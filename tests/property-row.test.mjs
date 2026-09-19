import assert from 'node:assert/strict';
import test from 'node:test';

import { toPropertyRow, withoutThumbnailPath } from '../app/property-row.js';
import { canShareFiles, SHARE_UNAVAILABLE_TOAST } from '../app/export.js';

const home = {
  id: '11111111-1111-4111-8111-111111111111',
  address: '42 UX Lane',
  city: 'Folsom',
  state: 'CA',
  zip: '95630',
  status: 'vacant',
  tenantName: '',
  phone: '',
  email: '',
  rent: '1800',
  notes: '',
  createdAt: '2026-09-19T00:00:00.000Z',
  updatedAt: '2026-09-19T00:00:00.000Z'
};

test('toPropertyRow omits empty thumbnail_path so Add home works before the column exists', () => {
  const row = toPropertyRow({ ...home, thumbnailPath: '' }, 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
  assert.equal('thumbnail_path' in row, false);
  assert.equal(row.address, '42 UX Lane');
  assert.equal(row.account_id, 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
  assert.equal(row.rent, '1800');
});

test('toPropertyRow includes thumbnail_path only when a photo path exists', () => {
  const row = toPropertyRow({ ...home, thumbnailPath: 'acct/properties/id/thumbnail.jpg' }, 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
  assert.equal(row.thumbnail_path, 'acct/properties/id/thumbnail.jpg');
  assert.equal(withoutThumbnailPath(row).thumbnail_path, undefined);
});

test('desktop Web Share fallback is a clear toast when canShare is missing', () => {
  assert.equal(canShareFiles({ name: 'file.csv' }, undefined), false);
  assert.equal(canShareFiles({ name: 'file.csv' }, {}), false);
  assert.equal(canShareFiles({ name: 'file.csv' }, { canShare: () => false }), false);
  assert.equal(canShareFiles({ name: 'file.csv' }, { canShare: () => true }), true);
  assert.equal(canShareFiles({ name: 'file.csv' }, { canShare: () => { throw new Error('not supported'); } }), false);
  assert.equal(SHARE_UNAVAILABLE_TOAST, 'File saved — use your share menu');
});
