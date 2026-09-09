'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizeDiscordId,
  buildDiscordChannelUrl,
} = require('../utils/discordChannelUrl');

test('normalizes valid Discord snowflakes', () => {
  assert.equal(normalizeDiscordId('1501518422431895592'), '1501518422431895592');
  assert.equal(normalizeDiscordId(' 1502224121684037742 '), '1502224121684037742');
});

test('rejects unsafe or malformed Discord IDs', () => {
  assert.equal(normalizeDiscordId(''), '');
  assert.equal(normalizeDiscordId('123'), '');
  assert.equal(normalizeDiscordId('1501518422431895592/../../evil'), '');
});

test('builds only validated Discord channel URLs', () => {
  assert.equal(
    buildDiscordChannelUrl('1501518422431895592', '1502224121684037742'),
    'https://discord.com/channels/1501518422431895592/1502224121684037742'
  );
  assert.equal(buildDiscordChannelUrl('invalid', '1502224121684037742'), '');
});
