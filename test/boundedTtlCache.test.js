'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { BoundedTtlCache } = require('../utils/boundedTtlCache');

test('cache expires entries using the configured TTL', () => {
  let now = 1000;
  const cache = new BoundedTtlCache({ ttlMs: 500, now: () => now });

  cache.set('ticket-1', { id: 1 });
  assert.deepEqual(cache.get('ticket-1'), { id: 1 });

  now = 1501;
  assert.equal(cache.get('ticket-1'), undefined);
  assert.equal(cache.size, 0);
});

test('cache evicts the least recently used entry at its bound', () => {
  const cache = new BoundedTtlCache({ maxEntries: 2, ttlMs: 5000 });

  cache.set('ticket-1', 1);
  cache.set('ticket-2', 2);
  assert.equal(cache.get('ticket-1'), 1);
  cache.set('ticket-3', 3);

  assert.equal(cache.get('ticket-2'), undefined);
  assert.equal(cache.get('ticket-1'), 1);
  assert.equal(cache.get('ticket-3'), 3);
  assert.equal(cache.size, 2);
});

test('cache supports targeted and full invalidation', () => {
  const cache = new BoundedTtlCache({ maxEntries: 5, ttlMs: 5000 });
  cache.set('one', 1);
  cache.set('two', 2);

  assert.equal(cache.delete('one'), true);
  assert.equal(cache.get('one'), undefined);
  cache.clear();
  assert.equal(cache.size, 0);
});
