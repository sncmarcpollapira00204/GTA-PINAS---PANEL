'use strict';

const pool = require('../db');
const { configuredOwnerIds } = require('../middleware/owner.middleware');

const DISCORD_API = 'https://discord.com/api/v10';
let schemaReady = false;
let schemaPromise = null;

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

function getGuildId() {
  return cleanSecret(process.env.DISCORD_GUILD_ID || process.env.GUILD_ID);
}

function getBotToken() {
  return cleanSecret(process.env.DISCORD_TOKEN || process.env.TOKEN);
}

function getAllowedRoleIds() {
  return splitIds(process.env.PANEL_ALLOWED_ROLE_IDS);
}

function getAllowedUserIds() {
  return splitIds(process.env.PANEL_ALLOWED_USER_IDS);
}

async function ensureSchema() {
  if (schemaReady) return;
  if (schemaPromise) return schemaPromise;

  schemaPromise = (async () => {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS panel_access_revocations (
        discord_id TEXT PRIMARY KEY,
        username TEXT,
        display_name TEXT,
        revoked_by TEXT NOT NULL,
        revoked_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_panel_access_revocations_revoked_at
      ON panel_access_revocations (revoked_at DESC)
    `);
    schemaReady = true;
  })().finally(() => {
    schemaPromise = null;
  });

  return schemaPromise;
}

async function discordRequest(path) {
  const token = getBotToken();
  if (!token) {
    const error = new Error('DISCORD_TOKEN/TOKEN is missing from the Web Panel Railway variables.');
    error.code = 'DISCORD_TOKEN_MISSING';
    error.status = 503;
    throw error;
  }

  const response = await fetch(`${DISCORD_API}${path}`, {
    headers: {
      Authorization: `Bot ${token}`,
      'User-Agent': '5th-Avenue-Web-Panel-Access-Manager/2.0',
    },
    signal: AbortSignal.timeout(15_000),
  });

  const raw = await response.text().catch(() => '');
  let payload = null;
  try {
    payload = raw ? JSON.parse(raw) : null;
  } catch (_) {
    payload = null;
  }

  if (!response.ok) {
    const error = new Error(
      response.status === 403
        ? 'Discord did not allow the Web Panel to read the server member list. Enable the Server Members intent for the bot.'
        : `Discord API returned HTTP ${response.status}.`
    );
    error.status = response.status === 403 ? 503 : 502;
    error.code = payload?.code || `DISCORD_HTTP_${response.status}`;
    error.discordMessage = payload?.message || raw.slice(0, 300);
    throw error;
  }

  return payload;
}

function discordAvatarUrl(user) {
  if (!user?.id) return null;
  if (!user.avatar) return null;
  const extension = String(user.avatar).startsWith('a_') ? 'gif' : 'png';
  return `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.${extension}?size=128`;
}

async function fetchAllGuildMembers() {
  const guildId = getGuildId();
  if (!guildId) {
    const error = new Error('DISCORD_GUILD_ID/GUILD_ID is missing from the Web Panel Railway variables.');
    error.code = 'GUILD_ID_MISSING';
    error.status = 503;
    throw error;
  }

  const members = [];
  let after = '';

  for (let page = 0; page < 20; page += 1) {
    const query = new URLSearchParams({ limit: '1000' });
    if (after) query.set('after', after);
    const batch = await discordRequest(`/guilds/${guildId}/members?${query.toString()}`);
    if (!Array.isArray(batch)) break;
    members.push(...batch);
    if (batch.length < 1000) break;
    after = String(batch[batch.length - 1]?.user?.id || '');
    if (!after) break;
  }

  return members;
}

async function fetchGuildRoles() {
  const guildId = getGuildId();
  const roles = await discordRequest(`/guilds/${guildId}/roles`);
  return Array.isArray(roles) ? roles : [];
}

function identityFor(member) {
  const user = member?.user || {};
  return {
    discordId: String(user.id || ''),
    username: String(user.username || 'Unknown User'),
    displayName: String(member?.nick || user.global_name || user.username || 'Unknown User'),
    avatarUrl: discordAvatarUrl(user),
    roles: Array.isArray(member?.roles) ? member.roles.map(String) : [],
  };
}

function assertManageableTarget(discordId) {
  if (configuredOwnerIds().has(String(discordId))) {
    const error = new Error('The protected Panel Owner account cannot have its panel access removed.');
    error.code = 'PANEL_OWNER_PROTECTED';
    error.status = 409;
    throw error;
  }
}

async function isPanelAccessRevoked(discordId) {
  const id = String(discordId || '').trim();
  if (!id) return false;
  await ensureSchema();
  const result = await pool.query(
    'SELECT 1 FROM panel_access_revocations WHERE discord_id = $1 LIMIT 1',
    [id]
  );
  return result.rows.length > 0;
}

async function listPanelAdmins() {
  await ensureSchema();

  const [members, guildRoles, revokedResult] = await Promise.all([
    fetchAllGuildMembers(),
    fetchGuildRoles(),
    pool.query(`
      SELECT discord_id, username, display_name, revoked_by, revoked_at
      FROM panel_access_revocations
      ORDER BY revoked_at DESC
    `),
  ]);

  const allowedRoleIds = getAllowedRoleIds();
  const allowedUserIds = getAllowedUserIds();
  const roleMap = new Map(guildRoles.map((role) => [String(role.id), String(role.name || 'Unknown Role')]));
  const revokedMap = new Map(revokedResult.rows.map((row) => [String(row.discord_id), row]));

  const staff = members
    .map(identityFor)
    .filter((member) => {
      if (!member.discordId) return false;
      return allowedUserIds.has(member.discordId)
        || member.roles.some((roleId) => allowedRoleIds.has(roleId));
    })
    .map((member) => {
      const matchingRoles = member.roles
        .filter((roleId) => allowedRoleIds.has(roleId))
        .map((roleId) => ({ id: roleId, name: roleMap.get(roleId) || 'Authorized Role' }));
      const revoked = revokedMap.get(member.discordId) || null;
      return {
        ...member,
        authorizedRoles: matchingRoles,
        directUserAccess: allowedUserIds.has(member.discordId),
        panelAccess: revoked ? 'removed' : 'active',
        revokedBy: revoked?.revoked_by || null,
        revokedAt: revoked?.revoked_at || null,
        protected: configuredOwnerIds().has(member.discordId),
      };
    })
    .sort((left, right) => {
      if (left.panelAccess !== right.panelAccess) return left.panelAccess === 'active' ? -1 : 1;
      return left.displayName.localeCompare(right.displayName, undefined, { sensitivity: 'base' });
    });

  return {
    staff,
    summary: {
      totalEligible: staff.length,
      activeAccess: staff.filter((item) => item.panelAccess === 'active').length,
      removedAccess: staff.filter((item) => item.panelAccess === 'removed').length,
    },
  };
}

async function removePanelAccess({ discordId, actorId }) {
  await ensureSchema();
  assertManageableTarget(discordId);

  const guildId = getGuildId();
  let member;
  try {
    member = await discordRequest(`/guilds/${guildId}/members/${encodeURIComponent(discordId)}`);
  } catch (error) {
    if (error.code !== 10007 && error.code !== 'DISCORD_HTTP_404') throw error;
    member = null;
  }

  const identity = member
    ? identityFor(member)
    : { discordId, username: null, displayName: discordId, avatarUrl: null, roles: [] };

  const allowedByRole = identity.roles.some((roleId) => getAllowedRoleIds().has(roleId));
  const allowedDirectly = getAllowedUserIds().has(discordId);
  if (!allowedByRole && !allowedDirectly) {
    const error = new Error('This Discord user does not currently have Web Panel permission.');
    error.code = 'PANEL_ACCESS_NOT_FOUND';
    error.status = 404;
    throw error;
  }

  await pool.query(
    `
      INSERT INTO panel_access_revocations (discord_id, username, display_name, revoked_by, revoked_at)
      VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
      ON CONFLICT (discord_id)
      DO UPDATE SET
        username = EXCLUDED.username,
        display_name = EXCLUDED.display_name,
        revoked_by = EXCLUDED.revoked_by,
        revoked_at = CURRENT_TIMESTAMP
    `,
    [discordId, identity.username, identity.displayName, actorId]
  );

  await pool.query('DELETE FROM web_sessions WHERE user_id = $1', [discordId]);

  return {
    ...identity,
    panelAccess: 'removed',
  };
}

module.exports = {
  ensureSchema,
  isPanelAccessRevoked,
  listPanelAdmins,
  removePanelAccess,
};
