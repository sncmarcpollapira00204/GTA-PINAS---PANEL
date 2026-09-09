'use strict';

process.env.MAIN_BOT_CONTROL_URL = 'https://main-bot.example.test';
process.env.MAIN_BOT_CONTROL_SECRET = 'test-secret';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  getConfiguration,
  isRetryableNetworkError,
  requestJson,
  requestRaw,
} = require('../services/mainBotControl.service');

test('control configuration rejects embedded URL credentials', () => {
  const original = process.env.MAIN_BOT_CONTROL_URL;
  process.env.MAIN_BOT_CONTROL_URL = 'https://user:pass@main-bot.example.test';
  try {
    assert.throws(
      () => getConfiguration(),
      (error) => error.code === 'MAIN_BOT_CONTROL_NOT_CONFIGURED'
    );
  } finally {
    process.env.MAIN_BOT_CONTROL_URL = original;
  }
});

test('network error classification only retries transient failures', () => {
  assert.equal(isRetryableNetworkError({ code: 'ECONNRESET' }), true);
  assert.equal(isRetryableNetworkError(new Error('request timeout')), true);
  assert.equal(isRetryableNetworkError({ code: 'ERR_INVALID_URL' }), false);
});

test('GET control requests retry transient HTTP failures', async () => {
  const originalFetch = global.fetch;
  let calls = 0;
  global.fetch = async () => {
    calls += 1;
    if (calls === 1) {
      return new Response(JSON.stringify({ error: 'temporary' }), {
        status: 503,
        headers: { 'content-type': 'application/json' },
      });
    }
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };

  try {
    const payload = await requestJson('/internal/status', {
      userId: '735045975378362401',
      timeoutMs: 1000,
      retries: 1,
    });
    assert.deepEqual(payload, { ok: true });
    assert.equal(calls, 2);
  } finally {
    global.fetch = originalFetch;
  }
});

test('POST control requests are never automatically retried', async () => {
  const originalFetch = global.fetch;
  let calls = 0;
  global.fetch = async () => {
    calls += 1;
    return new Response(JSON.stringify({ error: 'busy' }), {
      status: 503,
      headers: { 'content-type': 'application/json' },
    });
  };

  try {
    const response = await requestRaw('/internal/backups', {
      method: 'POST',
      userId: '735045975378362401',
      retries: 3,
      timeoutMs: 1000,
    });
    assert.equal(response.status, 503);
    assert.equal(calls, 1);
  } finally {
    global.fetch = originalFetch;
  }
});
