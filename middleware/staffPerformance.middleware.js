'use strict';

const { PANEL_OWNER_USER_ID, getAuthenticatedUserId } = require('./owner.middleware');

// Keep management permissions aligned with GTA-Pinas-Bot's current Owner/Executive roles.
const STAFF_PERFORMANCE_ROLE_IDS = new Set([
  '1525460665198968832',
  '1525460819381587988',
  '1525472827896102922',
]);

function canAccessStaffPerformance(req) {
  const user = req.auth?.user || req.user || req.session?.user || {};
  const userId = getAuthenticatedUserId(req);
  const roles = Array.isArray(user.roles) ? user.roles.map(String) : [];

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
