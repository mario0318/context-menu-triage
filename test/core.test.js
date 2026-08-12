'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  blockPlan,
  cook,
  diffHandlers,
  filterRows,
  handlersToCsv,
  handlersToSarif,
  snapshotDocument,
  snapshotHandlers,
  sortRows,
} = require('../lib/core');

function row(overrides = {}) {
  return {
    clsid: '{11111111-1111-1111-1111-111111111111}',
    label: 'Example',
    name: 'Example handler',
    dll: 'C:\\Program Files\\Example\\handler.dll',
    exists: true,
    clsidRegistered: true,
    inprocRegistered: true,
    sigStatus: 'Valid',
    signer: 'CN=Example Corp, O=Example Corp',
    underWindows: false,
    blocked: false,
    registrations: [{ hive: 'HKLM', view: '64', parent: '*', key: 'HKLM\\Software\\Classes\\*\\shellex\\ContextMenuHandlers\\Example' }],
    ...overrides,
  };
}

test('classifies a trusted non-Microsoft signer as third party', () => {
  const actual = cook(row());
  assert.equal(actual.pub, 'Example Corp');
  assert.equal(actual.trusted, true);
  assert.equal(actual.microsoftTrusted, false);
  assert.equal(actual.thirdParty, true);
  assert.equal(actual.reason, 'signed, trusted chain');
});

test('does not treat a self-signed or invalid chain as trusted', () => {
  const actual = cook(row({ sigStatus: 'UnknownError', signer: 'CN=Self Signed' }));
  assert.equal(actual.trusted, false);
  assert.equal(actual.pub, 'Self Signed');
  assert.equal(actual.reason, 'signature: UnknownError');
});

test('keeps Windows-path classification path first', () => {
  const actual = cook(row({ dll: 'C:\\Windows\\System32\\shell32.dll', underWindows: true, signer: null }));
  assert.equal(actual.pub, 'Windows');
  assert.equal(actual.isSystem, true);
  assert.equal(actual.thirdParty, false);
});

test('distinguishes stale COM registration states', () => {
  assert.equal(cook(row({ clsidRegistered: false, inprocRegistered: false, dll: null, exists: false })).comState, 'missing-clsid');
  assert.equal(cook(row({ inprocRegistered: false, dll: null, exists: false })).comState, 'missing-inproc');
  assert.equal(cook(row({ dll: 'C:\\Temp\\gone.dll', exists: false })).comState, 'missing-dll');
});

test('sorts writable missing paths before ordinary stale entries', () => {
  const rows = [
    cook(row()),
    cook(row({ clsid: '{22222222-2222-2222-2222-222222222222}', dll: null, exists: false, inprocRegistered: false })),
    cook(row({ clsid: '{33333333-3333-3333-3333-333333333333}', dll: 'C:\\Temp\\gone.dll', exists: false, writableMissingPath: true })),
  ].sort(sortRows);
  assert.equal(rows[0].writableMissingPath, true);
  assert.equal(rows[1].comState, 'missing-inproc');
});

test('reads legacy arrays and schema-versioned snapshots', () => {
  const handlers = [cook(row())];
  assert.equal(snapshotHandlers(handlers), handlers);
  const document = snapshotDocument(handlers, { hostname: 'fixture' }, '2026-01-01T00:00:00.000Z');
  assert.equal(snapshotHandlers(document), handlers);
  assert.equal(document.schemaVersion, 2);
});

test('plans only CLSIDs present in the snapshot', () => {
  const snapshot = snapshotDocument([
    row({ blocked: true }),
    row({ clsid: '{22222222-2222-2222-2222-222222222222}', blocked: false }),
  ], {});
  const plan = blockPlan(snapshot, new Set([
    '{22222222-2222-2222-2222-222222222222}',
    '{99999999-9999-9999-9999-999999999999}',
  ]));
  assert.deepEqual(plan.toBlock.map(x => x.clsid), ['{11111111-1111-1111-1111-111111111111}']);
  assert.deepEqual(plan.toUnblock.map(x => x.clsid), ['{22222222-2222-2222-2222-222222222222}']);
});

test('produces stable diff, CSV, SARIF, and filters', () => {
  const before = snapshotDocument([cook(row())], {});
  const changed = cook(row({ blocked: true }));
  const after = snapshotDocument([changed, cook(row({ clsid: '{22222222-2222-2222-2222-222222222222}' }))], {});
  const diff = diffHandlers(before, after);
  assert.equal(diff.added.length, 1);
  assert.equal(diff.changed.length, 1);
  assert.match(handlersToCsv([changed]), /publisher,signature/);
  assert.equal(handlersToSarif([cook(row({ sigStatus: 'NotSigned', signer: null }))]).runs[0].results.length, 1);
  assert.equal(filterRows([cook(row())], { showMicrosoft: true, hive: 'HKLM', query: 'example' }).length, 1);
});
