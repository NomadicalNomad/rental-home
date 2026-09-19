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
  const path = String(hash || '').replace(/^#/, '').split('?')[0].replace(/\/+$/, '');
  return path === '/sample' || path === 'sample';
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
    { id: '10000000-0000-4000-8000-000000000001', account_id: SAMPLE_ACCOUNT_ID, address: '1124 Iron Point Road', city: 'Folsom', state: 'CA', zip: '95630', status: 'occupied', tenant_name: 'Maria Hernandez', phone: '(916) 555-0148', email: 'maria.h@example.com', rent: '2450', notes: 'Renewal conversation in October.', created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z' },
    { id: '10000000-0000-4000-8000-000000000002', account_id: SAMPLE_ACCOUNT_ID, address: '704 Blue Ravine Road', city: 'Folsom', state: 'CA', zip: '95630', status: 'vacant', tenant_name: '', phone: '', email: '', rent: '2200', notes: 'Fresh paint completed in the living room.', created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z' },
    { id: '10000000-0000-4000-8000-000000000003', account_id: SAMPLE_ACCOUNT_ID, address: '1538 East Bidwell Street', city: 'Folsom', state: 'CA', zip: '95630', status: 'occupied', tenant_name: 'James Wilson', phone: '(916) 555-0196', email: 'james.wilson@example.com', rent: '2750', notes: 'Two-car garage; gardener included.', created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z' },
    { id: '10000000-0000-4000-8000-000000000004', account_id: SAMPLE_ACCOUNT_ID, address: '889 Sibley Street', city: 'Folsom', state: 'CA', zip: '95630', status: 'vacant', tenant_name: '', phone: '', email: '', rent: '1950', notes: '', created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z' }
  ];
}

export function sampleWriteError() {
  return new Error('Sample homes cannot be changed.');
}
