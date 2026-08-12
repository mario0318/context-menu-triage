'use strict';

const path = require('path');

const GUID_RE = /^\{[0-9A-Fa-f-]{36}\}$/;
const SNAPSHOT_SCHEMA_VERSION = 2;

function clsidOrThrow(clsid) {
  if (!GUID_RE.test(clsid || '')) throw new Error(`invalid CLSID: ${clsid}`);
  return clsid.toUpperCase();
}

function classifyComState(row) {
  if (!row.clsidRegistered) return 'missing-clsid';
  if (!row.inprocRegistered || !row.dll) return 'missing-inproc';
  if (!row.exists) return 'missing-dll';
  return 'present';
}

function cook(row) {
  const signer = row.signer || '';
  const cn = (signer.match(/CN=([^,]+)/) || [])[1];
  const microsoftSigner = /Microsoft (Corporation|Windows)/i.test(signer);
  const validSignature = row.sigStatus === 'Valid';
  const underWindows = row.underWindows === true;
  const isSystem = underWindows && !(validSignature && signer && !microsoftSigner);
  const isMs = isSystem || (validSignature && microsoftSigner);
  const comState = row.comState || classifyComState(row);
  const orphan = comState !== 'present';
  let pub;
  let reason;

  if (isSystem) {
    pub = 'Windows';
    reason = 'system path';
  } else if (isMs) {
    pub = 'Microsoft';
    reason = 'ms-signed';
  } else if (comState === 'missing-clsid') {
    pub = 'ORPHAN';
    reason = 'CLSID missing';
  } else if (comState === 'missing-inproc') {
    pub = 'ORPHAN';
    reason = 'InprocServer32 missing';
  } else if (comState === 'missing-dll') {
    pub = 'ORPHAN';
    reason = row.writableMissingPath ? 'DLL missing, parent writable' : 'DLL missing';
  } else if (validSignature && cn) {
    pub = cn.trim();
    reason = 'signed, trusted chain';
  } else if (cn) {
    pub = cn.trim();
    reason = `signature: ${row.sigStatus}`;
  } else {
    pub = 'UNSIGNED';
    reason = 'no trusted signature';
  }

  return {
    ...row,
    comState,
    isMs,
    isSystem,
    trusted: validSignature,
    microsoftTrusted: isMs,
    pub,
    reason,
    thirdParty: !isMs,
    orphan,
  };
}

function sortRows(a, b) {
  const rank = row => {
    if (row.writableMissingPath) return 0;
    if (row.orphan) return 1;
    if (row.thirdParty && row.sigStatus !== 'Valid') return 2;
    if (row.thirdParty) return 3;
    return 4;
  };
  return rank(a) - rank(b)
    || String(a.pub || '').localeCompare(String(b.pub || ''))
    || a.clsid.localeCompare(b.clsid);
}

function snapshotDocument(handlers, machine, createdAt = new Date().toISOString()) {
  return {
    schemaVersion: SNAPSHOT_SCHEMA_VERSION,
    createdAt,
    machine,
    handlers,
  };
}

function snapshotHandlers(document) {
  if (Array.isArray(document)) return document;
  if (!document || typeof document !== 'object' || !Array.isArray(document.handlers)) {
    throw new Error('snapshot must be an array or a schema-versioned object with a handlers array');
  }
  if (document.schemaVersion > SNAPSHOT_SCHEMA_VERSION) {
    throw new Error(`snapshot schema ${document.schemaVersion} is newer than supported schema ${SNAPSHOT_SCHEMA_VERSION}`);
  }
  return document.handlers;
}

function blockPlan(snapshot, currentBlocked) {
  const desired = new Map();
  for (const row of snapshotHandlers(snapshot)) {
    if (!row || !row.clsid) continue;
    const clsid = clsidOrThrow(row.clsid);
    desired.set(clsid, {
      blocked: row.blocked === true,
      name: row.name || row.label || clsid,
    });
  }
  const blocked = currentBlocked instanceof Set ? currentBlocked : new Set(currentBlocked || []);
  const toBlock = [];
  const toUnblock = [];
  for (const [clsid, row] of desired) {
    if (row.blocked && !blocked.has(clsid)) toBlock.push({ clsid, name: row.name });
    if (!row.blocked && blocked.has(clsid)) toUnblock.push({ clsid, name: row.name });
  }
  return { toBlock, toUnblock, total: desired.size };
}

function stableHandler(row) {
  return {
    clsid: row.clsid,
    blocked: !!row.blocked,
    comState: row.comState,
    dll: row.dll || null,
    sigStatus: row.sigStatus,
    signer: row.signer || null,
    registrations: (row.registrations || []).map(registration => ({
      hive: registration.hive,
      view: registration.view,
      parent: registration.parent,
      key: registration.key,
    })).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
  };
}

function diffHandlers(leftDocument, rightDocument) {
  const left = new Map(snapshotHandlers(leftDocument).map(row => [clsidOrThrow(row.clsid), stableHandler(row)]));
  const right = new Map(snapshotHandlers(rightDocument).map(row => [clsidOrThrow(row.clsid), stableHandler(row)]));
  const added = [];
  const removed = [];
  const changed = [];
  for (const [clsid, row] of right) {
    if (!left.has(clsid)) added.push(row);
    else if (JSON.stringify(left.get(clsid)) !== JSON.stringify(row)) changed.push({ clsid, before: left.get(clsid), after: row });
  }
  for (const [clsid, row] of left) if (!right.has(clsid)) removed.push(row);
  return { added, removed, changed };
}

function csvEscape(value) {
  const text = value == null ? '' : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function handlersToCsv(rows) {
  const columns = ['clsid', 'publisher', 'signature', 'blocked', 'com_state', 'dll', 'hives', 'views', 'parents', 'reason'];
  const lines = [columns.join(',')];
  for (const row of rows) {
    const registrations = row.registrations || [];
    lines.push([
      row.clsid,
      row.pub,
      row.sigStatus,
      row.blocked,
      row.comState,
      row.dll || '',
      [...new Set(registrations.map(x => x.hive))].join(';'),
      [...new Set(registrations.map(x => x.view))].join(';'),
      [...new Set(registrations.map(x => x.parent))].join(';'),
      row.reason,
    ].map(csvEscape).join(','));
  }
  return lines.join('\r\n') + '\r\n';
}

function handlersToSarif(rows, metadata = {}) {
  const findings = rows.filter(row => row.orphan || (row.thirdParty && row.sigStatus !== 'Valid'));
  return {
    version: '2.1.0',
    $schema: 'https://json.schemastore.org/sarif-2.1.0.json',
    runs: [{
      tool: {
        driver: {
          name: 'Context Menu Triage',
          informationUri: 'https://github.com/mario0318/context-menu-triage',
          version: metadata.version || 'dev',
          rules: [
            { id: 'CMT001', shortDescription: { text: 'Stale shell handler registration' } },
            { id: 'CMT002', shortDescription: { text: 'Shell handler lacks a trusted Authenticode signature' } },
          ],
        },
      },
      results: findings.map(row => ({
        ruleId: row.orphan ? 'CMT001' : 'CMT002',
        level: row.writableMissingPath ? 'warning' : 'note',
        message: { text: `${row.clsid}: ${row.reason}` },
        properties: stableHandler(row),
      })),
    }],
  };
}

function filterRows(rows, options = {}) {
  const query = String(options.query || '').toLowerCase();
  return rows.filter(row => {
    if (!options.showMicrosoft && row.isMs) return false;
    if (options.publisher && String(row.pub).toLowerCase() !== String(options.publisher).toLowerCase()) return false;
    if (options.signature && String(row.sigStatus).toLowerCase() !== String(options.signature).toLowerCase()) return false;
    if (options.hive && !(row.registrations || []).some(x => x.hive === options.hive)) return false;
    if (options.view && !(row.registrations || []).some(x => x.view === options.view)) return false;
    if (options.state && row.comState !== options.state) return false;
    if (options.blocked === true && !row.blocked) return false;
    if (options.blocked === false && row.blocked) return false;
    if (query) {
      const text = [row.clsid, row.name, row.label, row.pub, row.dll, row.signer, row.reason]
        .concat((row.registrations || []).flatMap(x => [x.hive, x.view, x.parent, x.key]))
        .filter(Boolean).join(' ').toLowerCase();
      if (!text.includes(query)) return false;
    }
    return true;
  });
}

function basename(file) {
  return file ? path.basename(file) : '';
}

module.exports = {
  GUID_RE,
  SNAPSHOT_SCHEMA_VERSION,
  basename,
  blockPlan,
  classifyComState,
  clsidOrThrow,
  cook,
  diffHandlers,
  filterRows,
  handlersToCsv,
  handlersToSarif,
  snapshotDocument,
  snapshotHandlers,
  sortRows,
  stableHandler,
};
