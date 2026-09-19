/* Mom-simple Property | Tenant | Expenses tab markup. */

export const DETAIL_TABS = [
  ['property', 'Property'],
  ['tenant', 'Tenant'],
  ['expenses', 'Expenses']
];

export const PROPERTY_TYPES = ['Single family', 'Townhouse', 'Condo', 'Multi-family', 'Other'];
export const FUEL_OPTIONS = [
  ['gas', 'Gas'],
  ['electric', 'Electric'],
  ['other', 'Other']
];

export function escapeHTML(value) {
  return String(value ?? '').replace(/[&<>'"]/g, character => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;'
  }[character]));
}

export function fuelLabel(fuel) {
  if (fuel === 'gas') return 'Gas';
  if (fuel === 'electric') return 'Electric';
  if (fuel === 'other') return 'Other';
  return '';
}

export function hasCurrentTenant(tenant) {
  if (!tenant) return false;
  return Boolean(String(tenant.name || '').trim() || String(tenant.phone || '').trim() || String(tenant.email || '').trim());
}

function fact(label, value) {
  if (value === '' || value == null) return '';
  return `<div class="fact"><span class="info-label">${escapeHTML(label)}</span><p>${escapeHTML(value)}</p></div>`;
}

export function formatBedsBaths(property) {
  const bits = [];
  if (property.beds != null && property.beds !== '') bits.push(`${property.beds} bed`);
  if (property.baths != null && property.baths !== '') bits.push(`${property.baths} bath`);
  if (property.sqft) bits.push(`${Number(property.sqft).toLocaleString('en-US')} sq ft`);
  return bits.join(' · ');
}

export function detailTabsHtml(active) {
  return `<div class="detail-tabs" role="tablist" aria-label="Property sections">
    ${DETAIL_TABS.map(([id, label]) => `
      <button type="button" role="tab" id="tab-${id}" class="detail-tab${id === active ? ' active' : ''}"
        aria-selected="${id === active ? 'true' : 'false'}" data-action="detail-tab" data-tab="${id}">${label}</button>
    `).join('')}
  </div>`;
}

export function galleryHtml({ photos, write, sample }) {
  const tiles = (photos || []).map(photo => `
    <button class="gallery-tile${photo.isPrimary ? ' is-primary' : ''}" type="button" data-action="gallery-photo" data-photo-id="${escapeHTML(photo.id)}" aria-label="${photo.isPrimary ? 'Cover photo' : 'Property photo'}">
      <div class="gallery-thumb" data-thumb-path="${escapeHTML(photo.storagePath)}" data-thumb-id="${escapeHTML(photo.id)}" data-thumb-alt="${photo.isPrimary ? 'Cover photo' : 'Property photo'}">
        <span class="media-placeholder" aria-hidden="true"></span>
      </div>
      ${photo.isPrimary ? '<span class="gallery-chip">Cover</span>' : ''}
    </button>`).join('');
  const add = write
    ? `<button class="gallery-tile is-add js-write" type="button" data-action="add-gallery-photo"><span aria-hidden="true">＋</span> Add photo</button>`
    : '';
  if (!photos?.length && !write) {
    return `<div class="info-card"><h3>Photos</h3><p class="muted">${sample ? 'No extra photos.' : 'No photos yet.'}</p></div>`;
  }
  return `<div class="info-card">
    <h3>Photos</h3>
    <p class="muted">${write ? 'The cover photo is the one on your property list.' : 'Cover photo is first.'}</p>
    <div class="gallery-row">${tiles}${add}</div>
  </div>`;
}

export function appliancesHtml({ appliances, write }) {
  const rows = (appliances || []).map(item => `
    <div class="appliance-row">
      <div>
        <strong>${escapeHTML(item.name)}</strong>
        <p class="muted">${escapeHTML([fuelLabel(item.fuel), item.notes].filter(Boolean).join(' · ') || ' ')}</p>
      </div>
      ${write ? `<button class="text-button danger js-write" type="button" data-action="delete-appliance" data-appliance-id="${escapeHTML(item.id)}">Remove</button>` : ''}
    </div>`).join('');
  const add = write ? `
    <form id="applianceForm" class="appliance-form js-write" novalidate>
      <div class="two-columns">
        <label>Appliance
          <input name="name" type="text" maxlength="80" required placeholder="Range">
        </label>
        <label>Fuel
          <select name="fuel">
            <option value="">Not sure</option>
            ${FUEL_OPTIONS.map(([value, label]) => `<option value="${value}">${label}</option>`).join('')}
          </select>
        </label>
      </div>
      <label>Notes <span class="optional">(optional)</span>
        <input name="notes" type="text" maxlength="200" placeholder="In the garage">
      </label>
      <button class="secondary-button compact" type="submit">Add appliance</button>
    </form>` : '';
  return `<div class="info-card">
    <h3>Appliances</h3>
    ${rows || '<p class="muted">No appliances listed.</p>'}
    ${add}
  </div>`;
}

export function propertyFactsHtml(property) {
  const line = formatBedsBaths(property);
  const year = property.yearBuilt ? `Built ${property.yearBuilt}` : '';
  return `
    ${line || year || property.propertyType ? `<div class="info-card">
      <h3>Home facts</h3>
      ${line ? `<p class="fact-line">${escapeHTML(line)}</p>` : ''}
      <div class="fact-grid">
        ${fact('Type', property.propertyType)}
        ${fact('Year built', property.yearBuilt)}
      </div>
      ${property.description ? `<p class="fact-copy">${escapeHTML(property.description)}</p>` : ''}
    </div>` : ''}
    ${property.utilityElectric || property.utilityGas || property.utilityWater || property.utilityNotes ? `<div class="info-card">
      <h3>Utilities</h3>
      <div class="fact-grid">
        ${fact('Electric', property.utilityElectric)}
        ${fact('Gas', property.utilityGas)}
        ${fact('Water', property.utilityWater)}
      </div>
      ${property.utilityNotes ? `<p class="fact-copy">${escapeHTML(property.utilityNotes)}</p>` : ''}
    </div>` : ''}
    ${property.trashSchedule || property.trashNotes ? `<div class="info-card">
      <h3>Trash</h3>
      ${fact('Pickup', property.trashSchedule)}
      ${property.trashNotes ? `<p class="fact-copy">${escapeHTML(property.trashNotes)}</p>` : ''}
    </div>` : ''}
    ${property.notes ? `<div class="info-card"><h3>Notes</h3><p>${escapeHTML(property.notes)}</p></div>` : ''}
  `;
}

export function vacantTenantHtml({ write }) {
  return `<div class="empty-state tenant-empty">
    <div class="empty-icon" aria-hidden="true">⌂</div>
    <h3>No tenant right now</h3>
    <p>This home is vacant. Nothing is filled in until someone moves in.</p>
    ${write ? '<button class="primary-button js-write" type="button" data-action="add-tenant">Add tenant</button>' : ''}
  </div>`;
}

function fileTile({ id, name, path, contentType, actions }) {
  const pdf = /pdf/i.test(contentType || '') || /\.pdf$/i.test(name || path || '');
  return `<div class="receipt-tile">
    <div class="receipt-thumb ${pdf ? 'is-pdf' : ''}">${pdf ? 'PDF' : '<span aria-hidden="true">📎</span>'}</div>
    <div class="receipt-meta">
      <strong>${escapeHTML(name || 'File')}</strong>
      <div class="receipt-actions">${actions}</div>
    </div>
  </div>`;
}

export function tenantTabHtml({ property, tenant, files, write, editing }) {
  if (!hasCurrentTenant(tenant) && !editing) return vacantTenantHtml({ write });
  if (editing) {
    return `<form id="tenantForm" novalidate>
      <div id="tenantError" class="form-error" role="alert" hidden></div>
      <label>Tenant name <span class="required" aria-hidden="true">*</span>
        <input name="name" type="text" maxlength="100" required value="${escapeHTML(tenant?.name || '')}" placeholder="Alex Johnson">
      </label>
      <div class="two-columns">
        <label>Phone
          <input name="phone" type="tel" maxlength="30" value="${escapeHTML(tenant?.phone || '')}" placeholder="(916) 555-0123">
        </label>
        <label>Email
          <input name="email" type="email" maxlength="120" value="${escapeHTML(tenant?.email || '')}" placeholder="alex@example.com">
        </label>
      </div>
      <label>Notes <span class="optional">(optional)</span>
        <textarea name="notes" rows="3" maxlength="1000" placeholder="Renewal date, preferred contact…">${escapeHTML(tenant?.notes || '')}</textarea>
      </label>
      <div class="form-actions sticky">
        <button class="primary-button js-write" type="submit">Save tenant</button>
        <button class="secondary-button" type="button" data-action="cancel-tenant">Cancel</button>
      </div>
    </form>`;
  }

  const lease = tenant?.leaseStoragePath
    ? fileTile({
      id: 'lease',
      name: tenant.leaseFileName || 'Lease',
      path: tenant.leaseStoragePath,
      contentType: tenant.leaseContentType,
      actions: `
        <button class="text-button" type="button" data-action="view-lease">View</button>
        ${write ? `<button class="text-button js-write" type="button" data-action="replace-lease">Replace</button>
        <button class="text-button danger js-write" type="button" data-action="remove-lease">Remove</button>` : ''}`
    })
    : (write
      ? '<button class="receipt-empty js-write" type="button" data-action="add-lease">Add lease (PDF or photo)</button>'
      : '<p class="muted">No lease on file.</p>');

  const correspondence = (files || []).map(file => fileTile({
    id: file.id,
    name: file.fileName,
    path: file.storagePath,
    contentType: file.contentType,
    actions: `
      <button class="text-button" type="button" data-action="view-tenant-file" data-file-id="${escapeHTML(file.id)}">View</button>
      ${write ? `<button class="text-button danger js-write" type="button" data-action="delete-tenant-file" data-file-id="${escapeHTML(file.id)}">Remove</button>` : ''}`
  })).join('');

  return `
    <div class="info-card">
      <h3>${escapeHTML(tenant.name || 'Tenant')}</h3>
      <div class="contact-actions">${contactButtons(tenant)}</div>
      ${tenant.notes ? `<p class="fact-copy">${escapeHTML(tenant.notes)}</p>` : ''}
      ${write ? `<button class="secondary-button compact js-write" type="button" data-action="edit-tenant">Edit tenant</button>` : ''}
    </div>
    <div class="info-card">
      <h3>Lease</h3>
      ${lease}
    </div>
    <div class="info-card">
      <h3>Correspondence</h3>
      ${correspondence || '<p class="muted">No letters or emails saved.</p>'}
      ${write ? '<button class="secondary-button compact js-write" type="button" data-action="add-correspondence">Add a copy</button>' : ''}
    </div>
    ${write ? `<div class="danger-zone js-write"><button class="danger-link" type="button" data-action="remove-tenant" data-id="${escapeHTML(property.id)}">Mark home vacant</button></div>` : ''}
  `;
}

function contactButtons(tenant) {
  const button = (label, value, scheme, icon) => {
    if (!value) return `<span class="contact-button disabled" aria-disabled="true"><span aria-hidden="true">${icon}</span>&nbsp; ${label}</span>`;
    const href = scheme === 'mailto' ? `mailto:${encodeURIComponent(value)}` : `${scheme}:${value.replace(/[^+\d]/g, '')}`;
    return `<a class="contact-button" href="${escapeHTML(href)}"><span aria-hidden="true">${icon}</span>&nbsp; ${label}</a>`;
  };
  return `${button('Call', tenant.phone, 'tel', '☎')} ${button('Text', tenant.phone, 'sms', '▣')} ${button('Email', tenant.email, 'mailto', '✉')}`;
}

export function typeOptionsHtml(selected) {
  const value = selected || '';
  const known = PROPERTY_TYPES.includes(value) ? value : (value ? 'Other' : '');
  return PROPERTY_TYPES.map(type => `<option value="${escapeHTML(type)}"${type === known ? ' selected' : ''}>${escapeHTML(type)}</option>`).join('');
}
