/* RentManor — per-account property manager (Supabase-backed). */
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
  SAMPLE_ACCOUNT_ID,
  enterSampleRoute,
  exitSampleRoute,
  requestAuthMode
} from './auth.js';
import {
  thumbnailObjectPath,
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
let activeFilter = 'all';
let currentView = 'list';
let editingId = null;
let editingExpenseId = null;
let expensePropertyId = null;
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
  if (sampleMode) return SAMPLE_ACCOUNT_ID;
  return getAccount()?.id || '';
}

function canWrite() {
  return !sampleMode && Boolean(getAccount()?.id);
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
    createdAt: row.created_at || new Date().toISOString(),
    updatedAt: row.updated_at || new Date().toISOString()
  };
}

function toRow(property) {
  const account = getAccount();
  return {
    id: property.id,
    account_id: account.id,
    address: property.address,
    city: property.city,
    state: property.state,
    zip: property.zip,
    status: property.status,
    tenant_name: property.tenantName || '',
    phone: property.phone || '',
    email: property.email || '',
    rent: property.rent || '',
    notes: property.notes || '',
    thumbnail_path: property.thumbnailPath || null,
    created_at: property.createdAt,
    updated_at: property.updatedAt
  };
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
  const supabase = getSupabase();
  const accountId = activeAccountId();
  const { data, error } = await supabase
    .from('properties')
    .select('*')
    .eq('account_id', accountId)
    .order('updated_at', { ascending: false });
  if (error) throw error;
  properties = (data || []).map(fromRow);
}

async function loadExpenses(propertyId) {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('expenses')
    .select('*')
    .eq('property_id', propertyId)
    .order('spent_on', { ascending: false })
    .order('created_at', { ascending: false });
  if (error) throw error;
  const list = (data || []).map(fromExpenseRow);
  expensesByProperty.set(propertyId, list);
  return list;
}

async function loadReceipts(expenseId) {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('receipts')
    .select('*')
    .eq('expense_id', expenseId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  const list = (data || []).map(fromReceiptRow);
  receiptsByExpense.set(expenseId, list);
  return list;
}

async function insertProperties(list) {
  if (!list.length) return;
  const supabase = getSupabase();
  const { error } = await supabase.from('properties').insert(list.map(toRow));
  if (error) throw error;
}

function escapeHTML(value) {
  return String(value ?? '').replace(/[&<>'"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));
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
        <div class="empty-icon" aria-hidden="true">⌂</div>
        <h3>No properties yet.</h3>
        <p>Add your first rental.</p>
        <button class="primary-button js-write" type="button" data-action="add">＋ Add home</button>
        <button class="text-button muted-link" type="button" data-action="view-sample">View sample portfolio</button>
        <p class="empty-help">See how RentManor looks with example homes. You can’t edit the sample.</p>
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

function contactButton(label, value, scheme, icon) {
  if (!value) return `<span class="contact-button disabled" aria-disabled="true"><span aria-hidden="true">${icon}</span>&nbsp; ${label}</span>`;
  const href = scheme === 'mailto' ? `mailto:${encodeURIComponent(value)}` : `${scheme}:${scheme === 'tel' || scheme === 'sms' ? value.replace(/[^+\d]/g, '') : value}`;
  return `<a class="contact-button" href="${escapeHTML(href)}"><span aria-hidden="true">${icon}</span>&nbsp; ${label}</a>`;
}

function expenseSummary(list) {
  const year = new Date().getFullYear();
  const thisYear = list.filter(item => String(item.spentOn || '').startsWith(String(year)));
  const use = thisYear.length ? thisYear : list;
  const total = use.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
  const label = thisYear.length ? 'this year' : 'all time';
  return `${money(total)} ${label} · ${use.length} ${use.length === 1 ? 'expense' : 'expenses'}`;
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

async function renderDetail(property) {
  if (!property) { showView('list'); return; }
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
  const write = canWrite();
  const heroAction = write ? 'photo-sheet' : (property.thumbnailPath ? 'view-hero' : '');
  detailView.innerHTML = `
      <button class="back-link" type="button" data-action="back-to-list"><span aria-hidden="true">‹</span> Back to properties</button>
      <button class="hero-photo-wrap" type="button" data-action="${heroAction}" data-id="${escapeHTML(property.id)}" ${heroAction ? '' : 'disabled'}>
        ${thumbMarkup(property, 'hero')}
        <span class="upload-bar" hidden><span></span></span>
      </button>
      <div class="detail-header">
        <span class="badge ${property.status}">${property.status === 'occupied' ? 'Occupied' : 'Vacant'}</span>
        <h2 id="detailHeading">${escapeHTML(property.address)}</h2>
        <p class="detail-address">${escapeHTML(propertyLocation(property))}</p>
        ${property.status === 'occupied' && property.tenantName ? `<p class="muted">Tenant: <strong>${escapeHTML(property.tenantName)}</strong></p>` : ''}
      </div>
      <div class="detail-grid">
        <div class="info-card"><h3>Contact tenant</h3><div class="contact-actions">${contactButton('Call', property.phone, 'tel', '☎')} ${contactButton('Text', property.phone, 'sms', '▣')} ${contactButton('Email', property.email, 'mailto', '✉')}</div>${property.status === 'vacant' ? '<p class="muted contact-hint">Add a tenant phone or email on Edit to enable these.</p>' : ''}</div>
        ${currency(property.rent) ? `<div class="info-card"><span class="info-label">Monthly rent</span><p class="rent-value">${escapeHTML(currency(property.rent))}</p></div>` : ''}
        ${property.notes ? `<div class="info-card"><h3>Notes</h3><p>${escapeHTML(property.notes)}</p></div>` : ''}
      </div>
      <section class="expense-section">
        <div class="section-heading">
          <div>
            <h3>Expenses</h3>
            <p class="muted">${expenses.length ? escapeHTML(expenseSummary(expenses)) : 'No expenses yet.'}</p>
          </div>
          ${write ? `<button class="primary-button compact js-write" type="button" data-action="add-expense" data-id="${escapeHTML(property.id)}">＋ Add</button>` : ''}
        </div>
        ${expenses.length
          ? `<div class="expense-list">${expenses.map(expenseRow).join('')}</div>`
          : (write ? `<button class="text-button muted-link js-write" type="button" data-action="add-expense" data-id="${escapeHTML(property.id)}">Add an expense</button>` : '')}
      </section>
      ${write ? `<div class="detail-actions js-write"><button class="primary-button" type="button" data-action="edit" data-id="${escapeHTML(property.id)}">Edit property</button><button class="secondary-button" type="button" data-action="back-to-list">Done</button></div>` : `<div class="detail-actions"><button class="secondary-button" type="button" data-action="back-to-list">Done</button></div>`}`;
  showView('detail');
  hydrateThumbs(detailView);
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
  if (data.status === 'occupied' && !data.tenantName) return { error: 'Please add the tenant name for an occupied home.' };
  if (data.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) return { error: 'Please enter a valid email address.' };
  if (data.rent && (!Number.isFinite(Number(data.rent)) || Number(data.rent) < 0)) return { error: 'Monthly rent must be a positive number.' };
  return { data: { ...data, state: data.state.toUpperCase() } };
}

async function savePropertyPhoto(property) {
  if (!pendingPhotoFile) return property;
  const file = await compressImageFile(pendingPhotoFile);
  const path = thumbnailObjectPath(activeAccountId(), property.id, extensionForType(file.type, 'jpg'));
  await uploadAccountMedia(path, file);
  if (property.thumbnailPath && property.thumbnailPath !== path) {
    try { await removeAccountMedia(property.thumbnailPath); } catch (_) { /* keep new photo */ }
  }
  const { error } = await getSupabase().from('properties').update({ thumbnail_path: path }).eq('id', property.id);
  if (error) throw error;
  return { ...property, thumbnailPath: path };
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
    const supabase = getSupabase();
    if (existing) {
      const { error } = await supabase.from('properties').update(toRow(saved)).eq('id', saved.id);
      if (error) throw error;
    } else {
      const { error } = await supabase.from('properties').insert(toRow(saved));
      if (error) throw error;
    }
    const withPhoto = await savePropertyPhoto(saved);
    pendingPhotoFile = null;
    revokeObjectUrl(pendingPhotoPreview);
    pendingPhotoPreview = '';
    await loadProperties();
    showToast(existing ? 'Property updated.' : 'Property added.');
    renderDetail(properties.find(property => property.id === withPhoto.id) || withPhoto);
  } catch (error) {
    showFormError(friendlyError(error));
  } finally {
    submit.disabled = false;
  }
}

async function collectPropertyMediaPaths(property) {
  const paths = [];
  if (property.thumbnailPath) paths.push(property.thumbnailPath);
  const expenses = expensesByProperty.get(property.id) || await loadExpenses(property.id).catch(() => []);
  for (const expense of expenses) {
    const receipts = receiptsByExpense.get(expense.id) || await loadReceipts(expense.id).catch(() => []);
    receipts.forEach(receipt => { if (receipt.storagePath) paths.push(receipt.storagePath); });
  }
  return paths;
}

async function deleteProperty() {
  if (!canWrite()) return;
  const property = properties.find(item => item.id === editingId);
  if (!property || !window.confirm(`Delete ${property.address}? This cannot be undone.`)) return;
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

function openPhotoSheet(property, context = 'detail') {
  if (!property) return;
  if (sampleMode) {
    if (property.thumbnailPath) viewMedia(property.thumbnailPath, property.address);
    return;
  }
  if (!canWrite()) return;
  photoContext = context;
  editingId = property.id;
  const remove = document.querySelector('#removePhotoButton');
  if (remove) remove.hidden = !property.thumbnailPath && !pendingPhotoFile;
  photoSheet.hidden = false;
}

function closeSheets() {
  if (photoSheet) photoSheet.hidden = true;
  if (receiptSheet) receiptSheet.hidden = true;
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
    pendingPhotoFile = file;
    const updated = await savePropertyPhoto(property);
    pendingPhotoFile = null;
    await loadProperties();
    showToast('Photo saved.');
    renderDetail(properties.find(item => item.id === updated.id) || updated);
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
    if (property?.thumbnailPath && window.confirm('Remove this photo?')) {
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
  if (!property?.thumbnailPath || !window.confirm('Remove this photo?')) return;
  try {
    await removeAccountMedia(property.thumbnailPath);
    const { error } = await getSupabase().from('properties').update({ thumbnail_path: null }).eq('id', property.id);
    if (error) throw error;
    await loadProperties();
    showToast('Photo removed.');
    renderDetail(properties.find(item => item.id === property.id));
  } catch (error) {
    showToast(friendlyError(error));
  }
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
            ${canWrite() ? `<button class="text-button" type="button" data-action="replace-receipt">Replace</button>
            <button class="text-button danger" type="button" data-action="remove-receipt">Remove</button>` : ''}
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
  expenseView.innerHTML = `
    <button class="back-link" type="button" data-action="back-to-detail" data-id="${escapeHTML(property.id)}"><span aria-hidden="true">‹</span> Back to ${escapeHTML(property.address)}</button>
    <div class="section-heading form-title">
      <div>
        <p class="eyebrow">${expense ? 'Update expense' : 'New expense'}</p>
        <h2 id="expenseHeading">${expense ? 'Edit expense' : 'New expense'}</h2>
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
        <button class="primary-button" type="submit"${canWrite() ? '' : ' hidden'}>Save</button>
        <button class="secondary-button" type="button" data-action="back-to-detail" data-id="${escapeHTML(property.id)}">Cancel</button>
        ${expense && canWrite() ? `<button class="danger-link js-write" type="button" data-action="delete-expense" data-expense-id="${escapeHTML(expense.id)}" data-property-id="${escapeHTML(property.id)}">Delete expense</button>` : ''}
      </div>
    </form>`;
  showView('expense');
  const expenseForm = document.querySelector('#expenseForm');
  if (expenseForm) expenseForm.addEventListener('submit', submitExpense);
  if (!canWrite()) {
    expenseView.querySelectorAll('input, textarea, select').forEach(field => { field.disabled = true; });
  }
}

async function openExpense(property, expense = null) {
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
    content_type: readyFile.type || '',
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
  closeSheets();
  const receiptError = document.querySelector('#receiptError');
  try {
    const ready = isPdf(file) ? assertPdfSize(file) : await compressImageFile(file);
    pendingReceiptFile = ready;
    revokeObjectUrl(pendingReceiptPreview);
    pendingReceiptPreview = isPdf(ready) ? '' : URL.createObjectURL(ready);
    const property = properties.find(item => item.id === expensePropertyId);
    const expense = (expensesByProperty.get(expensePropertyId) || []).find(item => item.id === editingExpenseId);
    if (property) renderExpenseForm(property, expense || null);
    if (receiptError) receiptError.hidden = true;
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
    if (!receipt || !window.confirm('Remove this receipt?')) return;
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
  if (!window.confirm('Delete this expense? This cannot be undone.')) return;
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

async function viewMedia(path, alt = '') {
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
  lightbox.hidden = false;
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

function showToast(message) {
  clearTimeout(toastTimer);
  toast.textContent = message;
  toast.hidden = false;
  toastTimer = setTimeout(() => { toast.hidden = true; }, 2800);
}

function closeModals() {
  backupPanel.hidden = true;
  accountPanel.hidden = true;
  invitePanel.hidden = true;
  importPanel.hidden = true;
  closeSheets();
  if (lightbox) lightbox.hidden = true;
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
  if (legacy.length && !alreadyOffered && !properties.length) {
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
  inviteButton.hidden = !isOwner();
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
  deleteButton.addEventListener('click', deleteProperty);
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
  document.querySelector('#photoCameraInput')?.addEventListener('change', event => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file) applyPickedPhoto(file);
  });
  document.querySelector('#photoLibraryInput')?.addEventListener('change', event => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file) applyPickedPhoto(file);
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

  document.addEventListener('click', event => {
    const photoChoice = event.target.closest('[data-photo]');
    if (photoChoice) {
      const choice = photoChoice.dataset.photo;
      if (choice === 'camera') document.querySelector('#photoCameraInput').click();
      if (choice === 'library') document.querySelector('#photoLibraryInput').click();
      if (choice === 'remove') removePropertyPhoto();
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

    const actionTarget = event.target.closest('[data-action]');
    if (actionTarget) {
      const action = actionTarget.dataset.action;
      if (action === 'add') openForm();
      if (action === 'edit') openForm(properties.find(property => property.id === actionTarget.dataset.id));
      if (action === 'back-to-list' || action === 'cancel-form') showView('list');
      if (action === 'back-to-detail') {
        const property = properties.find(item => item.id === actionTarget.dataset.id);
        if (property) renderDetail(property);
        else showView('list');
      }
      if (action === 'clear-filters') { searchInput.value = ''; activeFilter = 'all'; document.querySelectorAll('.filter-button').forEach(button => button.classList.toggle('active', button.dataset.filter === 'all')); renderList(); }
      if (action === 'view-sample') enterSampleRoute();
      if (action === 'photo-sheet') openPhotoSheet(properties.find(item => item.id === actionTarget.dataset.id), 'detail');
      if (action === 'form-photo') openPhotoSheet(properties.find(item => item.id === editingId) || { id: editingId, thumbnailPath: pendingPhotoPreview || '' }, 'form');
      if (action === 'view-hero') {
        const property = properties.find(item => item.id === actionTarget.dataset.id);
        if (property?.thumbnailPath) viewMedia(property.thumbnailPath, property.address);
      }
      if (action === 'add-expense') {
        const property = properties.find(item => item.id === actionTarget.dataset.id);
        if (property) openExpense(property);
      }
      if (action === 'open-expense') {
        const property = properties.find(item => item.id === actionTarget.dataset.propertyId);
        const expense = (expensesByProperty.get(actionTarget.dataset.propertyId) || []).find(item => item.id === actionTarget.dataset.expenseId);
        if (property && expense) openExpense(property, expense);
      }
      if (action === 'add-receipt' || action === 'replace-receipt') receiptSheet.hidden = false;
      if (action === 'remove-receipt') removeCurrentReceipt();
      if (action === 'view-receipt') viewReceipt(actionTarget.dataset.expenseId);
      if (action === 'delete-expense') deleteExpense(actionTarget.dataset.propertyId, actionTarget.dataset.expenseId);
      if (action === 'close-backup') backupPanel.hidden = true;
      if (action === 'close-account') accountPanel.hidden = true;
      if (action === 'close-invite') invitePanel.hidden = true;
      if (action === 'close-photo-sheet' || action === 'close-receipt-sheet') closeSheets();
      if (action === 'close-lightbox') lightbox.hidden = true;
      if (action === 'close-import') {
        if (importMode === 'offer') markLegacyOffered();
        importPanel.hidden = true;
        showView('list');
      }
      return;
    }
    const card = event.target.closest('.property-card');
    if (card) renderDetail(properties.find(property => property.id === card.dataset.id));
    if (event.target === backupPanel) backupPanel.hidden = true;
    if (event.target === accountPanel) accountPanel.hidden = true;
    if (event.target === invitePanel) invitePanel.hidden = true;
    if (event.target === photoSheet || event.target === receiptSheet) closeSheets();
    if (event.target === lightbox) lightbox.hidden = true;
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
  activeFilter = 'all';
  editingId = null;
  editingExpenseId = null;
  expensePropertyId = null;
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
      await loadProperties();
      showView('list');
    } catch (error) {
      showToast(friendlyError(error));
      propertyList.innerHTML = `<div class="empty-state"><div class="empty-icon" aria-hidden="true">⌂</div><h3>Sample isn’t ready</h3><p>${escapeHTML(friendlyError(error))}</p></div>`;
      showView('list');
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
