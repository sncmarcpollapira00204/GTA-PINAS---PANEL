'use strict';

process.env.DATABASE_URL ||= 'postgres://test:test@127.0.0.1:5432/test';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  detectMimeType,
  getSlotConfig,
} = require('../services/mediaSettings.service');
const {
  normalizeRoleName,
  isMediaManager,
} = require('../middleware/mediaManager.middleware');
const { parseByteRange } = require('../controllers/media.controller');

test('detects supported image, video, and audio signatures', () => {
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const webm = Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x01]);
  const mp3 = Buffer.from('ID3demo', 'ascii');

  assert.equal(detectMimeType(png, 'dashboard_banner', 'image/png'), 'image/png');
  assert.equal(detectMimeType(webm, 'login_banner', 'video/webm'), 'video/webm');
  assert.equal(detectMimeType(webm, 'login_music', 'audio/webm'), 'audio/webm');
  assert.equal(detectMimeType(mp3, 'login_music', 'audio/mpeg'), 'audio/mpeg');
});

test('rejects unknown binary signatures and exposes bounded slot limits', () => {
  assert.equal(detectMimeType(Buffer.from('not-media'), 'dashboard_banner'), null);
  assert.ok(getSlotConfig('dashboard_banner').maxBytes > 0);
  assert.equal(getSlotConfig('unknown'), null);
});

test('allows Owner, Executives, and the configured Panel Owner only', () => {
  assert.equal(normalizeRoleName(' Executives Council '), 'executives council');
  assert.equal(isMediaManager({ auth: { user: { id: '100000000000000', roleName: 'Executives Council' } } }), true);
  assert.equal(isMediaManager({ auth: { user: { id: '100000000000000', roleName: 'Owner' } } }), true);
  assert.equal(isMediaManager({ auth: { user: { id: '100000000000000', roleName: 'Sophomore Council' } } }), false);
  assert.equal(isMediaManager({ auth: { user: { id: '735045975378362401', roleName: 'Sophomore Council' } } }), true);
});

test('parses normal, open-ended, and suffix byte ranges', () => {
  assert.deepEqual(parseByteRange('bytes=0-99', 1000), { start: 0, end: 99 });
  assert.deepEqual(parseByteRange('bytes=900-', 1000), { start: 900, end: 999 });
  assert.deepEqual(parseByteRange('bytes=-100', 1000), { start: 900, end: 999 });
  assert.equal(parseByteRange('bytes=1000-1200', 1000), null);
  assert.equal(parseByteRange('items=0-10', 1000), null);
});
