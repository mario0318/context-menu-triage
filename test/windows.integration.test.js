'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { enumerate } = require('../triage');

test('live broad scan returns provenance and trusted Microsoft handlers', { skip: process.platform !== 'win32', timeout: 120000 }, () => {
  const rows = enumerate('broad');
  assert.ok(rows.length > 0);
  assert.ok(rows.every(row => Array.isArray(row.registrations) && row.registrations.length > 0));
  assert.ok(rows.some(row => /shell32\.dll$/i.test(row.dll || '') && row.isSystem));
  assert.ok(rows.some(row => /shellext\.dll$/i.test(row.dll || '') && row.isMs));
});
