'use strict';

const pool = require('../db');
const config = require('../config.json');
const ticketConfig = require('../ticket-staff.js');

const DISCORD_API = 'https://discord.com/api/v10';
const VIEW_CHANNEL = 1n << 10n;
const SYNC_COOLDOWN_MS = 5000;

let syncPromise = null;
let lastSyncAt = 0;

function getToken() {
  return String(
    process.env.DISCORD_TOKEN ||
    process.env.BOT_TOKEN ||
    process.env.DISCORD_BOT_TOKEN ||
    ''
  ).trim();
}

function categoryMap() {
  return new Map([
    [String(ticketConfig.ticketCategories?.report || ''), 'Report'],
    [String(ticketConfig.ticketCategories?.banAppeal || ''), 'Ban Appeal'],
    [String(ticketConfig.ticketCategories?.suggestion || ''), 'Suggestion'],
    [String(ticketConfig.ticketCategories?.boostClaim || ''), 'Server Boost'],
    [String(ticketConfig.ticketCategories?.donation || ''), 'Donation'],
  ].filter(([id]) => id));
}

function classifyChannel(channel) {
  const name = String(channel?.name || '').toLowerCase();
  const parentCategory = categoryMap().get(String(channel?.parent_id || ''));
  if (parentCategory) return parentCategory;

  if (/^(?:report-ticket|report)-/.test(name)) return 'Report';
  if (/^(?:banapeal-ticket|ban-appeal)-/.test(name)) return 'Ban Appeal';
  if (/^suggestion-/.test(name)) return 'Suggestion';
  if (/^(?:boostclaim|.*-boost)-/.test(name)) return 'Server Boost';
  if (/^donation-ticket-/.test(name)) return 'Donation';
  if (/^claimed-ticket-/.test(name)) return 'Ticket';
  if (/^ticket-/.test(name)) return parentCategory || 'Ticket';
  return null;
}

function ticketNumber(channelName) {
  return String(channelName || '').match(/-(\d{4,})$/)?.[1] || null;
}

function isTextChannel(channel) {
  return Number(channel?.type) === 0;
}

function hasViewPermission(overwrite) {
  try {
    return (BigInt(String(overwrite?.allow || '0')) & VIEW_CHANNEL) === VIEW_CHANNEL;
  } catch {
    return false;
  }
}

async function discordRequest(pathname) {
  const token = getToken();
  if (!token) throw new Error('DISCORD_TOKEN is missing from Railway Variables.');

  const response = await fetch(`${DISCORD_API}${pathname}`, {
    headers: {
      Authorization: `Bot ${token}`,
      'User-Agent': 'GTA-Pinas-Web-Panel/1.0',
      Accept: 'application/json',
    },
  });

  const body = await response.text();
  let payload = null;
  try { payload = JSON.parse(body); } catch {}

  if (!response.ok) {
    throw new Error(payload?.message || body || `Discord request failed (${response.status}).`);
  }

  return payload;
}

async function findTicketOwner(channel, botUserId) {
  const candidates = Array.isArray(channel?.permission_overwrites)
    ? channel.permission_overwrites.filter((overwrite) =>
        String(overwrite?.type) === '1' &&
        String(overwrite?.id) !== String(botUserId || '') &&
        hasViewPermission(overwrite)
      )
    : [];

  for (const overwrite of candidates) {
    try {
      const member = await discordRequest(`/guilds/${String(config.guildId)}/members/${String(overwrite.id)}`);
      if (member?.user && !member.user.bot) {
        return {
          id: String(member.user.id),
          username: member.nick || member.user.global_name || member.user.username || 'Unknown User',
          avatar: member.user.avatar
            ? `https://cdn.discordapp.com/avatars/${member.user.id}/${member.user.avatar}.png?size=128`
            : null,
        };
      }
    } catch {
      // Permission lookup can fail for a stale/deleted member; keep syncing the ticket.
    }
  }

  return null;
}

async function upsertOpenTicket(channel, botUserId) {
  const category = classifyChannel(channel);
  if (!category || !isTextChannel(channel)) return false;

  const owner = await findTicketOwner(channel, botUserId);
  const number = ticketNumber(channel.name);
  const ticketId = String(channel.id);
  const guildId = String(channel.guild_id || config.guildId);

  if (owner?.id) {
    await pool.query(
      `INSERT INTO users (id, username, avatar, is_bot, updated_at)
       VALUES ($1, $2, $3, FALSE, CURRENT_TIMESTAMP)
       ON CONFLICT (id) DO UPDATE SET
         username = EXCLUDED.username,
         avatar = COALESCE(EXCLUDED.avatar, users.avatar),
         updated_at = CURRENT_TIMESTAMP`,
      [owner.id, owner.username, owner.avatar]
    );
  }

  await pool.query(
    `INSERT INTO tickets
      (id, ticket_id, ticket_number, guild_id, channel_id, channel_name, user_id,
       category, status, import_source, last_activity_at, updated_at)
     VALUES ($1, $1, $2, $3, $4, $5, $6, $7, 'open', 'discord_live_sync', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
     ON CONFLICT (id) DO UPDATE SET
       ticket_number = COALESCE(EXCLUDED.ticket_number, tickets.ticket_number),
       guild_id = EXCLUDED.guild_id,
       channel_id = EXCLUDED.channel_id,
       channel_name = EXCLUDED.channel_name,
       user_id = COALESCE(EXCLUDED.user_id, tickets.user_id),
       category = EXCLUDED.category,
       status = CASE WHEN tickets.status = 'closed' THEN tickets.status ELSE 'open' END,
       import_source = CASE WHEN tickets.status = 'closed' THEN tickets.import_source ELSE EXCLUDED.import_source END,
       last_activity_at = GREATEST(COALESCE(tickets.last_activity_at, EXCLUDED.last_activity_at), EXCLUDED.last_activity_at),
       updated_at = CURRENT_TIMESTAMP`,
    [ticketId, number, guildId, ticketId, String(channel.name || ticketId), owner?.id || null, category]
  );

  return true;
}

async function syncOpenTicketsFromDiscord(force = false) {
  const now = Date.now();
  if (!force && lastSyncAt && now - lastSyncAt < SYNC_COOLDOWN_MS) return { synced: 0, skipped: true };
  if (syncPromise) return syncPromise;

  syncPromise = (async () => {
    const channels = await discordRequest(`/guilds/${String(config.guildId)}/channels`);
    const bot = await discordRequest('/users/@me').catch(() => null);
    const candidates = Array.isArray(channels) ? channels.filter((channel) => classifyChannel(channel) && isTextChannel(channel)) : [];

    let synced = 0;
    for (const channel of candidates) {
      try {
        if (await upsertOpenTicket(channel, bot?.id)) synced += 1;
      } catch (error) {
        console.error(`[DISCORD TICKET SYNC] Failed for ${channel?.name || channel?.id}:`, error.message);
      }
    }

    lastSyncAt = Date.now();
    console.log(`[DISCORD TICKET SYNC] ${synced} open Discord ticket channel(s) checked.`);
    return { synced, skipped: false };
  })().catch((error) => {
    console.error('[DISCORD TICKET SYNC] Failed:', error.message);
    return { synced: 0, skipped: false, error: error.message };
  }).finally(() => {
    syncPromise = null;
  });

  return syncPromise;
}

module.exports = { syncOpenTicketsFromDiscord };
