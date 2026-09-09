'use strict';

const { PANEL_OWNER_USER_ID, getAuthenticatedUserId } = require('./owner.middleware');

const STAFF_PERFORMANCE_ROLE_IDS = new Set([
  '1501546329682346064',
  '1501546391082766416',
  '1501546425492836393',
]);

function canAccessStaffPerformance(req) {
  const user = req.auth?.user || req.user || req.session?.user || {};
  const userId = getAuthenticatedUserId(req);
  const roles = Array.isArray(user.roles) ? user.roles.map(String) : [];

  // The configured panel owner keeps emergency access to prevent lockout.
  return userId === PANEL_OWNER_USER_ID || roles.some((roleId) => STAFF_PERFORMANCE_ROLE_IDS.has(roleId));
}

function requireStaffPerformanceAccess(req, res, next) {
  if (canAccessStaffPerformance(req)) return next();

  return res.status(403).json({
    error: 'Staff Performance is restricted to Owners and Executive Council.',
    code: 'STAFF_PERFORMANCE_FORBIDDEN',
  });
}

module.exports = {
  STAFF_PERFORMANCE_ROLE_IDS,
  canAccessStaffPerformance,
  requireStaffPerformanceAccess,
};
