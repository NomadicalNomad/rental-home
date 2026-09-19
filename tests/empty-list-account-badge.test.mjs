import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { shouldInjectDemoProperties } from '../app/account-scope.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const appJs = readFileSync(join(root, 'app/app.js'), 'utf8');
const appHtml = readFileSync(join(root, 'app/index.html'), 'utf8');
const appCss = readFileSync(join(root, 'app/styles.css'), 'utf8');
const netlifyToml = readFileSync(join(root, 'netlify.toml'), 'utf8');

test('search + Occupied/Vacant hide when property count is 0', () => {
  assert.match(appHtml, /id="searchBox"/);
  assert.match(appHtml, /id="filterRow"/);
  assert.match(appHtml, /class="search-box"[^>]*hidden/);
  assert.match(appHtml, /class="filter-row"[^>]*hidden/);
  assert.match(appJs, /function updateListTools/);
  assert.match(appJs, /const show = properties\.length > 0/);
  assert.match(appJs, /searchBox\.hidden = !show/);
  assert.match(appJs, /filterRow\.hidden = !show/);
  assert.match(appJs, /updateListTools\(\)/);
});

test('Account sheet clears the Netlify HUD badge', () => {
  assert.match(appHtml, /nl-hud:public:v1/);
  assert.match(appHtml, /nl-hud:owner-private:v1/);
  assert.match(appJs, /function neutralizeNetlifyBadge/);
  assert.match(appJs, /#nl-hud-frame, #nl-badge-frame, #netlify-badge/);
  assert.match(appCss, /#nl-badge-frame/);
  assert.match(appCss, /iframe\[src\*=["']netlify["']\]/);
  assert.match(appCss, /pointer-events:\s*none/);
  assert.match(appCss, /64px/);
  assert.match(appCss, /\.modal \{[^}]*padding:[^}]*64px/s);
  assert.doesNotMatch(netlifyToml, /\[\[headers\]\][\s\S]*nl-hud/);
  assert.match(netlifyToml, /Powered by Netlify badge/);
});

test('tagline stays; auto-seed stays off; photos/expenses not added', () => {
  assert.match(appHtml, /Your properties\. Your people\./);
  assert.equal(shouldInjectDemoProperties({ properties: [] }), false);
  assert.doesNotMatch(appJs, /function seedProperties/);
  assert.doesNotMatch(appJs, /maybeSeedSampleData/);
  assert.doesNotMatch(appHtml, /id="expenseView"/);
  assert.doesNotMatch(appJs, /thumbnail_path/);
});
