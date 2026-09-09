'use strict';

const { Pool } = require('pg');
const config = require('../config.json');

const DISCORD_API = 'https://discord.com/api/v10';
const PROFILE_CACHE_TTL_MS = 5 * 60 * 1000;

let whitelistPool = null;
let whitelistSchemaReadyPromise = null;
const profileCache = new Map();

function getWhitelistPool() {
  const connectionString = String(
    process.env.WHITELIST_DATABASE_URL
    || process.env.GATEKEEPER_DATABASE_URL
    || ''
  ).trim();
  if (!connectionString) {
    const error = new Error('WHITELIST_DATABASE_URL (or GATEKEEPER_DATABASE_URL) is not configured in the Web Panel service.');
    error.code = 'WHITELIST_DATABASE_NOT_CONFIGURED';
    throw error;
  }

  if (!whitelistPool) {
    whitelistPool = new Pool({
      connectionString,
      ssl: { rejectUnauthorized: false },
      keepAlive: true,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 15000,
      max: 5,
    });

    whitelistPool.on('error', (error) => {
      console.error('[WHITELIST DATABASE] Idle connection error:', error.message);
    });
  }

  return whitelistPool;
}

async function ensureWhitelistSchema() {
  if (!whitelistSchemaReadyPromise) {
    whitelistSchemaReadyPromise = getWhitelistPool().query(`
      ALTER TABLE whitelist ADD COLUMN IF NOT EXISTS application_status TEXT DEFAULT 'pending';
      UPDATE whitelist
      SET application_status = 'whitelisted'
      WHERE LOWER(COALESCE(NULLIF(TRIM(whitelisted_by), ''), 'none')) NOT IN ('none','null','n/a','unknown')
        AND LOWER(COALESCE(application_status, 'pending')) <> 'denied';

      UPDATE whitelist
      SET application_status = 'pending'
      WHERE application_status IS NULL OR application_status = '';
    `).catch((error) => {
      whitelistSchemaReadyPromise = null;
      throw error;
    });
  }
  return whitelistSchemaReadyPromise;
}

function getBotToken() {
  return String(process.env.DISCORD_TOKEN || process.env.TOKEN || '').trim();
}

function getGuildId() {
  return String(process.env.DISCORD_GUILD_ID || config.guildId || '').trim();
}

const statusValue = `LOWER(COALESCE(NULLIF(TRIM(application_status), ''), CASE
  WHEN LOWER(COALESCE(NULLIF(TRIM(whitelisted_by), ''), 'none')) NOT IN ('none','null','n/a','unknown')
  THEN 'whitelisted' ELSE 'pending' END))`;
const pendingCondition = `${statusValue} = 'pending'`;
const approvedCondition = `${statusValue} = 'whitelisted'`;

const DISCORD_TIMESTAMP_PATTERN = /^<t:(\d{9,13})(?::[tTdDfFR])?>$/;

function pluralize(value, singular) {
  return `${value} ${singular}${value === 1 ? '' : 's'}`;
}

function formatAccountAgeFromDate(createdAt, now = new Date()) {
  const created = createdAt instanceof Date ? createdAt : new Date(createdAt);
  if (Number.isNaN(created.getTime()) || created.getTime() > now.getTime()) return null;

  const totalDays = Math.max(0, Math.floor((now.getTime() - created.getTime()) / 86400000));
  const years = Math.floor(totalDays / 365.2425);
  const daysAfterYears = Math.max(0, Math.floor(totalDays - (years * 365.2425)));
  const months = Math.floor(daysAfterYears / 30.436875);
  const days = Math.max(0, Math.floor(daysAfterYears - (months * 30.436875)));

  if (years > 0) return `${pluralize(years, 'year')}, ${pluralize(months, 'month')}`;
  if (months > 0) return `${pluralize(months, 'month')}, ${pluralize(days, 'day')}`;
  if (totalDays > 0) return pluralize(totalDays, 'day');

  const totalHours = Math.max(0, Math.floor((now.getTime() - created.getTime()) / 3600000));
  return totalHours > 0 ? pluralize(totalHours, 'hour') : 'Less than 1 hour';
}

function accountCreatedDateFromValue(value) {
  const text = String(value || '').trim();
  const discordTimestamp = text.match(DISCORD_TIMESTAMP_PATTERN);
  if (discordTimestamp) {
    const raw = Number(discordTimestamp[1]);
    const milliseconds = raw > 9999999999 ? raw : raw * 1000;
    const date = new Date(milliseconds);
    if (!Number.isNaN(date.getTime())) return date;
  }

  if (/^\d{10,13}$/.test(text)) {
    const raw = Number(text);
    const milliseconds = text.length <= 10 ? raw * 1000 : raw;
    const date = new Date(milliseconds);
    if (!Number.isNaN(date.getTime())) return date;
  }

  return null;
}

function normalizedAccountAge(value, discordId) {
  const snowflakeDate = snowflakeCreatedAt(discordId);
  const createdAt = snowflakeDate ? new Date(snowflakeDate) : accountCreatedDateFromValue(value);
  const calculated = createdAt ? formatAccountAgeFromDate(createdAt) : null;
  if (calculated) return calculated;

  const text = String(value || '').trim();
  return text && !['NONE', 'NULL', 'N/A', 'UNKNOWN'].includes(text.toUpperCase())
    ? text
    : 'UNKNOWN';
}

function accountAgeNeedsRepair(value) {
  const text = String(value || '').trim();
  return DISCORD_TIMESTAMP_PATTERN.test(text) || /^\d{10,13}$/.test(text);
}

async function repairAccountAgeRows(pool, rows) {
  const repairs = (rows || [])
    .filter((row) => row?.discord_id && accountAgeNeedsRepair(row.account_age))
    .map((row) => ({
      discordId: String(row.discord_id),
      oldValue: String(row.account_age || ''),
      newValue: normalizedAccountAge(row.account_age, row.discord_id),
    }))
    .filter((item) => item.newValue && item.newValue !== item.oldValue);

  if (!repairs.length) return;

  await Promise.allSettled(repairs.map((item) => pool.query(
    `UPDATE whitelist
        SET account_age = $1
      WHERE discord_id = $2
        AND account_age = $3`,
    [item.newValue, item.discordId, item.oldValue]
  )));
}

function mapRecord(row) {
  if (!row) return null;
  const approvedBy = String(row.whitelisted_by || '').trim();
  const normalizedApprovedBy = approvedBy.toLowerCase();
  const storedStatus = String(row.application_status || '').trim().toLowerCase();
  const status = ['pending', 'whitelisted', 'denied'].includes(storedStatus)
    ? storedStatus
    : approvedBy && !['none', 'null', 'n/a', 'unknown'].includes(normalizedApprovedBy)
      ? 'whitelisted'
      : 'pending';

  return {
    discordId: row.discord_id || '',
    characterName: row.character_name || '',
    steamProfile: row.steam_profile || '',
    vouchers: row.vouchers || 'NONE',
    revokedVouches: row.revoked_vouches || 'NONE',
    whitelistType: row.whitelist_type || 'unknown',
    interviewer: row.interviewer || 'NONE',
    accountAge: normalizedAccountAge(row.account_age, row.discord_id),
    whitelistedBy: row.whitelisted_by || 'NONE',
    createdAt: row.created_at || null,
    status,
  };
}

async function lookupByDiscordId(discordId) {
  await ensureWhitelistSchema();
  const pool = getWhitelistPool();
  const result = await pool.query(
    `SELECT discord_id, character_name, steam_profile, vouchers, revoked_vouches,
            whitelist_type, interviewer, account_age, whitelisted_by, application_status, created_at
       FROM whitelist
      WHERE discord_id = $1
      LIMIT 1`,
    [discordId]
  );
  const row = result.rows[0];
  if (!row) return null;
  await repairAccountAgeRows(pool, [row]);
  return mapRecord(row);
}


function extractDiscordIds(value) {
  const text = String(value || '');
  const ids = [];
  const seen = new Set();

  for (const match of text.matchAll(/<@!?(\d{15,22})>|(?<!\d)(\d{15,22})(?!\d)/g)) {
    const id = String(match[1] || match[2] || '').trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }

  return ids;
}

async function getDiscordProfiles(discordIds, { force = false } = {}) {
  const uniqueIds = [...new Set((discordIds || []).map((id) => String(id || '').trim()))]
    .filter((id) => /^\d{15,22}$/.test(id))
    .slice(0, 25);

  const results = await Promise.allSettled(
    uniqueIds.map((id) => getDiscordProfile(id, { force }))
  );

  const profiles = {};
  results.forEach((result, index) => {
    if (result.status === 'fulfilled' && result.value?.id) {
      profiles[uniqueIds[index]] = result.value;
    }
  });

  return profiles;
}

async function getRecordPeople(record, { force = false } = {}) {
  if (!record) return {};

  const ids = [
    String(record.discordId || '').trim(),
    ...extractDiscordIds(record.vouchers),
    ...extractDiscordIds(record.revokedVouches),
    ...extractDiscordIds(record.whitelistedBy),
    ...extractDiscordIds(record.interviewer),
  ];

  return getDiscordProfiles(ids, { force });
}

async function listByStatus({ status, page = 1, pageSize = 20, search = '' }) {
  await ensureWhitelistSchema();
  const pool = getWhitelistPool();
  const safePage = Math.max(1, Number(page) || 1);
  const safePageSize = Math.min(50, Math.max(5, Number(pageSize) || 20));
  const offset = (safePage - 1) * safePageSize;
  const values = [];
  const conditions = [status === 'whitelisted' ? approvedCondition : pendingCondition];

  const normalizedSearch = String(search || '').trim();
  if (normalizedSearch) {
    values.push(`%${normalizedSearch}%`);
    const index = values.length;
    conditions.push(`(
      discord_id ILIKE $${index}
      OR COALESCE(character_name, '') ILIKE $${index}
      OR COALESCE(vouchers, '') ILIKE $${index}
      OR COALESCE(whitelist_type, '') ILIKE $${index}
      OR COALESCE(interviewer, '') ILIKE $${index}
      OR COALESCE(whitelisted_by, '') ILIKE $${index}
    )`);
  }

  const where = conditions.join(' AND ');
  const countResult = await pool.query(`SELECT COUNT(*)::int AS total FROM whitelist WHERE ${where}`, values);
  const total = Number(countResult.rows[0]?.total || 0);

  values.push(safePageSize, offset);
  const limitIndex = values.length - 1;
  const offsetIndex = values.length;
  const rowsResult = await pool.query(
    `SELECT discord_id, character_name, steam_profile, vouchers, revoked_vouches,
            whitelist_type, interviewer, account_age, whitelisted_by, application_status, created_at
       FROM whitelist
      WHERE ${where}
      ORDER BY created_at DESC NULLS LAST, character_name ASC NULLS LAST
      LIMIT $${limitIndex} OFFSET $${offsetIndex}`,
    values
  );

  await repairAccountAgeRows(pool, rowsResult.rows);

  return {
    items: rowsResult.rows.map(mapRecord),
    total,
    page: safePage,
    pageSize: safePageSize,
    totalPages: Math.max(1, Math.ceil(total / safePageSize)),
  };
}

function imageExtension(hash) {
  return String(hash || '').startsWith('a_') ? 'gif' : 'png';
}

function defaultAvatarUrl(user) {
  if (!user?.id) return null;
  let index = 0;
  try {
    index = user.discriminator && user.discriminator !== '0'
      ? Number(user.discriminator) % 5
      : Number((BigInt(user.id) >> 22n) % 6n);
  } catch (_) {
    index = 0;
  }
  return `https://cdn.discordapp.com/embed/avatars/${index}.png`;
}

function globalAvatarUrl(user) {
  if (!user?.id) return null;
  if (!user.avatar) return defaultAvatarUrl(user);
  return `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.${imageExtension(user.avatar)}?size=256`;
}

function guildAvatarUrl(guildId, userId, hash) {
  if (!guildId || !userId || !hash) return null;
  return `https://cdn.discordapp.com/guilds/${guildId}/users/${userId}/avatars/${hash}.${imageExtension(hash)}?size=256`;
}

function globalBannerUrl(user) {
  if (!user?.id || !user?.banner) return null;
  return `https://cdn.discordapp.com/banners/${user.id}/${user.banner}.${imageExtension(user.banner)}?size=1024`;
}

function snowflakeCreatedAt(discordId) {
  try {
    const milliseconds = Number((BigInt(discordId) >> 22n) + 1420070400000n);
    if (!Number.isFinite(milliseconds)) return null;
    return new Date(milliseconds).toISOString();
  } catch (_) {
    return null;
  }
}

async function discordRequest(path, { allowNotFound = false, retry = true } = {}) {
  const token = getBotToken();
  if (!token) {
    const error = new Error('TOKEN or DISCORD_TOKEN is not configured in the Web Panel service.');
    error.code = 'DISCORD_TOKEN_NOT_CONFIGURED';
    throw error;
  }

  const response = await fetch(`${DISCORD_API}${path}`, {
    headers: {
      Authorization: `Bot ${token}`,
      'User-Agent': '5th-Avenue-Web-Panel',
    },
    signal: AbortSignal.timeout(12000),
  });

  if (response.status === 429 && retry) {
    const payload = await response.json().catch(() => ({}));
    const waitMs = Math.min(5000, Math.max(250, Number(payload.retry_after || 1) * 1000));
    await new Promise((resolve) => setTimeout(resolve, waitMs));
    return discordRequest(path, { allowNotFound, retry: false });
  }

  if (response.status === 404 && allowNotFound) return null;

  if (!response.ok) {
    const error = new Error(`Discord API returned HTTP ${response.status}.`);
    error.code = 'DISCORD_API_ERROR';
    error.status = response.status;
    throw error;
  }

  return response.json();
}

async function getDiscordProfile(discordId, { force = false } = {}) {
  const normalizedId = String(discordId || '').trim();
  if (!/^\d{15,22}$/.test(normalizedId)) return null;

  const cached = profileCache.get(normalizedId);
  if (!force && cached && Date.now() - cached.createdAt < PROFILE_CACHE_TTL_MS) {
    return cached.profile;
  }

  const guildId = getGuildId();
  const memberPromise = guildId
    ? discordRequest(`/guilds/${encodeURIComponent(guildId)}/members/${encodeURIComponent(normalizedId)}`, { allowNotFound: true })
    : Promise.resolve(null);

  const [member, fullUser] = await Promise.all([
    memberPromise,
    discordRequest(`/users/${encodeURIComponent(normalizedId)}`, { allowNotFound: true }),
  ]);

  const memberUser = member?.user || {};
  const user = {
    id: fullUser?.id || memberUser.id || null,
    username: fullUser?.username || memberUser.username || null,
    global_name: fullUser?.global_name ?? memberUser.global_name ?? null,
    avatar: fullUser?.avatar ?? memberUser.avatar ?? null,
    discriminator: fullUser?.discriminator || memberUser.discriminator || '0',
    banner: fullUser?.banner ?? memberUser.banner ?? null,
    bot: fullUser?.bot ?? memberUser.bot ?? false,
  };

  if (!user.id) return null;
  if (String(user.id) !== normalizedId) {
    const error = new Error('Discord returned a profile that does not match the requested User ID.');
    error.code = 'DISCORD_PROFILE_ID_MISMATCH';
    throw error;
  }

  // Primary identity is the real global Discord profile.
  // Server nickname and server avatar remain separate informational fields.
  const globalDisplayName = user.global_name || user.username || `User ${normalizedId}`;
  const globalAvatar = globalAvatarUrl(user);
  const serverAvatar = guildAvatarUrl(guildId, String(user.id), member?.avatar);

  const profile = {
    id: String(user.id),
    username: user.username || 'Unknown user',
    globalName: user.global_name || null,
    displayName: globalDisplayName,
    guildNickname: member?.nick || null,
    avatarUrl: globalAvatar,
    globalAvatarUrl: globalAvatar,
    guildAvatarUrl: serverAvatar,
    bannerUrl: globalBannerUrl(user),
    joinedAt: member?.joined_at || null,
    accountCreatedAt: snowflakeCreatedAt(String(user.id)),
    inGuild: Boolean(member),
    bot: Boolean(user.bot),
  };

  profileCache.set(normalizedId, { createdAt: Date.now(), profile });
  return profile;
}


async function getWhitelistStats() {
  await ensureWhitelistSchema();
  const pool = getWhitelistPool();
  const result = await pool.query(`
    SELECT
      COUNT(*) FILTER (WHERE ${pendingCondition})::INTEGER AS pending,
      COUNT(*) FILTER (WHERE ${approvedCondition})::INTEGER AS whitelisted
    FROM whitelist
  `);

  return {
    pending: Number(result.rows[0]?.pending || 0),
    whitelisted: Number(result.rows[0]?.whitelisted || 0),
  };
}

module.exports = {
  lookupByDiscordId,
  listByStatus,
  getDiscordProfile,
  getDiscordProfiles,
  getRecordPeople,
  extractDiscordIds,
  getWhitelistStats,
};
