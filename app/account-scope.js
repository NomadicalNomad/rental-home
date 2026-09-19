/* Account isolation + shared sample mode (read-only Folsom demo). */

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

/** Demo rows are never copied into a personal account — including a brand-new empty one. */
export function shouldInjectDemoProperties(_context = {}) {
  return false;
}

export function rowsForAccount(rows, accountId) {
  if (!accountId) return [];
  const scope = String(accountId);
  return (rows || []).filter(row => String(row?.account_id || '') === scope);
}

export function personalListFromRows(rows, accountId) {
  if (shouldInjectDemoProperties({ accountId, properties: rows || [] })) {
    return rowsForAccount(rows, accountId);
  }
  return rowsForAccount(rows, accountId);
}

export function sampleWriteError() {
  return new Error('Sample homes cannot be changed.');
}
