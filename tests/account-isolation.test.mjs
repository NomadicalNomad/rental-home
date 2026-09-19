import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import {
  SAMPLE_ACCOUNT_ID,
  SAMPLE_ADDRESSES,
  canMutateAccount,
  isSampleAccountId,
  isSampleHash,
  personalListFromRows,
  rowsForAccount,
  scopedAccountId,
  shouldInjectDemoProperties
} from '../app/account-scope.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const QA_ACCOUNT = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const FRESH_ACCOUNT = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

const foreignFolsom = SAMPLE_ADDRESSES.map((address, index) => ({
  id: `qa-${index}`,
  account_id: QA_ACCOUNT,
  address,
  city: 'Folsom',
  state: 'CA',
  zip: '95630'
}));

test('fresh signup → 0 properties; no foreign Folsom rows', () => {
  const emptyPersonal = personalListFromRows([], FRESH_ACCOUNT);
  assert.equal(emptyPersonal.length, 0);

  const leaked = personalListFromRows(foreignFolsom, FRESH_ACCOUNT);
  assert.equal(leaked.length, 0);
  assert.equal(leaked.some(row => SAMPLE_ADDRESSES.includes(row.address)), false);
});

test('empty unseeded personal account is never auto-seeded', () => {
  assert.equal(shouldInjectDemoProperties({
    account: { id: FRESH_ACCOUNT, seeded: false },
    properties: [],
    sampleMode: false
  }), false);
  assert.equal(shouldInjectDemoProperties({
    account: { id: FRESH_ACCOUNT, seeded: false },
    properties: [],
    sampleMode: true
  }), false);
});

test('sample mode reads only the shared sample account id', () => {
  assert.equal(isSampleAccountId(SAMPLE_ACCOUNT_ID), true);
  assert.equal(isSampleAccountId(FRESH_ACCOUNT), false);
  assert.equal(scopedAccountId({ sampleMode: true, accountId: FRESH_ACCOUNT }), SAMPLE_ACCOUNT_ID);
  assert.equal(scopedAccountId({ sampleMode: false, accountId: FRESH_ACCOUNT }), FRESH_ACCOUNT);
  assert.equal(isSampleHash('#/sample'), true);
  assert.equal(isSampleHash('#sample'), true);
  assert.equal(isSampleHash('#/invite=ABC'), false);
});

test('sample account and sample mode are read-only', () => {
  assert.equal(canMutateAccount({ sampleMode: true, accountId: FRESH_ACCOUNT }), false);
  assert.equal(canMutateAccount({ sampleMode: false, accountId: SAMPLE_ACCOUNT_ID }), false);
  assert.equal(canMutateAccount({ sampleMode: false, accountId: FRESH_ACCOUNT }), true);
  assert.equal(canMutateAccount({ sampleMode: false, accountId: null }), false);
});

test('client filter drops another identity’s rows even if the API returns them', () => {
  const mixed = [
    ...foreignFolsom,
    { id: 'mine', account_id: FRESH_ACCOUNT, address: '999 QA Test Lane' }
  ];
  const mine = rowsForAccount(mixed, FRESH_ACCOUNT);
  assert.equal(mine.length, 1);
  assert.equal(mine[0].address, '999 QA Test Lane');
});

test('PWA no longer inserts Folsom seed into personal accounts', () => {
  const appJs = readFileSync(join(root, 'app/app.js'), 'utf8');
  assert.match(appJs, /shouldInjectDemoProperties/);
  assert.doesNotMatch(appJs, /insertProperties\(\s*seedProperties\(\)\s*\)/);
  assert.doesNotMatch(appJs, /async function maybeSeedSampleData/);
});

test('schema and migration pin sample account + RLS (no wipe of user rows)', () => {
  const schema = readFileSync(join(root, 'supabase/schema.sql'), 'utf8');
  const migration = readFileSync(join(root, 'supabase/migrations/20260919_account_isolation_sample.sql'), 'utf8');
  for (const sql of [schema, migration]) {
    assert.match(sql, /00000000-0000-4000-8000-000000000001/);
    assert.match(sql, /is_sample/);
    assert.match(sql, /properties_select_sample/);
    assert.match(sql, /not public\.is_sample_account\(account_id\)/);
    assert.doesNotMatch(sql, /delete from public\.properties\s+where account_id <>/i);
    assert.doesNotMatch(sql, /delete from public\.properties;/i);
  }
});
