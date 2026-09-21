import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { imageTypeFromName, isPdf, normalizeImageFile } from '../app/media.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

test('imageTypeFromName infers MIME from common photo extensions', () => {
  assert.equal(imageTypeFromName('yard.JPG'), 'image/jpeg');
  assert.equal(imageTypeFromName('porch.jpeg'), 'image/jpeg');
  assert.equal(imageTypeFromName('front.png'), 'image/png');
  assert.equal(imageTypeFromName('hero.webp'), 'image/webp');
  assert.equal(imageTypeFromName('IMG_1001.HEIC'), 'image/heic');
  assert.equal(imageTypeFromName('notes.pdf'), '');
  assert.equal(imageTypeFromName('no-extension'), '');
});

test('normalizeImageFile fills empty picker MIME from the filename', () => {
  const bare = new File([new Uint8Array([1, 2, 3])], 'backyard.jpg', { type: '' });
  const ready = normalizeImageFile(bare);
  assert.equal(ready.type, 'image/jpeg');
  assert.equal(ready.name, 'backyard.jpg');

  const typed = new File([new Uint8Array([1, 2, 3])], 'backyard.jpg', { type: 'image/jpeg' });
  assert.equal(normalizeImageFile(typed), typed);

  const pdf = new File([new Uint8Array([1, 2, 3])], 'lease.pdf', { type: '' });
  assert.ok(isPdf(pdf));
  assert.throws(() => normalizeImageFile(pdf), /Please choose a photo/);
  assert.throws(() => normalizeImageFile(new File([new Uint8Array([1])], 'notes', { type: '' })), /Please choose a photo/);
});

test('service worker cache name bumped past v20', () => {
  const sw = readFileSync(join(root, 'app/sw.js'), 'utf8');
  assert.match(sw, /rentmanor-shell-v21/);
  assert.doesNotMatch(sw, /rentmanor-shell-v20/);
});
