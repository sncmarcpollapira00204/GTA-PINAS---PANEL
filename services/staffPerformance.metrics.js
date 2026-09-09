'use strict';

function numberValue(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : 0;
}

function normalizeRank(value) {
  const text = String(value || '').trim().toLowerCase();
  if (text.includes('owner')) return { label: 'Owner', order: 0 };
  if (text.includes('executive')) return { label: 'Executives', order: 1 };
  if (text.includes('high council')) return { label: 'High Council', order: 2 };
  if (text.includes('sophomore')) return { label: 'Sophomore Council', order: 3 };
  if (text.includes('junior')) return { label: 'Junior Council', order: 4 };
  if (text.includes('fresh')) return { label: 'Freshmen', order: 5 };
  return { label: String(value || 'Staff'), order: 99 };
}

function extractIds(value) {
  const ids = [];
  const seen = new Set();
  const text = String(value || '');

  for (const match of text.matchAll(/<@!?(\d{15,22})>|(?<!\d)(\d{15,22})(?!\d)/g)) {
    const id = String(match[1] || match[2] || '');
    if (!id || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }

  return ids;
}

function normalizeWhitelistType(value) {
  const compact = String(value || 'voucher')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
  return compact === 'nonvoucher' ? 'nonvoucher' : 'voucher';
}

function dedupeConfiguredStaff(entries) {
  const output = [];
  const seen = new Set();

  for (const entry of Array.isArray(entries) ? entries : []) {
    const userId = String(entry?.userId || '').trim();
    if (!/^\d{15,22}$/.test(userId) || seen.has(userId)) continue;
    seen.add(userId);
    output.push({ ...entry, userId });
  }

  return output;
}

function emptyMetrics() {
  return {
    ticketsHandled: 0,
    whitelistApproved: 0,
    voucherApproved: 0,
    nonVoucherApproved: 0,
    adminActions: 0,
  };
}

function chooseConfiguredId(values, staffSet) {
  for (const value of values) {
    for (const id of extractIds(value)) {
      if (staffSet.has(id)) return id;
    }
  }
  return null;
}

function buildStaffRows(configured, ticketMetrics, whitelistMetrics) {
  return dedupeConfiguredStaff(configured)
    .map((entry) => {
      const userId = entry.userId;
      const rank = normalizeRank(entry.description);
      const ticket = ticketMetrics.get(userId) || emptyMetrics();
      const whitelist = whitelistMetrics.get(userId) || emptyMetrics();
      const whitelistApproved = numberValue(whitelist.whitelistApproved);
      const ticketsHandled = numberValue(ticket.ticketsHandled);

      return {
        userId,
        label: entry.label || userId,
        rank: rank.label,
        rankOrder: rank.order,
        whitelistApproved,
        voucherApproved: numberValue(whitelist.voucherApproved),
        nonVoucherApproved: numberValue(whitelist.nonVoucherApproved),
        adminActions: numberValue(whitelist.adminActions),
        ticketsHandled,
        totalActivity: whitelistApproved + ticketsHandled,
      };
    })
    .sort((left, right) => {
      if (left.rankOrder !== right.rankOrder) return left.rankOrder - right.rankOrder;
      if (right.totalActivity !== left.totalActivity) return right.totalActivity - left.totalActivity;
      return String(left.label).localeCompare(String(right.label), undefined, {
        sensitivity: 'base',
      });
    });
}

function buildReportTotals(staff, details = {}) {
  const rows = Array.isArray(staff) ? staff : [];
  const whitelistApproved = rows.reduce(
    (sum, item) => sum + numberValue(item.whitelistApproved),
    0
  );
  const ticketsHandled = rows.reduce(
    (sum, item) => sum + numberValue(item.ticketsHandled),
    0
  );

  return {
    staff: rows.length,
    whitelistApproved,
    ticketsHandled,
    totalActivity: whitelistApproved + ticketsHandled,
    whitelistDatabaseRecords: numberValue(details.whitelistDatabaseRecords),
    whitelistUnattributed: numberValue(details.whitelistUnattributed),
    closedTicketsDatabase: numberValue(details.closedTicketsDatabase),
    closedTicketsUnattributed: numberValue(details.closedTicketsUnattributed),
  };
}

module.exports = {
  numberValue,
  normalizeRank,
  extractIds,
  normalizeWhitelistType,
  dedupeConfiguredStaff,
  emptyMetrics,
  chooseConfiguredId,
  buildStaffRows,
  buildReportTotals,
};
