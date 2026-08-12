'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { enumerate } = require('../triage');

test('live broad scan returns provenance and a catalog-valid Windows handler', { skip: process.platform !== 'win32', timeout: 120000 }, () => {
  const rows = enumerate('broad');
  assert.ok(rows.length > 0);
  assert.ok(rows.every(row => Array.isArray(row.registrations) && row.registrations.length > 0));
  assert.ok(rows.some(row => /shell32\.dll$/i.test(row.dll || '') && row.isSystem && row.sigStatus === 'Valid'));
});
