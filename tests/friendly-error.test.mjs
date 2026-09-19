import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DATABASE_UPDATE_NEEDED,
  GENERIC_ERROR,
  NETWORK_ERROR,
  PERMISSION_ERROR,
  friendlyError,
  isMissingColumnError
} from '../app/errors.js';

test('friendlyError never returns only the generic string when message/code/details exist', () => {
  const postgrest = {
    code: 'PGRST204',
    message: "Could not find the 'thumbnail_path' column of 'properties' in the schema cache",
    details: null,
    hint: null
  };
  assert.equal(friendlyError(postgrest), DATABASE_UPDATE_NEEDED);
  assert.notEqual(friendlyError(postgrest), GENERIC_ERROR);

  const permission = {
    code: '42501',
    message: 'new row violates row-level security policy for table "properties"'
  };
  assert.equal(friendlyError(permission), PERMISSION_ERROR);

  const network = new TypeError('Failed to fetch');
  assert.equal(friendlyError(network), NETWORK_ERROR);

  const leftover = { code: 'XX000', message: 'unique constraint "properties_pkey"', details: 'Key (id)=(1) already exists.' };
  const leftoverText = friendlyError(leftover);
  assert.match(leftoverText, /unique constraint/);
  assert.match(leftoverText, /already exists/);
  assert.match(leftoverText, /XX000/);
  assert.notEqual(leftoverText, GENERIC_ERROR);

  const thumbConstraint = {
    code: '23502',
    message: 'null value in column "thumbnail_path" violates not-null constraint'
  };
  const thumbText = friendlyError(thumbConstraint);
  assert.match(thumbText, /thumbnail_path/);
  assert.match(thumbText, /23502/);
  assert.notEqual(thumbText, GENERIC_ERROR);
  assert.notEqual(thumbText, DATABASE_UPDATE_NEEDED);

  const named = new Error('assertWritable is not defined');
  const namedText = friendlyError(named);
  assert.match(namedText, /assertWritable is not defined/);
  assert.notEqual(namedText, GENERIC_ERROR);
});

test('friendlyError still maps sign-in copy and does not treat “confirm” as email confirm', () => {
  assert.equal(friendlyError({ message: 'Invalid login credentials' }), 'That email or password doesn’t match.');
  assert.match(friendlyError({ message: 'Please confirm the tenant is vacant' }), /confirm the tenant is vacant/);
});

test('isMissingColumnError detects PostgREST schema-cache misses', () => {
  assert.equal(isMissingColumnError({
    code: 'PGRST204',
    message: "Could not find the 'thumbnail_path' column of 'properties' in the schema cache"
  }, 'thumbnail_path'), true);
  assert.equal(isMissingColumnError({
    code: 'PGRST204',
    message: "Could not find the 'notes' column of 'properties' in the schema cache"
  }, 'thumbnail_path'), false);
});

test('generic fallback is only used when nothing actionable is present', () => {
  assert.equal(friendlyError({}), GENERIC_ERROR);
  assert.equal(friendlyError(null), GENERIC_ERROR);
});
