'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const service = read('services/staffManagement.service.js');
const controller = read('controllers/staffManagement.controller.js');
const middleware = read('middleware/staffManagement.middleware.js');
const authMiddleware = read('middleware/auth.middleware.js');
const authRoutes = read('routes/auth.routes.js');
const routes = read('routes/api.routes.js');
const ui = read('public/assets/manage-staff.js');

test('Manage Staff source files are valid JavaScript', () => {
  for (const [name, source] of [
    ['service', service],
    ['controller', controller],
    ['middleware', middleware],
    ['auth middleware', authMiddleware],
    ['UI', ui],
  ]) {
    assert.doesNotThrow(() => new Function(source), `${name} should parse`);
  }
});

test('Manage Staff is panel permission management, not Discord role management', () => {
  assert.match(service, /panel_access_revocations/);
  assert.match(service, /removePanelAccess/);
  assert.doesNotMatch(service, /members\/.*\/roles\/.*method: 'PUT'/);
  assert.doesNotMatch(controller, /setRank/);
  assert.doesNotMatch(ui, /Assign Rank/);
  assert.doesNotMatch(ui, /Add or update staff/);
  assert.match(ui, /Remove access/);
  assert.match(ui, /Discord roles stay untouched/);
  assert.match(ui, /Discord roles will stay unchanged/);
});

test('Manage Staff access includes the configured Owner and Executive role IDs', () => {
  for (const roleId of [
    '1501546329682346064',
    '1501546391082766416',
    '1501546425492836393',
  ]) {
    assert.match(middleware, new RegExp(roleId));
  }
  assert.match(middleware, /PANEL_STAFF_MANAGER_ROLE_IDS/);
  assert.match(middleware, /roles\.some\(\(roleId\) => STAFF_MANAGER_ROLE_IDS\.has\(roleId\)\)/);
  assert.match(authRoutes, /staffManagement: isStaffManager\(req\)/);
});

test('Manage Staff API is hidden behind Owner and Executive management middleware', () => {
  assert.match(routes, /router\.get\('\/staff-management', requireStaffManagerHidden/);
  assert.match(routes, /router\.delete\('\/staff-management\/:discordId', requireStaffManagerHidden/);
  assert.doesNotMatch(routes, /router\.put\('\/staff-management/);
});

test('panel revocation overrides Discord role eligibility on login and active sessions', () => {
  assert.match(authRoutes, /isPanelAccessRevoked\(user\.id\)/);
  assert.match(authMiddleware, /isPanelAccessRevoked\(user\?\.id\)/);
  assert.match(service, /DELETE FROM web_sessions WHERE user_id = \$1/);
});

test('protected Panel Owner and self-removal are blocked', () => {
  assert.match(service, /configuredOwnerIds\(\)\.has\(String\(discordId\)\)/);
  assert.match(controller, /discordId === actorId/);
});

test('Manage Staff UI uses server-authoritative Owner and Executive permission', () => {
  assert.match(ui, /permissions\?\.staffManagement/);
  assert.match(ui, /isManagementEnabled/);
  assert.doesNotMatch(ui, /panelOwnerToolsEnabled/);
  assert.match(ui, /x-csrf-token/);
});
