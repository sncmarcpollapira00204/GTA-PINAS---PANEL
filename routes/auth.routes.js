const express = require('express');
const crypto = require('crypto');
const authService = require('../services/auth.service');
const panelAuthService = require('../services/panelAuth.service');
const staffManagement = require('../services/staffManagement.service');
const { requireApiAuth } = require('../middleware/auth.middleware');
const { requireCsrf } = require('../middleware/csrf.middleware');
const { isPanelOwner } = require('../middleware/owner.middleware');
const { isMediaManager } = require('../middleware/mediaManager.middleware');
const { isStaffManager } = require('../middleware/staffManagement.middleware');

const pageRouter = express.Router();
const apiRouter = express.Router();

const callbackCodes = new Map();

async function loginRateLimit(req, res, next) {
  try {
    const ip = String(req.ip || 'unknown');
    const routeGroup = req.path.includes('callback') ? 'callback' : 'start';
    const result = await authService.consumeRateLimit(
      `oauth:${routeGroup}:${ip}`,
      { windowSeconds: 10 * 60, maxAttempts: 25 }
    );

    if (!result.allowed) {
      const retryAfter = Math.max(
        1,
        Math.ceil((new Date(result.resetAt).getTime() - Date.now()) / 1000)
      );
      res.setHeader('Retry-After', String(retryAfter));
      return res.status(429).send('Too many login attempts. Please wait a few minutes and try again shortly.');
    }

    return next();
  } catch (error) {
    console.error('[AUTH RATE LIMIT ERROR]', error);
    return res.status(503).send('Login protection is temporarily unavailable. Please try again shortly.');
  }
}

function callbackErrorCode(error) {
  const allowed = new Set([
    'access_denied',
    'invalid_state',
    'not_authorized',
    'not_member',
    'token_exchange_failed',
    'oauth_configuration',
    'oauth_expired',
    'discord_error',
  ]);
  return allowed.has(error?.code) ? error.code : 'login_failed';
}

function codeFingerprint(code) {
  return crypto.createHash('sha256').update(String(code)).digest('hex');
}

function reserveCallbackCode(code) {
  const now = Date.now();
  for (const [key, expiresAt] of callbackCodes.entries()) {
    if (expiresAt <= now) callbackCodes.delete(key);
  }

  const fingerprint = codeFingerprint(code);
  if (callbackCodes.has(fingerprint)) return false;
  callbackCodes.set(fingerprint, now + 5 * 60 * 1000);
  return true;
}

function loginErrorRedirect(codeName) {
  const query = new URLSearchParams({ error: codeName });

  if (codeName === 'not_authorized' || codeName === 'not_member') {
    query.set('message', 'YOU ARE NOT A REGISTERED ADMIN.');
  }

  return `/login?${query.toString()}`;
}

pageRouter.get('/discord', loginRateLimit, (req, res) => {
  try {
    const state = authService.createOAuthState();
    const redirectUri = authService.getRedirectUri(req);
    authService.setOAuthStateCookie(res, state);
    authService.setOAuthRedirectCookie(res, redirectUri);

    console.log(`[AUTH START] OAuth callback: ${redirectUri}`);
    return res.redirect(authService.getAuthorizationUrl(state, redirectUri));
  } catch (error) {
    console.error('[AUTH START ERROR]', error.message);
    return res.redirect('/login?error=oauth_configuration');
  }
});

pageRouter.get('/discord/callback', loginRateLimit, async (req, res) => {
  const state = String(req.query.state || '');
  const code = String(req.query.code || '').trim();
  const oauthError = String(req.query.error || '');
  const cookieState = authService.getOAuthStateCookie(req);
  const cookieRedirectUri = authService.getOAuthRedirectCookie(req);

  authService.clearOAuthStateCookie(res);
  authService.clearOAuthRedirectCookie(res);

  try {
    // Resolve the redirect URI inside the protected callback flow so a malformed
    // Railway/OAuth configuration is converted into the normal login error page
    // instead of escaping as an Express 500.
    const redirectUri = authService.getRedirectUri(req, cookieRedirectUri);

    if (oauthError) {
      throw new authService.AuthError('access_denied', 'Discord authorization was cancelled.', 401);
    }

    if (!code || !authService.verifyOAuthState(state, cookieState)) {
      throw new authService.AuthError('invalid_state', 'The Discord login state was invalid or expired.', 401);
    }

    if (!reserveCallbackCode(code)) {
      throw new authService.AuthError('oauth_expired', 'This Discord authorization code was already used.', 401);
    }

    const user = await panelAuthService.authenticateAuthorizationCode(code, redirectUri);

    if (await staffManagement.isPanelAccessRevoked(user.id)) {
      const error = new authService.AuthError(
        'not_authorized',
        'Your Web Panel access has been removed by management.',
        403
      );
      error.userId = user.id;
      error.username = user.username;
      throw error;
    }

    const session = await authService.createSession(user, req);
    authService.setSessionCookie(res, session.rawToken);

    await authService.logAuthEvent({
      userId: user.id,
      username: user.username,
      eventType: 'login_success',
      req,
      metadata: { roleId: user.roleId, roleName: user.roleName, accessScope: user.accessScope },
    });

    console.log(`[AUTH] ${user.username} logged into the Web Panel as ${user.roleName}.`);
    return res.redirect('/');
  } catch (error) {
    const codeName = callbackErrorCode(error);
    console.warn('[AUTH CALLBACK]', codeName, error.message);

    await authService.logAuthEvent({
      userId: error.userId || null,
      username: error.username || null,
      eventType: 'login_denied',
      req,
      metadata: {
        code: codeName,
        discordError: error.discordError || null,
        discordDescription: error.discordDescription || null,
      },
    }).catch((logError) => {
      console.warn('[AUTH CALLBACK LOGGING]', logError.message);
    });

    return res.redirect(loginErrorRedirect(codeName));
  }
});

apiRouter.get('/me', requireApiAuth, (req, res) => {
  return res.json({
    authenticated: true,
    user: req.auth.user,
    csrfToken: req.auth.csrfToken,
    session: {
      createdAt: req.auth.createdAt,
      expiresAt: req.auth.expiresAt,
    },
    permissions: {
      ownerTools: isPanelOwner(req),
      accessLogs: isPanelOwner(req),
      mediaBranding: isMediaManager(req),
      staffManagement: isStaffManager(req),
    },
  });
});

apiRouter.post('/logout', requireApiAuth, requireCsrf, async (req, res) => {
  const user = req.auth.user;
  await authService.deleteSession(req.auth.rawToken);
  authService.clearSessionCookie(res);

  await authService.logAuthEvent({
    userId: user.id,
    username: user.username,
    eventType: 'logout',
    req,
  });

  return res.json({ success: true, message: 'Signed out successfully.' });
});

module.exports = { pageRouter, apiRouter };
