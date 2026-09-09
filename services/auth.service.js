const crypto = require('crypto');
const config = require('../config.json');
const pool = require('../db');

const DISCORD_API = 'https://discord.com/api/v10';
const SESSION_COOKIE = 'fifth_avenue_session';
const OAUTH_STATE_COOKIE = 'fifth_avenue_oauth_state';
const OAUTH_REDIRECT_COOKIE = 'fifth_avenue_oauth_redirect';
const SESSION_HOURS = Math.max(1, Number(process.env.SESSION_HOURS || 8));
const SESSION_MAX_AGE_MS = SESSION_HOURS * 60 * 60 * 1000;
const ACCESS_RECHECK_MS = Math.max(1, Number(process.env.ACCESS_RECHECK_MINUTES || 10)) * 60 * 1000;
const SESSION_CACHE_TTL_MS = 30 * 1000;
const sessionCache = new Map();


function readCachedSession(sessionHash) {
  const cached = sessionCache.get(sessionHash);
  if (!cached) return null;

  const expiresAt = new Date(cached.session.expires_at).getTime();
  if (Date.now() >= cached.cachedUntil || !Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
    sessionCache.delete(sessionHash);
    return null;
  }

  return cached.session;
}

function cacheSession(session) {
  if (!session?.session_hash) return;
  sessionCache.set(session.session_hash, {
    cachedUntil: Date.now() + SESSION_CACHE_TTL_MS,
    session,
  });
}

class AuthError extends Error {
  constructor(code, message, status = 400) {
    super(message);
    this.name = 'AuthError';
    this.code = code;
    this.status = status;
  }
}

function splitIds(value) {
  return new Set(
    String(value || '')
      .split(',')
      .map((item) => item.trim())
      .filter((item) => /^\d{15,22}$/.test(item))
  );
}

function getGuildId() {
  return String(process.env.DISCORD_GUILD_ID || config.guildId || '').trim();
}

function cleanSecret(value) {
  const text = String(value || '').trim();
  if ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'"))) {
    return text.slice(1, -1).trim();
  }
  return text;
}

function getClientId() {
  return cleanSecret(process.env.DISCORD_CLIENT_ID || process.env.APPLICATION_ID);
}

function configuredRedirectUri() {
  return cleanSecret(process.env.DISCORD_REDIRECT_URI);
}

function publicBaseUrl(req) {
  const explicit = cleanSecret(process.env.PUBLIC_URL || process.env.WEB_PANEL_URL);
  if (explicit) return explicit.replace(/\/+$/, '');

  const railwayDomain = cleanSecret(process.env.RAILWAY_PUBLIC_DOMAIN);
  if (railwayDomain) return `https://${railwayDomain.replace(/^https?:\/\//, '').replace(/\/+$/, '')}`;

  if (req) {
    const forwardedProto = String(req.get?.('x-forwarded-proto') || '').split(',')[0].trim();
    const protocol = forwardedProto || req.protocol || 'https';
    const forwardedHost = String(req.get?.('x-forwarded-host') || '').split(',')[0].trim();
    const host = forwardedHost || req.get?.('host');
    if (host) return `${protocol}://${host}`.replace(/\/+$/, '');
  }

  return '';
}

function getRedirectUri(req, cookieRedirectUri = '') {
  const cookieUri = cleanSecret(cookieRedirectUri);
  if (cookieUri) return cookieUri;

  const baseUrl = publicBaseUrl(req);
  if (baseUrl) return `${baseUrl}/auth/discord/callback`;

  const configured = configuredRedirectUri();
  if (configured) return configured;

  throw new AuthError(
    'oauth_configuration',
    'No Discord OAuth callback URL is configured or detectable.',
    500
  );
}

function getSessionSecret() {
  return cleanSecret(process.env.SESSION_SECRET);
}

function getBotToken() {
  return cleanSecret(process.env.DISCORD_TOKEN || process.env.TOKEN);
}

function getClientSecret() {
  return cleanSecret(process.env.DISCORD_CLIENT_SECRET);
}

function getAllowedRoleIds() {
  return splitIds(process.env.PANEL_ALLOWED_ROLE_IDS);
}

function getAllowedUserIds() {
  return splitIds(process.env.PANEL_ALLOWED_USER_IDS);
}

function validateConfiguration() {
  const missing = [];

  if (!getClientId()) missing.push('DISCORD_CLIENT_ID');
  if (!getClientSecret()) missing.push('DISCORD_CLIENT_SECRET');
  if (!configuredRedirectUri() && !cleanSecret(process.env.PUBLIC_URL || process.env.WEB_PANEL_URL) && !cleanSecret(process.env.RAILWAY_PUBLIC_DOMAIN)) {
    console.warn('[AUTH CONFIG] DISCORD_REDIRECT_URI is not set. The callback will be detected from the public request URL.');
  }
  if (!getGuildId()) missing.push('DISCORD_GUILD_ID or config.json guildId');
  if (getSessionSecret().length < 32) missing.push('SESSION_SECRET (minimum 32 characters)');

  const allowedRoles = getAllowedRoleIds();
  const allowedUsers = getAllowedUserIds();
  if (!allowedRoles.size && !allowedUsers.size) {
    missing.push('PANEL_ALLOWED_ROLE_IDS or PANEL_ALLOWED_USER_IDS');
  }

  if (missing.length) {
    throw new Error(`[AUTH CONFIG] Missing or invalid: ${missing.join(', ')}`);
  }
}

async function initAuthTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS web_sessions (
      session_hash TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      user_data JSONB NOT NULL,
      csrf_token TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      last_seen_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      expires_at TIMESTAMPTZ NOT NULL
    )
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_web_sessions_expires_at
    ON web_sessions (expires_at)
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS web_auth_events (
      id BIGSERIAL PRIMARY KEY,
      user_id TEXT,
      username TEXT,
      event_type TEXT NOT NULL,
      ip_address TEXT,
      user_agent TEXT,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS web_rate_limits (
      rate_key TEXT PRIMARY KEY,
      attempts INTEGER NOT NULL DEFAULT 0,
      reset_at TIMESTAMPTZ NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_web_rate_limits_reset_at
    ON web_rate_limits (reset_at)
  `);

  await cleanupExpiredSessions();
  console.log('[AUTH] Secure Discord login tables are ready.');
}

function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('base64url');
}

function hashToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

function signValue(value) {
  return crypto
    .createHmac('sha256', getSessionSecret())
    .update(String(value))
    .digest('base64url');
}

function safeEqual(left, right) {
  const leftBuffer = Buffer.from(String(left || ''));
  const rightBuffer = Buffer.from(String(right || ''));
  if (leftBuffer.length !== rightBuffer.length) return false;
  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function createOAuthState() {
  const nonce = randomToken(32);
  return `${nonce}.${signValue(nonce)}`;
}

function verifyOAuthState(queryState, cookieState) {
  if (!queryState || !cookieState || !safeEqual(queryState, cookieState)) return false;
  const [nonce, signature] = String(queryState).split('.');
  if (!nonce || !signature) return false;
  return safeEqual(signature, signValue(nonce));
}

function cookieSecure() {
  return String(process.env.COOKIE_SECURE || 'true').toLowerCase() !== 'false';
}

function buildCookie(name, value, options = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`, 'Path=/', 'HttpOnly', 'SameSite=Lax'];
  if (cookieSecure()) parts.push('Secure');
  if (Number.isFinite(options.maxAgeSeconds)) {
    parts.push(`Max-Age=${Math.max(0, Math.floor(options.maxAgeSeconds))}`);
  }
  return parts.join('; ');
}

function setOAuthStateCookie(res, state) {
  res.append('Set-Cookie', buildCookie(OAUTH_STATE_COOKIE, state, { maxAgeSeconds: 600 }));
}

function clearOAuthStateCookie(res) {
  res.append('Set-Cookie', buildCookie(OAUTH_STATE_COOKIE, '', { maxAgeSeconds: 0 }));
}

function setOAuthRedirectCookie(res, redirectUri) {
  const value = `${redirectUri}.${signValue(redirectUri)}`;
  res.append('Set-Cookie', buildCookie(OAUTH_REDIRECT_COOKIE, value, { maxAgeSeconds: 600 }));
}

function getOAuthRedirectCookie(req) {
  const value = parseCookies(req)[OAUTH_REDIRECT_COOKIE] || '';
  const separator = value.lastIndexOf('.');
  if (separator < 1) return '';
  const redirectUri = value.slice(0, separator);
  const signature = value.slice(separator + 1);
  return safeEqual(signature, signValue(redirectUri)) ? redirectUri : '';
}

function clearOAuthRedirectCookie(res) {
  res.append('Set-Cookie', buildCookie(OAUTH_REDIRECT_COOKIE, '', { maxAgeSeconds: 0 }));
}

function setSessionCookie(res, rawToken) {
  res.append(
    'Set-Cookie',
    buildCookie(SESSION_COOKIE, rawToken, { maxAgeSeconds: Math.floor(SESSION_MAX_AGE_MS / 1000) })
  );
}

function clearSessionCookie(res) {
  res.append('Set-Cookie', buildCookie(SESSION_COOKIE, '', { maxAgeSeconds: 0 }));
}

function parseCookies(req) {
  const output = {};
  const header = String(req.headers.cookie || '');
  for (const pair of header.split(';')) {
    const separator = pair.indexOf('=');
    if (separator < 0) continue;
    const key = pair.slice(0, separator).trim();
    const value = pair.slice(separator + 1).trim();
    if (!key) continue;
    try {
      output[key] = decodeURIComponent(value);
    } catch {
      output[key] = value;
    }
  }
  return output;
}

function getSessionToken(req) {
  return parseCookies(req)[SESSION_COOKIE] || null;
}

function getOAuthStateCookie(req) {
  return parseCookies(req)[OAUTH_STATE_COOKIE] || null;
}

async function createSession(user) {
  const rawToken = randomToken(48);
  const sessionHash = hashToken(rawToken);
  const csrfToken = randomToken(32);
  const expiresAt = new Date(Date.now() + SESSION_MAX_AGE_MS);

  await pool.query(
    `
      INSERT INTO web_sessions (
        session_hash,
        user_id,
        user_data,
        csrf_token,
        expires_at
      )
      VALUES ($1, $2, $3::jsonb, $4, $5)
    `,
    [sessionHash, user.id, JSON.stringify(user), csrfToken, expiresAt]
  );

  return { rawToken, csrfToken, expiresAt };
}

async function loadSession(rawToken) {
  if (!rawToken) return null;

  const sessionHash = hashToken(rawToken);
  const cached = readCachedSession(sessionHash);
  if (cached) return cached;

  const result = await pool.query(
    `
      SELECT session_hash, user_id, user_data, csrf_token, created_at, last_seen_at, expires_at
      FROM web_sessions
      WHERE session_hash = $1
        AND expires_at > CURRENT_TIMESTAMP
      LIMIT 1
    `,
    [sessionHash]
  );

  if (!result.rows.length) {
    sessionCache.delete(sessionHash);
    return null;
  }

  const session = result.rows[0];
  cacheSession(session);

  const lastSeen = new Date(session.last_seen_at).getTime();
  if (!Number.isFinite(lastSeen) || Date.now() - lastSeen > 60_000) {
    pool.query(
      `UPDATE web_sessions SET last_seen_at = CURRENT_TIMESTAMP WHERE session_hash = $1`,
      [session.session_hash]
    ).catch(() => {});
  }

  return session;
}

async function updateSessionUser(sessionHash, user) {
  await pool.query(
    `
      UPDATE web_sessions
      SET user_data = $2::jsonb,
          last_seen_at = CURRENT_TIMESTAMP
      WHERE session_hash = $1
    `,
    [sessionHash, JSON.stringify(user)]
  );

  const cached = sessionCache.get(sessionHash);
  if (cached?.session) {
    cached.session.user_data = user;
    cached.session.last_seen_at = new Date();
    cached.cachedUntil = Date.now() + SESSION_CACHE_TTL_MS;
  }
}

async function deleteSession(rawToken) {
  if (!rawToken) return;
  const sessionHash = hashToken(rawToken);
  sessionCache.delete(sessionHash);
  await pool.query('DELETE FROM web_sessions WHERE session_hash = $1', [sessionHash]);
}

async function cleanupExpiredSessions() {
  await Promise.all([
    pool.query('DELETE FROM web_sessions WHERE expires_at <= CURRENT_TIMESTAMP'),
    pool.query("DELETE FROM web_rate_limits WHERE reset_at < CURRENT_TIMESTAMP - INTERVAL '1 day'"),
  ]);
  const now = Date.now();
  for (const [sessionHash, cached] of sessionCache.entries()) {
    const expiresAt = new Date(cached?.session?.expires_at).getTime();
    if (!Number.isFinite(expiresAt) || expiresAt <= now || cached.cachedUntil <= now) {
      sessionCache.delete(sessionHash);
    }
  }
}

async function consumeRateLimit(rateKey, options = {}) {
  const windowSeconds = Math.max(60, Number(options.windowSeconds || 600));
  const maxAttempts = Math.max(1, Number(options.maxAttempts || 25));
  const key = String(rateKey || 'unknown').slice(0, 250);

  const result = await pool.query(
    `
    INSERT INTO web_rate_limits (rate_key, attempts, reset_at, updated_at)
    VALUES ($1, 1, CURRENT_TIMESTAMP + ($2::INTEGER * INTERVAL '1 second'), CURRENT_TIMESTAMP)
    ON CONFLICT (rate_key)
    DO UPDATE SET
      attempts = CASE
        WHEN web_rate_limits.reset_at <= CURRENT_TIMESTAMP THEN 1
        ELSE web_rate_limits.attempts + 1
      END,
      reset_at = CASE
        WHEN web_rate_limits.reset_at <= CURRENT_TIMESTAMP
          THEN CURRENT_TIMESTAMP + ($2::INTEGER * INTERVAL '1 second')
        ELSE web_rate_limits.reset_at
      END,
      updated_at = CURRENT_TIMESTAMP
    RETURNING attempts, reset_at
    `,
    [key, windowSeconds]
  );

  const record = result.rows[0];
  return {
    allowed: Number(record.attempts) <= maxAttempts,
    attempts: Number(record.attempts),
    maxAttempts,
    resetAt: record.reset_at,
  };
}

function getAuthorizationUrl(state, redirectUri) {
  const params = new URLSearchParams({
    client_id: getClientId(),
    response_type: 'code',
    redirect_uri: redirectUri,
    scope: 'identify guilds.members.read',
    state,
    prompt: 'consent',
  });
  return `https://discord.com/oauth2/authorize?${params.toString()}`;
}

async function discordRequest(path, accessToken, tokenType = 'Bearer') {
  const response = await fetch(`${DISCORD_API}${path}`, {
    headers: {
      Authorization: `${tokenType} ${accessToken}`,
      'User-Agent': '5th-Avenue-Web-Panel/7.0',
    },
    signal: AbortSignal.timeout(12_000),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    const error = new Error(`Discord API returned HTTP ${response.status}.`);
    error.status = response.status;
    error.body = body.slice(0, 300);
    throw error;
  }

  return response.json();
}

async function exchangeAuthorizationCode(code, redirectUri) {
  const requestBody = new URLSearchParams({
    client_id: getClientId(),
    client_secret: getClientSecret(),
    grant_type: 'authorization_code',
    code: String(code || '').trim(),
    redirect_uri: redirectUri,
  });

  let response;
  try {
    response = await fetch(`${DISCORD_API}/oauth2/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': '5th-Avenue-Web-Panel/7.1',
      },
      body: requestBody,
      signal: AbortSignal.timeout(15_000),
    });
  } catch (error) {
    throw new AuthError('discord_error', `Unable to contact Discord OAuth: ${error.message}`, 502);
  }

  const rawBody = await response.text().catch(() => '');
  let body = {};
  try {
    body = rawBody ? JSON.parse(rawBody) : {};
  } catch (_) {
    body = {};
  }

  if (!response.ok || !body.access_token) {
    const discordError = String(body.error || `http_${response.status}`);
    const discordDescription = String(body.error_description || rawBody || 'No response details.').slice(0, 500);

    console.error(
      `[AUTH TOKEN ERROR] HTTP ${response.status} ${discordError}: ${discordDescription} | redirect_uri=${redirectUri}`
    );

    const message = discordError === 'invalid_grant'
      ? 'The Discord authorization code expired, was reused, or the OAuth callback URL does not match.'
      : discordError === 'invalid_client'
        ? 'Discord rejected the Client ID or Client Secret configured in Railway.'
        : 'Discord rejected the authorization request.';

    const error = new AuthError('token_exchange_failed', message, 401);
    error.discordError = discordError;
    error.discordDescription = discordDescription;
    throw error;
  }

  return body.access_token;
}

async function fetchGuildRoles() {
  const botToken = getBotToken();
  if (!botToken) return [];

  try {
    return await discordRequest(`/guilds/${getGuildId()}/roles`, botToken, 'Bot');
  } catch (error) {
    console.warn('[AUTH] Unable to fetch guild role names:', error.message);
    return [];
  }
}

function defaultAvatarUrlFor(user) {
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

function avatarUrlFor(user) {
  if (!user?.id) return null;
  if (!user.avatar) return defaultAvatarUrlFor(user);
  const extension = String(user.avatar).startsWith('a_') ? 'gif' : 'png';
  return `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.${extension}?size=256`;
}

function guildAvatarUrlFor(member, user) {
  if (!member?.avatar || !user?.id) return null;
  const extension = String(member.avatar).startsWith('a_') ? 'gif' : 'png';
  return `https://cdn.discordapp.com/guilds/${getGuildId()}/users/${user.id}/avatars/${member.avatar}.${extension}?size=256`;
}

async function resolveAuthorizedRole(memberRoles) {
  const allowedRoleIds = getAllowedRoleIds();
  const matchingRoleIds = Array.from(new Set(memberRoles || [])).filter((roleId) => allowedRoleIds.has(roleId));
  if (!matchingRoleIds.length) return null;

  const guildRoles = await fetchGuildRoles();
  const roleMap = new Map(guildRoles.map((role) => [String(role.id), role]));
  matchingRoleIds.sort((left, right) => {
    const leftPosition = Number(roleMap.get(left)?.position || 0);
    const rightPosition = Number(roleMap.get(right)?.position || 0);
    return rightPosition - leftPosition;
  });

  const roleId = matchingRoleIds[0];
  return {
    id: roleId,
    name: roleMap.get(roleId)?.name || 'Authorized Staff',
  };
}

async function buildAuthorizedUser(discordUser, member) {
  const allowedUserIds = getAllowedUserIds();
  const directUserAccess = allowedUserIds.has(String(discordUser.id));
  const authorizedRole = await resolveAuthorizedRole(member.roles || []);

  if (!directUserAccess && !authorizedRole) {
    throw new AuthError(
      'not_authorized',
      'Your Discord account does not have an approved Web Panel role.',
      403
    );
  }

  const displayName = member.nick || discordUser.global_name || discordUser.username;
  const role = authorizedRole || { id: null, name: 'Panel Owner' };

  return {
    id: String(discordUser.id),
    username: String(discordUser.username || 'Discord User'),
    globalName: discordUser.global_name || null,
    displayName: String(displayName || discordUser.username || 'Discord User'),
    avatarUrl: guildAvatarUrlFor(member, discordUser) || avatarUrlFor(discordUser),
    guildId: getGuildId(),
    guildNickname: member.nick || null,
    roleId: role.id,
    roleName: role.name,
    roles: Array.isArray(member.roles) ? member.roles.map(String) : [],
    accessCheckedAt: new Date().toISOString(),
    authenticatedAt: new Date().toISOString(),
  };
}

async function authenticateAuthorizationCode(code, redirectUri) {
  const accessToken = await exchangeAuthorizationCode(code, redirectUri);
  const discordUser = await discordRequest('/users/@me', accessToken);

  let member;
  try {
    member = await discordRequest(`/users/@me/guilds/${getGuildId()}/member`, accessToken);
  } catch (error) {
    if (error.status === 404) {
      throw new AuthError('not_member', 'Your Discord account is not a member of the configured server.', 403);
    }
    throw new AuthError('discord_error', 'Discord could not verify your server membership.', 502);
  }

  return buildAuthorizedUser(discordUser, member);
}

async function verifyCurrentAccess(user) {
  const botToken = getBotToken();
  if (!botToken) return { checked: false, user };

  const lastChecked = new Date(user.accessCheckedAt || 0).getTime();
  if (Number.isFinite(lastChecked) && Date.now() - lastChecked < ACCESS_RECHECK_MS) {
    return { checked: false, user };
  }

  try {
    const member = await discordRequest(
      `/guilds/${getGuildId()}/members/${encodeURIComponent(user.id)}`,
      botToken,
      'Bot'
    );

    const authorizedRole = await resolveAuthorizedRole(member.roles || []);
    const directUserAccess = getAllowedUserIds().has(String(user.id));
    if (!directUserAccess && !authorizedRole) {
      return { checked: true, authorized: false, user };
    }

    const refreshedUser = {
      ...user,
      guildNickname: member.nick || null,
      displayName: member.nick || user.globalName || user.username,
      avatarUrl: guildAvatarUrlFor(member, member.user || user) || avatarUrlFor(member.user || user) || user.avatarUrl,
      roleId: authorizedRole?.id || null,
      roleName: authorizedRole?.name || 'Panel Owner',
      roles: Array.isArray(member.roles) ? member.roles.map(String) : [],
      accessCheckedAt: new Date().toISOString(),
    };

    return { checked: true, authorized: true, user: refreshedUser };
  } catch (error) {
    if (error.status === 404) {
      return { checked: true, authorized: false, user };
    }

    console.warn('[AUTH] Live role recheck failed; keeping the current session:', error.message);
    return { checked: false, user };
  }
}

async function logAuthEvent({ userId, username, eventType, req, metadata = {} }) {
  try {
    await pool.query(
      `
        INSERT INTO web_auth_events (
          user_id,
          username,
          event_type,
          ip_address,
          user_agent,
          metadata
        )
        VALUES ($1, $2, $3, $4, $5, $6::jsonb)
      `,
      [
        userId || null,
        username || null,
        eventType,
        String(req?.ip || '').slice(0, 128) || null,
        String(req?.get?.('user-agent') || '').slice(0, 500) || null,
        JSON.stringify(metadata || {}),
      ]
    );
  } catch (error) {
    console.warn('[AUTH AUDIT] Unable to save event:', error.message);
  }
}


async function getAccessLogsOverview({ limit = 200, eventLimit = null } = {}) {
  const requestedLimit = eventLimit ?? limit;
  const safeLimit = Math.min(500, Math.max(20, Number(requestedLimit) || 200));
  await cleanupExpiredSessions();

  const [sessionResult, eventResult, summaryResult] = await Promise.all([
    pool.query(`
      SELECT
        s.user_id,
        s.user_data,
        s.created_at,
        s.last_seen_at,
        s.expires_at,
        latest.ip_address,
        latest.user_agent
      FROM web_sessions s
      LEFT JOIN LATERAL (
        SELECT ip_address, user_agent
        FROM web_auth_events e
        WHERE e.user_id = s.user_id
          AND e.event_type = 'login_success'
        ORDER BY e.created_at DESC
        LIMIT 1
      ) latest ON TRUE
      WHERE s.expires_at > CURRENT_TIMESTAMP
      ORDER BY s.last_seen_at DESC
    `),
    pool.query(`
      SELECT user_id, username, event_type, ip_address, user_agent, metadata, created_at
      FROM web_auth_events
      ORDER BY created_at DESC
      LIMIT $1
    `, [safeLimit]),
    pool.query(`
      SELECT
        COUNT(DISTINCT user_id) FILTER (
          WHERE expires_at > CURRENT_TIMESTAMP
            AND last_seen_at >= CURRENT_TIMESTAMP - INTERVAL '2 minutes'
        )::INTEGER AS online_users,
        COUNT(*) FILTER (WHERE expires_at > CURRENT_TIMESTAMP)::INTEGER AS active_sessions,
        (SELECT COUNT(*)::INTEGER FROM web_auth_events
          WHERE event_type = 'login_success'
            AND created_at >= CURRENT_TIMESTAMP - INTERVAL '24 hours') AS authorized_24h,
        (SELECT COUNT(*)::INTEGER FROM web_auth_events
          WHERE event_type = 'login_denied'
            AND created_at >= CURRENT_TIMESTAMP - INTERVAL '24 hours') AS denied_24h
      FROM web_sessions
    `),
  ]);

  const sessions = sessionResult.rows.map((row) => {
    const user = row.user_data && typeof row.user_data === 'object' ? row.user_data : {};
    return {
      userId: String(row.user_id || user.id || ''),
      username: user.username || null,
      displayName: user.displayName || user.globalName || user.username || 'Unknown User',
      avatarUrl: user.avatarUrl || null,
      roleName: user.roleName || 'Authorized Staff',
      ipAddress: row.ip_address || null,
      userAgent: row.user_agent || null,
      createdAt: row.created_at,
      lastSeenAt: row.last_seen_at,
      expiresAt: row.expires_at,
      isOnline: new Date(row.last_seen_at).getTime() >= Date.now() - 120000,
    };
  });

  const events = eventResult.rows.map((row) => ({
    userId: row.user_id || null,
    username: row.username || null,
    eventType: row.event_type,
    ipAddress: row.ip_address || null,
    userAgent: row.user_agent || null,
    metadata: row.metadata && typeof row.metadata === 'object' ? row.metadata : {},
    createdAt: row.created_at,
  }));

  const summary = summaryResult.rows[0] || {};
  return {
    sessions,
    events,
    summary: {
      onlineUsers: Number(summary.online_users || 0),
      activeSessions: Number(summary.active_sessions || 0),
      authorized24h: Number(summary.authorized_24h || 0),
      denied24h: Number(summary.denied_24h || 0),
    },
    generatedAt: new Date().toISOString(),
  };
}

module.exports = {
  AuthError,
  SESSION_COOKIE,
  OAUTH_STATE_COOKIE,
  OAUTH_REDIRECT_COOKIE,
  validateConfiguration,
  initAuthTables,
  createOAuthState,
  verifyOAuthState,
  setOAuthStateCookie,
  clearOAuthStateCookie,
  setOAuthRedirectCookie,
  getOAuthRedirectCookie,
  clearOAuthRedirectCookie,
  setSessionCookie,
  clearSessionCookie,
  getOAuthStateCookie,
  getSessionToken,
  createSession,
  loadSession,
  updateSessionUser,
  deleteSession,
  cleanupExpiredSessions,
  consumeRateLimit,
  getRedirectUri,
  getAuthorizationUrl,
  authenticateAuthorizationCode,
  verifyCurrentAccess,
  safeEqual,
  logAuthEvent,
  getAccessLogsOverview,
};
