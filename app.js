/* Rental Home - private, local-only property manager. */
(() => {
  'use strict';

  const STORAGE_KEY = 'rental-home-data-v1';
  const app = document.querySelector('#app');
  const listView = document.querySelector('#listView');
  const detailView = document.querySelector('#detailView');
  const formView = document.querySelector('#formView');
  const propertyList = document.querySelector('#propertyList');
  const propertyCount = document.querySelector('#propertyCount');
  const searchInput = document.querySelector('#searchInput');
  const clearSearch = document.querySelector('#clearSearch');
  const form = document.querySelector('#propertyForm');
  const formError = document.querySelector('#formError');
  const deleteButton = document.querySelector('#deleteButton');
  const backupPanel = document.querySelector('#backupPanel');
  const restoreInput = document.querySelector('#restoreInput');
  const toast = document.querySelector('#toast');

  let properties = loadProperties();
  let activeFilter = 'all';
  let currentView = 'list';
  let selectedId = null;
  let editingId = null;
  let toastTimer;

  function makeId() {
    return `home-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  function seedProperties() {
    return [
      { id: 'folsom-iron-point', address: '1124 Iron Point Road', city: 'Folsom', state: 'CA', zip: '95630', status: 'occupied', tenantName: 'Maria Hernandez', phone: '(916) 555-0148', email: 'maria.h@example.com', rent: '2450', notes: 'Renewal conversation in October.' },
      { id: 'folsom-blue-ravine', address: '704 Blue Ravine Road', city: 'Folsom', state: 'CA', zip: '95630', status: 'vacant', tenantName: '', phone: '', email: '', rent: '2200', notes: 'Fresh paint completed in the living room.' },
      { id: 'folsom-east-bidwell', address: '1538 East Bidwell Street', city: 'Folsom', state: 'CA', zip: '95630', status: 'occupied', tenantName: 'James Wilson', phone: '(916) 555-0196', email: 'james.wilson@example.com', rent: '2750', notes: 'Two-car garage; gardener included.' },
      { id: 'folsom-sibley', address: '889 Sibley Street', city: 'Folsom', state: 'CA', zip: '95630', status: 'vacant', tenantName: '', phone: '', email: '', rent: '1950', notes: '' }
    ].map(property => ({ ...property, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }));
  }

  function cleanProperty(value, index = 0) {
    if (!value || typeof value !== 'object') return null;
    const status = value.status === 'occupied' ? 'occupied' : 'vacant';
    const text = (field, max = 1000) => String(value[field] ?? '').trim().slice(0, max);
    return {
      id: text('id', 100) || `imported-${Date.now()}-${index}`,
      address: text('address', 120), city: text('city', 60), state: text('state', 2).toUpperCase(), zip: text('zip', 10),
      status, tenantName: text('tenantName', 100), phone: text('phone', 30), email: text('email', 120),
      rent: text('rent', 20), notes: text('notes', 1000),
      createdAt: text('createdAt', 40) || new Date().toISOString(), updatedAt: new Date().toISOString()
    };
  }

  function loadProperties() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (!saved) {
        const seeded = seedProperties();
        localStorage.setItem(STORAGE_KEY, JSON.stringify(seeded));
        return seeded;
      }
      const parsed = JSON.parse(saved);
      const list = Array.isArray(parsed) ? parsed : parsed?.properties;
      if (!Array.isArray(list)) throw new Error('Invalid saved data');
      return list.map(cleanProperty).filter(Boolean);
    } catch (error) {
      const seeded = seedProperties();
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(seeded)); } catch (_) { /* storage may be full */ }
      return seeded;
    }
  }

  function saveProperties() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(properties));
      return true;
    } catch (_) {
      showToast('Could not save. Please check your phone storage.');
      return false;
    }
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

  function renderList() {
    const query = searchInput.value.trim().toLowerCase();
    clearSearch.hidden = !query;
    const matches = properties.filter(property => {
      const inFilter = activeFilter === 'all' || property.status === activeFilter;
      const searchable = `${property.address} ${property.city} ${property.state} ${property.zip} ${property.tenantName}`.toLowerCase();
      return inFilter && (!query || searchable.includes(query));
    });
    const totalLabel = `${properties.length} ${properties.length === 1 ? 'property' : 'properties'}`;
    propertyCount.textContent = query || activeFilter !== 'all' ? `${matches.length} of ${totalLabel}` : totalLabel;

    if (!matches.length) {
      const hasProperties = properties.length > 0;
      propertyList.innerHTML = `<div class="empty-state"><div class="empty-icon" aria-hidden="true">${hasProperties ? '⌕' : '⌂'}</div><h3>${hasProperties ? 'No homes found' : 'No properties yet'}</h3><p>${hasProperties ? 'Try a different search or filter.' : 'Add your first rental home to get started.'}</p>${hasProperties ? '<button class="secondary-button" type="button" data-action="clear-filters">Clear search</button>' : '<button class="primary-button" type="button" data-action="add">Add a home</button>'}</div>`;
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
        ${property.status === 'occupied' ? `<div class="info-card"><h3>Contact tenant</h3><div class="contact-actions">${contactButton('Call', property.phone, 'tel', '☎')} ${contactButton('Text', property.phone, 'sms', '▣')} ${contactButton('Email', property.email, 'mailto', '✉')}</div></div>` : ''}
        ${currency(property.rent) ? `<div class="info-card"><span class="info-label">Monthly rent</span><p class="rent-value">${escapeHTML(currency(property.rent))}</p></div>` : ''}
        ${property.notes ? `<div class="info-card"><h3>Notes</h3><p>${escapeHTML(property.notes)}</p></div>` : ''}
      </div>
      <div class="detail-actions"><button class="primary-button" type="button" data-action="edit" data-id="${escapeHTML(property.id)}">Edit property</button><button class="secondary-button" type="button" data-action="back-to-list">Done</button></div>`;
    showView('detail');
  }

  function openForm(property = null) {
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

  function submitForm(event) {
    event.preventDefault();
    const result = readForm();
    if (result.error) { showFormError(result.error); return; }
    const now = new Date().toISOString();
    if (editingId) {
      const index = properties.findIndex(property => property.id === editingId);
      if (index !== -1) properties[index] = { ...properties[index], ...result.data, updatedAt: now };
    } else properties.unshift({ ...result.data, id: makeId(), createdAt: now, updatedAt: now });
    if (!saveProperties()) return;
    const saved = editingId ? properties.find(property => property.id === editingId) : properties[0];
    showToast(editingId ? 'Property updated.' : 'Property added.');
    renderDetail(saved);
  }

  function deleteProperty() {
    const property = properties.find(item => item.id === editingId);
    if (!property || !window.confirm(`Delete ${property.address}? This cannot be undone.`)) return;
    properties = properties.filter(item => item.id !== editingId);
    saveProperties();
    showToast('Property deleted.');
    showView('list');
  }

  function showToast(message) {
    clearTimeout(toastTimer);
    toast.textContent = message;
    toast.hidden = false;
    toastTimer = setTimeout(() => { toast.hidden = true; }, 2800);
  }

  function downloadBackup() {
    const payload = { app: 'Rental Home', version: 1, exportedAt: new Date().toISOString(), properties };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `rental-home-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    backupPanel.hidden = true;
    showToast('Backup downloaded.');
  }

  function handleRestore(event) {
    const file = event.target.files[0];
    event.target.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result);
        const incoming = Array.isArray(parsed) ? parsed : parsed?.properties;
        if (!Array.isArray(incoming)) throw new Error('No property list');
        const cleaned = incoming.map(cleanProperty).filter(Boolean);
        if (!window.confirm(`Replace all current properties with ${cleaned.length} ${cleaned.length === 1 ? 'property' : 'properties'} from this backup?`)) return;
        properties = cleaned;
        saveProperties();
        backupPanel.hidden = true;
        activeFilter = 'all';
        document.querySelectorAll('.filter-button').forEach(button => button.classList.toggle('active', button.dataset.filter === 'all'));
        searchInput.value = '';
        showView('list');
        showToast('Backup restored.');
      } catch (_) { showToast('That file could not be restored.'); }
    };
    reader.onerror = () => showToast('Could not read that file.');
    reader.readAsText(file);
  }

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
  document.querySelector('#backupButton').addEventListener('click', () => { backupPanel.hidden = false; });
  document.querySelector('#downloadButton').addEventListener('click', downloadBackup);
  document.querySelector('#restoreButton').addEventListener('click', () => restoreInput.click());
  restoreInput.addEventListener('change', handleRestore);

  document.addEventListener('click', event => {
    const actionTarget = event.target.closest('[data-action]');
    if (actionTarget) {
      const action = actionTarget.dataset.action;
      if (action === 'add') openForm();
      if (action === 'edit') openForm(properties.find(property => property.id === actionTarget.dataset.id));
      if (action === 'back-to-list' || action === 'cancel-form') showView('list');
      if (action === 'clear-filters') { searchInput.value = ''; activeFilter = 'all'; document.querySelectorAll('.filter-button').forEach(button => button.classList.toggle('active', button.dataset.filter === 'all')); renderList(); }
      if (action === 'close-backup') backupPanel.hidden = true;
      return;
    }
    const card = event.target.closest('.property-card');
    if (card) renderDetail(properties.find(property => property.id === card.dataset.id));
    if (event.target === backupPanel) backupPanel.hidden = true;
  });
  document.addEventListener('keydown', event => { if (event.key === 'Escape') backupPanel.hidden = true; });

  renderList();
  if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('./sw.js').catch(() => { /* offline support is optional */ });
})();
