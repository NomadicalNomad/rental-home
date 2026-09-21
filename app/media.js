/* Compress, upload, and resolve private account-media objects. */
import { getSupabase, SAMPLE_ACCOUNT_ID } from './auth.js';

const BUCKET = 'account-media';
const MAX_SOURCE_BYTES = 15 * 1024 * 1024;
const MAX_IMAGE_BYTES = 450 * 1024;
const MAX_PDF_BYTES = 8 * 1024 * 1024;
const SIGN_TTL = 3600;

const signedCache = new Map();

export function thumbnailObjectPath(accountId, propertyId, ext = 'jpg') {
  return `${accountId}/properties/${propertyId}/thumbnail.${ext}`;
}

export function galleryPhotoPath(accountId, propertyId, photoId, ext = 'jpg') {
  return `${accountId}/properties/${propertyId}/photos/${photoId}.${ext}`;
}

export function leaseObjectPath(accountId, propertyId, ext = 'pdf') {
  return `${accountId}/properties/${propertyId}/tenant/lease.${ext}`;
}

export function tenantFileObjectPath(accountId, propertyId, fileId, ext) {
  return `${accountId}/properties/${propertyId}/tenant/files/${fileId}.${ext}`;
}

export function receiptObjectPath(accountId, propertyId, expenseId, receiptId, ext) {
  return `${accountId}/properties/${propertyId}/expenses/${expenseId}/${receiptId}.${ext}`;
}

export function extensionForType(contentType, fallback = 'bin') {
  const type = String(contentType || '').toLowerCase();
  if (type === 'image/jpeg' || type === 'image/jpg') return 'jpg';
  if (type === 'image/png') return 'png';
  if (type === 'image/webp') return 'webp';
  if (type === 'image/gif') return 'gif';
  if (type === 'image/svg+xml') return 'svg';
  if (type === 'application/pdf') return 'pdf';
  return fallback;
}

export function isPdf(fileOrType, fileName = '') {
  const type = String(typeof fileOrType === 'string' ? fileOrType : fileOrType?.type || '').toLowerCase();
  const name = fileName || fileOrType?.name || '';
  return type === 'application/pdf'
    || type === 'application/x-pdf'
    || type === 'application/acrobat'
    || /\.pdf$/i.test(name);
}

const IMAGE_EXT_TYPES = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  heic: 'image/heic',
  heif: 'image/heif',
  avif: 'image/avif',
  bmp: 'image/bmp',
  tif: 'image/tiff',
  tiff: 'image/tiff'
};

export function imageTypeFromName(name = '') {
  const match = String(name || '').toLowerCase().match(/\.([a-z0-9]+)$/);
  return match ? (IMAGE_EXT_TYPES[match[1]] || '') : '';
}

/** Some file pickers leave type empty; account-media allowlist rejects octet-stream. */
export function normalizeImageFile(file) {
  if (!file) throw new Error('Please choose a photo.');
  if (isPdf(file)) throw new Error('Please choose a photo.');
  const type = String(file.type || '').toLowerCase();
  if (type.startsWith('image/')) return file;
  const inferred = imageTypeFromName(file.name);
  if (!inferred) throw new Error('Please choose a photo.');
  return new File([file], file.name || 'photo.jpg', {
    type: inferred,
    lastModified: file.lastModified || Date.now()
  });
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => {
      if (blob) resolve(blob);
      else reject(new Error('Couldn’t add that photo. Try a smaller one.'));
    }, type, quality);
  });
}

export async function compressImageFile(file) {
  const ready = normalizeImageFile(file);
  if (ready.size > MAX_SOURCE_BYTES) throw new Error('Photo too large — try again.');

  let bitmap = null;
  try {
    bitmap = await createImageBitmap(ready);
  } catch (_) {
    bitmap = null;
  }
  if (!bitmap) {
    if (ready.size <= MAX_IMAGE_BYTES && /image\/(jpeg|png|webp)/i.test(ready.type)) return ready;
    throw new Error('Couldn’t add that photo. Try a JPEG or PNG.');
  }

  const maxDim = 1280;
  const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { alpha: false });
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, width, height);
  context.drawImage(bitmap, 0, 0, width, height);
  if (bitmap.close) bitmap.close();

  let quality = 0.72;
  let blob = await canvasToBlob(canvas, 'image/jpeg', quality);
  while (blob.size > MAX_IMAGE_BYTES && quality > 0.45) {
    quality -= 0.08;
    blob = await canvasToBlob(canvas, 'image/jpeg', quality);
  }
  if (blob.size > MAX_IMAGE_BYTES) throw new Error('Photo too large — try again.');
  return new File([blob], 'photo.jpg', { type: 'image/jpeg' });
}

export function assertPdfSize(file) {
  if (!file || !isPdf(file)) throw new Error('Please choose a PDF.');
  if (file.size > MAX_PDF_BYTES) throw new Error('That PDF is too large. Try one under 8 MB.');
  // Some file pickers leave type empty; account-media allowlist rejects octet-stream.
  if (String(file.type || '').toLowerCase() === 'application/pdf') return file;
  return new File([file], file.name || 'receipt.pdf', {
    type: 'application/pdf',
    lastModified: file.lastModified || Date.now()
  });
}

export async function uploadAccountMedia(path, file, { upsert = true } = {}) {
  const supabase = getSupabase();
  if (!supabase) throw new Error('Not signed in');
  const contentType = isPdf(file)
    ? 'application/pdf'
    : (file.type || 'application/octet-stream');
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    upsert,
    contentType,
    cacheControl: '3600'
  });
  if (error) {
    const message = String(error.message || '');
    if (/fetch|network/i.test(message)) throw new Error('Couldn’t save photo — check connection.');
    if (/mime|content.?type|not allowed|invalid/i.test(message)) {
      throw new Error(isPdf(file)
        ? 'Couldn’t save that PDF. Try another file.'
        : 'Couldn’t save that photo. Try another file.');
    }
    throw error;
  }
  signedCache.delete(path);
  return path;
}

export async function removeAccountMedia(paths) {
  const list = (Array.isArray(paths) ? paths : [paths]).filter(Boolean);
  if (!list.length) return;
  const supabase = getSupabase();
  if (!supabase) return;
  const { error } = await supabase.storage.from(BUCKET).remove(list);
  if (error) throw error;
  list.forEach(path => signedCache.delete(path));
}

function sampleFallbackUrl(path) {
  if (!path) return '';
  if (/^(?:\.\/|data:|blob:|https?:)/i.test(path)) return path;
  if (!String(path).startsWith(`${SAMPLE_ACCOUNT_ID}/`)) return '';
  const file = path.split('/').pop() || '';
  const stem = file.replace(/\.(svg|pdf|jpe?g|png|webp)$/i, '');
  if (/00000000-0000-4000-8000-00000000001[1-3]$/.test(stem)) return `./sample-media/${stem}.svg`;
  if (stem === '00000000-0000-4000-8000-000000000031' || stem === '00000000-0000-4000-8000-000000000081') {
    return './sample-media/00000000-0000-4000-8000-000000000031.svg';
  }
  if (stem === '00000000-0000-4000-8000-000000000042') return './sample-media/00000000-0000-4000-8000-000000000012.svg';
  if (stem === '00000000-0000-4000-8000-000000000032' || stem === 'lease') {
    return './sample-media/00000000-0000-4000-8000-000000000032.pdf';
  }
  return '';
}

export async function resolveMediaUrl(path) {
  if (!path) return '';
  if (/^(?:https?:|data:|blob:|\.\/)/i.test(path)) return path;
  const hit = signedCache.get(path);
  if (hit && hit.expires > Date.now() + 15_000) return hit.url;

  const supabase = getSupabase();
  if (supabase) {
    try {
      const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, SIGN_TTL);
      if (!error && data?.signedUrl) {
        signedCache.set(path, { url: data.signedUrl, expires: Date.now() + SIGN_TTL * 1000 });
        return data.signedUrl;
      }
    } catch (_) { /* fall through */ }
  }
  return sampleFallbackUrl(path);
}

export function revokeObjectUrl(url) {
  if (url && url.startsWith('blob:')) URL.revokeObjectURL(url);
}
