/* RentManor — per-account property manager (Supabase-backed). */
import {
  canMutateAccount,
  isSampleHash,
  rowsForAccount,
  samplePortfolio,
  scopedAccountId,
  shouldInjectDemoProperties,
  sampleWriteError
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
  showScreen,
  showAuthMode
} from './auth.js';

const LEGACY_KEY = 'rental-home-data-v1';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const app = document.querySelector('#app');
const listView = document.querySelector('#listView');
const detailView = document.querySelector('#detailView');
const formView = document.querySelector('#formView');
const propertyList = document.querySelector('#propertyList');
const propertyCount = document.querySelector('#propertyCount');
const searchInput = document.querySelector('#searchInput');
const searchBox = document.querySelector('#searchBox');
const filterRow = document.querySelector('#filterRow');
const clearSearch = document.querySelector('#clearSearch');
const form = document.querySelector('#propertyForm');
const formError = document.querySelector('#formError');
const deleteButton = document.querySelector('#deleteButton');
const backupPanel = document.querySelector('#backupPanel');
const accountPanel = document.querySelector('#accountPanel');
const invitePanel = document.querySelector('#invitePanel');
const importPanel = document.querySelector('#importPanel');
const restoreInput = document.querySelector('#restoreInput');
const toast = document.querySelector('#toast');
const inviteButton = document.querySelector('#inviteButton');
const legacyImportButton = document.querySelector('#legacyImportButton');

let properties = [];
let activeFilter = 'all';
let currentView = 'list';
let editingId = null;
let toastTimer;
let importMode = 'offer';
let ready = false;
let sampleMode = false;

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
  return scopedAccountId({ sampleMode, accountId: getAccount()?.id || null });
}

function assertWritable() {
  if (!canMutateAccount({ sampleMode, accountId: getAccount()?.id || null })) {
    throw sampleWriteError();
  }
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
    createdAt: row.created_at || new Date().toISOString(),
    updatedAt: row.updated_at || new Date().toISOString()
  };
}

function toRow(property) {
  assertWritable();
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
    created_at: property.createdAt,
    updated_at: property.updatedAt
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
    properties = samplePortfolio().map(fromRow);
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

function propertyLocation(property) {
  return `${property.city}, ${property.state} ${property.zip}`;
}

function showView(view) {
  currentView = view;
  listView.hidden = view !== 'list';
  detailView.hidden = view !== 'detail';
  formView.hidden = view !== 'form';
  if (view === 'list') renderList();
  app.focus({ preventScroll: true });
}

function updateListTools() {
  const show = properties.length > 0;
  if (searchBox) searchBox.hidden = !show;
  if (filterRow) filterRow.hidden = !show;
}

function isNetlifyHudNode(node) {
  if (!node || node.nodeType !== 1) return false;
  const id = node.id || '';
  if (id === 'nl-hud-frame' || id === 'nl-badge-frame' || id === 'netlify-badge') return true;
  if (node.tagName === 'IFRAME') {
    const src = node.getAttribute('src') || '';
    const srcdoc = node.getAttribute('srcdoc') || '';
    return src.includes('netlify') || srcdoc.includes('netlify');
  }
  return false;
}

function neutralizeNetlifyBadge() {
  try {
    localStorage.setItem('nl-hud:public:v1', 'hidden');
    localStorage.setItem('nl-hud:owner-private:v1', 'hidden');
  } catch (_) { /* ignore */ }
  document.querySelectorAll('#nl-hud-frame, #nl-badge-frame, #netlify-badge, iframe[src*="netlify"]').forEach(node => node.remove());
}

function watchNetlifyBadge() {
  neutralizeNetlifyBadge();
  if (typeof MutationObserver !== 'function') return;
  const hudWatch = new MutationObserver(records => {
    for (const record of records) {
      for (const node of record.addedNodes) {
        if (isNetlifyHudNode(node) || node.querySelector?.('#nl-hud-frame, #nl-badge-frame, #netlify-badge, iframe[src*="netlify"]')) {
          neutralizeNetlifyBadge();
          return;
        }
      }
    }
  });
  hudWatch.observe(document.documentElement, { childList: true, subtree: true });
}

function renderList() {
  const query = searchInput.value.trim().toLowerCase();
  clearSearch.hidden = !query;
  updateListTools();
  const matches = properties.filter(property => {
    const inFilter = activeFilter === 'all' || property.status === activeFilter;
    const searchable = `${property.address} ${property.city} ${property.state} ${property.zip} ${property.tenantName}`.toLowerCase();
    return inFilter && (!query || searchable.includes(query));
  });
  const totalLabel = `${properties.length} ${properties.length === 1 ? 'property' : 'properties'}`;
  propertyCount.textContent = query || activeFilter !== 'all' ? `${matches.length} of ${totalLabel}` : totalLabel;

  if (!matches.length) {
    const hasProperties = properties.length > 0;
    const emptyPrimary = sampleMode
      ? '<button class="secondary-button" type="button" data-action="leave-sample">Leave sample</button>'
      : '<button class="primary-button" type="button" data-action="add">Add a home</button><button class="secondary-button" type="button" data-action="view-sample">View sample</button>';
    propertyList.innerHTML = `<div class="empty-state"><div class="empty-icon" aria-hidden="true">${hasProperties ? '⌕' : '⌂'}</div><h3>${hasProperties ? 'No homes found' : (sampleMode ? 'Sample homes are not available yet' : 'No properties yet')}</h3><p>${hasProperties ? 'Try a different search or filter.' : (sampleMode ? 'The shared sample has not been set up in this project.' : 'Add your first rental. Nobody else’s homes are copied in.')}</p>${hasProperties ? '<button class="secondary-button" type="button" data-action="clear-filters">Clear search</button>' : emptyPrimary}</div>`;
    return;
  }

  propertyList.innerHTML = matches.map(property => `
      <button class="property-card" type="button" data-id="${escapeHTML(property.id)}" aria-label="View ${escapeHTML(property.address)}">
        <div class="card-top"><h3>${escapeHTML(property.address)}</h3><span class="badge ${property.status}">${property.status === 'occupied' ? 'Occupied' : 'Vacant'}</span></div>
        <p class="card-address">${escapeHTML(propertyLocation(property))}</p>
        <div class="card-bottom"><span class="card-tenant">${property.status === 'occupied' ? escapeHTML(property.tenantName || 'Tenant name not added') : 'Ready for a tenant'}${currency(property.rent) ? ` · ${escapeHTML(currency(property.rent))}/mo` : ''}</span><span class="card-arrow" aria-hidden="true">›</span></div>
      </button>`).join('');
}

function contactButton(label, value, scheme, icon) {
  if (!value) return `<span class="contact-button disabled" aria-disabled="true"><span aria-hidden="true">${icon}</span>&nbsp; ${label}</span>`;
  const href = scheme === 'mailto' ? `mailto:${encodeURIComponent(value)}` : `${scheme}:${scheme === 'tel' || scheme === 'sms' ? value.replace(/[^+\d]/g, '') : value}`;
  return `<a class="contact-button" href="${escapeHTML(href)}"><span aria-hidden="true">${icon}</span>&nbsp; ${label}</a>`;
}

function renderDetail(property) {
  if (!property) { showView('list'); return; }
  detailView.innerHTML = `
      <button class="back-link" type="button" data-action="back-to-list"><span aria-hidden="true">‹</span> Back to properties</button>
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
      <div class="detail-actions">${sampleMode ? '' : `<button class="primary-button" type="button" data-action="edit" data-id="${escapeHTML(property.id)}">Edit property</button>`}<button class="secondary-button" type="button" data-action="back-to-list">Done</button></div>`;
  showView('detail');
}

function openForm(property = null) {
  if (sampleMode) {
    showToast('Sample homes cannot be changed.');
    return;
  }
  editingId = property?.id || null;
  form.reset();
  formError.hidden = true;
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

async function submitForm(event) {
  event.preventDefault();
  if (sampleMode) { showToast('Sample homes cannot be changed.'); return; }
  const result = readForm();
  if (result.error) { showFormError(result.error); return; }
  const now = new Date().toISOString();
  const submit = form.querySelector('button[type="submit"]');
  const existing = editingId ? properties.find(property => property.id === editingId) : null;
  const saved = existing
    ? { ...existing, ...result.data, updatedAt: now }
    : { ...result.data, id: makeId(), createdAt: now, updatedAt: now };
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
    await loadProperties();
    showToast(existing ? 'Property updated.' : 'Property added.');
    renderDetail(properties.find(property => property.id === saved.id) || saved);
  } catch (error) {
    showFormError(friendlyError(error));
  } finally {
    submit.disabled = false;
  }
}

async function deleteProperty() {
  if (sampleMode) { showToast('Sample homes cannot be changed.'); return; }
  const property = properties.find(item => item.id === editingId);
  if (!property || !window.confirm(`Delete ${property.address}? This cannot be undone.`)) return;
  try {
    const { error } = await getSupabase().from('properties').delete().eq('id', property.id);
    if (error) throw error;
    await loadProperties();
    showToast('Property deleted.');
    showView('list');
  } catch (error) {
    showToast(friendlyError(error));
  }
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
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async () => {
    try {
      const cleaned = readBackupFile(reader.result);
      if (!window.confirm(`Replace all current properties in this account with ${cleaned.length} ${cleaned.length === 1 ? 'property' : 'properties'} from this backup?`)) return;
      await replaceAccountProperties(cleaned.map(toRow));
      await markAccountSeeded();
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
  legacyImportButton.hidden = getLegacyProperties().length === 0;
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

function updateSampleChrome() {
  const banner = document.querySelector('#sampleBanner');
  const addButton = document.querySelector('#addButton');
  const accountButton = document.querySelector('#accountButton');
  const listHeading = document.querySelector('#listHeading');
  const sampleCreate = document.querySelector('#sampleCreateButton');
  if (banner) banner.hidden = !sampleMode;
  if (addButton) addButton.hidden = sampleMode;
  if (accountButton) accountButton.hidden = sampleMode;
  if (listHeading) listHeading.textContent = sampleMode ? 'Sample properties' : 'Your properties';
  if (sampleCreate) {
    sampleCreate.textContent = getUser() ? 'Back to my properties' : 'Create an account';
    sampleCreate.dataset.action = getUser() ? 'leave-sample' : 'sample-create';
  }
}

function enterSampleHash() {
  if (!isSampleHash(location.hash)) {
    location.hash = '/sample';
    return;
  }
  void showSamplePortfolio();
}

function leaveSampleHash() {
  if (isSampleHash(location.hash)) {
    history.replaceState({}, '', `${location.pathname}${location.search}`);
  }
  sampleMode = false;
  updateSampleChrome();
}

async function showSamplePortfolio() {
  sampleMode = true;
  bindUi();
  resetLocalState();
  updateSampleChrome();
  showScreen('app');
  try {
    await loadProperties();
    showView('list');
  } catch (error) {
    showToast(friendlyError(error));
    updateListTools();
    propertyList.innerHTML = `<div class="empty-state"><div class="empty-icon" aria-hidden="true">⌂</div><h3>Could not load sample</h3><p>${escapeHTML(friendlyError(error))}</p><button class="secondary-button" type="button" data-action="leave-sample">Leave sample</button></div>`;
  }
}

async function leaveSample() {
  leaveSampleHash();
  closeModals();
  if (getUser() && getAccount()) {
    showScreen('app');
    updateSampleChrome();
    updateAccountSummary();
    try {
      await loadProperties();
      await afterPropertiesReady();
    } catch (error) {
      showToast(friendlyError(error));
    }
    return;
  }
  resetLocalState();
  updateSampleChrome();
  showAuthMode('signin');
  showScreen('auth');
}

function openCreateFromSample() {
  leaveSampleHash();
  resetLocalState();
  updateSampleChrome();
  showAuthMode('signup');
  showScreen('auth');
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

function bindUi() {
  if (ready) return;
  ready = true;
  watchNetlifyBadge();
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
  document.querySelector('#viewSampleButton')?.addEventListener('click', event => {
    event.preventDefault();
    enterSampleHash();
  });
  document.querySelector('#signOutButton').addEventListener('click', async () => {
    closeModals();
    await signOut();
  });

  document.addEventListener('click', event => {
    const actionTarget = event.target.closest('[data-action]');
    if (actionTarget) {
      const action = actionTarget.dataset.action;
      if (action === 'add') openForm();
      if (action === 'edit') openForm(properties.find(property => property.id === actionTarget.dataset.id));
      if (action === 'view-sample') enterSampleHash();
      if (action === 'leave-sample') void leaveSample();
      if (action === 'sample-create') openCreateFromSample();
      if (action === 'back-to-list' || action === 'cancel-form') showView('list');
      if (action === 'clear-filters') { searchInput.value = ''; activeFilter = 'all'; document.querySelectorAll('.filter-button').forEach(button => button.classList.toggle('active', button.dataset.filter === 'all')); renderList(); }
      if (action === 'close-backup') backupPanel.hidden = true;
      if (action === 'close-account') accountPanel.hidden = true;
      if (action === 'close-invite') invitePanel.hidden = true;
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
  activeFilter = 'all';
  editingId = null;
  searchInput.value = '';
  document.querySelectorAll('.filter-button').forEach(button => button.classList.toggle('active', button.dataset.filter === 'all'));
  propertyList.innerHTML = '';
  propertyCount.textContent = '';
  updateListTools();
}

startAuth(async ({ status, notice }) => {
  bindUi();
  if (status === 'need-config') {
    sampleMode = false;
    resetLocalState();
    updateSampleChrome();
    return;
  }
  if (status === 'signed-in' && isSampleHash(location.hash)) {
    history.replaceState({}, '', `${location.pathname}${location.search}`);
  }
  if (isSampleHash(location.hash)) {
    await showSamplePortfolio();
    return;
  }
  sampleMode = false;
  updateSampleChrome();
  if (status === 'signed-out') {
    resetLocalState();
    return;
  }
  if (status !== 'signed-in') return;
  try {
    await loadProperties();
    updateAccountSummary();
    await afterPropertiesReady();
    if (notice) showToast(notice);
  } catch (error) {
    showToast(friendlyError(error));
    updateListTools();
    propertyList.innerHTML = `<div class="empty-state"><div class="empty-icon" aria-hidden="true">⌂</div><h3>Could not load homes</h3><p>${escapeHTML(friendlyError(error))}</p></div>`;
  }
});

window.addEventListener('hashchange', () => {
  if (isSampleHash(location.hash)) {
    void showSamplePortfolio();
    return;
  }
  if (sampleMode) void leaveSample();
});

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('./sw.js').catch(() => { /* offline support is optional */ });
}
