'use strict';

const fs = require('fs');
const path = require('path');
const mediaService = require('../services/mediaSettings.service');
const { isMediaManager } = require('../middleware/mediaManager.middleware');

function sendMediaError(req, res, error) {
  const status = Number.isInteger(error?.status) ? error.status : 500;
  if (status >= 500) {
    console.error(`[MEDIA ${req.requestId}]`, error);
  } else {
    console.warn(`[MEDIA ${req.requestId}]`, error.message);
  }

  return res.status(status).json({
    error: error?.message || 'Unable to process panel media.',
    code: error?.code || 'MEDIA_OPERATION_FAILED',
    requestId: req.requestId,
  });
}

function uploadedFileName(req) {
  const value = String(req.get('x-file-name') || '').trim();
  if (!value) return '';
  try {
    return decodeURIComponent(value);
  } catch (_) {
    return value;
  }
}

function parseByteRange(header, size) {
  const match = String(header || '').match(/^bytes=(\d*)-(\d*)$/i);
  if (!match || !Number.isFinite(size) || size <= 0) return null;

  const rawStart = match[1];
  const rawEnd = match[2];
  let start;
  let end;

  if (!rawStart && rawEnd) {
    const suffixLength = Number(rawEnd);
    if (!Number.isInteger(suffixLength) || suffixLength <= 0) return null;
    start = Math.max(0, size - suffixLength);
    end = size - 1;
  } else {
    start = Number(rawStart);
    end = rawEnd ? Number(rawEnd) : size - 1;
  }

  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || start >= size || end < start) {
    return null;
  }

  return { start, end: Math.min(end, size - 1) };
}

function pipeFile(res, filePath, options = {}) {
  const stream = fs.createReadStream(filePath, options);
  stream.on('error', (error) => {
    console.error('[MEDIA STREAM]', error);
    if (!res.headersSent) res.status(404).end();
    else res.destroy(error);
  });
  return stream.pipe(res);
}

exports.getPublicConfig = async (req, res) => {
  try {
    const config = await mediaService.getMediaConfig();
    res.setHeader('Cache-Control', 'public, max-age=30, stale-while-revalidate=120');
    return res.json({ slots: config.slots });
  } catch (error) {
    return sendMediaError(req, res, error);
  }
};

exports.getSettings = async (req, res) => {
  try {
    const config = await mediaService.getMediaConfig();
    res.setHeader('Cache-Control', 'private, no-store');
    return res.json({
      ...config,
      canManage: isMediaManager(req),
      managerRole: req.auth?.user?.roleName || 'Panel Owner',
    });
  } catch (error) {
    return sendMediaError(req, res, error);
  }
};

exports.getContent = async (req, res) => {
  try {
    const slot = String(req.params.slot || '').trim();
    const asset = await mediaService.getMediaMetadata(slot);
    if (!asset) return res.status(404).end();

    const size = Number(asset.size_bytes || 0);
    const etag = `"${asset.version}"`;
    if (req.get('if-none-match') === etag && !req.get('range')) {
      res.setHeader('ETag', etag);
      return res.status(304).end();
    }

    res.setHeader('Content-Type', asset.mime_type);
    res.setHeader('Content-Disposition', `inline; filename="${path.basename(asset.original_name).replace(/["\\]/g, '_')}"`);
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.setHeader('ETag', etag);
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('X-Content-Type-Options', 'nosniff');

    const rangeHeader = req.get('range');
    const range = rangeHeader ? parseByteRange(rangeHeader, size) : null;
    if (rangeHeader && !range) {
      res.setHeader('Content-Range', `bytes */${size}`);
      return res.status(416).end();
    }

    if (range) {
      const length = range.end - range.start + 1;
      res.status(206);
      res.setHeader('Content-Range', `bytes ${range.start}-${range.end}/${size}`);
      res.setHeader('Content-Length', String(length));

      if (req.method === 'HEAD') return res.end();
      if (asset.storage_path) {
        return pipeFile(res, asset.storage_path, { start: range.start, end: range.end });
      }

      const fileData = await mediaService.getMediaRange(slot, range.start, length);
      if (!Buffer.isBuffer(fileData)) return res.status(404).end();
      return res.send(fileData);
    }

    res.setHeader('Content-Length', String(size));
    if (req.method === 'HEAD') return res.end();

    if (asset.storage_path) return pipeFile(res, asset.storage_path);

    const fileData = await mediaService.getMediaData(slot);
    if (!Buffer.isBuffer(fileData)) return res.status(404).end();
    return res.send(fileData);
  } catch (error) {
    if (res.headersSent) {
      res.destroy(error);
      return;
    }
    return sendMediaError(req, res, error);
  }
};

exports.upload = async (req, res) => {
  try {
    const slot = String(req.params.slot || '').trim();
    const descriptor = await mediaService.saveMedia(slot, req.body, {
      contentType: req.get('content-type'),
      originalName: uploadedFileName(req),
      updatedBy: req.auth?.user?.id,
    });

    console.log(
      `[MEDIA] ${req.auth?.user?.username || req.auth?.user?.id || 'manager'} updated ${slot} `
      + `with ${descriptor.originalName} (${descriptor.sizeBytes} bytes).`
    );

    return res.status(201).json({
      success: true,
      message: `${descriptor.label} updated successfully.`,
      asset: descriptor,
    });
  } catch (error) {
    return sendMediaError(req, res, error);
  }
};

exports.reset = async (req, res) => {
  try {
    const slot = String(req.params.slot || '').trim();
    const descriptor = await mediaService.resetMedia(slot);
    console.log(
      `[MEDIA] ${req.auth?.user?.username || req.auth?.user?.id || 'manager'} reset ${slot} to default.`
    );
    return res.json({
      success: true,
      message: `${descriptor.label} reset to default.`,
      asset: descriptor,
    });
  } catch (error) {
    return sendMediaError(req, res, error);
  }
};

exports.parseByteRange = parseByteRange;
