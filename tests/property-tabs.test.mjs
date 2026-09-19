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
  const occupied = tenantTabHtml({
    property: { id: 'p1', status: 'occupied' },
    tenant: sampleTenants()[0],
    files: sampleTenantFiles(),
    write: false,
    editing: false
  });
  assert.match(occupied, /Maria Hernandez/);
  assert.match(occupied, /Lease agreement/);
  assert.match(occupied, /Letters &amp; emails/);
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
  assert.match(html, /Utilities/);
  assert.match(html, /Trash/);
  assert.match(html, /Appliances/);
  assert.match(html, /Photos/);
  assert.match(html, /Primary photo shows on your list/);
  assert.match(html, /gallery-star/);
  assert.doesNotMatch(html, /Edit property/);
  assert.doesNotMatch(html, />Expenses</);
});

test('sticky address chrome and 3-segment tabs use selected fill, not underline-only', () => {
  const html = detailHeaderHtml({ address: '1124 Iron Point Road', status: 'occupied' }, { location: 'Folsom, CA 95630', rent: '$2,450' });
  assert.match(html, /1124 Iron Point Road/);
  assert.match(html, /Folsom, CA 95630/);
  assert.match(html, /Occupied/);
  assert.match(html, /\$2,450\/mo/);
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

test('index confirm sheet offers Save / Discard / Cancel for dirty tabs', () => {
  const html = readFileSync(join(root, 'app/index.html'), 'utf8');
  assert.match(html, /id="confirmDiscard"/);
  assert.match(html, /id="lightboxActions"/);
  assert.match(html, /Make primary/);
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
  assert.doesNotMatch(appJs, /function seedProperties/);
});
