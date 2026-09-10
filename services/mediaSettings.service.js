'use strict';

const crypto = require('crypto');
const fs = require('fs/promises');
const path = require('path');
const pool = require('../db');

function positiveMegabytes(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0
    ? Math.floor(parsed * 1024 * 1024)
    : fallback * 1024 * 1024;
}

function positiveMilliseconds(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 1000 ? Math.floor(parsed) : fallback;
}

const MEDIA_CONFIG_CACHE_MS = positiveMilliseconds(process.env.MEDIA_CONFIG_CACHE_MS, 30_000);

const SLOT_CONFIG = Object.freeze({
  dashboard_banner: {
    label: 'Dashboard Banner',
    defaultUrl: '/assets/gtapinasbg.gif?v=20260910',
    defaultKind: 'image',
    defaultMimeType: 'image/gif',
    maxBytes: positiveMegabytes(process.env.MEDIA_MAX_DASHBOARD_MB, 20),
    allowedMimeTypes: new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'video/webm']),
  },
  login_banner: {
    label: 'Login / Web Banner',
    defaultUrl: '/assets/gtapinasbg.gif?v=20260910',
    defaultKind: 'image',
    defaultMimeType: 'image/gif',
    maxBytes: positiveMegabytes(process.env.MEDIA_MAX_LOGIN_MB, 40),
    allowedMimeTypes: new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'video/webm', 'video/mp4']),
  },
  login_music: {
    label: 'Web Music',
    defaultUrl: '/assets/gtapinasmusic.MP3?v=20260910',
    defaultKind: 'audio',
    defaultMimeType: 'audio/mpeg',
    maxBytes: positiveMegabytes(process.env.MEDIA_MAX_AUDIO_MB, 20),
    allowedMimeTypes: new Set(['audio/mpeg', 'audio/ogg', 'audio/wav', 'audio/webm']),
  },
});

const SLOT_NAMES = Object.freeze(Object.keys(SLOT_CONFIG));

const MIME_EXTENSION = Object.freeze({
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'video/webm': 'webm',
  'video/mp4': 'mp4',
  'audio/mpeg': 'mp3',
  'audio/ogg': 'ogg',
  'audio/wav': 'wav',
  'audio/webm': 'webm',
});

let mediaConfigCache = null;
let mediaConfigCacheExpiresAt = 0;
let mediaConfigInFlight = null;

function getSlotConfig(slot) {
  return SLOT_CONFIG[String(slot || '').trim()] || null;
}

function cleanMimeType(value) {
  return String(value || '').split(';')[0].trim().toLowerCase();
}

function hasBytes(buffer, bytes, offset = 0) {
  if (!Buffer.isBuffer(buffer) || buffer.length < offset + bytes.length) return false;
  return bytes.every((byte, index) => buffer[offset + index] === byte);
}

function hasAscii(buffer, text, offset = 0) {
  if (!Buffer.isBuffer(buffer) || buffer.length < offset + text.length) return false;
  return buffer.subarray(offset, offset + text.length).toString('ascii') === text;
}

function detectMimeType(buffer, slot, declaredMimeType = '') {
  if (!Buffer.isBuffer(buffer) || buffer.length < 4) return null;

  if (hasBytes(buffer, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
  if (hasBytes(buffer, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (hasAscii(buffer, 'GIF87a') || hasAscii(buffer, 'GIF89a')) return 'image/gif';
  if (hasAscii(buffer, 'RIFF') && hasAscii(buffer, 'WEBP', 8)) return 'image/webp';
  if (hasAscii(buffer, 'RIFF') && hasAscii(buffer, 'WAVE', 8)) return 'audio/wav';
  if (hasAscii(buffer, 'OggS')) return 'audio/ogg';
  if (hasAscii(buffer, 'ID3') || (buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0)) return 'audio/mpeg';

  if (hasAscii(buffer, 'ftyp', 4)) return 'video/mp4';

  if (hasBytes(buffer, [0x1a, 0x45, 0xdf, 0xa3])) {
    return slot === 'login_music' || cleanMimeType(declaredMimeType) === 'audio/webm'
      ? 'audio/webm'
      : 'video/webm';
  }

  return null;
}

function mediaKindForMime(mimeType) {
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/')) return 'video';
  return 'audio';
}

function safeOriginalName(value, fallback) {
  const basename = path.basename(String(value || fallback || 'upload'));
  return basename.replace(/[^a-zA-Z0-9._ -]/g, '_').slice(0, 180) || fallback;
}

function mediaStorageDirectory() {
  const configured = String(process.env.MEDIA_STORAGE_DIR || '').trim();
  return configured ? path.resolve(configured) : null;
}

function invalidateMediaConfigCache() {
  mediaConfigCache = null;
  mediaConfigCacheExpiresAt = 0;
}

async function initializeStorage() {
  const directory = mediaStorageDirectory();
  if (directory) {
    await fs.mkdir(directory, { recursive: true });
    console.log(`[MEDIA] Dynamic panel media will use persistent storage at ${directory}.`);
  } else {
    console.log('[MEDIA] MEDIA_STORAGE_DIR is not configured; dynamic panel media will be stored in PostgreSQL.');
  }
}

function publicDescriptor(slot, row = null) {
  const config = getSlotConfig(slot);
  if (!config) return null;

  if (!row) {
    return {
      slot,
      label: config.label,
      url: config.defaultUrl,
      kind: config.defaultKind,
      mimeType: config.defaultMimeType,
      originalName: null,
      sizeBytes: null,
      updatedAt: null,
      isDefault: true,
      maxBytes: config.maxBytes,
      acceptedMimeTypes: Array.from(config.allowedMimeTypes),
    };
  }

  return {
    slot,
    label: config.label,
    url: `/media/content/${encodeURIComponent(slot)}?v=${encodeURIComponent(row.version)}`,
    kind: row.media_kind,
    mimeType: row.mime_type,
    originalName: row.original_name,
    sizeBytes: Number(row.size_bytes || 0),
    updatedAt: row.updated_at,
    isDefault: false,
    maxBytes: config.maxBytes,
    acceptedMimeTypes: Array.from(config.allowedMimeTypes),
  };
}

async function queryMediaConfig() {
  const result = await pool.query(`
    SELECT slot, original_name, mime_type, media_kind, size_bytes, version, updated_at
    FROM panel_media_assets
    WHERE slot = ANY($1::text[])
  `, [SLOT_NAMES]);

  const rows = new Map(result.rows.map((row) => [row.slot, row]));
  const slots = {};
  for (const slot of SLOT_NAMES) {
    slots[slot] = publicDescriptor(slot, rows.get(slot) || null);
  }

  return {
    slots,
    storageMode: mediaStorageDirectory() ? 'volume' : 'database',
  };
}

async function getMediaConfig(options = {}) {
  const force = options.force === true;
  const now = Date.now();

  if (!force && mediaConfigCache && mediaConfigCacheExpiresAt > now) {
    return mediaConfigCache;
  }

  if (!force && mediaConfigInFlight) return mediaConfigInFlight;

  const request = queryMediaConfig()
    .then((config) => {
      mediaConfigCache = config;
      mediaConfigCacheExpiresAt = Date.now() + MEDIA_CONFIG_CACHE_MS;
      return config;
    })
    .finally(() => {
      if (mediaConfigInFlight === request) mediaConfigInFlight = null;
    });

  mediaConfigInFlight = request;
  return request;
}

async function saveMedia(slot, buffer, options = {}) {
  const config = getSlotConfig(slot);
  if (!config) {
    const error = new Error('Unsupported media slot.');
    error.status = 400;
    error.code = 'MEDIA_SLOT_INVALID';
    throw error;
  }

  if (!Buffer.isBuffer(buffer) || !buffer.length) {
    const error = new Error('Choose a non-empty media file.');
    error.status = 400;
    error.code = 'MEDIA_FILE_EMPTY';
    throw error;
  }

  if (buffer.length > config.maxBytes) {
    const error = new Error(`${config.label} exceeds the ${(config.maxBytes / 1024 / 1024).toFixed(0)} MB limit.`);
    error.status = 413;
    error.code = 'MEDIA_FILE_TOO_LARGE';
    throw error;
  }

  const mimeType = detectMimeType(buffer, slot, options.contentType);
  if (!mimeType || !config.allowedMimeTypes.has(mimeType)) {
    const error = new Error(`Unsupported or invalid file for ${config.label}.`);
    error.status = 415;
    error.code = 'MEDIA_TYPE_INVALID';
    throw error;
  }

  const version = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}`;
  const extension = MIME_EXTENSION[mimeType];
  const originalName = safeOriginalName(options.originalName, `${slot}.${extension}`);
  const directory = mediaStorageDirectory();
  let storagePath = null;
  let fileData = buffer;
  let temporaryPath = null;

  if (directory) {
    await fs.mkdir(directory, { recursive: true });
    storagePath = path.join(directory, `${slot}-${version}.${extension}`);
    temporaryPath = `${storagePath}.tmp`;
    await fs.writeFile(temporaryPath, buffer, { flag: 'wx' });
    await fs.rename(temporaryPath, storagePath);
    fileData = null;
  }

  const client = await pool.connect();
  let previousStoragePath = null;

  try {
    await client.query('BEGIN');
    const previous = await client.query(
      'SELECT storage_path FROM panel_media_assets WHERE slot = $1 FOR UPDATE',
      [slot]
    );
    previousStoragePath = previous.rows[0]?.storage_path || null;

    await client.query(`
      INSERT INTO panel_media_assets (
        slot, original_name, mime_type, media_kind, size_bytes,
        file_data, storage_path, version, updated_by, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, CURRENT_TIMESTAMP)
      ON CONFLICT (slot)
      DO UPDATE SET
        original_name = EXCLUDED.original_name,
        mime_type = EXCLUDED.mime_type,
        media_kind = EXCLUDED.media_kind,
        size_bytes = EXCLUDED.size_bytes,
        file_data = EXCLUDED.file_data,
        storage_path = EXCLUDED.storage_path,
        version = EXCLUDED.version,
        updated_by = EXCLUDED.updated_by,
        updated_at = CURRENT_TIMESTAMP
    `, [
      slot,
      originalName,
      mimeType,
      mediaKindForMime(mimeType),
      buffer.length,
      fileData,
      storagePath,
      version,
      String(options.updatedBy || '') || null,
    ]);

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    if (storagePath) await fs.unlink(storagePath).catch(() => {});
    throw error;
  } finally {
    client.release();
    if (temporaryPath) await fs.unlink(temporaryPath).catch(() => {});
  }

  if (previousStoragePath && previousStoragePath !== storagePath) {
    await fs.unlink(previousStoragePath).catch(() => {});
  }

  invalidateMediaConfigCache();
  const configResult = await getMediaConfig({ force: true });
  return configResult.slots[slot];
}

async function resetMedia(slot) {
  const config = getSlotConfig(slot);
  if (!config) {
    const error = new Error('Unsupported media slot.');
    error.status = 400;
    error.code = 'MEDIA_SLOT_INVALID';
    throw error;
  }

  const result = await pool.query(
    'DELETE FROM panel_media_assets WHERE slot = $1 RETURNING storage_path',
    [slot]
  );
  const storagePath = result.rows[0]?.storage_path || null;
  if (storagePath) await fs.unlink(storagePath).catch(() => {});
  invalidateMediaConfigCache();
  return publicDescriptor(slot, null);
}

async function getMediaMetadata(slot) {
  if (!getSlotConfig(slot)) return null;

  const result = await pool.query(`
    SELECT original_name, mime_type, size_bytes, storage_path, version, updated_at
    FROM panel_media_assets
    WHERE slot = $1
    LIMIT 1
  `, [slot]);

  return result.rows[0] || null;
}

async function getMediaData(slot) {
  if (!getSlotConfig(slot)) return null;

  const result = await pool.query(`
    SELECT file_data
    FROM panel_media_assets
    WHERE slot = $1
    LIMIT 1
  `, [slot]);

  return result.rows[0]?.file_data || null;
}

async function getMediaRange(slot, start, length) {
  if (!getSlotConfig(slot)) return null;
  if (!Number.isInteger(start) || start < 0 || !Number.isInteger(length) || length <= 0) return null;

  const result = await pool.query(`
    SELECT substring(file_data FROM $2 FOR $3) AS file_data
    FROM panel_media_assets
    WHERE slot = $1
    LIMIT 1
  `, [slot, start + 1, length]);

  return result.rows[0]?.file_data || null;
}

async function getMediaContent(slot) {
  const metadata = await getMediaMetadata(slot);
  if (!metadata) return null;
  if (metadata.storage_path) return metadata;
  const fileData = await getMediaData(slot);
  return { ...metadata, file_data: fileData };
}

module.exports = {
  SLOT_CONFIG,
  MEDIA_CONFIG_CACHE_MS,
  getSlotConfig,
  cleanMimeType,
  detectMimeType,
  mediaKindForMime,
  initializeStorage,
  invalidateMediaConfigCache,
  getMediaConfig,
  getMediaMetadata,
  getMediaData,
  getMediaRange,
  getMediaContent,
  saveMedia,
  resetMedia,
};
