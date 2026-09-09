'use strict';

const { isPanelOwner } = require('./owner.middleware');

const DEFAULT_STAFF_MANAGER_ROLE_IDS = Object.freeze([
  '1501546329682346064',
  '1501546391082766416',
  '1501546425492836393',
]);

function configuredStaffManagerRoleIds() {
  const configured = String(
    process.env.PANEL_STAFF_MANAGER_ROLE_IDS
    || DEFAULT_STAFF_MANAGER_ROLE_IDS.join(',')
  );

  const ids = configured
    .split(',')
    .map((value) => value.trim())
    .filter((value) => /^\d{15,22}$/.test(value));

  return new Set(ids.length ? ids : DEFAULT_STAFF_MANAGER_ROLE_IDS);
}

const STAFF_MANAGER_ROLE_IDS = configuredStaffManagerRoleIds();

function isStaffManager(req) {
  if (isPanelOwner(req)) return true;

  const roles = Array.isArray(req.auth?.user?.roles)
    ? req.auth.user.roles.map(String)
    : [];

  return roles.some((roleId) => STAFF_MANAGER_ROLE_IDS.has(roleId));
}

function logBlockedStaffManagement(req) {
  console.warn(
    `[STAFF MANAGEMENT ACCESS] Blocked ${req.method} ${req.originalUrl} for Discord user ${req.auth?.user?.id || 'unknown'}.`
  );
}

function requireStaffManager(req, res, next) {
  if (isStaffManager(req)) return next();
  logBlockedStaffManagement(req);
  return res.status(403).json({
    error: 'Only Owner and Executive management can manage staff.',
    code: 'STAFF_MANAGER_REQUIRED',
  });
}

function requireStaffManagerHidden(req, res, next) {
  if (isStaffManager(req)) return next();
  logBlockedStaffManagement(req);
  return res.status(404).json({
    error: 'Not found.',
    code: 'NOT_FOUND',
  });
}

module.exports = {
  DEFAULT_STAFF_MANAGER_ROLE_IDS,
  STAFF_MANAGER_ROLE_IDS,
  configuredStaffManagerRoleIds,
  isStaffManager,
  requireStaffManager,
  requireStaffManagerHidden,
};
