const authService = require('../services/auth.service');

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function requireCsrf(req, res, next) {
  if (SAFE_METHODS.has(String(req.method).toUpperCase())) return next();

  const suppliedToken = req.get('x-csrf-token');
  const expectedToken = req.auth?.csrfToken;

  if (!suppliedToken || !expectedToken || !authService.safeEqual(suppliedToken, expectedToken)) {
    return res.status(403).json({
      error: 'The security token is missing or invalid. Refresh the page and try again.',
      code: 'CSRF_INVALID',
    });
  }

  return next();
}

module.exports = { requireCsrf };
