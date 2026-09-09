'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  extractIds,
  dedupeConfiguredStaff,
  emptyMetrics,
  chooseConfiguredId,
  buildStaffRows,
  buildReportTotals,
} = require('../services/staffPerformance.metrics');

test('Discord IDs are extracted once and in source order', () => {
  assert.deepEqual(
    extractIds('<@111111111111111111> 222222222222222222 <@!111111111111111111>'),
    ['111111111111111111', '222222222222222222']
  );
});

test('configured staff are deduplicated by Discord ID', () => {
  const configured = dedupeConfiguredStaff([
    { label: 'One', userId: '111111111111111111' },
    { label: 'Duplicate', userId: '111111111111111111' },
    { label: 'Invalid', userId: 'not-an-id' },
  ]);

  assert.equal(configured.length, 1);
  assert.equal(configured[0].label, 'One');
});

test('one configured approver is selected for each whitelist record', () => {
  const staffSet = new Set(['111111111111111111', '222222222222222222']);
  assert.equal(
    chooseConfiguredId(
      ['<@333333333333333333>', '<@222222222222222222> <@111111111111111111>'],
      staffSet
    ),
    '222222222222222222'
  );
});

test('total activity equals displayed whitelist and ticket metrics', () => {
  const ticketMetrics = new Map([
    ['111111111111111111', { ...emptyMetrics(), ticketsHandled: 4 }],
    ['222222222222222222', { ...emptyMetrics(), ticketsHandled: 2 }],
  ]);
  const whitelistMetrics = new Map([
    ['111111111111111111', { ...emptyMetrics(), whitelistApproved: 3, adminActions: 99 }],
    ['222222222222222222', { ...emptyMetrics(), whitelistApproved: 1, adminActions: 50 }],
  ]);

  const rows = buildStaffRows([
    { label: 'Junior', userId: '111111111111111111', description: 'Junior Council' },
    { label: 'Owner', userId: '222222222222222222', description: 'Owner' },
  ], ticketMetrics, whitelistMetrics);

  assert.equal(rows[0].label, 'Owner', 'official hierarchy is the primary sort');
  assert.equal(rows[0].totalActivity, 3);
  assert.equal(rows[1].totalActivity, 7);
  assert.notEqual(rows[1].totalActivity, rows[1].adminActions + rows[1].ticketsHandled);
});

test('summary totals exactly match the visible staff rows', () => {
  const totals = buildReportTotals([
    { whitelistApproved: 3, ticketsHandled: 4 },
    { whitelistApproved: 1, ticketsHandled: 2 },
  ], {
    whitelistDatabaseRecords: 6,
    whitelistUnattributed: 2,
    closedTicketsDatabase: 8,
    closedTicketsUnattributed: 2,
  });

  assert.deepEqual(totals, {
    staff: 2,
    whitelistApproved: 4,
    ticketsHandled: 6,
    totalActivity: 10,
    whitelistDatabaseRecords: 6,
    whitelistUnattributed: 2,
    closedTicketsDatabase: 8,
    closedTicketsUnattributed: 2,
  });
});
