'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const vm = require('node:vm');
const renderGui = require('../lib/gui');

test('rendered GUI contains parseable client JavaScript and launch token', () => {
  const token = 'fixture-token';
  const html = renderGui(token);
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(match => match[1]);

  assert.equal(scripts.length, 1);
  assert.match(html, /Context Menu Triage/);
  assert.match(html, /prefers-color-scheme:dark/);
  assert.match(html, /localStorage\.setItem\('triage-theme'/);
  assert.match(scripts[0], /fixture-token/);
  assert.doesNotThrow(() => new vm.Script(scripts[0]));
});
