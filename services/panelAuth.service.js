'use strict';

const config = require('../config.json');
const authService = require('./auth.service');

const DISCORD_API = 'https://discord.com/api/v10';
const ACCESS_RECHECK_MS = Math.max(1, Number(process.env.ACCESS_RECHECK_MINUTES || 10)) * 60 * 1000;

function cleanSecret(value) {
  const text = String(value || '').trim();
  if ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'"))) {
    return text.slice(1, -1).trim();
  }
  return text;
}

function splitIds(value) {
  return new Set(
    String(value || '')
      .split(',')
      .map((item) => item.trim())
      .filter((item) => /^\d{15,22}$/.test(item))
  );
}

function configuredSchoolRoleIds() {
  return new Set(
    (Array.isArray(config.schoolTicketViewerRoleIds) ? config.schoolTicketViewerRoleIds : [])
      .map(String)
      .filter((item) => /^\d{15,22}$/.test(item))
  );
}

function fullAccessRoleIds() {
  return splitIds(process.env.PANEL_ALLOWED_ROLE_IDS);
}

function allowedUserIds() {
  return splitIds(process.env.PANEL_ALLOWED_USER_IDS);
}

function getGuildId() {
  return String(process.env.DISCORD_GUILD_ID || config.guildId || '').trim();
}

function getClientId() {
  return cleanSecret(process.env.DISCORD_CLIENT_ID || process.env.APPLICATION_ID);
}

function getClientSecret() {
  return cleanSecret(process.env.DISCORD_CLIENT_SECRET);
}

function getBotToken() {
  return cleanSecret(process.env.DISCORD_TOKEN || process.env.TOKEN);
}

async function discordRequest(path, accessToken, tokenType = 'Bearer') {
  const response = await fetch(`${DISCORD_API}${path}`, {
    headers: {
      Authorization: `${tokenType} ${accessToken}`,
      'User-Agent': '5th-Avenue-Web-Panel/7.2',
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
        'User-Agent': '5th-Avenue-Web-Panel/7.2',
      },
      body: requestBody,
      signal: AbortSignal.timeout(15_000),
    });
  } catch (error) {
    throw new authService.AuthError('discord_error', `Unable to contact Discord OAuth: ${error.message}`, 502);
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
    const error = new authService.AuthError(
      'token_exchange_failed',
      discordError === 'invalid_grant'
        ? 'The Discord authorization code expired, was reused, or the OAuth callback URL does not match.'
        : 'Discord rejected the authorization request.',
      401
    );
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
    console.warn('[PANEL AUTH] Unable to fetch guild role names:', error.message);
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

async function resolveAccess(memberRoles) {
  const fullRoles = fullAccessRoleIds();
  const schoolRoles = configuredSchoolRoleIds();
  const memberRoleIds = Array.from(new Set(memberRoles || [])).map(String);
  const matching = memberRoleIds.filter((roleId) => fullRoles.has(roleId) || schoolRoles.has(roleId));
  if (!matching.length) return null;

  const hasFullRole = memberRoleIds.some((roleId) => fullRoles.has(roleId));
  const guildRoles = await fetchGuildRoles();
  const roleMap = new Map(guildRoles.map((role) => [String(role.id), role]));
  matching.sort((left, right) => Number(roleMap.get(right)?.position || 0) - Number(roleMap.get(left)?.position || 0));

  const roleId = matching[0];
  return {
    roleId,
    roleName: roleMap.get(roleId)?.name || (hasFullRole ? 'Authorized Staff' : 'University Staff'),
    accessScope: hasFullRole ? 'full' : 'school_tickets',
  };
}

async function buildAuthorizedUser(discordUser, member) {
  const directUserAccess = allowedUserIds().has(String(discordUser.id));
  const access = await resolveAccess(member.roles || []);

  if (!directUserAccess && !access) {
    const error = new authService.AuthError(
      'not_authorized',
      'Your Discord account does not have an approved Web Panel role.',
      403
    );
    error.userId = String(discordUser.id || '');
    error.username = String(discordUser.username || '');
    throw error;
  }

  const displayName = member.nick || discordUser.global_name || discordUser.username;
  return {
    id: String(discordUser.id),
    username: String(discordUser.username || 'Discord User'),
    globalName: discordUser.global_name || null,
    displayName: String(displayName || discordUser.username || 'Discord User'),
    avatarUrl: guildAvatarUrlFor(member, discordUser) || avatarUrlFor(discordUser),
    guildId: getGuildId(),
    guildNickname: member.nick || null,
    roleId: access?.roleId || null,
    roleName: access?.roleName || 'Panel Owner',
    roles: Array.isArray(member.roles) ? member.roles.map(String) : [],
    accessScope: directUserAccess ? 'full' : (access?.accessScope || 'full'),
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
      throw new authService.AuthError('not_member', 'Your Discord account is not a member of the configured server.', 403);
    }
    throw new authService.AuthError('discord_error', 'Discord could not verify your server membership.', 502);
  }

  return buildAuthorizedUser(discordUser, member);
}

async function verifyCurrentAccess(user) {
  const botToken = getBotToken();
  if (!botToken) return { checked: false, user };

  const lastChecked = new Date(user?.accessCheckedAt || 0).getTime();
  if (Number.isFinite(lastChecked) && Date.now() - lastChecked < ACCESS_RECHECK_MS) {
    return { checked: false, user };
  }

  try {
    const member = await discordRequest(
      `/guilds/${getGuildId()}/members/${encodeURIComponent(user.id)}`,
      botToken,
      'Bot'
    );
    const directUserAccess = allowedUserIds().has(String(user.id));
    const access = await resolveAccess(member.roles || []);

    if (!directUserAccess && !access) {
      return { checked: true, authorized: false, user };
    }

    const discordUser = member.user || user;
    const refreshedUser = {
      ...user,
      guildNickname: member.nick || null,
      displayName: member.nick || discordUser.global_name || user.globalName || user.username,
      avatarUrl: guildAvatarUrlFor(member, discordUser) || avatarUrlFor(discordUser) || user.avatarUrl,
      roleId: access?.roleId || null,
      roleName: access?.roleName || 'Panel Owner',
      roles: Array.isArray(member.roles) ? member.roles.map(String) : [],
      accessScope: directUserAccess ? 'full' : (access?.accessScope || 'full'),
      accessCheckedAt: new Date().toISOString(),
    };

    return { checked: true, authorized: true, user: refreshedUser };
  } catch (error) {
    if (error.status === 404) return { checked: true, authorized: false, user };
    console.warn('[PANEL AUTH] Live role recheck failed; keeping the current session:', error.message);
    return { checked: false, user };
  }
}

module.exports = {
  authenticateAuthorizationCode,
  verifyCurrentAccess,
};
