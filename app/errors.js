/* Mom-facing error copy. Never drop a real Supabase/PostgREST message on the floor. */

export const GENERIC_ERROR = 'Something went wrong. Please try again.';
export const DATABASE_UPDATE_NEEDED =
  'This app update needs a database update — contact support.';
export const PERMISSION_ERROR =
  'You don’t have permission to save this. Sign in again, or ask the account owner.';
export const NETWORK_ERROR = 'Could not connect. Check your internet and try again.';

export function collectErrorParts(error) {
  if (error == null) return { message: '', code: '', details: '', hint: '', raw: '', name: '' };
  if (typeof error === 'string') {
    const message = error.trim();
    return { message, code: '', details: '', hint: '', raw: message, name: '' };
  }
  const message = String(error.message || error.error_description || error.error || '').trim();
  const code = String(error.code || error.status || error.statusCode || '').trim();
  const details = String(error.details || '').trim();
  const hint = String(error.hint || '').trim();
  const name = String(error.name || '').trim();
  const raw = [name, message, details, hint, code].filter(Boolean).join(' ');
  return { message, code, details, hint, raw, name };
}

function haystack(parts) {
  return String(parts.raw || '').toLowerCase();
}

export function isMissingColumnError(error, column = '') {
  const parts = collectErrorParts(error);
  const hay = haystack(parts);
  const code = parts.code.toUpperCase();
  const named = !column || hay.includes(String(column).toLowerCase());
  if (!named) return false;
  return (
    code === 'PGRST204' ||
    code === '42703' ||
    hay.includes('schema cache') ||
    /could not find the ['`]?[\w.]+['`]? column/.test(hay) ||
    (hay.includes('column') && hay.includes('does not exist'))
  );
}

export function isSchemaSetupError(error) {
  const parts = collectErrorParts(error);
  const hay = haystack(parts);
  const code = parts.code.toUpperCase();
  return (
    isMissingColumnError(error) ||
    code === 'PGRST205' ||
    code === '42P01' ||
    hay.includes('schema cache') ||
    hay.includes('could not find the function') ||
    hay.includes('could not find the table') ||
    hay.includes('does not exist')
  );
}

function isPermissionError(parts) {
  const hay = haystack(parts);
  const code = parts.code.toUpperCase();
  return (
    ['401', '403', '42501', 'PGRST301'].includes(code) ||
    hay.includes('row-level security') ||
    hay.includes('permission denied') ||
    hay.includes('not authorized') ||
    hay.includes('jwt expired') ||
    hay.includes('invalid jwt') ||
    hay.includes('not allowed') ||
    /\brls\b/.test(hay)
  );
}

function isNetworkError(parts) {
  const hay = haystack(parts);
  return (
    hay.includes('failed to fetch') ||
    hay.includes('networkerror') ||
    hay.includes('network request failed') ||
    hay.includes('load failed') ||
    (parts.name === 'TypeError' && hay.includes('fetch'))
  );
}

function formatActionable({ message, code, details }) {
  const bits = [message, details].filter(Boolean);
  if (!bits.length && !code) return '';
  if (!bits.length) return `Couldn’t save (${code}). Please try again.`;
  const body = bits.join(' — ');
  if (code && !body.toLowerCase().includes(String(code).toLowerCase())) {
    return `Couldn’t save. ${body} (${code})`;
  }
  return `Couldn’t save. ${body}`;
}

export function friendlyError(error) {
  const parts = collectErrorParts(error);
  const hay = haystack(parts);

  if (hay.includes('configure') || hay.includes('config.js')) return String(parts.message || error);
  if (hay.includes('invalid login') || hay.includes('invalid credentials')) {
    return 'That email or password doesn’t match.';
  }
  if (hay.includes('already registered') || hay.includes('already been registered') || hay.includes('user already exists')) {
    return 'That email already has an account. Try signing in.';
  }
  if (hay.includes('password') && (hay.includes('6') || hay.includes('least') || hay.includes('weak') || hay.includes('short'))) {
    return 'Please use a password with at least 6 characters.';
  }
  if (hay.includes('email not confirmed') || hay.includes('confirm your email') || hay.includes('email confirmation')) {
    return 'Please check your email to finish creating your account, then sign in.';
  }
  if (hay.includes('valid email') || hay.includes('unable to validate email')) {
    return 'Please enter a valid email address.';
  }
  if (hay.includes('invite was created for a different email')) {
    return 'This invite was made for a different email address.';
  }
  if (hay.includes('invite has expired')) return 'That invite has expired. Ask them to send a new one.';
  if (hay.includes('invite code was not found') || hay.includes('missing invite')) {
    return 'That invite code was not found.';
  }
  if (hay.includes('only the account owner')) {
    return 'Only the account owner can invite someone.';
  }
  if (hay.includes('sample homes cannot be changed') || hay.includes('sample is view only')) {
    return 'Sample homes cannot be changed.';
  }
  if (isMissingColumnError(error, 'thumbnail_path')) {
    return DATABASE_UPDATE_NEEDED;
  }
  if (isSchemaSetupError(error)) {
    if (
      hay.includes('expenses') ||
      hay.includes('receipts') ||
      hay.includes('property_photos') ||
      hay.includes('property_appliances') ||
      hay.includes('tenants') ||
      hay.includes('tenant_files') ||
      hay.includes('account-media') ||
      hay.includes('is_sample')
    ) {
      return DATABASE_UPDATE_NEEDED;
    }
    return 'This project isn’t finished setting up. Paste supabase/schema.sql into the Supabase SQL editor, then try again.';
  }
  if (hay.includes('bucket') || hay.includes('storage') || hay.includes('payload too large') || hay.includes('maximum allowed size')) {
    return 'Couldn’t save that file. Try a smaller photo or PDF, or finish the Storage setup in the README.';
  }
  if (isNetworkError(parts)) return NETWORK_ERROR;
  if (isPermissionError(parts)) return PERMISSION_ERROR;

  const actionable = formatActionable(parts);
  if (actionable) return actionable;
  return GENERIC_ERROR;
}
