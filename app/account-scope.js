/* Shared sample portfolio is read-only and never copied into a personal account. */

export const SAMPLE_ACCOUNT_ID = '00000000-0000-4000-8000-000000000001';

export const SAMPLE_ADDRESSES = [
  '1124 Iron Point Road',
  '704 Blue Ravine Road',
  '1538 East Bidwell Street',
  '889 Sibley Street'
];

export function isSampleAccountId(id) {
  return String(id || '').toLowerCase() === SAMPLE_ACCOUNT_ID;
}

export function isSampleHash(hash) {
  const path = String(hash || '').replace(/^#/, '').split('?')[0].replace(/^\/+|\/+$/g, '');
  return path === 'sample' || path.startsWith('sample/');
}

export function scopedAccountId({ sampleMode = false, accountId = null } = {}) {
  if (sampleMode) return SAMPLE_ACCOUNT_ID;
  return accountId || null;
}

export function canMutateAccount({ sampleMode = false, accountId = null } = {}) {
  if (sampleMode) return false;
  if (!accountId) return false;
  if (isSampleAccountId(accountId)) return false;
  return true;
}

/** Folsom templates are never inserted into a personal account — including a brand-new empty one. */
export function shouldInjectDemoProperties(_context = {}) {
  return false;
}

export function rowsForAccount(rows, accountId) {
  if (!accountId) return [];
  const scope = String(accountId);
  return (rows || []).filter(row => String(row?.account_id || '') === scope);
}

export function personalListFromRows(rows, accountId) {
  return rowsForAccount(rows, accountId);
}

/** Read-only Folsom demo for `#/sample` only. Not written to Supabase. */
export function samplePortfolio() {
  return [
    {
      id: '10000000-0000-4000-8000-000000000001',
      account_id: SAMPLE_ACCOUNT_ID,
      address: '1124 Iron Point Road',
      city: 'Folsom',
      state: 'CA',
      zip: '95630',
      status: 'occupied',
      tenant_name: 'Maria Hernandez',
      phone: '(916) 555-0148',
      email: 'maria.h@example.com',
      rent: '2450',
      notes: 'Renewal conversation in October.',
      thumbnail_path: './sample-media/00000000-0000-4000-8000-000000000011.svg',
      beds: 3,
      baths: 2,
      sqft: 1620,
      year_built: 1998,
      property_type: 'Single family',
      description: 'Single-story ranch near Intel. Two-car garage and a covered patio.',
      utility_electric: 'SMUD',
      utility_gas: 'PG&E',
      utility_water: 'City of Folsom',
      utility_notes: 'Landlord pays water. Tenant pays electric and gas.',
      trash_schedule: 'Thursday mornings',
      trash_notes: 'Bins out by 6am. Recycle and green waste weekly.',
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z'
    },
    {
      id: '10000000-0000-4000-8000-000000000002',
      account_id: SAMPLE_ACCOUNT_ID,
      address: '704 Blue Ravine Road',
      city: 'Folsom',
      state: 'CA',
      zip: '95630',
      status: 'vacant',
      tenant_name: '',
      phone: '',
      email: '',
      rent: '2200',
      notes: 'Fresh paint completed in the living room.',
      thumbnail_path: './sample-media/00000000-0000-4000-8000-000000000012.svg',
      beds: 2,
      baths: 2,
      sqft: 1180,
      year_built: 2004,
      property_type: 'Townhouse',
      description: 'End-unit townhouse. Fresh paint in the living room. Ready to show.',
      utility_electric: 'SMUD',
      utility_gas: 'PG&E',
      utility_water: 'City of Folsom',
      utility_notes: 'All utilities in the landlord name until a tenant moves in.',
      trash_schedule: 'Friday mornings',
      trash_notes: 'HOA handles street sweeping; trash is city pickup.',
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z'
    },
    {
      id: '10000000-0000-4000-8000-000000000003',
      account_id: SAMPLE_ACCOUNT_ID,
      address: '1538 East Bidwell Street',
      city: 'Folsom',
      state: 'CA',
      zip: '95630',
      status: 'occupied',
      tenant_name: 'James Wilson',
      phone: '(916) 555-0196',
      email: 'james.wilson@example.com',
      rent: '2750',
      notes: 'Two-car garage; gardener included.',
      thumbnail_path: './sample-media/00000000-0000-4000-8000-000000000013.svg',
      beds: 4,
      baths: 2.5,
      sqft: 2105,
      year_built: 1992,
      property_type: 'Single family',
      description: 'Two-story with a two-car garage. Gardener included on the first of the month.',
      utility_electric: 'SMUD',
      utility_gas: 'PG&E',
      utility_water: 'City of Folsom',
      utility_notes: 'Tenant pays all utilities.',
      trash_schedule: 'Wednesday mornings',
      trash_notes: 'Extra green-waste pickup in fall.',
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z'
    },
    {
      id: '10000000-0000-4000-8000-000000000004',
      account_id: SAMPLE_ACCOUNT_ID,
      address: '889 Sibley Street',
      city: 'Folsom',
      state: 'CA',
      zip: '95630',
      status: 'vacant',
      tenant_name: '',
      phone: '',
      email: '',
      rent: '1950',
      notes: '',
      thumbnail_path: './sample-media/00000000-0000-4000-8000-000000000012.svg',
      beds: 2,
      baths: 1,
      sqft: 980,
      year_built: 1986,
      property_type: 'Condo',
      description: 'Ground-floor condo. Quiet street near the park.',
      utility_electric: 'SMUD',
      utility_gas: '',
      utility_water: 'City of Folsom',
      utility_notes: 'HOA covers water and trash.',
      trash_schedule: 'Tuesday mornings',
      trash_notes: '',
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z'
    }
  ];
}

export function samplePhotos() {
  return [
    { id: '10000000-0000-4000-8000-000000000041', accountId: SAMPLE_ACCOUNT_ID, propertyId: '10000000-0000-4000-8000-000000000001', storagePath: './sample-media/00000000-0000-4000-8000-000000000011.svg', sortOrder: 0, isPrimary: true },
    { id: '10000000-0000-4000-8000-000000000042', accountId: SAMPLE_ACCOUNT_ID, propertyId: '10000000-0000-4000-8000-000000000001', storagePath: './sample-media/00000000-0000-4000-8000-000000000012.svg', sortOrder: 1, isPrimary: false },
    { id: '10000000-0000-4000-8000-000000000043', accountId: SAMPLE_ACCOUNT_ID, propertyId: '10000000-0000-4000-8000-000000000002', storagePath: './sample-media/00000000-0000-4000-8000-000000000012.svg', sortOrder: 0, isPrimary: true },
    { id: '10000000-0000-4000-8000-000000000044', accountId: SAMPLE_ACCOUNT_ID, propertyId: '10000000-0000-4000-8000-000000000003', storagePath: './sample-media/00000000-0000-4000-8000-000000000013.svg', sortOrder: 0, isPrimary: true },
    { id: '10000000-0000-4000-8000-000000000045', accountId: SAMPLE_ACCOUNT_ID, propertyId: '10000000-0000-4000-8000-000000000004', storagePath: './sample-media/00000000-0000-4000-8000-000000000012.svg', sortOrder: 0, isPrimary: true }
  ];
}

export function sampleAppliances() {
  return [
    { id: '10000000-0000-4000-8000-000000000071', accountId: SAMPLE_ACCOUNT_ID, propertyId: '10000000-0000-4000-8000-000000000001', name: 'Range', fuel: 'gas', notes: 'Replaced 2023.' },
    { id: '10000000-0000-4000-8000-000000000072', accountId: SAMPLE_ACCOUNT_ID, propertyId: '10000000-0000-4000-8000-000000000001', name: 'Dryer', fuel: 'electric', notes: 'In the garage.' },
    { id: '10000000-0000-4000-8000-000000000073', accountId: SAMPLE_ACCOUNT_ID, propertyId: '10000000-0000-4000-8000-000000000001', name: 'Refrigerator', fuel: 'electric', notes: '' },
    { id: '10000000-0000-4000-8000-000000000074', accountId: SAMPLE_ACCOUNT_ID, propertyId: '10000000-0000-4000-8000-000000000002', name: 'Range', fuel: 'electric', notes: 'Works. Leave for the next tenant.' },
    { id: '10000000-0000-4000-8000-000000000075', accountId: SAMPLE_ACCOUNT_ID, propertyId: '10000000-0000-4000-8000-000000000003', name: 'Washer', fuel: 'electric', notes: 'Shared laundry closet.' }
  ];
}

export function sampleTenants() {
  return [
    {
      id: '10000000-0000-4000-8000-000000000061',
      accountId: SAMPLE_ACCOUNT_ID,
      propertyId: '10000000-0000-4000-8000-000000000001',
      name: 'Maria Hernandez',
      phone: '(916) 555-0148',
      email: 'maria.h@example.com',
      notes: 'Renewal conversation in October. Prefers texts.',
      leaseStoragePath: './sample-media/00000000-0000-4000-8000-000000000032.pdf',
      leaseContentType: 'application/pdf',
      leaseFileName: 'hernandez-lease.pdf'
    },
    {
      id: '10000000-0000-4000-8000-000000000063',
      accountId: SAMPLE_ACCOUNT_ID,
      propertyId: '10000000-0000-4000-8000-000000000003',
      name: 'James Wilson',
      phone: '(916) 555-0196',
      email: 'james.wilson@example.com',
      notes: 'Quiet tenant. Gardener comes the first Monday.',
      leaseStoragePath: './sample-media/00000000-0000-4000-8000-000000000032.pdf',
      leaseContentType: 'application/pdf',
      leaseFileName: 'wilson-lease.pdf'
    }
  ];
}

export function sampleTenantFiles() {
  return [
    {
      id: '10000000-0000-4000-8000-000000000081',
      accountId: SAMPLE_ACCOUNT_ID,
      tenantId: '10000000-0000-4000-8000-000000000061',
      propertyId: '10000000-0000-4000-8000-000000000001',
      kind: 'correspondence',
      storagePath: './sample-media/00000000-0000-4000-8000-000000000031.svg',
      contentType: 'image/svg+xml',
      fileName: 'renewal-text.svg'
    }
  ];
}

export function sampleWriteError() {
  return new Error('Sample homes cannot be changed.');
}
