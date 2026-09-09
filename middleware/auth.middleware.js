'use strict';

const authService = require('../services/auth.service');
const panelAuthService = require('../services/panelAuth.service');
const staffManagement = require('../services/staffManagement.service');

async function loadAuthentication(req, res, next) {
  try {
    const rawToken = authService.getSessionToken(req);
    const session = await authService.loadSession(rawToken, req);

    if (!session) {
      req.auth = null;
      req.authError = null;
      return next();
    }

    let user = session.user_data;

    // A management revocation always overrides Discord roles and env-based access.
    // Check it on every authenticated request so removal takes effect immediately.
    if (await staffManagement.isPanelAccessRevoked(user?.id)) {
      await authService.deleteSession(rawToken).catch(() => {});
      authService.clearSessionCookie(res);
      await authService.logAuthEvent({
        userId: user?.id,
        username: user?.username,
        eventType: 'access_revoked',
        req,
        metadata: { source: 'manage_staff' },
      });
      req.auth = null;
      req.authError = null;
      return next();
    }

    const accessResult = await panelAuthService.verifyCurrentAccess(user);

    if (accessResult.checked && accessResult.authorized === false) {
      await authService.deleteSession(rawToken).catch(() => {});
      authService.clearSessionCookie(res);
      await authService.logAuthEvent({
        userId: user.id,
        username: user.username,
        eventType: 'access_revoked',
        req,
      });
      req.auth = null;
      req.authError = null;
      return next();
    }

    if (accessResult.checked && accessResult.authorized && accessResult.user) {
      user = accessResult.user;
      await authService.updateSessionUser(session.session_hash, user);
      session.user_data = user;
    }

    req.auth = {
      rawToken,
      sessionHash: session.session_hash,
      user,
      csrfToken: session.csrf_token,
      createdAt: session.created_at,
      expiresAt: session.expires_at,
    };
    req.authError = null;

    return next();
  } catch (error) {
    console.error(`[AUTH MIDDLEWARE ERROR ${req.requestId || 'no-request-id'}]`, error);
    req.auth = null;
    req.authError = error;
    return next();
  }
}

function requirePageAuth(req, res, next) {
  if (req.auth?.user) return next();
  if (req.authError) {
    return res.status(503).send('Authentication service is temporarily unavailable. Please try again shortly.');
  }
  return res.redirect('/login?required=1');
}

function requireApiAuth(req, res, next) {
  if (req.auth?.user) return next();
  if (req.authError) {
    return res.status(503).json({
      error: 'Authentication service is temporarily unavailable.',
      code: 'AUTH_SERVICE_UNAVAILABLE',
      requestId: req.requestId,
    });
  }
  return res.status(401).json({
    error: 'Authentication required.',
    code: 'AUTH_REQUIRED',
  });
}

function redirectAuthenticated(req, res, next) {
  if (req.auth?.user) return res.redirect('/');
  return next();
}

module.exports = {
  loadAuthentication,
  requirePageAuth,
  requireApiAuth,
  redirectAuthenticated,
};
