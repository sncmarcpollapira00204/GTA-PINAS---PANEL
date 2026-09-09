const express = require('express');
const path = require('path');
const helmet = require('helmet');
const compression = require('compression');
const crypto = require('crypto');
const http = require('http');
require('dotenv').config();

const pool = require('./db');
const authService = require('./services/auth.service');
const staffProfileService = require('./services/staffProfile.service');
const mediaSettingsService = require('./services/mediaSettings.service');
const { requireApiAuth, requirePageAuth } = require('./middleware/auth.middleware');
const csrfProtection = require('./middleware/csrf.middleware');
const authRoutes = require('./routes/auth.routes');
const apiRoutes = require('./routes/api.routes');
const mediaRoutes = require('./routes/media.routes');

const app = express();
const httpServer = http.createServer(app);
const PORT = Number(process.env.PORT || 3000);
let ready = false;
let shuttingDown = false;

app.disable('x-powered-by');
app.set('trust proxy', 1);

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'https:'],
      connectSrc: ["'self'"],
      fontSrc: ["'self'", 'data:', 'https:'],
      objectSrc: ["'none'"],
      frameAncestors: ["'self'"],
      baseUri: ["'self'"],
      formAction: ["'self'", 'https://discord.com'],
    },
  },
  crossOriginEmbedderPolicy: false,
}));
app.use(compression());
app.use(express.json({ limit: process.env.JSON_BODY_LIMIT || '2mb' }));

app.use((req, res, next) => {
  req.requestId = crypto.randomUUID();
  res.setHeader('X-Request-ID', req.requestId);
  next();
});

app.use('/assets', express.static(path.join(__dirname, 'public/assets'), {
  maxAge: '7d',
  immutable: true,
}));
app.use(express.static(path.join(__dirname, 'public'), {
  index: false,
  maxAge: '1h',
}));

app.use('/auth', authRoutes);
app.use('/api/media', requireApiAuth, csrfProtection, mediaRoutes);
app.use('/api', requireApiAuth, csrfProtection, apiRoutes);

app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.get('/', requirePageAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/api/health/live', (req, res) => {
  res.json({ ok: true, status: 'live' });
});

app.get('/api/health', (req, res) => {
  res.json({ ok: true, status: ready ? 'ready' : 'starting' });
});

app.get('/api/health/ready', async (req, res) => {
  if (!ready) return res.status(503).json({ ok: false, status: 'starting' });
  try {
    await pool.query('SELECT 1');
    return res.json({ ok: true, status: 'ready' });
  } catch (error) {
    return res.status(503).json({ ok: false, status: 'database_unavailable' });
  }
});

app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  const status = Number(error?.status || 500);
  if (status >= 500) console.error(`[REQUEST ERROR ${req.requestId}]`, error);
  else if (status !== 404) console.warn(`[REQUEST ${status} ${req.requestId}]`, error?.message || error);
  const message = error?.type === 'entity.too.large'
    ? 'Request body is too large.'
    : status === 404 ? 'Resource not found.'
      : status < 500 ? 'Request could not be completed.' : 'Internal server error.';
  return res.status(status).json({ error: message, requestId: req.requestId });
});

async function startServer() {
  if (shuttingDown) return;
  try {
    await pool.initSchema();
    await authService.initAuthTables();
    await staffProfileService.ensureSchema();
    await mediaSettingsService.ensureSchema();
    ready = true;
    httpServer.listen(PORT, () => {
      console.log(`[WEB PANEL] GTA Pinas panel listening on port ${PORT}.`);
    });
  } catch (error) {
    ready = false;
    console.error('[WEB PANEL STARTUP FAILED]', error);
    setTimeout(startServer, 5000);
  }
}

async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  ready = false;
  console.log(`[WEB PANEL] ${signal} received. Shutting down...`);
  await new Promise((resolve) => httpServer.close(resolve));
  await pool.end();
  process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

startServer();
