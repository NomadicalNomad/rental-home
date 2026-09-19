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
  detailTabsHtml,
  hasCurrentTenant,
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
  assert.match(empty, /No tenant right now/);
  assert.doesNotMatch(empty, /Maria|Alex|555-/);
  const occupied = tenantTabHtml({
    property: { id: 'p1' },
    tenant: sampleTenants()[0],
    files: sampleTenantFiles(),
    write: false,
    editing: false
  });
  assert.match(occupied, /Maria Hernandez/);
  assert.match(occupied, /Lease/);
  assert.match(occupied, /Correspondence/);
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
  assert.doesNotMatch(appJs, /function seedProperties/);
});
