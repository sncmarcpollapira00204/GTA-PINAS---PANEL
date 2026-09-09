'use strict';

const { Readable } = require('stream');

const mainBotControl = require('../services/mainBotControl.service');
const { getAuthenticatedUserId } = require('../middleware/owner.middleware');

const CLEAR_CONFIRMATION_TEXT = 'DELETE ALL DATABASES';

function statusForError(error) {
  if (error?.status && Number.isInteger(error.status)) return error.status;
  if (error?.code === 'MAIN_BOT_CONTROL_NOT_CONFIGURED') return 503;
  if (error?.code === 'MAIN_BOT_CONTROL_UNAVAILABLE') return 502;
  return 500;
}

function sendControlError(req, res, error) {
  console.error('[BACKUP CENTER]', error);
  return res.status(statusForError(error)).json({
    error: error?.message || 'Backup Center is temporarily unavailable.',
    code: error?.code || 'BACKUP_CENTER_ERROR',
    setupRequired: error?.code === 'MAIN_BOT_CONTROL_NOT_CONFIGURED',
    requestId: req.requestId,
  });
}

exports.getStatus = async (req, res) => {
  try {
    const status = await mainBotControl.getStatus(getAuthenticatedUserId(req));
    return res.json({
      ...status,
      confirmationText: CLEAR_CONFIRMATION_TEXT,
    });
  } catch (error) {
    return sendControlError(req, res, error);
  }
};

exports.startFullBackup = async (req, res) => {
  try {
    const payload = await mainBotControl.startFullBackup(getAuthenticatedUserId(req));
    console.log(`[BACKUP CENTER] ${req.auth?.user?.username || 'Panel owner'} started full Gatekeeper backup ${payload.job?.id || ''}.`);
    return res.status(202).json(payload);
  } catch (error) {
    return sendControlError(req, res, error);
  }
};

exports.getBackupJob = async (req, res) => {
  try {
    const jobId = String(req.params.id || '').trim();
    if (!/^[0-9a-f-]{20,80}$/i.test(jobId)) {
      return res.status(400).json({ error: 'Invalid backup job ID.' });
    }

    const payload = await mainBotControl.getBackupJob(getAuthenticatedUserId(req), jobId);
    return res.json(payload);
  } catch (error) {
    return sendControlError(req, res, error);
  }
};

exports.downloadBackup = async (req, res) => {
  try {
    const jobId = String(req.params.id || '').trim();
    if (!/^[0-9a-f-]{20,80}$/i.test(jobId)) {
      return res.status(400).json({ error: 'Invalid backup job ID.' });
    }

    const response = await mainBotControl.downloadBackup(getAuthenticatedUserId(req), jobId);
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      const error = new Error(payload.error || `Backup download failed (${response.status}).`);
      error.status = response.status;
      error.code = payload.code || 'BACKUP_DOWNLOAD_FAILED';
      throw error;
    }

    const contentDisposition = response.headers.get('content-disposition')
      || `attachment; filename="gatekeeper-full-backup-${jobId}.json.gz"`;
    const contentLength = response.headers.get('content-length');

    res.setHeader('Content-Type', response.headers.get('content-type') || 'application/gzip');
    res.setHeader('Content-Disposition', contentDisposition);
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (contentLength) res.setHeader('Content-Length', contentLength);

    if (!response.body) return res.end();
    Readable.fromWeb(response.body).pipe(res);
  } catch (error) {
    if (res.headersSent) {
      res.destroy(error);
      return;
    }
    return sendControlError(req, res, error);
  }
};

exports.clearDatabases = async (req, res) => {
  const confirmation = String(req.body?.confirmation || '').trim();
  if (confirmation !== CLEAR_CONFIRMATION_TEXT) {
    return res.status(400).json({
      error: `Type exactly: ${CLEAR_CONFIRMATION_TEXT}`,
      code: 'DATABASE_CLEAR_CONFIRMATION_INVALID',
    });
  }

  try {
    console.warn(`[BACKUP CENTER] ${req.auth?.user?.username || 'Panel owner'} requested a full database reset.`);
    const result = await mainBotControl.clearDatabases(
      getAuthenticatedUserId(req),
      confirmation
    );
    return res.json(result);
  } catch (error) {
    return sendControlError(req, res, error);
  }
};
