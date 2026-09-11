'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const controllerPath = path.join(__dirname, '..', 'controllers', 'tickets.simple.controller.js');
const source = fs.readFileSync(controllerPath, 'utf8');

test('simple ticket feed must include all open tickets regardless of import_source', () => {
  assert.match(
    source,
    /t\.status\s*=\s*'open'\s*\n\s*OR\s*\(t\.status\s*=\s*'closed'/,
    'the live open-ticket branch should not be gated by import_source'
  );
  assert.doesNotMatch(
    source,
    /t\.status\s*=\s*'open'\s+AND\s+COALESCE\(t\.import_source,
    'open tickets must not be excluded because their import_source differs'
  );
});
