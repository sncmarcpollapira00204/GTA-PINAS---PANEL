'use strict';

const { syncOpenTicketsFromDiscord } = require('./discordOpenTickets.service');

const STARTUP_DELAY_MS = 10000;
const SYNC_INTERVAL_MS = 20000;

async function run() {
  await syncOpenTicketsFromDiscord(true);
}

const startupTimer = setTimeout(run, STARTUP_DELAY_MS);
if (typeof startupTimer.unref === 'function') startupTimer.unref();

const interval = setInterval(run, SYNC_INTERVAL_MS);
if (typeof interval.unref === 'function') interval.unref();

console.log('[DISCORD TICKET SYNC] Background sync scheduled.');
