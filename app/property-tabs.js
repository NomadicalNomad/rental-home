/* Mom-simple Property | Tenant | Expenses tab markup. */

export const DETAIL_TABS = [
  ['property', 'Property'],
  ['tenant', 'Tenant'],
  ['expenses', 'Expenses']
];

export const PROPERTY_TYPES = [
  ['Single family', 'House'],
  ['Condo', 'Condo'],
  ['Townhouse', 'Townhome'],
  ['Multi-family', 'Multi'],
  ['Other', 'Other']
];

export const FUEL_OPTIONS = [
  ['gas', 'Gas'],
  ['electric', 'Electric'],
  ['other', 'Other']
];

export const GALLERY_SOFT_CAP = 10;

export function escapeHTML(value) {
  if (value === '' || value == null) return '';
  return String(value).replace(/[&<>'"]/g, character => ({
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
        aria-selected="${id === active ? 'true' : 'false'}" aria-controls="panel-${id}"
        data-action="detail-tab" data-tab="${id}">${label}</button>
    `).join('')}
  </div>`;
}

export function detailHeaderHtml(property, { location, rent, write = false } = {}) {
  const status = write
    ? `<span class="status-chrome js-write" role="group" aria-label="Rental status">
        <button type="button" class="badge occupied${property.status === 'occupied' ? ' is-current' : ''}" data-action="set-status-occupied">Occupied</button>
        <button type="button" class="badge vacant${property.status === 'vacant' ? ' is-current' : ''}" data-action="set-status-vacant">Vacant</button>
      </span>`
    : `<span class="badge ${property.status}">${property.status === 'occupied' ? 'Occupied' : 'Vacant'}</span>`;
  return `<div class="detail-header">
      <h2 id="detailHeading">${escapeHTML(property.address)}</h2>
      <p class="detail-meta">
        <span>${escapeHTML(location || '')}</span>
        ${status}
        ${rent ? `<span>${escapeHTML(rent)}/mo</span>` : ''}
      </p>
    </div>`;
}

function typeChipsHtml(selected) {
  const known = PROPERTY_TYPES.some(([value]) => value === selected);
  return `<div class="chip-row" role="radiogroup" aria-label="Property type">
    ${PROPERTY_TYPES.map(([value, label]) => `
      <label class="chip">
        <input type="radio" name="propertyType" value="${escapeHTML(value)}" ${(selected === value || (!known && value === 'Other' && selected)) ? 'checked' : ''}>
        ${escapeHTML(label)}
      </label>`).join('')}
  </div>`;
}

function fuelChipsHtml(selected = '') {
  return `<div class="chip-row fuel-chips" role="radiogroup" aria-label="Fuel">
    ${FUEL_OPTIONS.map(([value, label]) => `
      <label class="chip">
        <input type="radio" name="fuel" value="${escapeHTML(value)}" ${selected === value ? 'checked' : ''}>
        ${escapeHTML(label)}
      </label>`).join('')}
  </div>`;
}

export function galleryHtml({ photos, write, sample }) {
  const tiles = (photos || []).map(photo => `
    <button class="gallery-tile${photo.isPrimary ? ' is-primary' : ''}" type="button" data-action="gallery-photo" data-photo-id="${escapeHTML(photo.id)}" aria-label="${photo.isPrimary ? 'Primary photo' : 'Property photo'}">
      <div class="gallery-thumb" data-thumb-path="${escapeHTML(photo.storagePath)}" data-thumb-id="${escapeHTML(photo.id)}" data-thumb-alt="${photo.isPrimary ? 'Primary photo' : 'Property photo'}">
        <span class="media-placeholder" aria-hidden="true"></span>
      </div>
      ${photo.isPrimary ? '<span class="gallery-star" aria-hidden="true">★</span><span class="gallery-chip">Primary</span>' : ''}
    </button>`).join('');
  const atCap = (photos || []).length >= GALLERY_SOFT_CAP;
  const add = write && !atCap
    ? `<button class="gallery-tile is-add js-write" type="button" data-action="add-gallery-photo"><span aria-hidden="true">＋</span> Add</button>`
    : '';
  if (!photos?.length && !write) {
    return `<div class="info-card"><h3>Photos</h3><p class="muted">${sample ? 'No extra photos.' : 'No photos yet.'}</p></div>`;
  }
  return `<div class="info-card">
    <div class="card-head">
      <h3>Photos</h3>
      ${write && !atCap ? '<button class="text-button js-write" type="button" data-action="add-gallery-photo">+ Add</button>' : ''}
    </div>
    <p class="muted">Primary photo shows on your list.</p>
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
      <label>Name
        <input name="name" type="text" maxlength="80" required placeholder="Fridge">
      </label>
      <p class="info-label">Fuel</p>
      ${fuelChipsHtml('')}
      <label>Notes <span class="optional">(optional)</span>
        <input name="notes" type="text" maxlength="200" placeholder="In the garage">
      </label>
      <button class="secondary-button compact" type="submit">+ Add appliance</button>
    </form>` : '';
  const empty = !appliances?.length;
  const body = `${rows || '<p class="muted">No appliances listed.</p>'}${add}`;
  if (write) return disclosureCard(empty ? 'Appliances · None' : 'Appliances', body, !empty);
  return `<div class="info-card">
    <h3>Appliances</h3>
    ${body}
  </div>`;
}

function readBasics(property) {
  const line = formatBedsBaths(property);
  return `
    ${line ? `<p class="fact-line">${escapeHTML(line)}</p>` : ''}
    <div class="fact-grid">
      ${fact('Type', property.propertyType)}
      ${fact('Year built', property.yearBuilt)}
    </div>
    ${property.description ? `<p class="fact-copy">${escapeHTML(property.description)}</p>` : ''}
    ${property.notes ? `<p class="fact-copy">${escapeHTML(property.notes)}</p>` : ''}
    ${!line && !property.propertyType && !property.yearBuilt && !property.description && !property.notes ? '<p class="muted">No home facts yet.</p>' : ''}`;
}

function readUtilities(property) {
  return `
    <div class="fact-grid">
      ${fact('Electric', property.utilityElectric)}
      ${fact('Gas', property.utilityGas)}
      ${fact('Water', property.utilityWater)}
    </div>
    ${property.utilityNotes ? `<p class="fact-copy">${escapeHTML(property.utilityNotes)}</p>` : ''}
    ${!property.utilityElectric && !property.utilityGas && !property.utilityWater && !property.utilityNotes ? '<p class="muted">No utility notes yet.</p>' : ''}`;
}

function readTrash(property) {
  return `
    ${fact('Schedule', property.trashSchedule)}
    ${property.trashNotes ? `<p class="fact-copy">${escapeHTML(property.trashNotes)}</p>` : ''}
    ${!property.trashSchedule && !property.trashNotes ? '<p class="muted">No trash schedule yet.</p>' : ''}`;
}

export function propertyFactsHtml(property) {
  return `
    <div class="info-card">
      <h3>Basics</h3>
      ${readBasics(property)}
    </div>
    <div class="info-card">
      <h3>Utilities &amp; trash</h3>
      ${readUtilities(property)}
      ${readTrash(property)}
    </div>`;
}

function disclosureCard(title, body, open) {
  return `<details class="info-card is-disclosure"${open ? ' open' : ''}>
      <summary>${title}</summary>
      ${body}
    </details>`;
}

function editBasicsCard(property) {
  return `<div class="info-card">
      <h3>Basics</h3>
      <label>Street address <span class="required" aria-hidden="true">*</span>
        <input name="address" type="text" autocomplete="street-address" required maxlength="120" value="${escapeHTML(property.address)}" placeholder="123 Main Street">
      </label>
      <div class="two-columns">
        <label>City <span class="required" aria-hidden="true">*</span>
          <input name="city" type="text" autocomplete="address-level2" required maxlength="60" value="${escapeHTML(property.city)}" placeholder="Folsom">
        </label>
        <label>State <span class="required" aria-hidden="true">*</span>
          <input name="state" type="text" autocomplete="address-level1" required maxlength="2" value="${escapeHTML(property.state)}" placeholder="CA">
        </label>
      </div>
      <div class="two-columns">
        <label>ZIP code <span class="required" aria-hidden="true">*</span>
          <input name="zip" type="text" inputmode="numeric" autocomplete="postal-code" required maxlength="10" value="${escapeHTML(property.zip)}" placeholder="95630">
        </label>
        <label>Monthly rent
          <input name="rent" type="number" inputmode="decimal" min="0" step="1" value="${escapeHTML(property.rent)}" placeholder="2450">
        </label>
      </div>
      <p class="info-label">Property type</p>
      ${typeChipsHtml(property.propertyType)}
      <div class="two-columns">
        <label>Beds
          <input name="beds" type="number" inputmode="decimal" min="0" max="20" step="0.5" value="${escapeHTML(property.beds)}" placeholder="3">
        </label>
        <label>Baths
          <input name="baths" type="number" inputmode="decimal" min="0" max="20" step="0.5" value="${escapeHTML(property.baths)}" placeholder="2">
        </label>
      </div>
      <div class="two-columns">
        <label>Sq ft
          <input name="sqft" type="number" inputmode="numeric" min="0" step="1" value="${escapeHTML(property.sqft)}" placeholder="1600">
        </label>
        <label>Year built
          <input name="yearBuilt" type="number" inputmode="numeric" min="1800" max="2100" step="1" value="${escapeHTML(property.yearBuilt)}" placeholder="1998">
        </label>
      </div>
      <label>Description <span class="optional">(optional)</span>
        <textarea name="description" rows="3" maxlength="1000" placeholder="One-story, two-car garage…">${escapeHTML(property.description)}</textarea>
      </label>
      <label>Notes <span class="optional">(optional)</span>
        <textarea name="notes" rows="2" maxlength="1000" placeholder="Gate code, lockbox…">${escapeHTML(property.notes)}</textarea>
      </label>
    </div>`;
}

function editUtilitiesTrashCard(property) {
  const empty = !property.utilityElectric && !property.utilityGas && !property.utilityWater && !property.utilityNotes
    && !property.trashSchedule && !property.trashNotes;
  return disclosureCard(empty ? 'Utilities &amp; trash · Not set' : 'Utilities &amp; trash', `
      <label>Electric
        <input name="utilityElectric" type="text" maxlength="80" value="${escapeHTML(property.utilityElectric)}" placeholder="PG&amp;E · acct on file">
      </label>
      <label>Gas
        <input name="utilityGas" type="text" maxlength="80" value="${escapeHTML(property.utilityGas)}" placeholder="PG&amp;E">
      </label>
      <label>Water
        <input name="utilityWater" type="text" maxlength="80" value="${escapeHTML(property.utilityWater)}" placeholder="City of Folsom">
      </label>
      <label>Notes <span class="optional">(optional)</span>
        <textarea name="utilityNotes" rows="2" maxlength="400" placeholder="Who pays which bill">${escapeHTML(property.utilityNotes)}</textarea>
      </label>
      <label>Trash schedule
        <input name="trashSchedule" type="text" maxlength="80" value="${escapeHTML(property.trashSchedule)}" placeholder="Tue / Fri">
      </label>
      <label>Trash notes <span class="optional">(optional)</span>
        <textarea name="trashNotes" rows="2" maxlength="400" placeholder="Bins out by 6am">${escapeHTML(property.trashNotes)}</textarea>
      </label>`, !empty);
}

export function propertyTabHtml({ property, photos, appliances, expenses, tenant, write, sample, expenseSummary = '' }) {
  const fields = write
    ? `<form id="propertyDetailForm" novalidate>
        <div id="propertyDetailError" class="form-error" role="alert" hidden></div>
        ${editBasicsCard(property)}
        ${editUtilitiesTrashCard(property)}
        <div id="detailSaveBar" class="form-actions sticky js-write" hidden>
          <button class="primary-button" type="submit">Save</button>
        </div>
      </form>`
    : propertyFactsHtml(property);
  const tenantChip = hasCurrentTenant(tenant)
    ? `<button class="text-button muted-link" type="button" data-action="goto-tenant">Tenant: ${escapeHTML(tenant.name || 'Tenant')}</button>`
    : '';
  const expenseChip = expenses?.length
    ? `<button class="text-button muted-link" type="button" data-action="goto-expenses">${escapeHTML(expenseSummary || `${expenses.length} expenses`)}</button>`
    : '';
  return `
    <div class="detail-grid">
      ${fields}
      ${appliancesHtml({ appliances, write })}
      ${galleryHtml({ photos, write, sample })}
      ${tenantChip || expenseChip ? `<div class="deep-link-row">${tenantChip}${expenseChip}</div>` : ''}
      ${write ? `<div class="danger-zone js-write"><button class="danger-link" type="button" data-action="delete-property" data-id="${escapeHTML(property.id)}">Delete property</button></div>` : ''}
    </div>`;
}

export function vacantTenantHtml({ write, occupiedMissing = false }) {
  if (occupiedMissing) {
    return `<div class="empty-state tenant-empty is-dashed">
      <div class="empty-icon" aria-hidden="true">⌂</div>
      <h3>Add tenant details</h3>
      <p>This home is marked occupied, but no tenant is saved yet.</p>
      ${write ? '<button class="primary-button js-write" type="button" data-action="add-tenant">Add tenant details</button>' : ''}
    </div>`;
  }
  return `<div class="empty-state tenant-empty is-dashed">
    <div class="empty-icon" aria-hidden="true">⌂</div>
    <h3>No tenant yet</h3>
    <p>Add who lives here when this home is occupied.</p>
    ${write ? '<button class="primary-button js-write" type="button" data-action="add-tenant">Add tenant</button>' : ''}
  </div>`;
}

function fileTile({ name, contentType, actions }) {
  const pdf = /pdf/i.test(contentType || '') || /\.pdf$/i.test(name || '');
  return `<div class="receipt-tile">
    <div class="receipt-thumb ${pdf ? 'is-pdf' : ''}">${pdf ? '📄' : '🖼'}</div>
    <div class="receipt-meta">
      <strong>${escapeHTML(name || 'File')}</strong>
      <div class="receipt-actions">${actions}</div>
    </div>
  </div>`;
}

function contactButtons(tenant) {
  const button = (label, value, scheme, icon) => {
    if (!value) return `<span class="contact-button disabled" aria-disabled="true"><span aria-hidden="true">${icon}</span>&nbsp; ${label}</span>`;
    const href = scheme === 'mailto' ? `mailto:${encodeURIComponent(value)}` : `${scheme}:${value.replace(/[^+\d]/g, '')}`;
    return `<a class="contact-button" href="${escapeHTML(href)}"><span aria-hidden="true">${icon}</span>&nbsp; ${label}</a>`;
  };
  return `${button('Call', tenant.phone, 'tel', '☎')} ${button('Text', tenant.phone, 'sms', '▣')} ${button('Email', tenant.email, 'mailto', '✉')}`;
}

export function tenantTabHtml({ property, tenant, files, write, editing }) {
  const occupiedMissing = property?.status === 'occupied' && !hasCurrentTenant(tenant);
  if (!hasCurrentTenant(tenant) && !editing) return vacantTenantHtml({ write, occupiedMissing });
  const adding = editing && !hasCurrentTenant(tenant);
  const name = tenant?.name || '';
  const phone = tenant?.phone || '';
  const email = tenant?.email || '';
  const notes = tenant?.notes || '';

  const contactCard = write
    ? `<div class="info-card">
        <h3>Contact</h3>
        <label>Name <span class="required" aria-hidden="true">*</span>
          <input name="name" type="text" maxlength="100" required value="${escapeHTML(name)}" placeholder="Alex Johnson">
        </label>
        <div class="two-columns">
          <label>Phone
            <input name="phone" type="tel" maxlength="30" value="${escapeHTML(phone)}" placeholder="(916) 555-0123">
          </label>
          <label>Email
            <input name="email" type="email" maxlength="120" value="${escapeHTML(email)}" placeholder="alex@example.com">
          </label>
        </div>
        <div class="contact-actions">${contactButtons({ phone, email })}</div>
      </div>
      <div class="info-card">
        <h3>Notes</h3>
        <label class="sr-only" for="tenantNotes">Tenant notes</label>
        <textarea id="tenantNotes" name="notes" rows="3" maxlength="1000" placeholder="Preferred contact, renewal…">${escapeHTML(notes)}</textarea>
      </div>
      <div id="detailSaveBar" class="form-actions sticky js-write" hidden>
        <button class="primary-button" type="submit">Save</button>
      </div>`
    : `<div class="info-card">
        <h3>Contact</h3>
        <p class="fact-line">${escapeHTML(name || 'Tenant')}</p>
        ${phone ? `<p>${escapeHTML(phone)}</p>` : ''}
        ${email ? `<p>${escapeHTML(email)}</p>` : ''}
        <div class="contact-actions">${contactButtons({ phone, email })}</div>
      </div>
      ${notes ? `<div class="info-card"><h3>Notes</h3><p>${escapeHTML(notes)}</p></div>` : ''}`;

  const lease = tenant?.leaseStoragePath
    ? fileTile({
      name: tenant.leaseFileName || 'Lease',
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
    name: file.fileName,
    contentType: file.contentType,
    actions: `
      <button class="text-button" type="button" data-action="view-tenant-file" data-file-id="${escapeHTML(file.id)}">View</button>
      ${write ? `<button class="text-button danger js-write" type="button" data-action="delete-tenant-file" data-file-id="${escapeHTML(file.id)}">Remove</button>` : ''}`
  })).join('');

  const filesBlock = adding ? '' : `
    <div class="info-card">
      <h3>Lease agreement</h3>
      ${lease}
    </div>
    <div class="info-card">
      <div class="card-head">
        <h3>Letters &amp; emails (copies you save)</h3>
        ${write ? '<button class="text-button js-write" type="button" data-action="add-correspondence">+ Add</button>' : ''}
      </div>
      ${correspondence || '<p class="muted">No letters or emails saved.</p>'}
    </div>
    ${write ? `<div class="danger-zone js-write"><button class="danger-link" type="button" data-action="remove-tenant" data-id="${escapeHTML(property.id)}">Remove tenant</button></div>` : ''}`;

  return `
    <form id="tenantForm" novalidate>
      <div id="tenantError" class="form-error" role="alert" hidden></div>
      ${contactCard}
    </form>
    ${filesBlock}`;
}

export function typeOptionsHtml(selected) {
  const value = selected || '';
  const known = PROPERTY_TYPES.some(([stored]) => stored === value) ? value : (value ? 'Other' : '');
  return PROPERTY_TYPES.map(([stored, label]) => `<option value="${escapeHTML(stored)}"${stored === known ? ' selected' : ''}>${escapeHTML(label)}</option>`).join('');
}
