'use strict';

function integerInRange(value, fallback, minimum, maximum) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(maximum, Math.max(minimum, Math.floor(parsed)));
}

class BoundedTtlCache {
  constructor(options = {}) {
    this.maxEntries = integerInRange(options.maxEntries, 200, 1, 5000);
    this.ttlMs = integerInRange(options.ttlMs, 3000, 100, 60000);
    this.now = typeof options.now === 'function' ? options.now : Date.now;
    this.entries = new Map();
  }

  get size() {
    return this.entries.size;
  }

  get(key) {
    const normalizedKey = String(key);
    const entry = this.entries.get(normalizedKey);
    if (!entry) return undefined;

    if (entry.expiresAt <= this.now()) {
      this.entries.delete(normalizedKey);
      return undefined;
    }

    // Refresh insertion order so frequently-read tickets remain cached.
    this.entries.delete(normalizedKey);
    this.entries.set(normalizedKey, entry);
    return entry.value;
  }

  set(key, value, ttlMs = this.ttlMs) {
    const normalizedKey = String(key);
    const safeTtl = integerInRange(ttlMs, this.ttlMs, 100, 60000);

    this.entries.delete(normalizedKey);
    while (this.entries.size >= this.maxEntries) {
      const oldestKey = this.entries.keys().next().value;
      if (oldestKey === undefined) break;
      this.entries.delete(oldestKey);
    }

    this.entries.set(normalizedKey, {
      value,
      expiresAt: this.now() + safeTtl,
    });
    return value;
  }

  delete(key) {
    return this.entries.delete(String(key));
  }

  clear() {
    this.entries.clear();
  }
}

module.exports = {
  BoundedTtlCache,
  integerInRange,
};
