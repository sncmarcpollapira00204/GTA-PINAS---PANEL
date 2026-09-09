'use strict';

const { Pool } = require('pg');
const ticketPool = require('../db');
const staffConfig = require('../ticket-staff.js');
const {
  numberValue,
  normalizeWhitelistType,
  dedupeConfiguredStaff,
  emptyMetrics,
  chooseConfiguredId,
  buildStaffRows,
  buildReportTotals,
} = require('./staffPerformance.metrics');

const CACHE_MS = Math.max(
  5_000,
  Number(process.env.STAFF_PERFORMANCE_CACHE_MS || 60_000)
);

let whitelistPool = null;
let cache = null;
let cacheExpiresAt = 0;
let reportPromise = null;

function getWhitelistPool() {
  const connectionString = String(
    process.env.WHITELIST_DATABASE_URL ||
    process.env.GATEKEEPER_DATABASE_URL ||
    ''
  ).trim();

  if (!connectionString) return null;

  if (!whitelistPool) {
    const isLocal = connectionString.includes('localhost') || connectionString.includes('127.0.0.1');
    whitelistPool = new Pool({
      connectionString,
      ssl: isLocal ? false : { rejectUnauthorized: false },
      keepAlive: true,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 15_000,
      max: Math.max(2, Number(process.env.STAFF_PERFORMANCE_POOL_MAX || 3)),
      application_name: '5th-avenue-staff-performance',
    });

    whitelistPool.on('error', (error) => {
      console.error('[STAFF PERFORMANCE DB]', error.message);
    });
  }

  return whitelistPool;
}

function metricsMap(staffIds) {
  return new Map(staffIds.map((id) => [id, emptyMetrics()]));
}

async function loadTicketMetrics(staffIds) {
  const metrics = metricsMap(staffIds);

  const result = await ticketPool.query(
    `
      WITH final_handlers AS (
        SELECT
          id,
          COALESCE(
            NULLIF(TRIM(assigned_to), ''),
            NULLIF(TRIM(claimed_by), ''),
            NULLIF(TRIM(closed_by), '')
          ) AS handler_id
        FROM tickets
        WHERE status = 'closed'
      ),
      handler_counts AS (
        SELECT handler_id, COUNT(*)::INTEGER AS tickets_handled
        FROM final_handlers
        WHERE handler_id = ANY($1::text[])
        GROUP BY handler_id
      )
      SELECT
        COALESCE(
          (SELECT JSONB_OBJECT_AGG(handler_id, tickets_handled) FROM handler_counts),
          '{}'::jsonb
        ) AS handler_counts,
        (SELECT COUNT(*)::INTEGER FROM final_handlers) AS total_closed,
        (
          SELECT COUNT(*)::INTEGER
          FROM final_handlers
          WHERE handler_id IS NULL OR NOT (handler_id = ANY($1::text[]))
        ) AS unattributed_closed
    `,
    [staffIds]
  );

  const row = result.rows[0] || {};
  const handlerCounts = row.handler_counts && typeof row.handler_counts === 'object'
    ? row.handler_counts
    : {};

  for (const [id, count] of Object.entries(handlerCounts)) {
    const item = metrics.get(String(id));
    if (item) item.ticketsHandled = numberValue(count);
  }

  return {
    metrics,
    totalClosed: numberValue(row.total_closed),
    unattributedClosed: numberValue(row.unattributed_closed),
  };
}

async function loadWhitelistMetrics(staffIds) {
  const metrics = metricsMap(staffIds);
  const database = getWhitelistPool();

  if (!database) {
    return {
      metrics,
      available: false,
      totalApproved: 0,
      attributedApproved: 0,
      unattributedApproved: 0,
    };
  }

  const staffSet = new Set(staffIds);
  const whitelistRows = await database.query(`
    SELECT whitelist_type, whitelisted_by, interviewer
    FROM whitelist
    WHERE LOWER(
      COALESCE(
        NULLIF(TRIM(application_status), ''),
        CASE
          WHEN LOWER(COALESCE(NULLIF(TRIM(whitelisted_by), ''), 'none'))
            NOT IN ('none', 'null', 'n/a', 'unknown')
          THEN 'whitelisted'
          ELSE 'pending'
        END
      )
    ) = 'whitelisted'
  `);

  let attributedApproved = 0;

  for (const row of whitelistRows.rows) {
    const type = normalizeWhitelistType(row.whitelist_type);
    const candidates = type === 'nonvoucher'
      ? [row.interviewer, row.whitelisted_by]
      : [row.whitelisted_by, row.interviewer];
    const creditedId = chooseConfiguredId(candidates, staffSet);

    if (!creditedId) continue;

    const item = metrics.get(creditedId);
    item.whitelistApproved += 1;
    if (type === 'nonvoucher') item.nonVoucherApproved += 1;
    else item.voucherApproved += 1;
    attributedApproved += 1;
  }

  const logRows = await database.query(
    `
      SELECT admin_id, COUNT(*)::INTEGER AS admin_actions
      FROM admin_logs
      WHERE admin_id = ANY($1::text[])
      GROUP BY admin_id
    `,
    [staffIds]
  ).catch((error) => {
    console.warn('[STAFF PERFORMANCE LOGS]', error.message);
    return { rows: [] };
  });

  for (const row of logRows.rows) {
    const item = metrics.get(String(row.admin_id || ''));
    if (item) item.adminActions = numberValue(row.admin_actions);
  }

  const totalApproved = whitelistRows.rows.length;
  return {
    metrics,
    available: true,
    totalApproved,
    attributedApproved,
    unattributedApproved: Math.max(0, totalApproved - attributedApproved),
  };
}

async function buildReport() {
  const configured = dedupeConfiguredStaff(staffConfig.ticketAssignOptions);
  const staffIds = configured.map((entry) => entry.userId);

  if (!staffIds.length) {
    return {
      generatedAt: new Date().toISOString(),
      model: 'unique-records-v2',
      totals: buildReportTotals([]),
      accuracy: {
        ticketRule: 'Only closed tickets are counted, with one final handler per ticket.',
        whitelistRule: 'Each approved whitelist row is credited to at most one registered staff member.',
        totalActivityRule: 'Whitelist Approved + Tickets Handled.',
      },
      staff: [],
    };
  }

  const [ticketResult, whitelistResult] = await Promise.all([
    loadTicketMetrics(staffIds),
    loadWhitelistMetrics(staffIds),
  ]);

  const staff = buildStaffRows(
    configured,
    ticketResult.metrics,
    whitelistResult.metrics
  );
  const totals = buildReportTotals(staff, {
    whitelistDatabaseRecords: whitelistResult.totalApproved,
    whitelistUnattributed: whitelistResult.unattributedApproved,
    closedTicketsDatabase: ticketResult.totalClosed,
    closedTicketsUnattributed: ticketResult.unattributedClosed,
  });

  return {
    generatedAt: new Date().toISOString(),
    model: 'unique-records-v2',
    totals,
    accuracy: {
      whitelistDatabaseAvailable: whitelistResult.available,
      ticketRule: 'Only closed tickets are counted. One ticket is credited to assigned_to, then claimed_by, then closed_by.',
      whitelistRule: 'Each approved whitelist row is counted once and credited to one configured approver or interviewer.',
      totalActivityRule: 'Whitelist Approved + Tickets Handled.',
      databaseApprovedWhitelistRecords: whitelistResult.totalApproved,
      unattributedWhitelistRecords: whitelistResult.unattributedApproved,
      databaseClosedTickets: ticketResult.totalClosed,
      unattributedClosedTickets: ticketResult.unattributedClosed,
    },
    staff,
  };
}

async function loadStaffPerformance({ force = false } = {}) {
  if (!force && cache && Date.now() < cacheExpiresAt) return cache;
  if (reportPromise) return reportPromise;

  reportPromise = buildReport()
    .then((report) => {
      cache = report;
      cacheExpiresAt = Date.now() + CACHE_MS;
      return report;
    })
    .finally(() => {
      reportPromise = null;
    });

  return reportPromise;
}

function clearStaffPerformanceCache() {
  cache = null;
  cacheExpiresAt = 0;
}

module.exports = {
  loadStaffPerformance,
  clearStaffPerformanceCache,
};
