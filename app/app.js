/* RentManor — per-account property manager (Supabase-backed). */
import {
  SAMPLE_ACCOUNT_ID,
  canMutateAccount,
  rowsForAccount,
  sampleAppliances,
  samplePhotos,
  samplePortfolio,
  sampleTenantFiles,
  sampleTenants,
  sampleWriteError,
  scopedAccountId,
  shouldInjectDemoProperties
} from './account-scope.js';
import {
  startAuth,
  getSupabase,
  getUser,
  getAccount,
  isOwner,
  signOut,
  createInvite,
  inviteUrl,
  listMembers,
  markAccountSeeded,
  replaceAccountProperties,
  friendlyError,
  enterSampleRoute,
  exitSampleRoute,
  requestAuthMode,
  parseSampleRoute,
  setSampleHash
} from './auth.js';
import { isMissingColumnError, isSchemaSetupError } from './errors.js';
import { toPropertyRow, withoutOptionalPropertyColumns, withoutThumbnailPath } from './property-row.js';
import {
  detailHeaderHtml,
  detailTabsHtml,
  GALLERY_SOFT_CAP,
  hasCurrentTenant,
  propertyTabHtml,
  tenantTabHtml
} from './property-tabs.js';
import {
  thumbnailObjectPath,
  galleryPhotoPath,
  leaseObjectPath,
  tenantFileObjectPath,
  receiptObjectPath,
  extensionForType,
  isPdf,
  compressImageFile,
  assertPdfSize,
  uploadAccountMedia,
  removeAccountMedia,
  resolveMediaUrl,
  revokeObjectUrl
} from './media.js';
import { canShareFiles, expensesToCsv, expensesToPdf, exportFileName, exportTotals, SHARE_UNAVAILABLE_TOAST } from './export.js';

const LEGACY_KEY = 'rental-home-data-v1';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CATEGORIES = ['Repairs', 'Supplies', 'Utilities', 'Insurance', 'Other'];

const app = document.querySelector('#app');
const listView = document.querySelector('#listView');
const detailView = document.querySelector('#detailView');
const formView = document.querySelector('#formView');
const expenseView = document.querySelector('#expenseView');
const propertyList = document.querySelector('#propertyList');
const propertyCount = document.querySelector('#propertyCount');
const searchInput = document.querySelector('#searchInput');
const searchBox = document.querySelector('#searchBox');
const filterRow = document.querySelector('#filterRow');
const clearSearch = document.querySelector('#clearSearch');
const form = document.querySelector('#propertyForm');
const formError = document.querySelector('#formError');
const formPhotoTile = document.querySelector('#formPhotoTile');
const formPhotoError = document.querySelector('#formPhotoError');
const deleteButton = document.querySelector('#deleteButton');
const backupPanel = document.querySelector('#backupPanel');
const accountPanel = document.querySelector('#accountPanel');
const invitePanel = document.querySelector('#invitePanel');
const importPanel = document.querySelector('#importPanel');
const photoSheet = document.querySelector('#photoSheet');
const receiptSheet = document.querySelector('#receiptSheet');
const confirmSheet = document.querySelector('#confirmSheet');
const exportFormatSheet = document.querySelector('#exportFormatSheet');
const exportReadySheet = document.querySelector('#exportReadySheet');
const lightbox = document.querySelector('#lightbox');
const restoreInput = document.querySelector('#restoreInput');
const toast = document.querySelector('#toast');
const inviteButton = document.querySelector('#inviteButton');
const legacyImportButton = document.querySelector('#legacyImportButton');
const addButton = document.querySelector('#addButton');
const accountButton = document.querySelector('#accountButton');

let properties = [];
let expensesByProperty = new Map();
let receiptsByExpense = new Map();
let photosByProperty = new Map();
let appliancesByProperty = new Map();
let tenantByProperty = new Map();
let tenantFilesByTenant = new Map();
let activeFilter = 'all';
let currentView = 'list';
let editingId = null;
let editingExpenseId = null;
let expensePropertyId = null;
let detailTab = 'property';
let detailPropertyId = null;
let tenantEditorOpen = false;
let detailDirty = false;
let galleryPhotoId = null;
let filePickerContext = 'receipt';
let toastTimer;
let importMode = 'offer';
let ready = false;
let sampleMode = false;
let pendingPhotoFile = null;
let pendingPhotoPreview = '';
let photoContext = 'detail';
let pendingReceiptFile = null;
let pendingReceiptPreview = '';
let uploadBusy = false;
let pendingExport = null;
let exportPropertyId = null;
let confirmResolve = null;
let usingSampleFallback = false;

const SAMPLE_FALLBACK_EXPENSES = [
  { id: '00000000-0000-4000-8000-000000000021', accountId: SAMPLE_ACCOUNT_ID, propertyId: '10000000-0000-4000-8000-000000000001', spentOn: '2026-09-12', amount: 84, category: 'Repairs', notes: 'HVAC filter', createdAt: '2026-09-12T17:10:00Z', updatedAt: '2026-09-12T17:10:00Z' },
  { id: '00000000-0000-4000-8000-000000000022', accountId: SAMPLE_ACCOUNT_ID, propertyId: '10000000-0000-4000-8000-000000000001', spentOn: '2026-01-15', amount: 420, category: 'Insurance', notes: 'Annual landlord policy', createdAt: '2026-01-15T18:00:00Z', updatedAt: '2026-01-15T18:00:00Z' },
  { id: '00000000-0000-4000-8000-000000000023', accountId: SAMPLE_ACCOUNT_ID, propertyId: '10000000-0000-4000-8000-000000000002', spentOn: '2026-08-03', amount: 186.5, category: 'Supplies', notes: 'Living room paint', createdAt: '2026-08-03T18:20:00Z', updatedAt: '2026-08-03T18:20:00Z' },
  { id: '00000000-0000-4000-8000-000000000024', accountId: SAMPLE_ACCOUNT_ID, propertyId: '10000000-0000-4000-8000-000000000003', spentOn: '2026-09-08', amount: 62.4, category: 'Utilities', notes: 'Water', createdAt: '2026-09-08T16:40:00Z', updatedAt: '2026-09-08T16:40:00Z' },
  { id: '00000000-0000-4000-8000-000000000025', accountId: SAMPLE_ACCOUNT_ID, propertyId: '10000000-0000-4000-8000-000000000003', spentOn: '2026-09-01', amount: 75, category: 'Other', notes: 'Gardener', createdAt: '2026-09-01T15:00:00Z', updatedAt: '2026-09-01T15:00:00Z' }
];

const SAMPLE_FALLBACK_RECEIPTS = [
  { id: '00000000-0000-4000-8000-000000000031', accountId: SAMPLE_ACCOUNT_ID, expenseId: '00000000-0000-4000-8000-000000000021', storagePath: './sample-media/00000000-0000-4000-8000-000000000031.svg', contentType: 'image/svg+xml', fileName: 'hvac-filter.svg', createdAt: '2026-09-12T17:12:00Z', updatedAt: '2026-09-12T17:12:00Z' },
  { id: '00000000-0000-4000-8000-000000000032', accountId: SAMPLE_ACCOUNT_ID, expenseId: '00000000-0000-4000-8000-000000000024', storagePath: './sample-media/00000000-0000-4000-8000-000000000032.pdf', contentType: 'application/pdf', fileName: 'water-bill.pdf', createdAt: '2026-09-08T16:42:00Z', updatedAt: '2026-09-08T16:42:00Z' }
];

function applySampleFallback() {
  usingSampleFallback = true;
  properties = samplePortfolio().map(fromRow);
  expensesByProperty = new Map();
  receiptsByExpense = new Map();
  photosByProperty = new Map();
  appliancesByProperty = new Map();
  tenantByProperty = new Map();
  tenantFilesByTenant = new Map();
  SAMPLE_FALLBACK_EXPENSES.forEach(item => {
    const list = expensesByProperty.get(item.propertyId) || [];
    list.push({ ...item });
    expensesByProperty.set(item.propertyId, list);
  });
  SAMPLE_FALLBACK_RECEIPTS.forEach(item => {
    const list = receiptsByExpense.get(item.expenseId) || [];
    list.push({ ...item });
    receiptsByExpense.set(item.expenseId, list);
  });
  samplePhotos().forEach(item => {
    const list = photosByProperty.get(item.propertyId) || [];
    list.push({ ...item });
    photosByProperty.set(item.propertyId, list);
  });
  sampleAppliances().forEach(item => {
    const list = appliancesByProperty.get(item.propertyId) || [];
    list.push({ ...item });
    appliancesByProperty.set(item.propertyId, list);
  });
  sampleTenants().forEach(item => {
    tenantByProperty.set(item.propertyId, { ...item });
  });
  sampleTenantFiles().forEach(item => {
    const list = tenantFilesByTenant.get(item.tenantId) || [];
    list.push({ ...item });
    tenantFilesByTenant.set(item.tenantId, list);
  });
}

function makeId() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, character => {
    const random = Math.random() * 16 | 0;
    const value = character === 'x' ? random : (random & 0x3 | 0x8);
    return value.toString(16);
  });
}

function offeredKey() {
  const account = getAccount();
  return account ? `rental-home-legacy-offered:${account.id}` : 'rental-home-legacy-offered';
}

function activeAccountId() {
  return scopedAccountId({ sampleMode, accountId: getAccount()?.id || null }) || '';
}

function canWrite() {
  return canMutateAccount({ sampleMode, accountId: getAccount()?.id || null });
}

function cleanProperty(value, index = 0) {
  if (!value || typeof value !== 'object') return null;
  const status = value.status === 'occupied' ? 'occupied' : 'vacant';
  const text = (field, max = 1000) => String(value[field] ?? '').trim().slice(0, max);
  const tenantName = text('tenantName', 100) || text('tenant_name', 100);
  const id = text('id', 100);
  return {
    id: UUID_RE.test(id) ? id : makeId() || `imported-${Date.now()}-${index}`,
    address: text('address', 120),
    city: text('city', 60),
    state: text('state', 2).toUpperCase(),
    zip: text('zip', 10),
    status,
    tenantName,
    phone: text('phone', 30),
    email: text('email', 120),
    rent: text('rent', 20),
    notes: text('notes', 1000),
    thumbnailPath: text('thumbnailPath', 400) || text('thumbnail_path', 400),
    beds: text('beds', 8),
    baths: text('baths', 8),
    sqft: text('sqft', 10),
    yearBuilt: text('yearBuilt', 6) || text('year_built', 6),
    propertyType: text('propertyType', 40) || text('property_type', 40),
    description: text('description', 1000),
    utilityElectric: text('utilityElectric', 80) || text('utility_electric', 80),
    utilityGas: text('utilityGas', 80) || text('utility_gas', 80),
    utilityWater: text('utilityWater', 80) || text('utility_water', 80),
    utilityNotes: text('utilityNotes', 400) || text('utility_notes', 400),
    trashSchedule: text('trashSchedule', 80) || text('trash_schedule', 80),
    trashNotes: text('trashNotes', 400) || text('trash_notes', 400),
    createdAt: text('createdAt', 40) || text('created_at', 40) || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

function fromRow(row) {
  return {
    id: row.id,
    address: row.address || '',
    city: row.city || '',
    state: row.state || '',
    zip: row.zip || '',
    status: row.status === 'occupied' ? 'occupied' : 'vacant',
    tenantName: row.tenant_name || '',
    phone: row.phone || '',
    email: row.email || '',
    rent: row.rent || '',
    notes: row.notes || '',
    thumbnailPath: row.thumbnail_path || '',
    beds: row.beds ?? '',
    baths: row.baths ?? '',
    sqft: row.sqft ?? '',
    yearBuilt: row.year_built ?? row.yearBuilt ?? '',
    propertyType: row.property_type || row.propertyType || '',
    description: row.description || '',
    utilityElectric: row.utility_electric || row.utilityElectric || '',
    utilityGas: row.utility_gas || row.utilityGas || '',
    utilityWater: row.utility_water || row.utilityWater || '',
    utilityNotes: row.utility_notes || row.utilityNotes || '',
    trashSchedule: row.trash_schedule || row.trashSchedule || '',
    trashNotes: row.trash_notes || row.trashNotes || '',
    createdAt: row.created_at || new Date().toISOString(),
    updatedAt: row.updated_at || new Date().toISOString()
  };
}

function assertWritable() {
  if (!canWrite()) throw sampleWriteError();
  if (!getAccount()?.id) throw new Error('Sign in again to save this home.');
}

function toRow(property) {
  assertWritable();
  return toPropertyRow(property, getAccount().id);
}

const OPTIONAL_LOOKS = /beds|baths|sqft|year_built|property_type|description|utility_|trash_|thumbnail_path/i;

async function writePropertyRows(rows, { existingId = null } = {}) {
  const supabase = getSupabase();
  if (!supabase) throw new Error('Could not connect. Check your internet and try again.');
  const table = supabase.from('properties');
  const first = existingId
    ? await table.update(rows[0]).eq('id', existingId)
    : await table.insert(rows);
  if (!first.error) return;
  const missingOptional = OPTIONAL_LOOKS.test(String(first.error?.message || ''))
    || isMissingColumnError(first.error)
    || rows.some(row => row.thumbnail_path) && isMissingColumnError(first.error, 'thumbnail_path');
  if (!missingOptional) throw first.error;
  const fallback = rows.map(row => withoutOptionalPropertyColumns(withoutThumbnailPath(row)));
  const retry = existingId
    ? await supabase.from('properties').update(fallback[0]).eq('id', existingId)
    : await supabase.from('properties').insert(fallback);
  if (retry.error) throw retry.error;
}

function fromExpenseRow(row) {
  return {
    id: row.id,
    accountId: row.account_id,
    propertyId: row.property_id,
    spentOn: row.spent_on,
    amount: Number(row.amount),
    category: row.category || '',
    notes: row.notes || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function toExpenseRow(expense) {
  return {
    id: expense.id,
    account_id: activeAccountId(),
    property_id: expense.propertyId,
    spent_on: expense.spentOn,
    amount: Number(expense.amount),
    category: expense.category || '',
    notes: expense.notes || ''
  };
}

function fromReceiptRow(row) {
  return {
    id: row.id,
    accountId: row.account_id,
    expenseId: row.expense_id,
    storagePath: row.storage_path,
    contentType: row.content_type || '',
    fileName: row.file_name || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function getLegacyProperties() {
  try {
    const saved = localStorage.getItem(LEGACY_KEY);
    if (!saved) return [];
    const parsed = JSON.parse(saved);
    const list = Array.isArray(parsed) ? parsed : parsed?.properties;
    if (!Array.isArray(list)) return [];
    return list.map(cleanProperty).filter(Boolean).filter(property => property.address);
  } catch (_) {
    return [];
  }
}

function markLegacyOffered() {
  try { localStorage.setItem(offeredKey(), '1'); } catch (_) { /* ignore */ }
}

function readBackupFile(text) {
  const parsed = JSON.parse(text);
  const incoming = Array.isArray(parsed) ? parsed : parsed?.properties;
  if (!Array.isArray(incoming)) throw new Error('No property list');
  const cleaned = incoming.map(cleanProperty).filter(Boolean);
  if (!cleaned.length && incoming.length) throw new Error('No property list');
  return cleaned;
}

async function loadProperties() {
  if (sampleMode) {
    const supabase = getSupabase();
    if (supabase) {
      try {
        const { data, error } = await supabase
          .from('properties')
          .select('*')
          .eq('account_id', SAMPLE_ACCOUNT_ID)
          .order('updated_at', { ascending: false });
        if (!error && data?.length) {
          usingSampleFallback = false;
          properties = rowsForAccount(data, SAMPLE_ACCOUNT_ID).map(row => mergeSampleFacts(fromRow(row)));
          return;
        }
      } catch (_) { /* local Folsom fallback */ }
    }
    applySampleFallback();
    return;
  }
  const supabase = getSupabase();
  const accountId = activeAccountId();
  if (!supabase || !accountId) {
    properties = [];
    return;
  }
  const { data, error } = await supabase
    .from('properties')
    .select('*')
    .eq('account_id', accountId)
    .order('updated_at', { ascending: false });
  if (error) throw error;
  properties = rowsForAccount(data || [], accountId).map(fromRow);
  if (shouldInjectDemoProperties({ account: getAccount(), properties, sampleMode })) {
    properties = [];
  }
}

async function loadExpenses(propertyId) {
  if (sampleMode && usingSampleFallback) {
    const list = SAMPLE_FALLBACK_EXPENSES.filter(item => item.propertyId === propertyId).map(item => ({ ...item }));
    expensesByProperty.set(propertyId, list);
    return list;
  }
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('expenses')
    .select('*')
    .eq('property_id', propertyId)
    .order('spent_on', { ascending: false })
    .order('created_at', { ascending: false });
  if (error) {
    if (sampleMode) {
      const list = SAMPLE_FALLBACK_EXPENSES.filter(item => item.propertyId === propertyId).map(item => ({ ...item }));
      expensesByProperty.set(propertyId, list);
      return list;
    }
    throw error;
  }
  const list = (data || []).map(fromExpenseRow);
  expensesByProperty.set(propertyId, list);
  return list;
}

async function loadReceipts(expenseId) {
  if (sampleMode && usingSampleFallback) {
    const list = SAMPLE_FALLBACK_RECEIPTS.filter(item => item.expenseId === expenseId).map(item => ({ ...item }));
    receiptsByExpense.set(expenseId, list);
    return list;
  }
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('receipts')
    .select('*')
    .eq('expense_id', expenseId)
    .order('created_at', { ascending: false });
  if (error) {
    if (sampleMode) {
      const list = SAMPLE_FALLBACK_RECEIPTS.filter(item => item.expenseId === expenseId).map(item => ({ ...item }));
      receiptsByExpense.set(expenseId, list);
      return list;
    }
    throw error;
  }
  const list = (data || []).map(fromReceiptRow);
  receiptsByExpense.set(expenseId, list);
  return list;
}

function fromPhotoRow(row) {
  return {
    id: row.id,
    accountId: row.account_id,
    propertyId: row.property_id,
    storagePath: row.storage_path,
    sortOrder: Number(row.sort_order) || 0,
    isPrimary: Boolean(row.is_primary)
  };
}

function fromApplianceRow(row) {
  return {
    id: row.id,
    accountId: row.account_id,
    propertyId: row.property_id,
    name: row.name || '',
    fuel: row.fuel || '',
    notes: row.notes || ''
  };
}

function fromTenantRow(row) {
  return {
    id: row.id,
    accountId: row.account_id,
    propertyId: row.property_id,
    name: row.name || '',
    phone: row.phone || '',
    email: row.email || '',
    notes: row.notes || '',
    leaseStoragePath: row.lease_storage_path || '',
    leaseContentType: row.lease_content_type || '',
    leaseFileName: row.lease_file_name || ''
  };
}

function fromTenantFileRow(row) {
  return {
    id: row.id,
    accountId: row.account_id,
    tenantId: row.tenant_id,
    propertyId: row.property_id,
    kind: row.kind || 'correspondence',
    storagePath: row.storage_path,
    contentType: row.content_type || '',
    fileName: row.file_name || ''
  };
}

function fallbackPropertyIdFor(property) {
  if (!property) return '';
  const match = samplePortfolio().find(row => row.address === property.address);
  return match?.id || property.id;
}

function mergeSampleFacts(property) {
  const template = samplePortfolio().find(row => row.address === property.address);
  if (!template) return property;
  const take = (current, fallback) => (current === '' || current == null ? fallback : current);
  return {
    ...property,
    beds: take(property.beds, template.beds),
    baths: take(property.baths, template.baths),
    sqft: take(property.sqft, template.sqft),
    yearBuilt: take(property.yearBuilt, template.year_built),
    propertyType: take(property.propertyType, template.property_type),
    description: take(property.description, template.description),
    utilityElectric: take(property.utilityElectric, template.utility_electric),
    utilityGas: take(property.utilityGas, template.utility_gas),
    utilityWater: take(property.utilityWater, template.utility_water),
    utilityNotes: take(property.utilityNotes, template.utility_notes),
    trashSchedule: take(property.trashSchedule, template.trash_schedule),
    trashNotes: take(property.trashNotes, template.trash_notes)
  };
}

function thumbnailAsPhotos(property) {
  if (!property?.thumbnailPath) return [];
  return [{
    id: `thumb-${property.id}`,
    accountId: activeAccountId(),
    propertyId: property.id,
    storagePath: property.thumbnailPath,
    sortOrder: 0,
    isPrimary: true
  }];
}

function contactAsTenant(property) {
  if (!property) return null;
  if (!(property.tenantName || property.phone || property.email || property.status === 'occupied')) return null;
  return {
    id: `legacy-${property.id}`,
    accountId: activeAccountId(),
    propertyId: property.id,
    name: property.tenantName || '',
    phone: property.phone || '',
    email: property.email || '',
    notes: '',
    leaseStoragePath: '',
    leaseContentType: '',
    leaseFileName: ''
  };
}

async function loadPhotos(propertyId) {
  if (sampleMode && usingSampleFallback) {
    const list = samplePhotos().filter(item => item.propertyId === propertyId).map(item => ({ ...item }));
    photosByProperty.set(propertyId, list);
    return list;
  }
  const supabase = getSupabase();
  const property = properties.find(item => item.id === propertyId);
  if (!supabase) {
    const list = thumbnailAsPhotos(property);
    photosByProperty.set(propertyId, list);
    return list;
  }
  const { data, error } = await supabase
    .from('property_photos')
    .select('*')
    .eq('property_id', propertyId)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) {
    if (sampleMode) {
      const list = samplePhotos().filter(item => item.propertyId === fallbackPropertyIdFor(property)).map(item => ({
        ...item,
        propertyId
      }));
      photosByProperty.set(propertyId, list.length ? list : thumbnailAsPhotos(property));
      return photosByProperty.get(propertyId);
    }
    const list = thumbnailAsPhotos(property);
    photosByProperty.set(propertyId, list);
    return list;
  }
  const list = (data || []).map(fromPhotoRow);
  photosByProperty.set(propertyId, list);
  return list;
}

async function loadAppliances(propertyId) {
  if (sampleMode && usingSampleFallback) {
    const list = sampleAppliances().filter(item => item.propertyId === propertyId).map(item => ({ ...item }));
    appliancesByProperty.set(propertyId, list);
    return list;
  }
  const supabase = getSupabase();
  const property = properties.find(item => item.id === propertyId);
  if (!supabase) {
    appliancesByProperty.set(propertyId, []);
    return [];
  }
  const { data, error } = await supabase
    .from('property_appliances')
    .select('*')
    .eq('property_id', propertyId)
    .order('created_at', { ascending: true });
  if (error) {
    if (sampleMode) {
      const list = sampleAppliances().filter(item => item.propertyId === fallbackPropertyIdFor(property)).map(item => ({
        ...item,
        propertyId
      }));
      appliancesByProperty.set(propertyId, list);
      return list;
    }
    appliancesByProperty.set(propertyId, []);
    return [];
  }
  const list = (data || []).map(fromApplianceRow);
  appliancesByProperty.set(propertyId, list);
  return list;
}

async function loadTenant(propertyId) {
  if (sampleMode && usingSampleFallback) {
    const tenant = sampleTenants().find(item => item.propertyId === propertyId) || null;
    tenantByProperty.set(propertyId, tenant ? { ...tenant } : null);
    return tenantByProperty.get(propertyId);
  }
  const supabase = getSupabase();
  const property = properties.find(item => item.id === propertyId);
  if (!supabase) {
    const tenant = contactAsTenant(property);
    tenantByProperty.set(propertyId, tenant);
    return tenant;
  }
  const { data, error } = await supabase
    .from('tenants')
    .select('*')
    .eq('property_id', propertyId)
    .maybeSingle();
  if (error) {
    if (sampleMode) {
      const tenant = sampleTenants().find(item => item.propertyId === fallbackPropertyIdFor(property)) || null;
      tenantByProperty.set(propertyId, tenant ? { ...tenant, propertyId } : null);
      return tenantByProperty.get(propertyId);
    }
    const tenant = contactAsTenant(property);
    tenantByProperty.set(propertyId, tenant);
    return tenant;
  }
  const tenant = data ? fromTenantRow(data) : null;
  tenantByProperty.set(propertyId, tenant);
  return tenant;
}

async function loadTenantFiles(tenantId) {
  if (!tenantId) return [];
  if (sampleMode && usingSampleFallback) {
    const list = sampleTenantFiles().filter(item => item.tenantId === tenantId).map(item => ({ ...item }));
    tenantFilesByTenant.set(tenantId, list);
    return list;
  }
  const supabase = getSupabase();
  if (!supabase) {
    tenantFilesByTenant.set(tenantId, []);
    return [];
  }
  const { data, error } = await supabase
    .from('tenant_files')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false });
  if (error) {
    if (sampleMode) {
      const list = sampleTenantFiles().filter(item => item.tenantId === tenantId).map(item => ({ ...item }));
      tenantFilesByTenant.set(tenantId, list);
      return list;
    }
    tenantFilesByTenant.set(tenantId, []);
    return [];
  }
  const list = (data || []).map(fromTenantFileRow);
  tenantFilesByTenant.set(tenantId, list);
  return list;
}

async function loadPropertyExtras(propertyId) {
  const [photos, appliances, tenant] = await Promise.all([
    loadPhotos(propertyId),
    loadAppliances(propertyId),
    loadTenant(propertyId)
  ]);
  if (tenant?.id) await loadTenantFiles(tenant.id).catch(() => []);
  return { photos, appliances, tenant };
}

async function insertProperties(list) {
  if (!list.length) return;
  await writePropertyRows(list.map(toRow));
}

function escapeHTML(value) {
  return String(value ?? '').replace(/[&<>'"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));
}

function homeOutline() {
  return `<span class="empty-icon" aria-hidden="true"><svg viewBox="0 0 64 64" fill="none"><path d="M10 30L32 12l22 18" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M16 28v22h32V28" stroke="currentColor" stroke-width="2.5" stroke-linejoin="round"/><path d="M28 50V36h8v14" stroke="currentColor" stroke-width="2.5" stroke-linejoin="round"/></svg></span>`;
}

function askConfirm({ title, message, confirmLabel = 'Confirm', discardLabel = '' }) {
  return new Promise(resolve => {
    if (confirmResolve) confirmResolve(false);
    confirmResolve = resolve;
    const titleEl = document.querySelector('#confirmTitle');
    const messageEl = document.querySelector('#confirmMessage');
    const yes = document.querySelector('#confirmYes');
    const discard = document.querySelector('#confirmDiscard');
    if (titleEl) titleEl.textContent = title;
    if (messageEl) messageEl.textContent = message;
    if (yes) {
      yes.textContent = confirmLabel;
      yes.classList.toggle('danger', !discardLabel);
    }
    if (discard) {
      discard.hidden = !discardLabel;
      discard.textContent = discardLabel || 'Discard';
    }
    if (confirmSheet) confirmSheet.hidden = false;
  });
}

function settleConfirm(ok) {
  if (confirmSheet) confirmSheet.hidden = true;
  const discard = document.querySelector('#confirmDiscard');
  if (discard) discard.hidden = true;
  const resolve = confirmResolve;
  confirmResolve = null;
  if (resolve) resolve(ok);
}

function activeDetailForm() {
  return document.querySelector('#propertyDetailForm') || document.querySelector('#tenantForm');
}

function isDetailDirty() {
  return detailDirty || activeDetailForm()?.dataset.dirty === '1';
}

function setDetailDirty(dirty) {
  detailDirty = dirty;
  const form = activeDetailForm();
  if (form) form.dataset.dirty = dirty ? '1' : '';
  const bar = document.querySelector('#detailSaveBar');
  if (bar) bar.hidden = !dirty;
}

function captureDetailDraft() {
  const form = activeDetailForm();
  if (!form || !isDetailDirty()) return null;
  return { tab: detailTab, values: Object.fromEntries(new FormData(form).entries()) };
}

function restoreDetailDraft(draft) {
  if (!draft || draft.tab !== detailTab) return;
  const form = activeDetailForm();
  if (!form) return;
  Object.entries(draft.values).forEach(([key, value]) => {
    const field = form.elements[key];
    if (!field) return;
    if (field instanceof RadioNodeList) {
      [...field].forEach(input => { input.checked = input.value === value; });
    } else if (field.type === 'radio') {
      const match = form.querySelector(`[name="${key}"][value="${value}"]`);
      if (match) match.checked = true;
    } else {
      field.value = value;
    }
  });
  setDetailDirty(true);
}

function bindDetailDirty() {
  const form = activeDetailForm();
  if (!form) return;
  const mark = () => setDetailDirty(true);
  form.addEventListener('input', mark);
  form.addEventListener('change', mark);
}

function syncStickyOffset() {
  const banner = document.querySelector('#sampleBanner');
  const height = sampleMode && banner && !banner.hidden ? Math.ceil(banner.getBoundingClientRect().height) : 0;
  document.documentElement.style.setProperty('--detail-sticky-top', `${height}px`);
}

async function confirmLeaveDirtyTab() {
  if (!isDetailDirty()) return 'ok';
  const result = await askConfirm({
    title: 'Save changes?',
    message: 'You have unsaved edits on this tab.',
    confirmLabel: 'Save',
    discardLabel: 'Discard'
  });
  if (result === true) {
    const saved = await saveActiveDetailForm();
    return saved ? 'ok' : 'cancel';
  }
  if (result === 'discard') {
    setDetailDirty(false);
    return 'ok';
  }
  return 'cancel';
}

async function switchDetailTab(next) {
  const tab = DETAIL_TABS_SAFE.has(next) ? next : 'property';
  if (tab === detailTab) return;
  if (await confirmLeaveDirtyTab() !== 'ok') return;
  detailTab = tab;
  if (detailTab !== 'tenant') tenantEditorOpen = false;
  const property = properties.find(item => item.id === detailPropertyId);
  if (property) renderDetail(property);
}

function currency(value) {
  const amount = Number(value);
  return Number.isFinite(amount) && amount > 0 ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(amount) : '';
}

function money(value) {
  const amount = Number(value);
  return Number.isFinite(amount) ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount) : '';
}

function formatDate(value) {
  if (!value) return '';
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function todayISO() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

function propertyLocation(property) {
  return `${property.city}, ${property.state} ${property.zip}`;
}

function receiptForExpense(expenseId) {
  return (receiptsByExpense.get(expenseId) || [])[0] || null;
}

function showView(view) {
  currentView = view;
  listView.hidden = view !== 'list';
  detailView.hidden = view !== 'detail';
  formView.hidden = view !== 'form';
  if (expenseView) expenseView.hidden = view !== 'expense';
  if (view === 'list') renderList();
  app.focus({ preventScroll: true });
}

function updateSampleChrome() {
  document.body.classList.toggle('sample-mode', sampleMode);
  syncStickyOffset();
  const banner = document.querySelector('#sampleBanner');
  const signedIn = Boolean(getUser() && getAccount());
  if (banner) banner.hidden = !sampleMode;
  if (accountButton) accountButton.hidden = sampleMode;
  if (addButton) addButton.hidden = sampleMode;
  const myAccount = document.querySelector('#exitSampleAccount');
  const signIn = document.querySelector('#exitSampleSignIn');
  const signUp = document.querySelector('#exitSampleSignUp');
  if (myAccount) myAccount.hidden = !sampleMode || !signedIn;
  if (signIn) signIn.hidden = !sampleMode || signedIn;
  if (signUp) signUp.hidden = !sampleMode || signedIn;
  const heading = document.querySelector('#listHeading');
  if (heading) heading.textContent = sampleMode ? 'Your properties · Sample' : 'Your properties';
}

function thumbMarkup(property, size = 'card') {
  const alt = escapeHTML(property.address);
  const path = escapeHTML(property.thumbnailPath || '');
  const klass = size === 'hero' ? 'hero-photo' : 'card-thumb';
  if (!property.thumbnailPath) {
    const label = size === 'hero'
      ? (sampleMode ? '<span class="hero-empty"><span aria-hidden="true">⌂</span> No photo</span>' : '<span class="hero-empty"><span aria-hidden="true">⌂</span> Add photo</span>')
      : '<span aria-hidden="true">⌂</span>';
    return `<div class="${klass} is-empty" data-thumb-id="${escapeHTML(property.id)}" data-thumb-path="${path}" data-thumb-alt="${alt}">${label}</div>`;
  }
  return `<div class="${klass}" data-thumb-id="${escapeHTML(property.id)}" data-thumb-path="${path}" data-thumb-alt="${alt}"><span class="media-placeholder" aria-hidden="true"></span></div>`;
}

async function hydrateThumbs(root) {
  if (!root) return;
  const nodes = [...root.querySelectorAll('[data-thumb-path]')];
  await Promise.all(nodes.map(async node => {
    const path = node.dataset.thumbPath;
    if (!path) return;
    const url = await resolveMediaUrl(path);
    if (!url) return;
    const img = document.createElement('img');
    img.src = url;
    img.alt = node.dataset.thumbAlt || '';
    node.replaceChildren(img);
  }));
}

function renderList() {
  const query = searchInput.value.trim().toLowerCase();
  clearSearch.hidden = !query;
  const hasProperties = properties.length > 0;
  if (searchBox) searchBox.hidden = !hasProperties;
  if (filterRow) filterRow.hidden = !hasProperties;
  const matches = properties.filter(property => {
    const inFilter = activeFilter === 'all' || property.status === activeFilter;
    const searchable = `${property.address} ${property.city} ${property.state} ${property.zip} ${property.tenantName}`.toLowerCase();
    return inFilter && (!query || searchable.includes(query));
  });
  const totalLabel = `${properties.length} ${properties.length === 1 ? 'property' : 'properties'}`;
  propertyCount.textContent = query || activeFilter !== 'all' ? `${matches.length} of ${totalLabel}` : totalLabel;

  if (!matches.length) {
    if (hasProperties) {
      propertyList.innerHTML = `<div class="empty-state"><div class="empty-icon" aria-hidden="true">⌕</div><h3>No homes found</h3><p>Try a different search or filter.</p><button class="secondary-button" type="button" data-action="clear-filters">Clear search</button></div>`;
      return;
    }
    propertyList.innerHTML = `
      <div class="empty-state">
        ${homeOutline()}
        <h3>No properties yet.</h3>
        <p>Add your first rental.</p>
        <button class="primary-button js-write" type="button" data-action="add">+ Add home</button>
        ${sampleMode ? '' : `<button class="text-button muted-link" type="button" data-action="view-sample">View sample</button>
        <p class="empty-help">See how RentManor looks with example homes. You can’t edit the sample.</p>`}
      </div>`;
    return;
  }

  propertyList.innerHTML = matches.map(property => `
      <button class="property-card" type="button" data-id="${escapeHTML(property.id)}" aria-label="View ${escapeHTML(property.address)}">
        ${thumbMarkup(property)}
        <div class="card-copy">
          <div class="card-top"><h3>${escapeHTML(property.address)}</h3><span class="badge ${property.status}">${property.status === 'occupied' ? 'Occupied' : 'Vacant'}</span></div>
          <p class="card-address">${escapeHTML(propertyLocation(property))}</p>
          <div class="card-bottom"><span class="card-tenant">${property.status === 'occupied' ? escapeHTML(property.tenantName || 'Tenant name not added') : 'Ready for a tenant'}${currency(property.rent) ? ` · ${escapeHTML(currency(property.rent))}/mo` : ''}</span><span class="card-arrow" aria-hidden="true">›</span></div>
        </div>
      </button>`).join('');
  hydrateThumbs(propertyList);
}

function existingTenantName(propertyId) {
  if (!propertyId) return '';
  const tenant = tenantByProperty.get(propertyId);
  if (hasCurrentTenant(tenant)) return tenant.name || '';
  return properties.find(item => item.id === propertyId)?.tenantName || '';
}

function expenseSummary(list) {
  const total = list.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
  return `${money(total)} total · ${list.length} ${list.length === 1 ? 'expense' : 'expenses'}`;
}

function goSample(subpath = '') {
  if (!setSampleHash(subpath)) applySamplePath();
}

async function applySamplePath() {
  const route = parseSampleRoute();
  if (!route.sample) {
    showView('list');
    return;
  }
  if (!route.propertyId) {
    showView('list');
    return;
  }
  const property = properties.find(item => item.id === route.propertyId);
  if (!property) {
    showView('list');
    return;
  }
  if (route.expenseId) {
    detailTab = 'expenses';
    const expenses = expensesByProperty.get(property.id) || await loadExpenses(property.id).catch(() => []);
    const expense = expenses.find(item => item.id === route.expenseId);
    if (expense) {
      await openExpense(property, expense);
      return;
    }
  }
  await renderDetail(property);
}

function expenseRow(expense) {
  const receipt = receiptForExpense(expense.id);
  const chip = receipt
    ? `<span class="receipt-chip">${isPdf(receipt.contentType, receipt.fileName) ? 'PDF' : '📎'} ${escapeHTML(receipt.fileName || 'Receipt')}</span>`
    : '';
  return `
    <button class="expense-row" type="button" data-action="open-expense" data-expense-id="${escapeHTML(expense.id)}" data-property-id="${escapeHTML(expense.propertyId)}">
      <div class="expense-copy">
        <div class="expense-top">${escapeHTML(formatDate(expense.spentOn))} · ${escapeHTML(expense.category || 'Other')}</div>
        ${expense.notes ? `<p class="expense-notes">${escapeHTML(expense.notes)}</p>` : ''}
        ${chip}
      </div>
      <span class="expense-amount">${escapeHTML(money(expense.amount))}</span>
    </button>`;
}

function expensesPanelHtml(property, expenses, write) {
  return `<section class="expense-section">
        <div class="section-heading">
          <div>
            <h3>Expenses</h3>
            <p class="muted">${expenses.length ? escapeHTML(expenseSummary(expenses)) : 'No expenses yet.'}</p>
            ${write ? '<p class="muted">People on this account can see these expenses and receipts.</p>' : ''}
          </div>
          <div class="heading-actions">
            ${expenses.length ? `<button class="secondary-button compact" type="button" data-action="export-expenses" data-id="${escapeHTML(property.id)}">Export</button>` : ''}
            ${write ? `<button class="primary-button compact js-write" type="button" data-action="add-expense" data-id="${escapeHTML(property.id)}">＋ Add</button>` : ''}
          </div>
        </div>
        ${expenses.length
          ? `<div class="expense-list">${expenses.map(expenseRow).join('')}</div>`
          : (write ? `<button class="text-button muted-link js-write" type="button" data-action="add-expense" data-id="${escapeHTML(property.id)}">Add an expense</button>` : '')}
      </section>`;
}

const DETAIL_TABS_SAFE = new Set(['property', 'tenant', 'expenses']);

function propertyTabPanel(property, write, { expenses = [], tenant = null } = {}) {
  const photos = photosByProperty.get(property.id) || thumbnailAsPhotos(property);
  const appliances = appliancesByProperty.get(property.id) || [];
  return propertyTabHtml({
    property,
    photos,
    appliances,
    expenses,
    tenant,
    write,
    sample: sampleMode,
    expenseSummary: expenses.length
      ? `${expenses.length} ${expenses.length === 1 ? 'expense' : 'expenses'} · ${money(expenses.reduce((sum, item) => sum + (Number(item.amount) || 0), 0))}`
      : ''
  });
}

async function renderDetail(property) {
  if (!property) { showView('list'); return; }
  const draft = captureDetailDraft();
  detailPropertyId = property.id;
  let expenses = expensesByProperty.get(property.id);
  if (!expenses) {
    try {
      expenses = await loadExpenses(property.id);
      await Promise.all(expenses.map(item => loadReceipts(item.id).catch(() => [])));
    } catch (error) {
      expenses = [];
      showToast(friendlyError(error));
    }
  }
  try {
    await loadPropertyExtras(property.id);
  } catch (error) {
    showToast(friendlyError(error));
  }
  const write = canWrite();
  const photos = photosByProperty.get(property.id) || thumbnailAsPhotos(property);
  const cover = photos.find(item => item.isPrimary) || photos[0];
  const heroPath = cover?.storagePath || property.thumbnailPath || '';
  const heroProperty = { ...property, thumbnailPath: heroPath };
  const heroAction = heroPath ? 'view-hero' : (write ? 'add-gallery-photo' : '');
  const tenant = tenantByProperty.get(property.id);
  const files = tenant?.id ? (tenantFilesByTenant.get(tenant.id) || []) : [];
  const tab = DETAIL_TABS_SAFE.has(detailTab) ? detailTab : 'property';
  let panel = '';
  if (tab === 'tenant') {
    panel = tenantTabHtml({ property, tenant, files, write, editing: write && tenantEditorOpen });
  } else if (tab === 'expenses') {
    panel = expensesPanelHtml(property, expenses, write);
  } else {
    panel = propertyTabPanel(property, write, { expenses, tenant });
  }
  detailView.innerHTML = `
      <button class="back-link" type="button" data-action="back-to-list"><span aria-hidden="true">‹</span> Back to properties</button>
      <button class="hero-photo-wrap" type="button" data-action="${heroAction}" data-id="${escapeHTML(property.id)}" ${heroAction ? '' : 'disabled'}>
        ${thumbMarkup(heroProperty, 'hero')}
        <span class="upload-bar" hidden><span></span></span>
      </button>
      <div class="detail-sticky">
        ${detailHeaderHtml(property, { location: propertyLocation(property), rent: currency(property.rent), write })}
        ${detailTabsHtml(tab)}
      </div>
      <div class="detail-panel" role="tabpanel" id="panel-${tab}" aria-labelledby="tab-${tab}">${panel}</div>`;
  showView('detail');
  syncStickyOffset();
  hydrateThumbs(detailView);
  const applianceForm = document.querySelector('#applianceForm');
  if (applianceForm) applianceForm.addEventListener('submit', submitAppliance);
  const propertyForm = document.querySelector('#propertyDetailForm');
  if (propertyForm) propertyForm.addEventListener('submit', submitPropertyDetail);
  const tenantForm = document.querySelector('#tenantForm');
  if (tenantForm) tenantForm.addEventListener('submit', submitTenant);
  bindDetailDirty();
  restoreDetailDraft(draft);
}

function renderFormPhoto(property) {
  if (!formPhotoTile) return;
  if (pendingPhotoPreview) {
    formPhotoTile.classList.remove('is-empty');
    formPhotoTile.innerHTML = `<img src="${escapeHTML(pendingPhotoPreview)}" alt="">`;
    return;
  }
  if (property?.thumbnailPath) {
    formPhotoTile.classList.remove('is-empty');
    formPhotoTile.dataset.thumbPath = property.thumbnailPath;
    formPhotoTile.dataset.thumbId = property.id;
    formPhotoTile.dataset.thumbAlt = property.address;
    formPhotoTile.innerHTML = '<span class="media-placeholder" aria-hidden="true"></span>';
    hydrateThumbs(formPhotoTile.parentElement);
    return;
  }
  formPhotoTile.classList.add('is-empty');
  formPhotoTile.removeAttribute('data-thumb-path');
  formPhotoTile.innerHTML = '<span class="hero-empty"><span aria-hidden="true">⌂</span> Add photo</span>';
}

function openForm(property = null) {
  if (!canWrite()) return;
  editingId = property?.id || null;
  pendingPhotoFile = null;
  revokeObjectUrl(pendingPhotoPreview);
  pendingPhotoPreview = '';
  form.reset();
  formError.hidden = true;
  if (formPhotoError) formPhotoError.hidden = true;
  document.querySelector('#formEyebrow').textContent = property ? 'Update property' : 'New property';
  document.querySelector('#formHeading').textContent = property ? 'Edit home' : 'Add a home';
  deleteButton.hidden = !property;
  if (property) {
    Object.entries(property).forEach(([key, value]) => {
      const field = form.elements[key];
      if (!field) return;
      if (key === 'status') {
        const radio = form.querySelector(`input[name="status"][value="${value}"]`);
        if (radio) radio.checked = true;
      } else field.value = value ?? '';
    });
  } else {
    form.querySelector('input[name="status"][value="vacant"]').checked = true;
  }
  renderFormPhoto(property);
  showView('form');
  window.scrollTo(0, 0);
  form.elements.address.focus();
}

function showFormError(message) {
  formError.textContent = message;
  formError.hidden = false;
  formError.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function readForm() {
  const data = Object.fromEntries(new FormData(form).entries());
  Object.keys(data).forEach(key => { if (typeof data[key] === 'string') data[key] = data[key].trim(); });
  if (!data.address || !data.city || !data.state || !data.zip) return { error: 'Please fill in the required property fields.' };
  if (!data.status) return { error: 'Please choose whether this home is occupied or vacant.' };
  if (!/^\d{5}(-\d{4})?$/.test(data.zip)) return { error: 'Please enter a valid 5-digit ZIP code.' };
  if (data.rent && (!Number.isFinite(Number(data.rent)) || Number(data.rent) < 0)) return { error: 'Monthly rent must be a positive number.' };
  return { data: { ...data, state: data.state.toUpperCase(), tenantName: existingTenantName(editingId), phone: '', email: '' } };
}

function readPropertyDetail(formEl) {
  const data = Object.fromEntries(new FormData(formEl).entries());
  Object.keys(data).forEach(key => { if (typeof data[key] === 'string') data[key] = data[key].trim(); });
  if (!data.address || !data.city || !data.state || !data.zip) return { error: 'Please fill in the required property fields.' };
  if (!/^\d{5}(-\d{4})?$/.test(data.zip)) return { error: 'Please enter a valid 5-digit ZIP code.' };
  if (data.rent && (!Number.isFinite(Number(data.rent)) || Number(data.rent) < 0)) return { error: 'Monthly rent must be a positive number.' };
  return { data: { ...data, state: data.state.toUpperCase() } };
}

function showPropertyDetailError(message) {
  const box = document.querySelector('#propertyDetailError');
  if (!box) {
    showToast(message);
    return;
  }
  box.textContent = message;
  box.hidden = false;
  box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

async function submitPropertyDetail(event) {
  event.preventDefault();
  return savePropertyDetail();
}

async function savePropertyDetail() {
  if (!canWrite()) return false;
  const formEl = document.querySelector('#propertyDetailForm');
  const property = properties.find(item => item.id === detailPropertyId);
  if (!formEl || !property) return false;
  const result = readPropertyDetail(formEl);
  if (result.error) { showPropertyDetailError(result.error); return false; }
  const submit = formEl.querySelector('button[type="submit"]');
  if (submit) submit.disabled = true;
  try {
    const saved = { ...property, ...result.data, updatedAt: new Date().toISOString() };
    await writePropertyRows([toRow(saved)], { existingId: saved.id });
    await loadProperties();
    setDetailDirty(false);
    showToast('Property saved.');
    const next = properties.find(item => item.id === saved.id) || saved;
    renderDetail(next);
    return true;
  } catch (error) {
    showPropertyDetailError(friendlyError(error));
    return false;
  } finally {
    if (submit) submit.disabled = false;
  }
}

async function saveActiveDetailForm() {
  if (detailTab === 'tenant') return saveTenantFromForm();
  if (detailTab === 'property') return savePropertyDetail();
  return true;
}

async function savePropertyPhoto(property) {
  if (!pendingPhotoFile) return property;
  const file = await compressImageFile(pendingPhotoFile);
  const saved = await addGalleryPhoto(property, file);
  pendingPhotoFile = null;
  return saved;
}

function galleryPhotoCount(propertyId) {
  return (photosByProperty.get(propertyId) || []).length;
}

async function addGalleryPhoto(property, file) {
  const existingCount = galleryPhotoCount(property.id);
  if (existingCount >= GALLERY_SOFT_CAP) {
    showToast('You can add up to 10 photos.');
    return property;
  }
  const ready = await compressImageFile(file);
  const photoId = makeId();
  const ext = extensionForType(ready.type, 'jpg');
  const galleryPath = galleryPhotoPath(activeAccountId(), property.id, photoId, ext);
  const existing = photosByProperty.get(property.id) || await loadPhotos(property.id).catch(() => []);
  const makePrimary = existing.length === 0;
  let path = galleryPath;
  try {
    await uploadAccountMedia(galleryPath, ready);
  } catch (error) {
    path = thumbnailObjectPath(activeAccountId(), property.id, ext);
    await uploadAccountMedia(path, ready);
  }
  const supabase = getSupabase();
  const row = {
    id: photoId,
    account_id: activeAccountId(),
    property_id: property.id,
    storage_path: path,
    sort_order: existing.length,
    is_primary: makePrimary
  };
  const inserted = await supabase.from('property_photos').insert(row);
  if (inserted.error) {
    if (!isSchemaSetupError(inserted.error) && !isMissingColumnError(inserted.error)) throw inserted.error;
    const { error } = await supabase.from('properties').update({ thumbnail_path: path }).eq('id', property.id);
    if (error) throw error;
    return { ...property, thumbnailPath: path };
  }
  if (makePrimary) {
    const { error } = await supabase.from('properties').update({ thumbnail_path: path }).eq('id', property.id);
    if (error && !isMissingColumnError(error, 'thumbnail_path')) throw error;
  }
  await loadPhotos(property.id);
  return { ...property, thumbnailPath: makePrimary ? path : property.thumbnailPath };
}

async function submitForm(event) {
  event.preventDefault();
  if (!canWrite()) return;
  const result = readForm();
  if (result.error) { showFormError(result.error); return; }
  const now = new Date().toISOString();
  const submit = form.querySelector('button[type="submit"]');
  const existing = editingId ? properties.find(property => property.id === editingId) : null;
  const saved = existing
    ? { ...existing, ...result.data, updatedAt: now }
    : { ...result.data, id: makeId(), thumbnailPath: '', createdAt: now, updatedAt: now };
  submit.disabled = true;
  try {
    if (existing) await writePropertyRows([toRow(saved)], { existingId: saved.id });
    else await writePropertyRows([toRow(saved)]);
    const withPhoto = await savePropertyPhoto(saved);
    pendingPhotoFile = null;
    revokeObjectUrl(pendingPhotoPreview);
    pendingPhotoPreview = '';
    if (withPhoto.status === 'vacant') await syncTenantFromProperty(withPhoto);
    await loadProperties();
    showToast(existing ? 'Property updated.' : 'Property added.');
    const next = properties.find(property => property.id === withPhoto.id) || withPhoto;
    const needTenant = next.status === 'occupied' && !hasCurrentTenant(tenantByProperty.get(next.id));
    detailTab = needTenant ? 'tenant' : 'property';
    tenantEditorOpen = needTenant;
    renderDetail(next);
  } catch (error) {
    showFormError(friendlyError(error));
  } finally {
    submit.disabled = false;
  }
}

async function collectPropertyMediaPaths(property) {
  const paths = [];
  if (property.thumbnailPath) paths.push(property.thumbnailPath);
  const photos = photosByProperty.get(property.id) || await loadPhotos(property.id).catch(() => []);
  photos.forEach(photo => { if (photo.storagePath) paths.push(photo.storagePath); });
  const tenant = tenantByProperty.get(property.id) || await loadTenant(property.id).catch(() => null);
  if (tenant?.leaseStoragePath) paths.push(tenant.leaseStoragePath);
  if (tenant?.id) {
    const files = tenantFilesByTenant.get(tenant.id) || await loadTenantFiles(tenant.id).catch(() => []);
    files.forEach(file => { if (file.storagePath) paths.push(file.storagePath); });
  }
  const expenses = expensesByProperty.get(property.id) || await loadExpenses(property.id).catch(() => []);
  for (const expense of expenses) {
    const receipts = receiptsByExpense.get(expense.id) || await loadReceipts(expense.id).catch(() => []);
    receipts.forEach(receipt => { if (receipt.storagePath) paths.push(receipt.storagePath); });
  }
  return [...new Set(paths)];
}

async function deleteProperty(propertyId = editingId) {
  if (!canWrite()) return;
  const property = properties.find(item => item.id === propertyId);
  if (!property || !await askConfirm({ title: 'Delete property', message: `Delete ${property.address}? This cannot be undone.`, confirmLabel: 'Delete property' })) return;
  try {
    const paths = await collectPropertyMediaPaths(property);
    const { error } = await getSupabase().from('properties').delete().eq('id', property.id);
    if (error) throw error;
    try { await removeAccountMedia(paths); } catch (_) { /* rows are gone */ }
    expensesByProperty.delete(property.id);
    await loadProperties();
    showToast('Property deleted.');
    showView('list');
  } catch (error) {
    showToast(friendlyError(error));
  }
}

function openPhotoSheet(property, context = 'detail', photoId = null) {
  if (!property) return;
  const photos = photosByProperty.get(property.id) || thumbnailAsPhotos(property);
  const selected = photoId ? photos.find(item => item.id === photoId) : null;
  if (sampleMode) {
    const path = selected?.storagePath || property.thumbnailPath;
    if (path) viewMedia(path, property.address);
    return;
  }
  if (!canWrite() && !selected) return;
  photoContext = context;
  galleryPhotoId = selected?.id || null;
  editingId = property.id;
  const remove = document.querySelector('#removePhotoButton');
  const viewBtn = document.querySelector('#viewPhotoButton');
  const primaryBtn = document.querySelector('#makePrimaryButton');
  const title = document.querySelector('#photoSheetTitle');
  if (title) title.textContent = selected ? 'Photo' : 'Add photo';
  if (remove) remove.hidden = context === 'form' ? !property.thumbnailPath && !pendingPhotoFile : !selected;
  if (viewBtn) viewBtn.hidden = !selected;
  if (primaryBtn) primaryBtn.hidden = !selected || selected.isPrimary || !canWrite();
  photoSheet.hidden = false;
}

function closeSheets() {
  if (photoSheet) photoSheet.hidden = true;
  if (receiptSheet) receiptSheet.hidden = true;
  filePickerContext = 'receipt';
  const receiptTitle = document.querySelector('#receiptSheetTitle');
  if (receiptTitle) receiptTitle.textContent = 'Add receipt';
  closeExportSheets();
}

function closeExportSheets() {
  if (exportFormatSheet) exportFormatSheet.hidden = true;
  if (exportReadySheet) exportReadySheet.hidden = true;
  setExportFormatBusy(false);
}

function setExportFormatBusy(busy) {
  exportFormatSheet?.querySelectorAll('[data-export-format]').forEach(button => {
    button.disabled = busy;
  });
}

function showExportError(boxId, visible) {
  const box = document.querySelector(boxId);
  if (!box) return;
  box.hidden = !visible;
  if (visible) box.textContent = 'Couldn’t create the file. Try again.';
}

function openExportSheet(property) {
  const expenses = expensesByProperty.get(property.id) || [];
  if (!expenses.length) return;
  exportPropertyId = property.id;
  pendingExport = null;
  showExportError('#exportFormatError', false);
  showExportError('#exportReadyError', false);
  setExportFormatBusy(false);
  if (exportReadySheet) exportReadySheet.hidden = true;
  if (exportFormatSheet) exportFormatSheet.hidden = false;
}

function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function saveExportFile() {
  if (!pendingExport) return;
  downloadBlob(pendingExport.blob, pendingExport.name);
}

async function shareExportFile() {
  if (!pendingExport) return;
  const file = pendingExport.file;
  if (canShareFiles(file)) {
    try {
      await navigator.share({
        files: [file],
        title: 'RentManor expenses',
        text: pendingExport.name
      });
      return;
    } catch (error) {
      if (error?.name === 'AbortError') return;
    }
  }
  saveExportFile();
  showToast(SHARE_UNAVAILABLE_TOAST, 4500);
}

async function generateExpenseExport(format) {
  const property = properties.find(item => item.id === exportPropertyId);
  const expenses = expensesByProperty.get(exportPropertyId) || [];
  const formatError = document.querySelector('#exportFormatError');
  if (formatError) formatError.hidden = true;
  if (!property || !expenses.length) return;
  setExportFormatBusy(true);
  if (exportFormatSheet) exportFormatSheet.hidden = true;
  if (exportReadySheet) exportReadySheet.hidden = false;
  const progress = document.querySelector('#exportProgress');
  const share = document.querySelector('#exportShareButton');
  const save = document.querySelector('#exportSaveButton');
  if (progress) progress.hidden = false;
  if (share) share.disabled = true;
  if (save) save.disabled = true;
  showExportError('#exportReadyError', false);
  try {
    const ext = format === 'pdf' ? 'pdf' : 'csv';
    const name = exportFileName(property.address, ext, { sample: sampleMode });
    const type = ext === 'pdf' ? 'application/pdf' : 'text/csv';
    const payload = ext === 'pdf'
      ? expensesToPdf({ address: property.address, list: expenses })
      : expensesToCsv(expenses);
    const blob = new Blob([payload], { type });
    const file = new File([blob], name, { type });
    const { count, total } = exportTotals(expenses);
    pendingExport = { blob, file, name };
    const fileNameEl = document.querySelector('#exportFileName');
    const summaryEl = document.querySelector('#exportReadySummary');
    if (fileNameEl) fileNameEl.textContent = name;
    if (summaryEl) summaryEl.textContent = `${count} ${count === 1 ? 'expense' : 'expenses'} · ${money(total)}`;
    if (share) share.disabled = false;
    if (save) save.disabled = false;
  } catch (_) {
    if (exportReadySheet) exportReadySheet.hidden = true;
    if (exportFormatSheet) exportFormatSheet.hidden = false;
    showExportError('#exportFormatError', true);
  } finally {
    if (progress) progress.hidden = true;
    setExportFormatBusy(false);
  }
}

async function applyPickedPhoto(file) {
  if (!file || !canWrite()) return;
  const property = properties.find(item => item.id === editingId);
  closeSheets();
  if (photoContext === 'form' || currentView === 'form') {
    try {
      const compressed = await compressImageFile(file);
      pendingPhotoFile = compressed;
      revokeObjectUrl(pendingPhotoPreview);
      pendingPhotoPreview = URL.createObjectURL(compressed);
      if (formPhotoError) formPhotoError.hidden = true;
      renderFormPhoto(property);
    } catch (error) {
      if (formPhotoError) {
        formPhotoError.hidden = false;
        formPhotoError.textContent = friendlyError(error);
      } else showToast(friendlyError(error));
    }
    return;
  }
  if (!property) return;
  const bar = detailView.querySelector('.upload-bar');
  if (bar) bar.hidden = false;
  uploadBusy = true;
  try {
    await addGalleryPhoto(property, file);
    await loadProperties();
    showToast('Photo saved.');
    renderDetail(properties.find(item => item.id === property.id) || property);
  } catch (error) {
    showToast(friendlyError(error));
  } finally {
    uploadBusy = false;
    if (bar) bar.hidden = true;
  }
}

async function applyPickedPhotos(fileList) {
  const files = [...(fileList || [])].filter(Boolean);
  if (!files.length) return;
  if (photoContext === 'form' || currentView === 'form') {
    await applyPickedPhoto(files[0]);
    return;
  }
  const property = properties.find(item => item.id === editingId);
  if (!property || !canWrite()) return;
  const room = GALLERY_SOFT_CAP - galleryPhotoCount(property.id);
  if (room <= 0) {
    showToast('You can add up to 10 photos.');
    return;
  }
  const accepted = files.slice(0, room);
  if (accepted.length < files.length) showToast('You can add up to 10 photos.');
  closeSheets();
  const bar = detailView.querySelector('.upload-bar');
  if (bar) bar.hidden = false;
  uploadBusy = true;
  try {
    for (const file of accepted) {
      await addGalleryPhoto(property, file);
    }
    await loadProperties();
    showToast(accepted.length > 1 ? 'Photos saved.' : 'Photo saved.');
    renderDetail(properties.find(item => item.id === property.id) || property);
  } catch (error) {
    showToast(friendlyError(error));
  } finally {
    uploadBusy = false;
    if (bar) bar.hidden = true;
  }
}

async function removePropertyPhoto() {
  if (!canWrite()) return;
  const property = properties.find(item => item.id === editingId);
  closeSheets();
  if (photoContext === 'form' || currentView === 'form') {
    pendingPhotoFile = null;
    revokeObjectUrl(pendingPhotoPreview);
    pendingPhotoPreview = '';
    if (property) property.thumbnailPath = property.thumbnailPath || '';
    if (property?.thumbnailPath && await askConfirm({ title: 'Remove photo', message: 'Remove this photo?', confirmLabel: 'Remove photo' })) {
      try {
        await removeAccountMedia(property.thumbnailPath);
        await getSupabase().from('properties').update({ thumbnail_path: null }).eq('id', property.id);
        property.thumbnailPath = '';
        await loadProperties();
      } catch (error) {
        showToast(friendlyError(error));
      }
    }
    renderFormPhoto(properties.find(item => item.id === property?.id) || property);
    return;
  }
  const photos = photosByProperty.get(property?.id) || [];
  const selected = galleryPhotoId ? photos.find(item => item.id === galleryPhotoId) : (photos.find(item => item.isPrimary) || photos[0]);
  if (lightbox) lightbox.hidden = true;
  if (!property || !selected || !await askConfirm({ title: 'Remove photo', message: 'Remove this photo?', confirmLabel: 'Remove photo' })) return;
  try {
    if (!String(selected.id).startsWith('thumb-')) {
      const { error } = await getSupabase().from('property_photos').delete().eq('id', selected.id);
      if (error && !isSchemaSetupError(error)) throw error;
    }
    try { await removeAccountMedia(selected.storagePath); } catch (_) { /* row may already be gone */ }
    const remaining = (photosByProperty.get(property.id) || []).filter(item => item.id !== selected.id);
    const nextCover = remaining.find(item => item.isPrimary) || remaining[0];
    await getSupabase().from('properties').update({ thumbnail_path: nextCover?.storagePath || null }).eq('id', property.id);
    await loadProperties();
    await loadPhotos(property.id);
    showToast('Photo removed.');
    renderDetail(properties.find(item => item.id === property.id));
  } catch (error) {
    showToast(friendlyError(error));
  }
}

async function makePhotoPrimary() {
  if (!canWrite()) return;
  const property = properties.find(item => item.id === editingId);
  const photos = photosByProperty.get(property?.id) || [];
  const selected = photos.find(item => item.id === galleryPhotoId);
  closeSheets();
  if (lightbox) lightbox.hidden = true;
  if (!property || !selected) return;
  try {
    const supabase = getSupabase();
    await supabase.from('property_photos').update({ is_primary: false }).eq('property_id', property.id);
    const { error } = await supabase.from('property_photos').update({ is_primary: true }).eq('id', selected.id);
    if (error) throw error;
    await supabase.from('properties').update({ thumbnail_path: selected.storagePath }).eq('id', property.id);
    await loadProperties();
    await loadPhotos(property.id);
    showToast('List photo updated.');
    renderDetail(properties.find(item => item.id === property.id) || property);
  } catch (error) {
    showToast(friendlyError(error));
  }
}

async function viewSelectedGalleryPhoto() {
  const property = properties.find(item => item.id === editingId);
  const photos = photosByProperty.get(property?.id) || [];
  const selected = photos.find(item => item.id === galleryPhotoId) || photos.find(item => item.isPrimary);
  closeSheets();
  if (selected?.storagePath) viewMedia(selected.storagePath, property?.address || '');
}

function categoryChips(selected) {
  return CATEGORIES.map(name => `
    <label class="chip ${name === selected ? 'active' : ''}">
      <input type="radio" name="category" value="${escapeHTML(name)}" ${name === selected ? 'checked' : ''}>
      ${escapeHTML(name)}
    </label>`).join('');
}

function receiptBlock(expense) {
  const receipt = expense ? receiptForExpense(expense.id) : null;
  const preview = pendingReceiptPreview;
  if (preview || receipt) {
    const name = pendingReceiptFile?.name || receipt?.fileName || 'Receipt';
    const pdf = pendingReceiptFile ? isPdf(pendingReceiptFile) : isPdf(receipt?.contentType, receipt?.fileName);
    return `
      <div class="receipt-tile">
        <div class="receipt-thumb ${pdf ? 'is-pdf' : ''}">${pdf ? 'PDF' : (preview ? `<img src="${escapeHTML(preview)}" alt="">` : '<span aria-hidden="true">📎</span>')}</div>
        <div class="receipt-meta">
          <strong>${escapeHTML(name)}</strong>
          <div class="receipt-actions">
            ${receipt && !pendingReceiptFile ? `<button class="text-button" type="button" data-action="view-receipt" data-expense-id="${escapeHTML(expense.id)}">View</button>` : ''}
            ${canWrite() ? `<button class="text-button js-write" type="button" data-action="replace-receipt">Replace</button>
            <button class="text-button danger js-write" type="button" data-action="remove-receipt">Remove</button>` : ''}
          </div>
        </div>
        <span class="upload-bar" hidden><span></span></span>
      </div>`;
  }
  if (!canWrite()) return '<p class="muted">No receipt.</p>';
  return `<button class="receipt-empty js-write" type="button" data-action="add-receipt">Add receipt</button>`;
}

function renderExpenseForm(property, expense) {
  const selected = expense?.category && CATEGORIES.includes(expense.category) ? expense.category : (expense?.category ? 'Other' : 'Repairs');
  const write = canWrite();
  expenseView.innerHTML = `
    <button class="back-link" type="button" data-action="back-to-detail" data-id="${escapeHTML(property.id)}"><span aria-hidden="true">‹</span> Back to ${escapeHTML(property.address)}</button>
    <div class="section-heading form-title">
      <div>
        <p class="eyebrow">${write ? (expense ? 'Update expense' : 'New expense') : 'Expense'}</p>
        <h2 id="expenseHeading">${write ? (expense ? 'Edit expense' : 'New expense') : 'Expense'}</h2>
      </div>
    </div>
    <form id="expenseForm" novalidate>
      <div id="expenseError" class="form-error" role="alert" hidden></div>
      <label>Date
        <input name="spentOn" type="date" required value="${escapeHTML(expense?.spentOn || todayISO())}">
      </label>
      <label>Amount
        <span class="amount-field"><span aria-hidden="true">$</span><input name="amount" type="number" inputmode="decimal" min="0" step="0.01" required value="${expense ? escapeHTML(String(expense.amount)) : ''}" placeholder="0.00"></span>
      </label>
      <fieldset>
        <legend>Category</legend>
        <div class="chip-row">${categoryChips(selected)}</div>
      </fieldset>
      <label>Notes <span class="optional">(optional)</span>
        <textarea name="notes" rows="3" maxlength="1000" placeholder="What was this for?">${escapeHTML(expense?.notes || '')}</textarea>
      </label>
      <fieldset>
        <legend>Receipt</legend>
        ${receiptBlock(expense)}
        <div id="receiptError" class="form-error" role="alert" hidden></div>
      </fieldset>
      <div class="form-actions sticky">
        <button class="primary-button js-write" type="submit"${write ? '' : ' hidden'}>Save</button>
        <button class="secondary-button" type="button" data-action="back-to-detail" data-id="${escapeHTML(property.id)}">${write ? 'Cancel' : 'Done'}</button>
      </div>
    </form>
    ${expense && write ? `<div class="danger-zone js-write"><button class="danger-link" type="button" data-action="delete-expense" data-expense-id="${escapeHTML(expense.id)}" data-property-id="${escapeHTML(property.id)}">Delete expense</button></div>` : ''}`;
  showView('expense');
  const expenseForm = document.querySelector('#expenseForm');
  if (expenseForm) expenseForm.addEventListener('submit', submitExpense);
  if (!write) {
    expenseView.querySelectorAll('input, textarea, select').forEach(field => { field.disabled = true; });
  }
}

async function openExpense(property, expense = null) {
  if (!expense && !canWrite()) return;
  expensePropertyId = property.id;
  editingExpenseId = expense?.id || null;
  pendingReceiptFile = null;
  revokeObjectUrl(pendingReceiptPreview);
  pendingReceiptPreview = '';
  if (expense) {
    try { await loadReceipts(expense.id); } catch (error) { showToast(friendlyError(error)); }
  }
  renderExpenseForm(property, expense);
}

async function submitExpense(event) {
  event.preventDefault();
  if (!canWrite()) return;
  const property = properties.find(item => item.id === expensePropertyId);
  if (!property) return;
  const formEl = event.currentTarget;
  const errorBox = document.querySelector('#expenseError');
  const spentOn = formEl.spentOn.value;
  const amount = Number(formEl.amount.value);
  const category = formEl.category?.value || 'Other';
  const notes = formEl.notes.value.trim().slice(0, 1000);
  if (!spentOn) { errorBox.hidden = false; errorBox.textContent = 'Please choose a date.'; return; }
  if (!Number.isFinite(amount) || amount < 0) { errorBox.hidden = false; errorBox.textContent = 'Please enter an amount.'; return; }
  const submit = formEl.querySelector('button[type="submit"]');
  const existing = editingExpenseId
    ? (expensesByProperty.get(property.id) || []).find(item => item.id === editingExpenseId)
    : null;
  const saved = {
    id: existing?.id || makeId(),
    propertyId: property.id,
    spentOn,
    amount,
    category,
    notes
  };
  submit.disabled = true;
  try {
    const supabase = getSupabase();
    if (existing) {
      const { error } = await supabase.from('expenses').update(toExpenseRow(saved)).eq('id', saved.id);
      if (error) throw error;
    } else {
      const { error } = await supabase.from('expenses').insert(toExpenseRow(saved));
      if (error) throw error;
    }
    if (pendingReceiptFile) await saveReceiptForExpense(property, saved);
    await loadExpenses(property.id);
    await Promise.all((expensesByProperty.get(property.id) || []).map(item => loadReceipts(item.id).catch(() => [])));
    pendingReceiptFile = null;
    revokeObjectUrl(pendingReceiptPreview);
    pendingReceiptPreview = '';
    showToast(existing ? 'Expense updated.' : 'Expense added.');
    renderDetail(properties.find(item => item.id === property.id) || property);
  } catch (error) {
    errorBox.hidden = false;
    errorBox.textContent = friendlyError(error);
  } finally {
    submit.disabled = false;
  }
}

async function saveReceiptForExpense(property, expense, file = pendingReceiptFile) {
  if (!file || !canWrite()) return;
  const readyFile = isPdf(file) ? assertPdfSize(file) : await compressImageFile(file);
  const receiptId = receiptForExpense(expense.id)?.id || makeId();
  const ext = extensionForType(readyFile.type, isPdf(readyFile) ? 'pdf' : 'jpg');
  const path = receiptObjectPath(activeAccountId(), property.id, expense.id, receiptId, ext);
  await uploadAccountMedia(path, readyFile);
  const previous = receiptForExpense(expense.id);
  if (previous && previous.storagePath && previous.storagePath !== path) {
    try { await removeAccountMedia(previous.storagePath); } catch (_) { /* keep new file */ }
  }
  const row = {
    id: receiptId,
    account_id: activeAccountId(),
    expense_id: expense.id,
    storage_path: path,
    content_type: isPdf(readyFile) ? 'application/pdf' : (readyFile.type || ''),
    file_name: readyFile.name || `receipt.${ext}`
  };
  const supabase = getSupabase();
  if (previous) {
    const { error } = await supabase.from('receipts').update(row).eq('id', receiptId);
    if (error) throw error;
  } else {
    const { error } = await supabase.from('receipts').insert(row);
    if (error) throw error;
  }
  await loadReceipts(expense.id);
}

async function applyPickedReceipt(file) {
  if (!file || !canWrite()) return;
  if (filePickerContext === 'lease' || filePickerContext === 'correspondence') {
    await applyPickedTenantFile(file);
    return;
  }
  closeSheets();
  const receiptError = document.querySelector('#receiptError');
  try {
    const ready = isPdf(file) ? assertPdfSize(file) : await compressImageFile(file);
    pendingReceiptFile = ready;
    revokeObjectUrl(pendingReceiptPreview);
    pendingReceiptPreview = isPdf(ready) ? '' : URL.createObjectURL(ready);
    const property = properties.find(item => item.id === expensePropertyId);
    const expense = (expensesByProperty.get(expensePropertyId) || []).find(item => item.id === editingExpenseId);
    if (receiptError) receiptError.hidden = true;
    // Existing expense: persist now so PDF/image replace survives without another Save tap.
    if (property && expense?.id) {
      const bar = expenseView.querySelector('.upload-bar');
      if (bar) bar.hidden = false;
      try {
        await saveReceiptForExpense(property, expense, ready);
        pendingReceiptFile = null;
        revokeObjectUrl(pendingReceiptPreview);
        pendingReceiptPreview = '';
        showToast('Receipt saved.');
        await loadReceipts(expense.id);
        renderExpenseForm(property, (expensesByProperty.get(property.id) || []).find(item => item.id === expense.id) || expense);
      } finally {
        if (bar) bar.hidden = true;
      }
      return;
    }
    if (property) renderExpenseForm(property, expense || null);
  } catch (error) {
    if (receiptError) {
      receiptError.hidden = false;
      receiptError.textContent = friendlyError(error);
    } else showToast(friendlyError(error));
  }
}

async function removeCurrentReceipt() {
  if (!canWrite()) return;
  const expense = (expensesByProperty.get(expensePropertyId) || []).find(item => item.id === editingExpenseId);
  if (pendingReceiptFile) {
    pendingReceiptFile = null;
    revokeObjectUrl(pendingReceiptPreview);
    pendingReceiptPreview = '';
  } else {
    const receipt = expense ? receiptForExpense(expense.id) : null;
    if (!receipt || !await askConfirm({ title: 'Remove receipt', message: 'Remove this receipt?', confirmLabel: 'Remove' })) return;
    try {
      await getSupabase().from('receipts').delete().eq('id', receipt.id);
      try { await removeAccountMedia(receipt.storagePath); } catch (_) { /* row gone */ }
      await loadReceipts(expense.id);
    } catch (error) {
      showToast(friendlyError(error));
      return;
    }
  }
  const property = properties.find(item => item.id === expensePropertyId);
  if (property) renderExpenseForm(property, expense || null);
}

async function deleteExpense(propertyId, expenseId) {
  if (!canWrite()) return;
  if (!await askConfirm({ title: 'Delete expense', message: 'Delete this expense? This cannot be undone.', confirmLabel: 'Delete expense' })) return;
  try {
    const receipts = receiptsByExpense.get(expenseId) || await loadReceipts(expenseId).catch(() => []);
    const { error } = await getSupabase().from('expenses').delete().eq('id', expenseId);
    if (error) throw error;
    try { await removeAccountMedia(receipts.map(item => item.storagePath)); } catch (_) { /* rows gone */ }
    receiptsByExpense.delete(expenseId);
    await loadExpenses(propertyId);
    showToast('Expense deleted.');
    renderDetail(properties.find(item => item.id === propertyId));
  } catch (error) {
    showToast(friendlyError(error));
  }
}

async function viewMedia(path, alt = '', { gallery = false } = {}) {
  const url = await resolveMediaUrl(path);
  if (!url) {
    showToast('Could not open that file.');
    return;
  }
  if (/\.pdf($|\?)/i.test(path) || /\.pdf($|\?)/i.test(url)) {
    window.open(url, '_blank', 'noopener');
    return;
  }
  const image = document.querySelector('#lightboxImage');
  if (image) {
    image.src = url;
    image.alt = alt || '';
  }
  const actions = document.querySelector('#lightboxActions');
  if (actions) actions.hidden = !(gallery && canWrite());
  lightbox.hidden = false;
}

async function syncTenantFromProperty(property) {
  if (!canWrite() || !property) return;
  const supabase = getSupabase();
  if (!supabase) return;
  let existing = tenantByProperty.get(property.id);
  if (existing === undefined) existing = await loadTenant(property.id).catch(() => null);
  const vacant = property.status === 'vacant';
  if (vacant) {
    if (existing?.id && !String(existing.id).startsWith('legacy-')) {
      const { error } = await supabase.from('tenants').delete().eq('id', existing.id);
      if (error && !isSchemaSetupError(error)) throw error;
    }
    tenantByProperty.set(property.id, null);
    return;
  }
  const row = {
    account_id: activeAccountId(),
    property_id: property.id,
    name: property.tenantName || '',
    phone: property.phone || '',
    email: property.email || ''
  };
  if (existing?.id && !String(existing.id).startsWith('legacy-')) {
    const { error } = await supabase.from('tenants').update(row).eq('id', existing.id);
    if (error && !isSchemaSetupError(error)) throw error;
  } else {
    row.id = makeId();
    const { error } = await supabase.from('tenants').insert(row);
    if (error && !isSchemaSetupError(error)) throw error;
  }
}

async function refreshPropertyAfterTenant(propertyId) {
  await loadProperties();
  await loadTenant(propertyId);
  const tenant = tenantByProperty.get(propertyId);
  if (tenant?.id) await loadTenantFiles(tenant.id).catch(() => []);
  renderDetail(properties.find(item => item.id === propertyId));
}

async function submitTenant(event) {
  event.preventDefault();
  await saveTenantFromForm();
}

async function saveTenantFromForm() {
  if (!canWrite()) return false;
  const property = properties.find(item => item.id === detailPropertyId);
  const formEl = document.querySelector('#tenantForm');
  if (!property || !formEl) return false;
  const errorBox = document.querySelector('#tenantError');
  const name = formEl.name.value.trim();
  const phone = formEl.phone.value.trim();
  const email = formEl.email.value.trim();
  const notes = formEl.notes.value.trim().slice(0, 1000);
  if (!name) {
    if (errorBox) { errorBox.hidden = false; errorBox.textContent = 'Please add the tenant name.'; }
    return false;
  }
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    if (errorBox) { errorBox.hidden = false; errorBox.textContent = 'Please enter a valid email address.'; }
    return false;
  }
  const submit = formEl.querySelector('button[type="submit"]');
  if (submit) submit.disabled = true;
  try {
    const supabase = getSupabase();
    let existing = tenantByProperty.get(property.id);
    if (existing === undefined) existing = await loadTenant(property.id).catch(() => null);
    const row = {
      account_id: activeAccountId(),
      property_id: property.id,
      name,
      phone,
      email,
      notes
    };
    if (existing?.id && !String(existing.id).startsWith('legacy-')) {
      const { error } = await supabase.from('tenants').update(row).eq('id', existing.id);
      if (error) throw error;
    } else {
      row.id = makeId();
      const { error } = await supabase.from('tenants').insert(row);
      if (error) throw error;
    }
    const { error } = await supabase.from('properties').update({
      status: 'occupied',
      tenant_name: name,
      phone,
      email
    }).eq('id', property.id);
    if (error) throw error;
    tenantEditorOpen = false;
    setDetailDirty(false);
    showToast('Tenant saved.');
    await refreshPropertyAfterTenant(property.id);
    return true;
  } catch (error) {
    if (errorBox) {
      errorBox.hidden = false;
      errorBox.textContent = friendlyError(error);
    } else showToast(friendlyError(error));
    return false;
  } finally {
    if (submit) submit.disabled = false;
  }
}

async function markPropertyVacant(propertyId, { fromStatus = false } = {}) {
  if (!canWrite()) return false;
  const asked = fromStatus
    ? await askConfirm({ title: 'Remove tenant record?', message: 'Remove tenant record? Lease copies and letters for this home will be deleted.', confirmLabel: 'Remove tenant' })
    : await askConfirm({ title: 'Remove tenant', message: 'Remove tenant info and files for this home?', confirmLabel: 'Remove tenant' });
  if (!asked) return false;
  try {
    const supabase = getSupabase();
    const tenant = tenantByProperty.get(propertyId) || await loadTenant(propertyId);
    if (tenant?.id && !String(tenant.id).startsWith('legacy-')) {
      const files = tenantFilesByTenant.get(tenant.id) || await loadTenantFiles(tenant.id).catch(() => []);
      const paths = [...files.map(item => item.storagePath), tenant.leaseStoragePath].filter(Boolean);
      const { error } = await supabase.from('tenants').delete().eq('id', tenant.id);
      if (error) throw error;
      try { await removeAccountMedia(paths); } catch (_) { /* rows gone */ }
    }
    const { error } = await supabase.from('properties').update({
      status: 'vacant',
      tenant_name: '',
      phone: '',
      email: ''
    }).eq('id', propertyId);
    if (error) throw error;
    tenantByProperty.set(propertyId, null);
    tenantEditorOpen = false;
    showToast('Home is vacant.');
    await refreshPropertyAfterTenant(propertyId);
    return true;
  } catch (error) {
    showToast(friendlyError(error));
    return false;
  }
}

function openFileSheet(kind) {
  if (!canWrite()) return;
  filePickerContext = kind;
  const title = document.querySelector('#receiptSheetTitle');
  if (title) title.textContent = kind === 'lease' ? 'Add lease' : 'Add a copy';
  if (receiptSheet) receiptSheet.hidden = false;
}

async function applyPickedTenantFile(file) {
  closeSheets();
  const property = properties.find(item => item.id === detailPropertyId);
  if (!property) return;
  let tenant = tenantByProperty.get(property.id);
  if (!tenant?.id || String(tenant.id).startsWith('legacy-')) {
    showToast('Save the tenant first, then add files.');
    return;
  }
  const ready = isPdf(file) ? assertPdfSize(file) : await compressImageFile(file);
  const ext = extensionForType(ready.type, isPdf(ready) ? 'pdf' : 'jpg');
  const supabase = getSupabase();
  try {
    if (filePickerContext === 'lease') {
      const path = leaseObjectPath(activeAccountId(), property.id, ext);
      await uploadAccountMedia(path, ready);
      if (tenant.leaseStoragePath && tenant.leaseStoragePath !== path) {
        try { await removeAccountMedia(tenant.leaseStoragePath); } catch (_) { /* keep new file */ }
      }
      const { error } = await supabase.from('tenants').update({
        lease_storage_path: path,
        lease_content_type: isPdf(ready) ? 'application/pdf' : (ready.type || ''),
        lease_file_name: ready.name || `lease.${ext}`
      }).eq('id', tenant.id);
      if (error) throw error;
      showToast('Lease saved.');
    } else {
      const fileId = makeId();
      const path = tenantFileObjectPath(activeAccountId(), property.id, fileId, ext);
      await uploadAccountMedia(path, ready);
      const { error } = await supabase.from('tenant_files').insert({
        id: fileId,
        account_id: activeAccountId(),
        tenant_id: tenant.id,
        property_id: property.id,
        kind: 'correspondence',
        storage_path: path,
        content_type: isPdf(ready) ? 'application/pdf' : (ready.type || ''),
        file_name: ready.name || `file.${ext}`
      });
      if (error) throw error;
      showToast('Copy saved.');
    }
    filePickerContext = 'receipt';
    await refreshPropertyAfterTenant(property.id);
  } catch (error) {
    filePickerContext = 'receipt';
    showToast(friendlyError(error));
  }
}

async function removeLease() {
  if (!canWrite()) return;
  const property = properties.find(item => item.id === detailPropertyId);
  const tenant = tenantByProperty.get(property?.id);
  if (!tenant?.leaseStoragePath || !await askConfirm({ title: 'Remove lease', message: 'Remove this lease file?', confirmLabel: 'Remove' })) return;
  try {
    const { error } = await getSupabase().from('tenants').update({
      lease_storage_path: null,
      lease_content_type: '',
      lease_file_name: ''
    }).eq('id', tenant.id);
    if (error) throw error;
    try { await removeAccountMedia(tenant.leaseStoragePath); } catch (_) { /* row updated */ }
    showToast('Lease removed.');
    await refreshPropertyAfterTenant(property.id);
  } catch (error) {
    showToast(friendlyError(error));
  }
}

async function deleteTenantFile(fileId) {
  if (!canWrite()) return;
  const property = properties.find(item => item.id === detailPropertyId);
  const tenant = tenantByProperty.get(property?.id);
  const files = tenantFilesByTenant.get(tenant?.id) || [];
  const file = files.find(item => item.id === fileId);
  if (!file || !await askConfirm({ title: 'Remove copy', message: 'Remove this file?', confirmLabel: 'Remove' })) return;
  try {
    const { error } = await getSupabase().from('tenant_files').delete().eq('id', file.id);
    if (error) throw error;
    try { await removeAccountMedia(file.storagePath); } catch (_) { /* row gone */ }
    showToast('File removed.');
    await refreshPropertyAfterTenant(property.id);
  } catch (error) {
    showToast(friendlyError(error));
  }
}

async function submitAppliance(event) {
  event.preventDefault();
  if (!canWrite()) return;
  const property = properties.find(item => item.id === detailPropertyId);
  if (!property) return;
  const formEl = event.currentTarget;
  const name = formEl.name.value.trim();
  const fuel = formEl.fuel.value || null;
  const notes = formEl.notes.value.trim().slice(0, 200);
  if (!name) {
    showToast('Please name the appliance.');
    return;
  }
  const submit = formEl.querySelector('button[type="submit"]');
  submit.disabled = true;
  try {
    const { error } = await getSupabase().from('property_appliances').insert({
      id: makeId(),
      account_id: activeAccountId(),
      property_id: property.id,
      name,
      fuel,
      notes
    });
    if (error) throw error;
    showToast('Appliance added.');
    await loadAppliances(property.id);
    renderDetail(property);
  } catch (error) {
    showToast(friendlyError(error));
  } finally {
    submit.disabled = false;
  }
}

async function deleteAppliance(applianceId) {
  if (!canWrite()) return;
  if (!await askConfirm({ title: 'Remove appliance', message: 'Remove this appliance?', confirmLabel: 'Remove' })) return;
  try {
    const { error } = await getSupabase().from('property_appliances').delete().eq('id', applianceId);
    if (error) throw error;
    const property = properties.find(item => item.id === detailPropertyId);
    showToast('Appliance removed.');
    if (property) {
      await loadAppliances(property.id);
      renderDetail(property);
    }
  } catch (error) {
    showToast(friendlyError(error));
  }
}

async function viewReceipt(expenseId) {
  const receipt = receiptForExpense(expenseId);
  if (!receipt) return;
  if (isPdf(receipt.contentType, receipt.fileName)) {
    const url = await resolveMediaUrl(receipt.storagePath);
    if (url) window.open(url, '_blank', 'noopener');
    else showToast('Could not open that file.');
    return;
  }
  viewMedia(receipt.storagePath, receipt.fileName);
}

function showToast(message, ms = 2800) {
  clearTimeout(toastTimer);
  toast.textContent = message;
  toast.hidden = false;
  toastTimer = setTimeout(() => { toast.hidden = true; }, ms);
}

function closeModals() {
  backupPanel.hidden = true;
  accountPanel.hidden = true;
  invitePanel.hidden = true;
  importPanel.hidden = true;
  closeSheets();
  if (lightbox) lightbox.hidden = true;
  if (confirmSheet && !confirmSheet.hidden) settleConfirm(false);
}

function downloadBackup() {
  const payload = { app: 'RentManor', version: 1, exportedAt: new Date().toISOString(), properties };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `rentmanor-backup-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  closeModals();
  showToast('Backup downloaded.');
}

async function handleRestore(event) {
  if (sampleMode) { showToast('Sample homes cannot be changed.'); event.target.value = ''; return; }
  const file = event.target.files[0];
  event.target.value = '';
  if (!file || !canWrite()) return;
  const reader = new FileReader();
  reader.onload = async () => {
    try {
      const cleaned = readBackupFile(reader.result);
      if (!window.confirm(`Replace all current properties in this account with ${cleaned.length} ${cleaned.length === 1 ? 'property' : 'properties'} from this backup?`)) return;
      await replaceAccountProperties(cleaned.map(toRow));
      await markAccountSeeded();
      expensesByProperty.clear();
      receiptsByExpense.clear();
      await loadProperties();
      closeModals();
      activeFilter = 'all';
      document.querySelectorAll('.filter-button').forEach(button => button.classList.toggle('active', button.dataset.filter === 'all'));
      searchInput.value = '';
      showView('list');
      showToast('Backup restored.');
    } catch (error) {
      showToast(error?.message === 'No property list' ? 'That file could not be restored.' : friendlyError(error));
    }
  };
  reader.onerror = () => showToast('Could not read that file.');
  reader.readAsText(file);
}

function updateLegacyButton() {
  legacyImportButton.hidden = sampleMode || getLegacyProperties().length === 0;
}

function openImportPanel(mode) {
  importMode = mode;
  const legacy = getLegacyProperties();
  const message = document.querySelector('#importMessage');
  if (!legacy.length) {
    showToast('No older properties were found on this phone.');
    return;
  }
  const count = `${legacy.length} ${legacy.length === 1 ? 'property' : 'properties'}`;
  message.textContent = mode === 'offer'
    ? `We found ${count} saved on this phone from before accounts. Add them to this account?`
    : `Add ${count} saved on this phone to this account?`;
  accountPanel.hidden = true;
  importPanel.hidden = false;
}

async function importLegacyProperties() {
  if (sampleMode) { showToast('Sample homes cannot be changed.'); return; }
  const legacy = getLegacyProperties();
  if (!legacy.length) return;
  try {
    await insertProperties(legacy.map(property => ({ ...property, id: makeId() })));
    await markAccountSeeded();
    markLegacyOffered();
    await loadProperties();
    closeModals();
    showView('list');
    showToast('Those homes are now in your account.');
  } catch (error) {
    showToast(friendlyError(error));
  }
}

async function afterPropertiesReady() {
  updateLegacyButton();
  const legacy = getLegacyProperties();
  const alreadyOffered = Boolean(localStorage.getItem(offeredKey()));
  if (!sampleMode && legacy.length && !alreadyOffered && !properties.length) {
    openImportPanel('offer');
    return;
  }
  showView('list');
}

function updateAccountSummary() {
  const user = getUser();
  const account = getAccount();
  const summary = document.querySelector('#accountSummary');
  const email = user?.email || 'your email';
  const name = account?.name || 'Your account';
  summary.textContent = `Signed in as ${email}. Homes in “${name}” stay private to this account.`;
  inviteButton.hidden = sampleMode || !isOwner();
}

async function openAccountMenu() {
  if (sampleMode) return;
  updateAccountSummary();
  updateLegacyButton();
  accountPanel.hidden = false;
}

async function openInvitePanel() {
  const result = document.querySelector('#inviteResult');
  const errorBox = document.querySelector('#inviteError');
  const memberList = document.querySelector('#memberList');
  result.hidden = true;
  errorBox.hidden = true;
  memberList.textContent = 'Loading who can see this account…';
  accountPanel.hidden = true;
  invitePanel.hidden = false;
  try {
    const members = await listMembers();
    if (!members.length) {
      memberList.textContent = '';
      return;
    }
    memberList.innerHTML = `<strong>People on this account</strong>${members.map(member => {
      const label = member.email || 'Signed-in person';
      const role = member.role === 'owner' ? 'owner' : 'can view & edit';
      return `<div>${escapeHTML(label)} · ${role}</div>`;
    }).join('')}`;
  } catch (error) {
    memberList.textContent = friendlyError(error);
  }
}

async function submitInvite(event) {
  event.preventDefault();
  const formEl = event.currentTarget;
  const email = formEl.email.value.trim();
  const errorBox = document.querySelector('#inviteError');
  const result = document.querySelector('#inviteResult');
  const submit = formEl.querySelector('button[type="submit"]');
  errorBox.hidden = true;
  submit.disabled = true;
  try {
    const row = await createInvite(email);
    const url = inviteUrl(row.token);
    document.querySelector('#inviteCode').textContent = row.token;
    result.hidden = false;
    result.dataset.url = url;
    showToast('Invite ready. Copy the link and send it.');
  } catch (error) {
    errorBox.hidden = false;
    errorBox.textContent = friendlyError(error);
  } finally {
    submit.disabled = false;
  }
}

async function copyInviteLink() {
  const result = document.querySelector('#inviteResult');
  const url = result?.dataset.url;
  const code = document.querySelector('#inviteCode')?.textContent || '';
  const text = url || code;
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
    showToast('Invite link copied.');
  } catch (_) {
    window.prompt('Copy this invite link:', text);
  }
}

function leaveSample(dest) {
  if (dest === 'signup' || dest === 'signin') requestAuthMode(dest);
  exitSampleRoute();
}

function bindUi() {
  if (ready) return;
  ready = true;
  document.querySelector('#addButton').addEventListener('click', () => openForm());
  searchInput.addEventListener('input', renderList);
  clearSearch.addEventListener('click', () => { searchInput.value = ''; renderList(); searchInput.focus(); });
  document.querySelectorAll('.filter-button').forEach(button => button.addEventListener('click', () => {
    activeFilter = button.dataset.filter;
    document.querySelectorAll('.filter-button').forEach(item => item.classList.toggle('active', item === button));
    renderList();
  }));
  form.addEventListener('submit', submitForm);
  deleteButton.addEventListener('click', () => deleteProperty());
  document.querySelector('#accountButton').addEventListener('click', openAccountMenu);
  document.querySelector('#backupButton').addEventListener('click', () => { accountPanel.hidden = true; backupPanel.hidden = false; });
  document.querySelector('#downloadButton').addEventListener('click', downloadBackup);
  document.querySelector('#restoreButton').addEventListener('click', () => restoreInput.click());
  restoreInput.addEventListener('change', handleRestore);
  inviteButton.addEventListener('click', openInvitePanel);
  document.querySelector('#inviteForm').addEventListener('submit', submitInvite);
  document.querySelector('#copyInviteButton').addEventListener('click', copyInviteLink);
  legacyImportButton.addEventListener('click', () => openImportPanel('manual'));
  document.querySelector('#confirmImportButton').addEventListener('click', importLegacyProperties);
  document.querySelector('#skipImportButton').addEventListener('click', async () => {
    markLegacyOffered();
    closeModals();
    showView('list');
  });
  document.querySelector('#signOutButton').addEventListener('click', async () => {
    closeModals();
    await signOut();
  });
  document.querySelector('#exitSampleAccount')?.addEventListener('click', () => leaveSample('account'));
  document.querySelector('#exitSampleSignIn')?.addEventListener('click', () => leaveSample('signin'));
  document.querySelector('#exitSampleSignUp')?.addEventListener('click', () => leaveSample('signup'));
  document.querySelector('#exportShareButton')?.addEventListener('click', shareExportFile);
  document.querySelector('#exportSaveButton')?.addEventListener('click', saveExportFile);
  document.querySelector('#confirmYes')?.addEventListener('click', () => settleConfirm(true));
  document.querySelector('#confirmDiscard')?.addEventListener('click', () => settleConfirm('discard'));
  document.querySelector('#photoCameraInput')?.addEventListener('change', event => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file) applyPickedPhoto(file);
  });
  document.querySelector('#photoLibraryInput')?.addEventListener('change', event => {
    const files = event.target.files;
    event.target.value = '';
    if (files?.length) applyPickedPhotos(files);
  });
  document.querySelector('#receiptCameraInput')?.addEventListener('change', event => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file) applyPickedReceipt(file);
  });
  document.querySelector('#receiptLibraryInput')?.addEventListener('change', event => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file) applyPickedReceipt(file);
  });
  document.querySelector('#receiptPdfInput')?.addEventListener('change', event => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file) applyPickedReceipt(file);
  });

  document.addEventListener('click', async event => {
    const photoChoice = event.target.closest('[data-photo]');
    if (photoChoice) {
      const choice = photoChoice.dataset.photo;
      if (choice === 'camera') document.querySelector('#photoCameraInput').click();
      if (choice === 'library') document.querySelector('#photoLibraryInput').click();
      if (choice === 'remove') removePropertyPhoto();
      if (choice === 'view') viewSelectedGalleryPhoto();
      if (choice === 'primary') makePhotoPrimary();
      return;
    }
    const receiptChoice = event.target.closest('[data-receipt]');
    if (receiptChoice) {
      const choice = receiptChoice.dataset.receipt;
      if (choice === 'camera') document.querySelector('#receiptCameraInput').click();
      if (choice === 'library') document.querySelector('#receiptLibraryInput').click();
      if (choice === 'pdf') document.querySelector('#receiptPdfInput').click();
      return;
    }
    const exportChoice = event.target.closest('[data-export-format]');
    if (exportChoice && !exportChoice.disabled) {
      generateExpenseExport(exportChoice.dataset.exportFormat);
      return;
    }

    const actionTarget = event.target.closest('[data-action]');
    if (actionTarget) {
      const action = actionTarget.dataset.action;
      if (action === 'add') { if (canWrite()) openForm(); }
      if (action === 'edit') { if (canWrite()) openForm(properties.find(property => property.id === actionTarget.dataset.id)); }
      if (action === 'back-to-list' || action === 'cancel-form') {
        if (currentView === 'detail' && await confirmLeaveDirtyTab() !== 'ok') return;
        setDetailDirty(false);
        if (sampleMode) goSample();
        else showView('list');
      }
      if (action === 'back-to-detail') {
        if (sampleMode) goSample(actionTarget.dataset.id || '');
        else {
          const property = properties.find(item => item.id === actionTarget.dataset.id);
          if (property) renderDetail(property);
          else showView('list');
        }
      }
      if (action === 'clear-filters') { searchInput.value = ''; activeFilter = 'all'; document.querySelectorAll('.filter-button').forEach(button => button.classList.toggle('active', button.dataset.filter === 'all')); renderList(); }
      if (action === 'view-sample') enterSampleRoute();
      if (action === 'detail-tab') {
        await switchDetailTab(actionTarget.dataset.tab);
      }
      if (action === 'goto-tenant') await switchDetailTab('tenant');
      if (action === 'goto-expenses') await switchDetailTab('expenses');
      if (action === 'set-status-occupied') {
        const property = properties.find(item => item.id === detailPropertyId);
        if (!property || property.status === 'occupied') return;
        if (await confirmLeaveDirtyTab() !== 'ok') {
          renderDetail(property);
          return;
        }
        tenantEditorOpen = true;
        detailTab = 'tenant';
        renderDetail(property);
      }
      if (action === 'set-status-vacant') {
        const property = properties.find(item => item.id === detailPropertyId);
        const tenant = tenantByProperty.get(detailPropertyId);
        if (!property || (property.status === 'vacant' && !hasCurrentTenant(tenant))) return;
        if (await confirmLeaveDirtyTab() !== 'ok') {
          renderDetail(property);
          return;
        }
        const removed = await markPropertyVacant(property.id, { fromStatus: true });
        if (!removed) renderDetail(properties.find(item => item.id === property.id) || property);
      }
      if (action === 'delete-property') deleteProperty(actionTarget.dataset.id || detailPropertyId);
      if (action === 'add-gallery-photo') {
        const property = properties.find(item => item.id === (actionTarget.dataset.id || detailPropertyId));
        if (property) openPhotoSheet(property, 'gallery');
      }
      if (action === 'gallery-photo') {
        const property = properties.find(item => item.id === detailPropertyId);
        const photos = photosByProperty.get(property?.id) || thumbnailAsPhotos(property);
        const selected = photos.find(item => item.id === actionTarget.dataset.photoId);
        if (property && selected) {
          galleryPhotoId = selected.id;
          editingId = property.id;
          viewMedia(selected.storagePath, property.address, { gallery: true });
        }
      }
      if (action === 'lightbox-primary') makePhotoPrimary();
      if (action === 'lightbox-remove') removePropertyPhoto();
      if (action === 'add-tenant') {
        tenantEditorOpen = true;
        detailTab = 'tenant';
        const property = properties.find(item => item.id === detailPropertyId);
        if (property) renderDetail(property);
      }
      if (action === 'edit-tenant') {
        tenantEditorOpen = true;
        const property = properties.find(item => item.id === detailPropertyId);
        if (property) renderDetail(property);
      }
      if (action === 'cancel-tenant') {
        tenantEditorOpen = false;
        const property = properties.find(item => item.id === detailPropertyId);
        if (property) renderDetail(property);
      }
      if (action === 'remove-tenant') markPropertyVacant(actionTarget.dataset.id || detailPropertyId);
      if (action === 'add-lease' || action === 'replace-lease') openFileSheet('lease');
      if (action === 'add-correspondence') openFileSheet('correspondence');
      if (action === 'remove-lease') removeLease();
      if (action === 'view-lease') {
        const tenant = tenantByProperty.get(detailPropertyId);
        if (tenant?.leaseStoragePath) {
          if (isPdf(tenant.leaseContentType, tenant.leaseFileName)) {
            resolveMediaUrl(tenant.leaseStoragePath).then(url => {
              if (url) window.open(url, '_blank', 'noopener');
              else showToast('Could not open that file.');
            });
          } else viewMedia(tenant.leaseStoragePath, tenant.leaseFileName);
        }
      }
      if (action === 'view-tenant-file') {
        const tenant = tenantByProperty.get(detailPropertyId);
        const file = (tenantFilesByTenant.get(tenant?.id) || []).find(item => item.id === actionTarget.dataset.fileId);
        if (file) {
          if (isPdf(file.contentType, file.fileName)) {
            resolveMediaUrl(file.storagePath).then(url => {
              if (url) window.open(url, '_blank', 'noopener');
              else showToast('Could not open that file.');
            });
          } else viewMedia(file.storagePath, file.fileName);
        }
      }
      if (action === 'delete-tenant-file') deleteTenantFile(actionTarget.dataset.fileId);
      if (action === 'delete-appliance') deleteAppliance(actionTarget.dataset.applianceId);
      if (action === 'photo-sheet') openPhotoSheet(properties.find(item => item.id === actionTarget.dataset.id), 'gallery');
      if (action === 'form-photo') openPhotoSheet(properties.find(item => item.id === editingId) || { id: editingId, thumbnailPath: pendingPhotoPreview || '' }, 'form');
      if (action === 'view-hero') {
        const property = properties.find(item => item.id === actionTarget.dataset.id);
        const photos = photosByProperty.get(property?.id) || thumbnailAsPhotos(property);
        const cover = photos.find(item => item.isPrimary) || photos[0];
        const path = cover?.storagePath || property?.thumbnailPath;
        if (path) {
          galleryPhotoId = cover?.id || null;
          if (property) editingId = property.id;
          viewMedia(path, property.address, { gallery: Boolean(cover) });
        }
      }
      if (action === 'export-expenses') {
        const property = properties.find(item => item.id === actionTarget.dataset.id);
        if (property) openExportSheet(property);
      }
      if (action === 'add-expense') {
        if (!canWrite()) return;
        detailTab = 'expenses';
        const property = properties.find(item => item.id === actionTarget.dataset.id);
        if (property) openExpense(property);
      }
      if (action === 'open-expense') {
        detailTab = 'expenses';
        const property = properties.find(item => item.id === actionTarget.dataset.propertyId);
        const expense = (expensesByProperty.get(actionTarget.dataset.propertyId) || []).find(item => item.id === actionTarget.dataset.expenseId);
        if (property && expense && sampleMode) goSample(`${property.id}/expense/${expense.id}`);
        else if (property && expense) openExpense(property, expense);
      }
      if (action === 'add-receipt' || action === 'replace-receipt') {
        if (!canWrite()) return;
        filePickerContext = 'receipt';
        const title = document.querySelector('#receiptSheetTitle');
        if (title) title.textContent = 'Add receipt';
        receiptSheet.hidden = false;
      }
      if (action === 'remove-receipt') removeCurrentReceipt();
      if (action === 'view-receipt') viewReceipt(actionTarget.dataset.expenseId);
      if (action === 'delete-expense') deleteExpense(actionTarget.dataset.propertyId, actionTarget.dataset.expenseId);
      if (action === 'close-backup') backupPanel.hidden = true;
      if (action === 'close-account') accountPanel.hidden = true;
      if (action === 'close-invite') invitePanel.hidden = true;
      if (action === 'close-photo-sheet' || action === 'close-receipt-sheet' || action === 'close-export') closeSheets();
      if (action === 'close-confirm') settleConfirm(false);
      if (action === 'close-lightbox') {
        lightbox.hidden = true;
        const actions = document.querySelector('#lightboxActions');
        if (actions) actions.hidden = true;
      }
      if (action === 'close-import') {
        if (importMode === 'offer') markLegacyOffered();
        importPanel.hidden = true;
        showView('list');
      }
      return;
    }
    const card = event.target.closest('.property-card');
    if (card) {
      detailTab = 'property';
      tenantEditorOpen = false;
      setDetailDirty(false);
      const property = properties.find(item => item.id === card.dataset.id);
      if (property && sampleMode) goSample(property.id);
      else if (property) renderDetail(property);
    }
    if (event.target === backupPanel) backupPanel.hidden = true;
    if (event.target === accountPanel) accountPanel.hidden = true;
    if (event.target === invitePanel) invitePanel.hidden = true;
    if (event.target === photoSheet || event.target === receiptSheet || event.target === exportFormatSheet || event.target === exportReadySheet) closeSheets();
    if (event.target === confirmSheet) settleConfirm(false);
    if (event.target === lightbox) {
      lightbox.hidden = true;
      const actions = document.querySelector('#lightboxActions');
      if (actions) actions.hidden = true;
    }
    if (event.target === importPanel) {
      if (importMode === 'offer') markLegacyOffered();
      importPanel.hidden = true;
      showView('list');
    }
  });
  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    if (!importPanel.hidden && importMode === 'offer') markLegacyOffered();
    closeModals();
  });
}

function resetLocalState() {
  properties = [];
  expensesByProperty = new Map();
  receiptsByExpense = new Map();
  photosByProperty = new Map();
  appliancesByProperty = new Map();
  tenantByProperty = new Map();
  tenantFilesByTenant = new Map();
  usingSampleFallback = false;
  activeFilter = 'all';
  editingId = null;
  editingExpenseId = null;
  expensePropertyId = null;
  detailTab = 'property';
  detailPropertyId = null;
  tenantEditorOpen = false;
  detailDirty = false;
  galleryPhotoId = null;
  searchInput.value = '';
  document.querySelectorAll('.filter-button').forEach(button => button.classList.toggle('active', button.dataset.filter === 'all'));
  propertyList.innerHTML = '';
  propertyCount.textContent = '';
}

startAuth(async ({ status, notice }) => {
  bindUi();
  sampleMode = status === 'sample';
  updateSampleChrome();
  if (status === 'need-config' || status === 'signed-out') {
    resetLocalState();
    return;
  }
  if (status === 'sample') {
    try {
      expensesByProperty = new Map();
      receiptsByExpense = new Map();
      photosByProperty = new Map();
      appliancesByProperty = new Map();
      tenantByProperty = new Map();
      tenantFilesByTenant = new Map();
      await loadProperties();
      await applySamplePath();
    } catch (error) {
      applySampleFallback();
      await applySamplePath();
      showToast(friendlyError(error));
    }
    return;
  }
  if (status !== 'signed-in') return;
  try {
    expensesByProperty = new Map();
    receiptsByExpense = new Map();
    await loadProperties();
    updateAccountSummary();
    await afterPropertiesReady();
    if (notice) showToast(notice);
  } catch (error) {
    showToast(friendlyError(error));
    propertyList.innerHTML = `<div class="empty-state"><div class="empty-icon" aria-hidden="true">⌂</div><h3>Could not load homes</h3><p>${escapeHTML(friendlyError(error))}</p></div>`;
  }
});

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('./sw.js').catch(() => { /* offline support is optional */ });
}
