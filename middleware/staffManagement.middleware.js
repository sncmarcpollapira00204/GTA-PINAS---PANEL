'use strict';

const { isPanelOwner } = require('./owner.middleware');

const DEFAULT_PANEL_MODERATOR_ROLE_NAMES = Object.freeze([
  'Panel Moderator',
]);

function configuredPanelModeratorRoleIds() {
  const configured = String(process.env.PANEL_MODERATOR_ROLE_IDS || '');
  return new Set(
    configured
      .split(',')
      .map((value) => value.trim())
      .filter((value) => /^\d{15,22}$/.test(value))
  );
}

const PANEL_MODERATOR_ROLE_IDS = configuredPanelModeratorRoleIds();

function isPanelModerator(req) {
  if (isPanelOwner(req)) return true;

  const user = req.auth?.user || {};
  const roleName = String(user.roleName || '').trim().toLowerCase();
  if (DEFAULT_PANEL_MODERATOR_ROLE_NAMES.some((name) => name.toLowerCase() === roleName)) {
    return true;
  }

  const roles = Array.isArray(user.roles) ? user.roles.map(String) : [];
  return roles.some((roleId) => PANEL_MODERATOR_ROLE_IDS.has(roleId));
}

function logBlockedPanelModeratorAccess(req) {
  console.warn(
    `[PANEL MODERATOR ACCESS] Blocked ${req.method} ${req.originalUrl} for Discord user ${req.auth?.user?.id || 'unknown'}.`
  );
}

function requirePanelModerator(req, res, next) {
  if (isPanelModerator(req)) return next();

  logBlockedPanelModeratorAccess(req);
  return res.status(403).json({
    error: 'Only Panel Moderator can access this.',
    code: 'PANEL_MODERATOR_REQUIRED',
  });
}

function requirePanelModeratorHidden(req, res, next) {
  if (isPanelModerator(req)) return next();

  logBlockedPanelModeratorAccess(req);
  return res.status(403).json({
    error: 'Only Panel Moderator can access this.',
    code: 'PANEL_MODERATOR_REQUIRED',
  });
}

module.exports = {
  DEFAULT_PANEL_MODERATOR_ROLE_NAMES,
  PANEL_MODERATOR_ROLE_IDS,
  configuredPanelModeratorRoleIds,
  isPanelModerator,
  requirePanelModerator,
  requirePanelModeratorHidden,
};
