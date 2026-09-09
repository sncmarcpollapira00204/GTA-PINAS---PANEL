'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const MAIN_GUILD_ID = '1501518422431895592';
const SCHOOL_CATEGORY_IDS = [
  '1539116290600472616',
  '1539593016455467069',
];
const REMOVED_HANDLER_IDS = [
  '742409114533232809',
  '717684731386265680',
];

function walk(directory) {
  const output = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.name === '.git' || entry.name === 'node_modules' || entry.name === 'currentGuildOnly.test.js') continue;
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) output.push(...walk(fullPath));
    else if (entry.isFile() && /\.(?:js|json)$/i.test(entry.name) && entry.name !== 'package-lock.json') output.push(fullPath);
  }
  return output;
}

test('Web Panel recovery is scoped to the current 5th Avenue guild and includes school tickets', () => {
  const config = require('../config.json');
  assert.equal(config.guildId, MAIN_GUILD_ID);
  for (const categoryId of SCHOOL_CATEGORY_IDS) {
    assert.ok(config.openTicketCategoryIds.includes(categoryId));
  }
});

test('removed Staff Discord variables do not return to runtime source', () => {
  const source = walk(ROOT)
    .map((file) => fs.readFileSync(file, 'utf8'))
    .join('\n');
  const forbidden = [
    ['STAFF', 'GUILD', 'ID'].join('_'),
    ['STAFF', 'TICKET', 'LOGS'].join('_'),
    ['STAFF', 'VOIDED', 'LOGS'].join('_'),
  ];
  for (const token of forbidden) assert.doesNotMatch(source, new RegExp(token));
});

test('Web Panel handler roster no longer contains removed handlers', () => {
  const handlers = require('../ticket-staff.js').ticketAssignOptions;
  const ids = new Set(handlers.map((handler) => String(handler.userId)));
  for (const removedId of REMOVED_HANDLER_IDS) assert.equal(ids.has(removedId), false);
});
