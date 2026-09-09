'use strict';

const pool = require('../db');
const config = require('../config.json');
const staffConfig = require('../ticket-staff.js');

const DISCORD_API = 'https://discord.com/api/v10';
const COMPLETE_CACHE_TTL_MS = 60 * 60 * 1000;
const PARTIAL_CACHE_TTL_MS = 15 * 1000;
const STALE_TTL_MS = 24 * 60 * 60 * 1000;
const ROLE_CACHE_TTL_MS = 10 * 60 * 1000;
const MEMBER_CACHE_TTL_MS = 60 * 60 * 1000;
const MISSING_MEMBER_CACHE_TTL_MS = 5 * 60 * 1000;
const MEMBER_LOOKUP_CONCURRENCY = Math.min(
  4,
  Math.max(1, Number(process.env.STAFF_LOOKUP_CONCURRENCY || 2))
);
const MEMBER_LOOKUP_TIMEOUT_MS = Math.min(
  20_000,
  Math.max(3_000, Number(process.env.STAFF_LOOKUP_TIMEOUT_MS || 8_000))
);
const DISCORD_REQUEST_SPACING_MS = Math.min(
  1_000,
  Math.max(75, Number(process.env.STAFF_REQUEST_SPACING_MS || 125))
);
const DISCORD_MAX_RETRIES = Math.min(
  5,
  Math.max(1, Number(process.env.STAFF_DISCORD_RETRIES || 3))
);
const STAFF_RANKS = [
  { key: 'owner', label: 'Owner', order: 0, patterns: [/owner/i, /toyo/i] },
  { key: 'executive', label: 'Executives', order: 1, patterns: [/executive/i] },
  { key: 'high-council', label: 'High Council', order: 2, patterns: [/high\s*council/i] },
  { key: 'sophomore', label: 'Sophomore Council', order: 3, patterns: [/sophomore/i] },
  { key: 'junior', label: 'Junior Council', order: 4, patterns: [/junior/i] },
  { key: 'freshman', label: 'Freshmen', order: 5, patterns: [/freshm(?:a|e)n/i] },
];

let cache = {
  createdAt: 0,
  data: null,
  complete: false,
  resolvedCount: 0,
  totalCount: 0,
  inGuildCount: 0,
  source: 'empty',
  lastError: null,
};
let refreshPromise = null;
let roleCache = { guildId: '', createdAt: 0, data: null };
let warmupStarted = false;
let partialRetryTimer = null;
let partialRetryAttempt = 0;
let rateLimitedUntil = 0;
let nextRequestStartAt = 0;
let requestStartGate = Promise.resolve();

const memberCache = new Map();

function sleep(milliseconds) {
  return new Promise(resolve => setTimeout(resolve, Math.max(0, milliseconds)));
}

function resolveStaffRank(entry) {
  const source = String(entry?.description || '').trim();
  return STAFF_RANKS.find(rank => rank.patterns.some(pattern => pattern.test(source))) || {
    key: 'staff',
    label: source || 'Ticket Staff',
    order: 99,
  };
}

function getBotToken() {
  return String(process.env.DISCORD_TOKEN || process.env.TOKEN || '').trim();
}

function getGuildId() {
  return String(process.env.DISCORD_GUILD_ID || config.guildId || '').trim();
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

function guildBannerUrl(guildId, userId, hash) {
  if (!guildId || !userId || !hash) return null;
  return `https://cdn.discordapp.com/guilds/${guildId}/users/${userId}/banners/${hash}.${imageExtension(hash)}?size=1024`;
}

function colorHex(color) {
  if (typeof color === 'string' && /^#[0-9a-f]{6}$/i.test(color)) return color.toUpperCase();
  const numeric = Number(color || 0);
  if (!Number.isInteger(numeric) || numeric <= 0) return '#2563EB';
  return `#${numeric.toString(16).padStart(6, '0').slice(-6)}`;
}

async function waitForDiscordRequestSlot() {
  let releaseGate;
  const previousGate = requestStartGate;
  requestStartGate = new Promise(resolve => {
    releaseGate = resolve;
  });

  await previousGate;

  try {
    const waitMs = Math.max(
      0,
      nextRequestStartAt - Date.now(),
      rateLimitedUntil - Date.now()
    );
    if (waitMs > 0) await sleep(waitMs);
    nextRequestStartAt = Date.now() + DISCORD_REQUEST_SPACING_MS;
  } finally {
    releaseGate();
  }
}

function retryableDiscordError(error) {
  return error?.name === 'AbortError'
    || error?.name === 'TimeoutError'
    || error?.code === 'UND_ERR_CONNECT_TIMEOUT'
    || error?.code === 'ECONNRESET'
    || error?.code === 'ETIMEDOUT'
    || error?.status === 429
    || Number(error?.status || 0) >= 500;
}

async function discordRequest(path, { maxRetries = DISCORD_MAX_RETRIES } = {}) {
  const token = getBotToken();
  if (!token) {
    const error = new Error('DISCORD_TOKEN or TOKEN is missing.');
    error.code = 'TOKEN_MISSING';
    throw error;
  }

  let lastError = null;

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    try {
      await waitForDiscordRequestSlot();

      const response = await fetch(`${DISCORD_API}${path}`, {
        headers: {
          Authorization: `Bot ${token}`,
          'User-Agent': '5th-Avenue-Web-Panel/StaffProfiles',
        },
        signal: AbortSignal.timeout(MEMBER_LOOKUP_TIMEOUT_MS),
      });

      if (response.status === 429) {
        const body = await response.json().catch(() => ({}));
        const headerSeconds = Number(response.headers.get('retry-after') || 0);
        const bodySeconds = Number(body.retry_after || 0);
        const waitMs = Math.max(
          1_000,
          Math.ceil(Math.max(headerSeconds, bodySeconds, 1) * 1_000)
        );
        rateLimitedUntil = Math.max(rateLimitedUntil, Date.now() + waitMs);

        const error = new Error('Discord API rate limit is active.');
        error.code = 'RATE_LIMITED';
        error.status = 429;
        error.retryAfterMs = waitMs;
        throw error;
      }

      if (!response.ok) {
        const error = new Error(`Discord API returned HTTP ${response.status}.`);
        error.status = response.status;
        throw error;
      }

      return response.json();
    } catch (error) {
      lastError = error;
      if (!retryableDiscordError(error) || attempt >= maxRetries) throw error;

      const retryAfterMs = Number(error.retryAfterMs || 0);
      const backoffMs = retryAfterMs || Math.min(4_000, 300 * (2 ** attempt));
      await sleep(backoffMs + Math.floor(Math.random() * 150));
    }
  }

  throw lastError || new Error('Discord request failed.');
}

async function getDatabaseStaffMap() {
  try {
    const result = await pool.query('SELECT * FROM staff');
    return new Map(result.rows.map(row => [String(row.id), row]));
  } catch (error) {
    console.warn('[STAFF PROFILES] Unable to read staff statistics:', error.message);
    return new Map();
  }
}

async function getGuildRoleMap(guildId) {
  const age = Date.now() - roleCache.createdAt;
  if (roleCache.guildId === guildId && roleCache.data instanceof Map && age < ROLE_CACHE_TTL_MS) {
    return roleCache.data;
  }

  const roles = await discordRequest(`/guilds/${encodeURIComponent(guildId)}/roles`);
  const map = new Map((roles || []).map(role => [String(role.id), role]));
  roleCache = { guildId, createdAt: Date.now(), data: map };
  return map;
}

async function runWithConcurrency(items, concurrency, worker) {
  const results = new Array(items.length);
  let nextIndex = 0;

  async function runner() {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      try {
        results[index] = await worker(items[index], index);
      } catch (error) {
        results[index] = { error };
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length || 1) }, () => runner())
  );
  return results;
}

function memberCacheTtl(record) {
  return record?.status === 'missing'
    ? MISSING_MEMBER_CACHE_TTL_MS
    : MEMBER_CACHE_TTL_MS;
}

function validMemberCacheRecord(record) {
  return Boolean(
    record
    && ['found', 'missing'].includes(record.status)
    && Date.now() - Number(record.createdAt || 0) < memberCacheTtl(record)
  );
}

async function getGuildMemberRecords(guildId, wantedIds, { force = false } = {}) {
  const uniqueIds = Array.from(new Set(wantedIds.map(String).filter(Boolean)));
  const records = new Map();
  const pendingIds = [];

  for (const userId of uniqueIds) {
    const cachedRecord = memberCache.get(userId);
    if (cachedRecord) records.set(userId, cachedRecord);
    if (force || !validMemberCacheRecord(cachedRecord)) pendingIds.push(userId);
  }

  const results = await runWithConcurrency(
    pendingIds,
    MEMBER_LOOKUP_CONCURRENCY,
    async (userId) => {
      try {
        const member = await discordRequest(
          `/guilds/${encodeURIComponent(guildId)}/members/${encodeURIComponent(userId)}`
        );
        return {
          userId,
          record: {
            status: 'found',
            member,
            createdAt: Date.now(),
            error: null,
          },
        };
      } catch (error) {
        if (error.status === 404) {
          return {
            userId,
            record: {
              status: 'missing',
              member: null,
              createdAt: Date.now(),
              error: null,
            },
          };
        }
        return { userId, error };
      }
    }
  );

  const errors = [];

  for (const result of results) {
    if (!result) continue;
    if (result.record) {
      memberCache.set(result.userId, result.record);
      records.set(result.userId, result.record);
      continue;
    }

    if (result.error) {
      errors.push({ userId: result.userId || null, error: result.error });
      const cachedRecord = memberCache.get(result.userId);
      if (cachedRecord) records.set(result.userId, cachedRecord);
    }
  }

  return { records, errors };
}

function highestRole(memberRoles, roleMap, guildId) {
  return (memberRoles || [])
    .map(id => roleMap.get(String(id)))
    .filter(role => role && String(role.id) !== String(guildId))
    .sort((left, right) => Number(right.position || 0) - Number(left.position || 0))[0] || null;
}

function buildProfile(entry, stats, memberRecord, roleMap, guildId) {
  const userId = String(entry.userId || '');
  const rank = resolveStaffRank(entry);
  const member = memberRecord?.status === 'found' ? memberRecord.member : null;
  const user = member?.user || {};
  const role = member ? highestRole(member.roles, roleMap, guildId) : null;
  const discordName = member?.nick || user.global_name || user.username || null;
  const memberStatus = memberRecord?.status || 'unknown';

  return {
    ...stats,
    id: userId,
    user_id: userId,
    label: entry.label,
    staff_role: entry.description || stats.role || 'Ticket Handler',
    description: entry.description || null,
    category_id: entry.categoryId || null,
    rank_key: rank.key,
    rank_label: rank.label,
    rank_order: rank.order,
    username: user.username || stats.username || entry.label,
    global_name: user.global_name || null,
    guild_nickname: member?.nick || null,
    display_name: entry.label || discordName || userId,
    discord_display_name: discordName || null,
    avatar_url:
      guildAvatarUrl(guildId, userId, member?.avatar) ||
      globalAvatarUrl(user) ||
      stats.avatar ||
      null,
    banner_url:
      guildBannerUrl(guildId, userId, member?.banner) ||
      globalBannerUrl(user) ||
      null,
    server_role: role?.name || entry.description || stats.role || 'Ticket Handler',
    role_color: colorHex(role?.color),
    banner_color: colorHex(user.accent_color || role?.color),
    joined_at: member?.joined_at || null,
    in_guild: memberStatus === 'found' ? true : memberStatus === 'missing' ? false : null,
    profile_complete: memberStatus === 'found' || memberStatus === 'missing',
  };
}

function mergeWithExistingProfiles(profiles) {
  if (!Array.isArray(cache.data) || !cache.data.length) return profiles;

  const existing = new Map(
    cache.data.map(profile => [String(profile.id || profile.user_id || ''), profile])
  );

  return profiles.map(profile => {
    if (profile.profile_complete) return profile;
    const old = existing.get(String(profile.id || profile.user_id || ''));
    if (!old?.profile_complete) return profile;

    return {
      ...profile,
      username: old.username || profile.username,
      global_name: old.global_name || profile.global_name,
      guild_nickname: old.guild_nickname || profile.guild_nickname,
      discord_display_name: old.discord_display_name || profile.discord_display_name,
      avatar_url: old.avatar_url || profile.avatar_url,
      banner_url: old.banner_url || profile.banner_url,
      server_role: old.server_role || profile.server_role,
      role_color: old.role_color || profile.role_color,
      banner_color: old.banner_color || profile.banner_color,
      joined_at: old.joined_at || profile.joined_at,
      in_guild: old.in_guild,
      profile_complete: true,
    };
  });
}

function errorSummary(errors) {
  if (!Array.isArray(errors) || !errors.length) return null;
  const first = errors[0]?.error || errors[0];
  const code = first?.code || first?.status || first?.name || 'ERROR';
  return `${code}: ${first?.message || 'Discord profile lookup failed.'}`;
}

async function buildStaffSnapshot({ refreshAllMembers = false } = {}) {
  const guildId = getGuildId();
  const configuredStaff = Array.isArray(staffConfig.ticketAssignOptions)
    ? staffConfig.ticketAssignOptions
    : [];
  const staffIds = configuredStaff.map(entry => String(entry.userId || '')).filter(Boolean);
  const databaseStaff = await getDatabaseStaffMap();

  let roleMap = new Map();
  let roleError = null;
  let memberRecords = new Map();
  let memberErrors = [];

  if (!guildId) {
    roleError = Object.assign(new Error('DISCORD_GUILD_ID is missing.'), {
      code: 'GUILD_ID_MISSING',
    });
  } else {
    const [roleResult, memberResult] = await Promise.allSettled([
      getGuildRoleMap(guildId),
      getGuildMemberRecords(guildId, staffIds, { force: refreshAllMembers }),
    ]);

    if (roleResult.status === 'fulfilled') {
      roleMap = roleResult.value;
    } else {
      roleError = roleResult.reason;
      console.warn('[STAFF PROFILES] Discord roles unavailable:', roleError.message);
    }

    if (memberResult.status === 'fulfilled') {
      memberRecords = memberResult.value.records;
      memberErrors = memberResult.value.errors;
    } else {
      memberErrors = [{ userId: null, error: memberResult.reason }];
    }
  }

  let profiles = configuredStaff.map(entry => {
    const userId = String(entry.userId || '');
    return buildProfile(
      entry,
      databaseStaff.get(userId) || {},
      memberRecords.get(userId) || null,
      roleMap,
      guildId
    );
  });

  profiles = mergeWithExistingProfiles(profiles);

  profiles.sort((left, right) => {
    const rankCompare = Number(left.rank_order ?? 99) - Number(right.rank_order ?? 99);
    if (rankCompare) return rankCompare;
    return String(left.label || '').localeCompare(String(right.label || ''), undefined, {
      sensitivity: 'base',
    });
  });

  const resolvedCount = profiles.filter(profile => profile.profile_complete).length;
  const inGuildCount = profiles.filter(profile => profile.in_guild === true).length;
  const allErrors = [
    ...(roleError ? [{ userId: null, error: roleError }] : []),
    ...memberErrors,
  ];
  const complete = resolvedCount === profiles.length;
  const tokenAvailable = Boolean(getBotToken());
  const retryable = tokenAvailable
    && Boolean(guildId)
    && memberErrors.some(item => retryableDiscordError(item.error));

  return {
    createdAt: Date.now(),
    data: profiles,
    complete,
    resolvedCount,
    totalCount: profiles.length,
    inGuildCount,
    source: complete ? 'discord' : resolvedCount ? 'partial' : 'configured',
    lastError: errorSummary(allErrors),
    retryable,
  };
}

function clearPartialRetry() {
  if (partialRetryTimer) clearTimeout(partialRetryTimer);
  partialRetryTimer = null;
}

function schedulePartialRetry(snapshot) {
  clearPartialRetry();

  if (snapshot.complete || !snapshot.retryable) {
    if (snapshot.complete) partialRetryAttempt = 0;
    return;
  }

  const delayMs = Math.min(60_000, 2_000 * (2 ** Math.min(partialRetryAttempt, 5)));
  partialRetryAttempt += 1;

  partialRetryTimer = setTimeout(() => {
    partialRetryTimer = null;
    refreshStaffSnapshot({
      forceCache: true,
      refreshAllMembers: false,
    }).catch(error => {
      console.warn('[STAFF PROFILES] Background retry failed:', error.message);
    });
  }, delayMs);
  partialRetryTimer.unref?.();
}

async function refreshStaffSnapshot({
  forceCache = false,
  refreshAllMembers = false,
} = {}) {
  const age = Date.now() - cache.createdAt;
  const ttl = cache.complete ? COMPLETE_CACHE_TTL_MS : PARTIAL_CACHE_TTL_MS;
  const hasFreshCache = Array.isArray(cache.data) && age < ttl;
  const hasStaleCache = Array.isArray(cache.data) && age < STALE_TTL_MS;

  if (!forceCache && hasFreshCache) return cache;
  if (refreshPromise) return refreshPromise;

  refreshPromise = buildStaffSnapshot({ refreshAllMembers })
    .then(snapshot => {
      cache = snapshot;
      schedulePartialRetry(snapshot);
      return cache;
    })
    .catch(error => {
      if (hasStaleCache) {
        cache = {
          ...cache,
          source: cache.complete ? 'stale' : cache.source,
          lastError: `${error.code || error.status || error.name || 'ERROR'}: ${error.message}`,
        };
        return cache;
      }
      throw error;
    })
    .finally(() => {
      refreshPromise = null;
    });

  return refreshPromise;
}

async function loadStaffProfiles({ force = false } = {}) {
  const snapshot = await refreshStaffSnapshot({
    forceCache: force,
    refreshAllMembers: force,
  });
  return snapshot.data;
}

function buildConfiguredFallbackProfiles() {
  const configuredStaff = Array.isArray(staffConfig.ticketAssignOptions)
    ? staffConfig.ticketAssignOptions
    : [];
  return configuredStaff.map(entry => buildProfile(
    entry,
    {},
    null,
    new Map(),
    getGuildId()
  ));
}

function getCachedStaffProfiles() {
  return Array.isArray(cache.data) ? cache.data : null;
}

function getStaffProfileStatus() {
  return {
    hasCache: Array.isArray(cache.data),
    complete: Boolean(cache.complete),
    resolvedCount: Number(cache.resolvedCount || 0),
    totalCount: Number(cache.totalCount || 0),
    inGuildCount: Number(cache.inGuildCount || 0),
    source: cache.source || 'empty',
    lastError: cache.lastError || null,
    ageMs: cache.createdAt ? Math.max(0, Date.now() - cache.createdAt) : null,
    refreshing: Boolean(refreshPromise),
  };
}

function warmStaffProfiles() {
  if (!warmupStarted) warmupStarted = true;
  return refreshStaffSnapshot({
    forceCache: false,
    refreshAllMembers: false,
  }).then(snapshot => snapshot.data).catch(error => {
    console.warn('[STAFF PROFILES] Background warmup failed:', error.message);
    return cache.data || buildConfiguredFallbackProfiles();
  });
}

module.exports = {
  loadStaffProfiles,
  getCachedStaffProfiles,
  getStaffProfileStatus,
  buildConfiguredFallbackProfiles,
  warmStaffProfiles,
};
