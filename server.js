'use strict';

require('dotenv').config();

const crypto = require('crypto');
const express = require('express');
const fs = require('fs/promises');
const path = require('path');
const pool = require('./db');
const apiRoutes = require('./routes/api.routes');
const authRoutes = require('./routes/auth.routes');
const mediaRoutes = require('./routes/media.routes');
const donationRoutes = require('./routes/donation.routes');
const authService = require('./services/auth.service');
const mediaSettingsService = require('./services/mediaSettings.service');
const { loadAuthentication, requirePageAuth, requireApiAuth, redirectAuthenticated } = require('./middleware/auth.middleware');
const { requireCsrf } = require('./middleware/csrf.middleware');

const app = express();
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';
const PUBLIC_DIR = path.join(__dirname, 'public');
const NORMAL_BODY_LIMIT = process.env.NORMAL_BODY_LIMIT || '1mb';
const PANEL_ASSET_VERSION = `${process.env.PANEL_ASSET_VERSION || '20260910-gta-pinas'}-embed5`; 
const SLOW_REQUEST_MS = Math.max(250, Number(process.env.SLOW_REQUEST_MS || 1500));
let httpServer = null;
let cleanupTimer = null;
let shuttingDown = false;
let ready = false;
let pageTemplates = null;
app.disable('x-powered-by');
app.set('trust proxy', 1);
app.set('etag', 'strong');

function injectBeforeClosingTag(html, closingTag, snippets) {
  const missing = snippets.filter((snippet) => !html.includes(snippet));
  if (!missing.length) return html;
  return html.replace(closingTag, `    ${missing.join('\n    ')}\n${closingTag}`);
}

async function loadPageTemplates() {
  const [loginHtml, indexHtml] = await Promise.all([
    fs.readFile(path.join(PUBLIC_DIR, 'login.html'), 'utf8'),
    fs.readFile(path.join(PUBLIC_DIR, 'index.html'), 'utf8'),
  ]);
  const loginScripts = [
    `<script defer src="/assets/login-media-branding.js?v=${PANEL_ASSET_VERSION}"></script>`,
    `<script defer src="/assets/login-ost-autoplay.js?v=${PANEL_ASSET_VERSION}"></script>`,
  ];
  const styleTags = [
    `<link rel="stylesheet" href="/assets/dashboard-hero.css?v=${PANEL_ASSET_VERSION}">`,
    `<link rel="stylesheet" href="/assets/transcript-ui-fix.css?v=${PANEL_ASSET_VERSION}">`,
    `<link rel="stylesheet" href="/assets/settings-center.css?v=${PANEL_ASSET_VERSION}">`,
  ];
  const scriptTags = [
    `<script defer src="/assets/admin-name-rotator.js?v=${PANEL_ASSET_VERSION}"></script>`,
    `<script defer src="/assets/ticket-ui-cleanup.js?v=${PANEL_ASSET_VERSION}"></script>`,
    '<script defer src="/assets/simple-panel-ui.js?v=20260806-1"></script>',
    `<script defer src="/assets/transcript-collapse-fix.js?v=${PANEL_ASSET_VERSION}"></script>`,
    `<script defer src="/assets/transcript-meta-footer.js?v=${PANEL_ASSET_VERSION}"></script>`,
    `<script defer src="/assets/open-ticket-discord.js?v=${PANEL_ASSET_VERSION}"></script>`,
    `<script defer src="/assets/media-branding.js?v=${PANEL_ASSET_VERSION}"></script>`,
    '<script defer src="/assets/manage-staff.js?v=20260816-3"></script>',
    `<script defer src="/assets/donation-embed-editor.js?v=${PANEL_ASSET_VERSION}"></script>`,
  ];
  pageTemplates = {
    login: injectBeforeClosingTag(loginHtml, '</body>', loginScripts),
    index: injectBeforeClosingTag(injectBeforeClosingTag(indexHtml, '</head>', styleTags), '</body>', scriptTags),
  };
}

app.use((req, res, next) => {
  const startedAt = process.hrtime.bigint();
  req.requestId = req.get('x-request-id') || crypto.randomUUID();
  res.setHeader('X-Request-Id', req.requestId);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  if (req.originalUrl.startsWith('/api/') && !req.originalUrl.startsWith('/api/health')) res.setHeader('Cache-Control', 'private, no-store');
  if (String(process.env.NODE_ENV || '').toLowerCase() === 'production') res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  res.on('finish', () => {
    const elapsedMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
    if (elapsedMs >= SLOW_REQUEST_MS || res.statusCode >= 500) console.warn(`[REQUEST ${req.requestId}] ${req.method} ${req.originalUrl} ${res.statusCode} ${elapsedMs.toFixed(1)}ms`);
  });
  next();
});

app.use('/assets', express.static(path.join(PUBLIC_DIR, 'assets'), { index: false, fallthrough: false, maxAge: '7d', setHeaders: (res) => res.setHeader('Cache-Control', 'public, max-age=604800, stale-while-revalidate=86400') }));
app.use('/media', mediaRoutes);
app.use(loadAuthentication);
app.get('/favicon.ico', (req, res) => res.status(204).end());
app.get('/login', redirectAuthenticated, (req, res, next) => { if (!pageTemplates?.login) return next(new Error('Login template is not ready.')); res.setHeader('Cache-Control', 'private, max-age=300, must-revalidate'); return res.type('html').send(pageTemplates.login); });
app.use('/auth', authRoutes.pageRouter);
app.use(express.json({ limit: NORMAL_BODY_LIMIT, strict: true }));
app.use(express.urlencoded({ extended: true, limit: '256kb', parameterLimit: 1000 }));
app.use('/api/auth', authRoutes.apiRouter);
app.get('/api/health/live', (req, res) => res.json({ status: 'ok', service: 'gta-pinas-web-panel', uptimeSeconds: Math.floor(process.uptime()) }));
async function readinessResponse(req, res) {
  try { if (!ready) throw new Error('Service startup is not complete.'); await pool.query('SELECT 1'); return res.json({ status: 'ok', database: 'connected', authentication: 'enabled' }); }
  catch (error) { return res.status(503).json({ status: 'error', database: 'disconnected', authentication: 'enabled', requestId: req.requestId }); }
}
app.get(['/api/health', '/api/health/ready'], readinessResponse);
app.use('/api', requireApiAuth, requireCsrf, apiRoutes);
app.use('/api/donation', requireApiAuth, requireCsrf, donationRoutes);
app.get(['/', '/index.html'], requirePageAuth, (req, res, next) => { if (!pageTemplates?.index) return next(new Error('Panel template is not ready.')); res.setHeader('Cache-Control', 'private, no-store, max-age=0, must-revalidate'); return res.type('html').send(pageTemplates.index); });
app.use((req, res) => req.originalUrl.startsWith('/api/') ? res.status(404).json({ error: 'API endpoint not found.', requestId: req.requestId }) : req.auth?.user ? res.redirect('/') : res.redirect('/login'));
app.use((error, req, res, next) => { if (res.headersSent) return next(error); const bodyParserError = error?.type === 'entity.too.large' || error instanceof SyntaxError; const requestedStatus = Number(error?.statusCode || error?.status); const status = error?.type === 'entity.too.large' ? 413 : error instanceof SyntaxError ? 400 : Number.isInteger(requestedStatus) && requestedStatus >= 400 && requestedStatus < 600 ? requestedStatus : 500; if (status >= 500) console.error(`[REQUEST ERROR ${req.requestId}]`, error); const message = bodyParserError ? (status === 413 ? 'Request body is too large.' : 'Request body contains invalid JSON.') : status === 404 ? 'Resource not found.' : status < 500 ? 'Request could not be completed.' : 'Internal server error.'; return res.status(status).json({ error: message, requestId: req.requestId }); });
async function startServer() { if (shuttingDown) return; try { await pool.initSchema(); await authService.initAuthTables(); await loadPageTemplates(); await mediaSettingsService.initializeStorage(); ready = true; httpServer = app.listen(PORT, HOST, () => console.log(`[WEB PANEL] GTA Pinas panel listening on ${HOST}:${PORT}.`)); cleanupTimer = setInterval(() => authService.cleanupExpiredSessions().catch(() => {}), 15 * 60 * 1000); cleanupTimer.unref?.(); } catch (error) { console.error('[WEB PANEL STARTUP FAILED]', error); process.exitCode = 1; } }
async function shutdown(signal) { if (shuttingDown) return; shuttingDown = true; if (cleanupTimer) clearInterval(cleanupTimer); if (httpServer) await new Promise((resolve) => httpServer.close(resolve)); await pool.end().catch(() => {}); console.log(`[WEB PANEL] Shutdown complete (${signal}).`); }
process.on('SIGINT', () => shutdown('SIGINT')); process.on('SIGTERM', () => shutdown('SIGTERM')); if (require.main === module) startServer();
