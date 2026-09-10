'use strict';

const pool = require('../db');

const DISCORD_API = 'https://discord.com/api/v10';
const cache = new Map();
const CACHE_MS = 5 * 60 * 1000;

function cleanSecret(value) {
  const text = String(value || '').trim();
  if ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'"))) return text.slice(1, -1).trim();
  return text;
}

function getToken() {
  return cleanSecret(process.env.DISCORD_TOKEN || process.env.TOKEN || process.env.DISCORD_BOT_TOKEN);
}

function buildAvatarUrl(user) {
  if (!user?.id) return null;
  if (user.avatar) {
    const ext = String(user.avatar).startsWith('a_') ? 'gif' : 'png';
    return `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.${ext}?size=128`;
  }
  try {
    const index = Number((BigInt(String(user.id)) >> 22n) % 6n);
    return `https://cdn.discordapp.com/embed/avatars/${index}.png`;
  } catch {
    return null;
  }
}

async function discordGet(pathname) {
  const token = getToken();
  if (!token) return null;
  const response = await fetch(`${DISCORD_API}${pathname}`, {
    headers: { Authorization: `Bot ${token}`, 'User-Agent': 'GTA-Pinas-Web-Panel/TranscriptIdentity' },
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) return null;
  return response.json().catch(() => null);
}

async function resolveUser(userId) {
  const id = String(userId || '').trim();
  if (!/^\d{15,22}$/.test(id)) return null;

  const cached = cache.get(id);
  if (cached && cached.expiresAt > Date.now()) return cached.user;

  const member = await discordGet(`/guilds/${cleanSecret(process.env.DISCORD_GUILD_ID || '')}/members/${encodeURIComponent(id)}`);
  const user = member?.user || await discordGet(`/users/${encodeURIComponent(id)}`);
  if (!user?.id) return null;

  const resolved = {
    id: String(user.id),
    username: String(user.username || user.global_name || '').trim(),
    displayName: String(member?.nick || user.global_name || user.username || '').trim(),
    avatar: buildAvatarUrl(user),
  };
  cache.set(id, { expiresAt: Date.now() + CACHE_MS, user: resolved });
  return resolved;
}

function placeholder(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return !normalized || ['user', 'unknown user', 'archived user', 'discord user'].includes(normalized);
}

async function enrichMessages(messages) {
  const rows = Array.isArray(messages) ? messages : [];
  const ids = [...new Set(rows.map(row => String(row?.user_id || '').trim()).filter(id => /^\d{15,22}$/.test(id)))];
  if (!ids.length) return rows;

  const identities = await Promise.all(ids.map(async id => [id, await resolveUser(id).catch(() => null)]));
  const byId = new Map(identities);

  for (const row of rows) {
    const user = byId.get(String(row?.user_id || '').trim());
    if (!user) continue;

    if (placeholder(row.username)) row.username = user.username || user.displayName || row.username || 'User';
    if (!row.avatar) row.avatar = user.avatar || row.avatar;
  }
  return rows;
}

async function backfillTicketMessageIdentities(ticketId = null) {
  const values = [];
  let where = `WHERE m.user_id IS NOT NULL`;
  if (ticketId) {
    values.push(String(ticketId));
    where += ` AND m.ticket_id = $1`;
  }

  const result = await pool.query(`
    SELECT m.id, m.user_id, m.username, m.avatar
    FROM ticket_messages m
    ${where}
    AND (
      m.username IS NULL
      OR TRIM(m.username) = ''
      OR LOWER(TRIM(m.username)) IN ('user','unknown user','archived user','discord user')
      OR m.avatar IS NULL
      OR TRIM(m.avatar) = ''
    )
    ORDER BY m.created_at ASC
    LIMIT 250
  `, values);

  const enriched = await enrichMessages(result.rows);
  for (const row of enriched) {
    if (!row?.id || placeholder(row.username) && !row.avatar) continue;
    await pool.query(
      `UPDATE ticket_messages SET username = COALESCE(NULLIF($2,''), username), avatar = COALESCE(NULLIF($3,''), avatar), updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
      [String(row.id), String(row.username || '').trim(), String(row.avatar || '').trim()]
    );
  }
  return enriched.length;
}

module.exports = { enrichMessages, backfillTicketMessageIdentities };
