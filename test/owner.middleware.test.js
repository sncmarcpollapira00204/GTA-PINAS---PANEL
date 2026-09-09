'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const owner = require('../middleware/owner.middleware');

function responseRecorder() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

test('default panel owner is recognized', () => {
  const req = { auth: { user: { id: owner.DEFAULT_PANEL_OWNER_USER_ID } } };
  assert.equal(owner.isPanelOwner(req), true);
});

test('unauthorized user receives owner-only response', () => {
  const req = {
    method: 'POST',
    originalUrl: '/api/import/category/report',
    auth: { user: { id: '111111111111111111' } },
  };
  const res = responseRecorder();
  let nextCalled = false;

  owner.requirePanelOwner(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 403);
  assert.equal(res.body.code, 'OWNER_ONLY');
});

test('hidden owner endpoint returns not found to unauthorized users', () => {
  const req = {
    method: 'GET',
    originalUrl: '/api/access-logs',
    auth: { user: { id: '111111111111111111' } },
  };
  const res = responseRecorder();

  owner.requirePanelOwnerHidden(req, res, () => {
    throw new Error('next must not be called');
  });

  assert.equal(res.statusCode, 404);
  assert.equal(res.body.code, 'NOT_FOUND');
});

test('comma-separated owner configuration is normalized', () => {
  const previous = process.env.PANEL_OWNER_USER_IDS;
  process.env.PANEL_OWNER_USER_IDS = '735045975378362401, 222222222222222222, invalid';

  try {
    assert.deepEqual(
      [...owner.configuredOwnerIds()],
      ['735045975378362401', '222222222222222222']
    );
  } finally {
    if (previous === undefined) delete process.env.PANEL_OWNER_USER_IDS;
    else process.env.PANEL_OWNER_USER_IDS = previous;
  }
});
