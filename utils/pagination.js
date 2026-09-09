'use strict';

function positiveInteger(value, fallback, minimum = 1, maximum = Number.MAX_SAFE_INTEGER) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(maximum, Math.max(minimum, Math.floor(parsed)));
}

function parsePagePagination(query = {}, options = {}) {
  const defaultLimit = positiveInteger(options.defaultLimit, 50, 1, 1000);
  const maxLimit = positiveInteger(options.maxLimit, 200, defaultLimit, 5000);
  const page = positiveInteger(query.page, 1, 1, 1_000_000);
  const limit = positiveInteger(query.limit, defaultLimit, 1, maxLimit);
  const offset = (page - 1) * limit;

  return { page, limit, offset };
}

function paginationMeta({ page, limit, total }) {
  const safeTotal = Math.max(0, Number(total) || 0);
  const totalPages = safeTotal ? Math.ceil(safeTotal / limit) : 0;

  return {
    page,
    limit,
    total: safeTotal,
    totalPages,
    hasPreviousPage: page > 1,
    hasNextPage: page < totalPages,
  };
}

function normalizeSearch(value, maximumLength = 120) {
  return String(value || '').trim().replace(/\s+/g, ' ').slice(0, maximumLength);
}

module.exports = {
  positiveInteger,
  parsePagePagination,
  paginationMeta,
  normalizeSearch,
};
