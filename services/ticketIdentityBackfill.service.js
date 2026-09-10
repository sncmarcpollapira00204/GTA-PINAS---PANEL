'use strict';

const pool = require('../db');

const DISCORD_API = 'https://discord.com/api/v10';
let running = false;
let scheduled = false;

function cleanSecret(value) {
  const text = String(value || '').trim();
  if ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'"))) return text.slice(1, -1).trim();
  return text;
}

function getToken() {
  return cleanSecret(process.env.DISCORD_TOKEN || process.env.TOKEN || process.env.DISCORD_BOT_TOKEN);
}

function getGuildId() {
  return cleanSecret(process.env.DISCORD_GUILD_ID || process.env.GUILD_ID || '1525392083924549682');
}

function needsRefresh(username) {
  const value = String(username || '').trim().toLowerCase();
  return !value || value === 'unknown user' || value === 'archived user' || value === 'discord user';
}

async function discordGet(path) {
  const token = getToken();
  if (!token) return null;
  const response = await fetch(`${DISCORD_API}${path}`, {
    headers: { Authorization: `Bot ${token}`, 'User-Agent': 'GTA-Pinas-Web-Panel/Identity-Backfill' },
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) return null;
  return response.json().catch(() => null);
}

async function upsertIdentity(user) {
  if (!user?.id) return false;
  const username = String(user.username || user.global_name || '').trim();
  if (!username) return false;
  const avatar = user.avatar
    ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.${String(user.avatar).startsWith('a_') ? 'gif' : 'png'}?size=128`
    : null;

  await pool.query(
    `INSERT INTO users (id, username, avatar, is_bot, updated_at)
     VALUES ($1,$2,$3,FALSE,CURRENT_TIMESTAMP)
     ON CONFLICT (id) DO UPDATE SET username=EXCLUDED.username, avatar=COALESCE(EXCLUDED.avatar, users.avatar), updated_at=CURRENT_TIMESTAMP`,
    [String(user.id), username, avatar]
  );
  return true;
}

async function resolveUser(userId) {
  const guildId = getGuildId();
  const member = await discordGet(`/guilds/${guildId}/members/${encodeURIComponent(userId)}`);
  if (member?.user) {
    await upsertIdentity(member.user);
    return true;
  }
  const user = await discordGet(`/users/${encodeURIComponent(userId)}`);
  if (user) {
    await upsertIdentity(user);
    return true;
  }
  return false;
}

async function backfill() {
  if (running) return;
  running = true;
  try {
    const result = await pool.query(`
      SELECT DISTINCT t.user_id
      FROM tickets t
      LEFT JOIN users u ON u.id = t.user_id
      WHERE t.user_id IS NOT NULL
        AND NULLIF(TRIM(t.user_id), '') IS NOT NULL
        AND (u.id IS NULL OR u.username IS NULL OR LOWER(TRIM(u.username)) IN ('unknown user','archived user','discord user'))
      LIMIT 50
    `);

    let updated = 0;
    for (const row of result.rows) {
      try {
        if (await resolveUser(String(row.user_id))) updated += 1;
      } catch (error) {
        console.warn(`[IDENTITY BACKFILL] ${row.user_id}: ${error.message}`);
      }
    }
    if (updated) console.log(`[IDENTITY BACKFILL] Updated ${updated} user identities.`);
  } catch (error) {
    console.warn(`[IDENTITY BACKFILL] ${error.message}`);
  } finally {
    running = false;
  }
}

function schedule() {
  if (scheduled) return;
  scheduled = true;

  // server.js initializes the PostgreSQL schema before accepting requests.
  // Do not hit the database during module loading; Railway may still be starting PostgreSQL.
  const initialDelay = Math.max(30_000, Number(process.env.IDENTITY_BACKFILL_INITIAL_DELAY_MS || 60_000));
  setTimeout(() => void backfill(), initialDelay).unref?.();
  setInterval(() => void backfill(), 10 * 60 * 1000).unref?.();
}

module.exports = { backfill, schedule, needsRefresh };
