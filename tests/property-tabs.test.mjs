import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import {
  SAMPLE_ACCOUNT_ID,
  sampleAppliances,
  samplePhotos,
  samplePortfolio,
  sampleTenantFiles,
  sampleTenants
} from '../app/account-scope.js';
import {
  galleryPhotoPath,
  leaseObjectPath,
  tenantFileObjectPath
} from '../app/media.js';
import {
  DETAIL_TABS,
  GALLERY_SOFT_CAP,
  detailHeaderHtml,
  detailTabsHtml,
  galleryHtml,
  hasCurrentTenant,
  propertyTabHtml,
  tenantTabHtml,
  vacantTenantHtml
} from '../app/property-tabs.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

test('detail chrome is Property | Tenant | Expenses', () => {
  assert.deepEqual(DETAIL_TABS.map(item => item[1]), ['Property', 'Tenant', 'Expenses']);
  const html = detailTabsHtml('tenant');
  assert.match(html, /aria-selected="true"[^>]*data-tab="tenant"|data-tab="tenant"[^>]*aria-selected="true"/);
  assert.match(html, /class="detail-tab active"/);
});

test('sample occupied homes have tenant + lease demo; vacant homes do not invent a tenant', () => {
  const homes = samplePortfolio();
  const occupied = homes.filter(row => row.status === 'occupied');
  const vacant = homes.filter(row => row.status === 'vacant');
  assert.ok(occupied.length >= 2);
  assert.ok(vacant.length >= 1);
  vacant.forEach(home => {
    assert.equal(home.tenant_name, '');
    assert.equal(sampleTenants().some(tenant => tenant.propertyId === home.id), false);
  });
  occupied.forEach(home => {
    const tenant = sampleTenants().find(item => item.propertyId === home.id);
    assert.ok(hasCurrentTenant(tenant));
    assert.ok(tenant.leaseStoragePath);
  });
  assert.ok(samplePhotos().some(photo => photo.isPrimary));
  assert.ok(sampleAppliances().some(item => item.fuel === 'gas'));
  assert.ok(sampleTenantFiles().every(file => file.kind === 'correspondence'));
});

test('vacant tenant tab is an empty state with no fake contact', () => {
  const empty = vacantTenantHtml({ write: false });
  assert.match(empty, /No tenant yet/);
  assert.match(empty, /Add who lives here when this home is occupied/);
  assert.doesNotMatch(empty, /Maria|Alex|555-/);
  const writable = vacantTenantHtml({ write: true });
  assert.match(writable, /Add tenant/);
  assert.doesNotMatch(writable, /name="phone"|name="email"|tenantName/);
  const occupied = tenantTabHtml({
    property: { id: 'p1', status: 'occupied' },
    tenant: sampleTenants()[0],
    files: sampleTenantFiles(),
    write: false,
    editing: false
  });
  assert.match(occupied, /Maria Hernandez/);
  assert.match(occupied, /Lease agreement/);
  assert.match(occupied, /Letters &amp; emails \(copies you save\)/);
  assert.match(occupied, /Call/);
  assert.match(occupied, /Text/);
  assert.match(occupied, /Email/);
  assert.doesNotMatch(occupied, />Correspondence</);
});

test('property tab groups Basics, Utilities, Trash, Appliances, and Photos', () => {
  const home = samplePortfolio()[0];
  const html = propertyTabHtml({
    property: {
      ...home,
      propertyType: home.property_type,
      yearBuilt: home.year_built,
      utilityElectric: home.utility_electric,
      utilityGas: home.utility_gas,
      utilityWater: home.utility_water,
      utilityNotes: home.utility_notes,
      trashSchedule: home.trash_schedule,
      trashNotes: home.trash_notes
    },
    photos: samplePhotos().filter(item => item.propertyId === home.id),
    appliances: sampleAppliances().filter(item => item.propertyId === home.id),
    expenses: [{ amount: 84 }],
    tenant: sampleTenants()[0],
    write: false,
    sample: true,
    expenseSummary: '2 expenses · $504'
  });
  assert.match(html, /Basics/);
  assert.match(html, /Utilities &amp; trash/);
  assert.match(html, /Appliances/);
  assert.match(html, /Photos/);
  assert.match(html, /Primary photo shows on your list/);
  assert.match(html, /gallery-star/);
  assert.doesNotMatch(html, /Edit property/);
  assert.doesNotMatch(html, />Expenses</);
  assert.doesNotMatch(html, /name="phone"|name="email"|name="tenantName"/);
  assert.doesNotMatch(html, />Call<|>Text<|>Email</);
});

test('property write form is collapsible groups with no people fields', () => {
  const home = samplePortfolio()[1];
  const html = propertyTabHtml({
    property: {
      ...home,
      status: 'vacant',
      tenantName: '',
      phone: '',
      email: '',
      propertyType: home.property_type,
      yearBuilt: home.year_built,
      utilityElectric: '',
      utilityGas: '',
      utilityWater: '',
      utilityNotes: '',
      trashSchedule: '',
      trashNotes: ''
    },
    photos: [],
    appliances: [],
    expenses: [],
    tenant: null,
    write: true,
    sample: false
  });
  assert.match(html, /<details class="info-card is-disclosure"/);
  assert.match(html, /<h3>Basics<\/h3>/);
  assert.match(html, /<summary>Utilities &amp; trash · Not set<\/summary>/);
  assert.match(html, /<summary>Appliances · None<\/summary>/);
  assert.match(html, /id="detailSaveBar"/);
  assert.match(html, /Primary photo shows on your list/);
  assert.doesNotMatch(html, /name="tenantName"|name="phone"|name="email"/);
  assert.doesNotMatch(html, />Call<|>Text</);
  assert.doesNotMatch(html, /Maria|Alex|555-/);
});

test('sticky address chrome and 3-segment tabs use selected fill, not underline-only', () => {
  const html = detailHeaderHtml({ address: '1124 Iron Point Road', status: 'occupied' }, { location: 'Folsom, CA 95630', rent: '$2,450' });
  assert.match(html, /1124 Iron Point Road/);
  assert.match(html, /Folsom, CA 95630/);
  assert.match(html, /Occupied/);
  assert.match(html, /\$2,450\/mo/);
  const writable = detailHeaderHtml({ address: '1124 Iron Point Road', status: 'vacant' }, { location: 'Folsom, CA 95630', write: true });
  assert.match(writable, /data-action="set-status-occupied"/);
  assert.match(writable, /data-action="set-status-vacant"/);
  assert.equal(GALLERY_SOFT_CAP, 10);
  const tabs = detailTabsHtml('property');
  assert.match(tabs, /role="tablist"/);
  assert.match(tabs, /aria-selected="true"[^>]*data-tab="property"|data-tab="property"[^>]*aria-selected="true"/);
});

test('gallery primary tile is marked for the list thumbnail', () => {
  const html = galleryHtml({
    photos: samplePhotos().filter(item => item.propertyId === '10000000-0000-4000-8000-000000000001'),
    write: false,
    sample: true
  });
  assert.match(html, /Primary/);
  assert.match(html, /★/);
});

test('gallery Add buttons carry the property id', () => {
  const propertyId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const html = galleryHtml({ photos: [], write: true, sample: false, propertyId });
  assert.match(html, /data-action="add-gallery-photo"[^>]*data-id="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"/);
  assert.equal([...html.matchAll(/data-action="add-gallery-photo"/g)].length, 2);
});

test('existing-home photo picks persist immediately; new-home form only stages', () => {
  const appJs = readFileSync(join(root, 'app/app.js'), 'utf8');
  assert.match(appJs, /function photoTargetProperty/);
  assert.match(appJs, /function persistPickedPhotos/);
  assert.match(appJs, /async function stageFormPhoto/);
  assert.match(appJs, /if \(!property\?\.id && isFormPhotoContext\(\)\)/);
  assert.match(appJs, /await persistPickedPhotos\(property, \[file\]\)/);
  assert.match(appJs, /Photo added\. Save this home to keep it\./);
  assert.match(appJs, /showPhotoFailure/);
  assert.match(appJs, /Couldn’t add that photo\. Try again\./);
  assert.match(appJs, /const files = \[\.\.\.\(event\.target\.files \|\| \[\]\)\];\s*event\.target\.value = '';/s);
});

test('index confirm sheet offers Save / Discard / Cancel for dirty tabs', () => {
  const html = readFileSync(join(root, 'app/index.html'), 'utf8');
  const appJs = readFileSync(join(root, 'app/app.js'), 'utf8');
  assert.match(html, /id="confirmDiscard"/);
  assert.match(html, /id="lightboxActions"/);
  assert.match(html, /Make primary/);
  assert.match(html, /<label class="sheet-row js-write" for="photoCameraInput"/);
  assert.match(html, /<label class="sheet-row js-write" for="photoLibraryInput"/);
  assert.doesNotMatch(appJs, /#photoCameraInput'\)\.click\(/);
  assert.doesNotMatch(appJs, /#photoLibraryInput'\)\.click\(/);
  assert.doesNotMatch(html, /id="tenantFields"|name="tenantName"/);
  assert.match(html, /Tenant name, phone, and email live on the Tenant tab/);
});

test('storage paths follow the Structure freeze', () => {
  const account = SAMPLE_ACCOUNT_ID;
  const property = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const photo = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const file = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  assert.equal(galleryPhotoPath(account, property, photo, 'jpg'), `${account}/properties/${property}/photos/${photo}.jpg`);
  assert.equal(leaseObjectPath(account, property, 'pdf'), `${account}/properties/${property}/tenant/lease.pdf`);
  assert.equal(tenantFileObjectPath(account, property, file, 'pdf'), `${account}/properties/${property}/tenant/files/${file}.pdf`);
});

test('SQL and PWA keep account isolation and one tenant per property', () => {
  const migration = readFileSync(join(root, 'supabase/migrations/20260919_property_tenant_tabs.sql'), 'utf8');
  const schema = readFileSync(join(root, 'supabase/schema.sql'), 'utf8');
  const appJs = readFileSync(join(root, 'app/app.js'), 'utf8');
  for (const sql of [migration, schema]) {
    assert.match(sql, /tenants_one_per_property_idx/);
    assert.match(sql, /property_photos_one_primary_idx/);
    assert.match(sql, /tenants_select_member/);
    assert.match(sql, /property_photos_select_member/);
    assert.match(sql, /not public.is_sample_account\(account_id\)/);
    assert.match(sql, /insert into public.tenants/);
  }
  assert.match(appJs, /function assertWritable/);
  assert.match(appJs, /detail-tab/);
  assert.match(appJs, /Save changes\?/);
  assert.match(appJs, /confirmLeaveDirtyTab/);
  assert.match(appJs, /Remove tenant info and files for this home\?/);
  assert.match(appJs, /Remove tenant record\?/);
  assert.match(appJs, /You can add up to 10 photos/);
  assert.doesNotMatch(appJs, /function seedProperties/);
  assert.doesNotMatch(appJs, /Please add the tenant name for an occupied home/);
});
