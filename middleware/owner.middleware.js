'use strict';

const DEFAULT_PANEL_OWNER_USER_ID = '735045975378362401';

function configuredOwnerIds() {
  const configured = String(
    process.env.PANEL_OWNER_USER_IDS ||
    process.env.PANEL_OWNER_USER_ID ||
    DEFAULT_PANEL_OWNER_USER_ID
  );

  const ids = configured
    .split(',')
    .map((value) => value.trim())
    .filter((value) => /^\d{15,22}$/.test(value));

  return new Set(ids.length ? ids : [DEFAULT_PANEL_OWNER_USER_ID]);
}

const PANEL_OWNER_USER_IDS = configuredOwnerIds();
const PANEL_OWNER_USER_ID = PANEL_OWNER_USER_IDS.values().next().value;

function getAuthenticatedUserId(req) {
  return String(
    req.auth?.user?.id ||
    req.user?.id ||
    req.session?.user?.id ||
    ''
  );
}

function isPanelOwner(req) {
  return PANEL_OWNER_USER_IDS.has(getAuthenticatedUserId(req));
}

function logBlockedOwnerAccess(req) {
  console.warn(
    `[OWNER ACCESS] Blocked ${req.method} ${req.originalUrl} for Discord user ${getAuthenticatedUserId(req) || 'unknown'}.`
  );
}

function requirePanelOwner(req, res, next) {
  if (isPanelOwner(req)) {
    return next();
  }

  logBlockedOwnerAccess(req);

  return res.status(403).json({
    error: 'This action is available only to the panel owner.',
    code: 'OWNER_ONLY',
  });
}

// Use this for sensitive owner-only endpoints that should look nonexistent to everyone else.
function requirePanelOwnerHidden(req, res, next) {
  if (isPanelOwner(req)) {
    return next();
  }

  logBlockedOwnerAccess(req);
  return res.status(404).json({
    error: 'Not found.',
    code: 'NOT_FOUND',
  });
}

module.exports = {
  DEFAULT_PANEL_OWNER_USER_ID,
  PANEL_OWNER_USER_ID,
  PANEL_OWNER_USER_IDS,
  configuredOwnerIds,
  getAuthenticatedUserId,
  isPanelOwner,
  requirePanelOwner,
  requirePanelOwnerHidden,
};
