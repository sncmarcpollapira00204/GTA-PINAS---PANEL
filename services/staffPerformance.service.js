'use strict';

const ticketPool = require('../db');
const staffConfig = require('../ticket-staff.js');
const {
  numberValue,
  emptyMetrics,
  dedupeConfiguredStaff,
  buildStaffRows,
  buildReportTotals,
} = require('./staffPerformance.metrics');

const CACHE_MS = Math.max(
  5_000,
  Number(process.env.STAFF_PERFORMANCE_CACHE_MS || 60_000)
);

let cache = null;
let cacheExpiresAt = 0;
let reportPromise = null;

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

async function buildReport() {
  const configured = dedupeConfiguredStaff(staffConfig.ticketAssignOptions);
  const staffIds = configured.map((entry) => entry.userId);

  if (!staffIds.length) {
    return {
      generatedAt: new Date().toISOString(),
      model: 'ticket-records-v3',
      totals: buildReportTotals([]),
      accuracy: {
        ticketRule: 'Only closed tickets are counted, with one final handler per ticket.',
        totalActivityRule: 'Tickets Handled.',
      },
      staff: [],
    };
  }

  const ticketResult = await loadTicketMetrics(staffIds);
  const emptyWhitelistMetrics = metricsMap(staffIds);
  const staff = buildStaffRows(
    configured,
    ticketResult.metrics,
    emptyWhitelistMetrics
  );
  const totals = buildReportTotals(staff, {
    whitelistDatabaseRecords: 0,
    whitelistUnattributed: 0,
    closedTicketsDatabase: ticketResult.totalClosed,
    closedTicketsUnattributed: ticketResult.unattributedClosed,
  });

  return {
    generatedAt: new Date().toISOString(),
    model: 'ticket-records-v3',
    totals,
    accuracy: {
      whitelistDatabaseAvailable: false,
      ticketRule: 'Only closed tickets are counted. One ticket is credited to assigned_to, then claimed_by, then closed_by.',
      whitelistRule: 'Whitelist metrics are disabled for GTA Pinas.',
      totalActivityRule: 'Tickets Handled.',
      databaseApprovedWhitelistRecords: 0,
      unattributedWhitelistRecords: 0,
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
