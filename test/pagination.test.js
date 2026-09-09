'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  positiveInteger,
  parsePagePagination,
  paginationMeta,
  normalizeSearch,
} = require('../utils/pagination');

test('positiveInteger applies defaults and limits', () => {
  assert.equal(positiveInteger('25', 10, 1, 100), 25);
  assert.equal(positiveInteger('999', 10, 1, 100), 100);
  assert.equal(positiveInteger('-3', 10, 1, 100), 1);
  assert.equal(positiveInteger('invalid', 10, 1, 100), 10);
});

test('parsePagePagination calculates a bounded offset', () => {
  assert.deepEqual(
    parsePagePagination({ page: '3', limit: '25' }, { defaultLimit: 50, maxLimit: 100 }),
    { page: 3, limit: 25, offset: 50 }
  );

  assert.deepEqual(
    parsePagePagination({ page: '0', limit: '999' }, { defaultLimit: 50, maxLimit: 200 }),
    { page: 1, limit: 200, offset: 0 }
  );
});

test('paginationMeta reports navigation state', () => {
  assert.deepEqual(paginationMeta({ page: 2, limit: 50, total: 120 }), {
    page: 2,
    limit: 50,
    total: 120,
    totalPages: 3,
    hasPreviousPage: true,
    hasNextPage: true,
  });
});

test('normalizeSearch trims whitespace and length', () => {
  assert.equal(normalizeSearch('  ticket   owner  ', 20), 'ticket owner');
  assert.equal(normalizeSearch('x'.repeat(50), 10), 'x'.repeat(10));
});
