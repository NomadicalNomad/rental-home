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
  samplePortfolio,
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
});

test('sample mode is #/sample only and does not copy into a personal account', () => {
  assert.equal(isSampleAccountId(SAMPLE_ACCOUNT_ID), true);
  assert.equal(isSampleHash('#/sample'), true);
  assert.equal(scopedAccountId({ sampleMode: true, accountId: FRESH_ACCOUNT }), SAMPLE_ACCOUNT_ID);
  const sample = samplePortfolio();
  assert.equal(sample.length, 4);
  assert.ok(sample.every(row => row.account_id === SAMPLE_ACCOUNT_ID));
  assert.equal(personalListFromRows(sample, FRESH_ACCOUNT).length, 0);
});

test('sample account and sample mode are read-only', () => {
  assert.equal(canMutateAccount({ sampleMode: true, accountId: FRESH_ACCOUNT }), false);
  assert.equal(canMutateAccount({ sampleMode: false, accountId: SAMPLE_ACCOUNT_ID }), false);
  assert.equal(canMutateAccount({ sampleMode: false, accountId: FRESH_ACCOUNT }), true);
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

test('PWA deleted auto-seed paths (maybeSeedSampleData / seedProperties)', () => {
  const appJs = readFileSync(join(root, 'app/app.js'), 'utf8');
  assert.doesNotMatch(appJs, /function seedProperties/);
  assert.doesNotMatch(appJs, /maybeSeedSampleData/);
  assert.doesNotMatch(appJs, /insertProperties\(\s*seedProperties\(\)\s*\)/);
  assert.match(appJs, /samplePortfolio\(\)/);
  assert.match(appJs, /if \(sampleMode\)/);
});

test('schema.sql leaves existing RLS member policies intact', () => {
  const schema = readFileSync(join(root, 'supabase/schema.sql'), 'utf8');
  assert.match(schema, /properties_select_member/);
  assert.match(schema, /using \(public\.is_account_member\(account_id\)\);/);
  assert.doesNotMatch(schema, /properties_select_sample/);
  assert.doesNotMatch(schema, /is_sample_account/);
  assert.doesNotMatch(schema, /not public\.is_sample_account/);
});
