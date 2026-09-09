'use strict';

const { isPanelOwner } = require('./owner.middleware');

function normalizeRoleName(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function configuredRoleNames() {
  const configured = String(
    process.env.PANEL_MEDIA_MANAGER_ROLE_NAMES
    || 'Owner,Executives Council,Executive Council,Executives'
  );

  return new Set(
    configured
      .split(',')
      .map(normalizeRoleName)
      .filter(Boolean)
  );
}

const MEDIA_MANAGER_ROLE_NAMES = configuredRoleNames();

function isMediaManager(req) {
  if (isPanelOwner(req)) return true;

  const roleName = normalizeRoleName(req.auth?.user?.roleName);
  if (!roleName) return false;
  if (MEDIA_MANAGER_ROLE_NAMES.has(roleName)) return true;

  // Keep common naming variants working without granting access to lower staff ranks.
  return roleName === 'owner'
    || roleName === 'server owner'
    || roleName.includes('executive');
}

function requireMediaManager(req, res, next) {
  if (isMediaManager(req)) return next();

  console.warn(
    `[MEDIA ACCESS] Blocked ${req.method} ${req.originalUrl} for Discord user ${req.auth?.user?.id || 'unknown'} `
    + `with role ${req.auth?.user?.roleName || 'unknown'}.`
  );

  return res.status(403).json({
    error: 'Only the Panel Owner, Owner, and Executives can manage panel media.',
    code: 'MEDIA_MANAGER_REQUIRED',
  });
}

module.exports = {
  MEDIA_MANAGER_ROLE_NAMES,
  normalizeRoleName,
  configuredRoleNames,
  isMediaManager,
  requireMediaManager,
};
