'use strict';

const crypto = require('crypto');
const pool = require('../db');

function integerInRange(value, fallback, minimum, maximum) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(maximum, Math.max(minimum, Math.floor(parsed)));
}

const MAX_JOB_AGE_MS = integerInRange(
  process.env.IMPORT_JOB_MAX_AGE_MS,
  6 * 60 * 60 * 1000,
  60 * 60 * 1000,
  48 * 60 * 60 * 1000
);
const MAX_RETAINED_JOBS = integerInRange(process.env.IMPORT_JOB_MAX_RETAINED, 100, 20, 1000);
const JOB_LOCK_TIMEOUT_MS = integerInRange(
  process.env.IMPORT_JOB_LOCK_TIMEOUT_MS,
  5 * 60 * 1000,
  10000,
  30 * 60 * 1000
);
const CLEANUP_INTERVAL_MS = integerInRange(
  process.env.IMPORT_JOB_CLEANUP_INTERVAL_MS,
  60000,
  10000,
  10 * 60 * 1000
);
const JOB_LOCK_NAME = '5th-avenue-runtime-import-jobs';
const jobs = new Map();
const pendingWriteTimers = new Map();
let executionQueue = Promise.resolve();
let cleanupPromise = null;
let lastCleanupAt = 0;

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function text(value, maximum) {
  return String(value || '').trim().slice(0, maximum);
}

function asDate(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function rowToJob(row) {
  if (!row) return null;
  return {
    id: String(row.id),
    type: row.type,
    status: row.status,
    stage: row.stage,
    progress: Number(row.progress || 0),
    processed: Number(row.processed || 0),
    total: Number(row.total || 0),
    message: row.message,
    details: Array.isArray(row.details) ? row.details : [],
    result: row.result ?? null,
    error: row.error ?? null,
    createdAt: asDate(row.created_at) || new Date(),
    updatedAt: asDate(row.updated_at) || new Date(),
    finishedAt: asDate(row.finished_at),
  };
}

function toPublicJob(job) {
  if (!job) return null;

  return {
    id: job.id,
    type: job.type,
    status: job.status,
    stage: job.stage,
    progress: job.progress,
    processed: job.processed,
    total: job.total,
    message: job.message,
    details: job.details,
    result: job.result,
    error: job.error,
    createdAt: job.createdAt.toISOString(),
    updatedAt: job.updatedAt.toISOString(),
    finishedAt: job.finishedAt ? job.finishedAt.toISOString() : null,
  };
}

function snapshot(job) {
  return {
    id: job.id,
    type: job.type,
    status: job.status,
    stage: job.stage,
    progress: job.progress,
    processed: job.processed,
    total: job.total,
    message: job.message,
    details: job.details,
    result: job.result,
    error: job.error,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    finishedAt: job.finishedAt,
  };
}

async function persistJob(job) {
  const value = snapshot(job);
  await pool.query(
    `
      INSERT INTO runtime_jobs (
        id, type, status, stage, progress, processed, total,
        message, details, result, error, created_at, updated_at, finished_at
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7,
        $8, $9::jsonb, $10::jsonb, $11, $12, $13, $14
      )
      ON CONFLICT (id)
      DO UPDATE SET
        type = EXCLUDED.type,
        status = EXCLUDED.status,
        stage = EXCLUDED.stage,
        progress = EXCLUDED.progress,
        processed = EXCLUDED.processed,
        total = EXCLUDED.total,
        message = EXCLUDED.message,
        details = EXCLUDED.details,
        result = EXCLUDED.result,
        error = EXCLUDED.error,
        updated_at = EXCLUDED.updated_at,
        finished_at = EXCLUDED.finished_at
    `,
    [
      value.id,
      value.type,
      value.status,
      value.stage,
      value.progress,
      value.processed,
      value.total,
      value.message,
      JSON.stringify(value.details || []),
      value.result == null ? null : JSON.stringify(value.result),
      value.error,
      value.createdAt,
      value.updatedAt,
      value.finishedAt,
    ]
  );
}

function schedulePersist(job, delay = 250) {
  const existing = pendingWriteTimers.get(job.id);
  if (existing) clearTimeout(existing);

  const timer = setTimeout(() => {
    pendingWriteTimers.delete(job.id);
    persistJob(job).catch((error) => {
      console.warn(`[IMPORT JOB ${job.id}] Unable to persist progress:`, error.message);
    });
  }, delay);
  timer.unref?.();
  pendingWriteTimers.set(job.id, timer);
}

async function flushPersist(job) {
  const timer = pendingWriteTimers.get(job.id);
  if (timer) {
    clearTimeout(timer);
    pendingWriteTimers.delete(job.id);
  }
  await persistJob(job);
}

async function performCleanup() {
  const cutoff = new Date(Date.now() - MAX_JOB_AGE_MS);

  for (const [id, job] of jobs.entries()) {
    if (job.updatedAt < cutoff) jobs.delete(id);
  }

  await pool.query('DELETE FROM runtime_jobs WHERE updated_at < $1', [cutoff]);
  await pool.query(
    `
      DELETE FROM runtime_jobs
      WHERE id IN (
        SELECT id
        FROM runtime_jobs
        ORDER BY updated_at DESC
        OFFSET $1
      )
    `,
    [MAX_RETAINED_JOBS]
  );
}

async function cleanOldJobs({ force = false } = {}) {
  const now = Date.now();
  if (!force && now - lastCleanupAt < CLEANUP_INTERVAL_MS) return;
  if (cleanupPromise) return cleanupPromise;

  cleanupPromise = performCleanup()
    .then(() => {
      lastCleanupAt = Date.now();
    })
    .finally(() => {
      cleanupPromise = null;
    });

  return cleanupPromise;
}

async function initJobStore() {
  await pool.query(
    `
      UPDATE runtime_jobs
      SET status = 'failed',
          stage = 'Interrupted',
          error = 'The operation was interrupted by a service restart.',
          message = 'The operation was interrupted by a service restart.',
          updated_at = CURRENT_TIMESTAMP,
          finished_at = CURRENT_TIMESTAMP
      WHERE status IN ('queued', 'running')
    `
  );
  await cleanOldJobs({ force: true });
  console.log('[IMPORT JOBS] Persistent runtime job store is ready.');
}

async function acquireJobLock(client, job) {
  const startedAt = Date.now();
  let lastPersistAt = 0;

  job.stage = 'Waiting for import slot';
  job.message = 'Waiting for any other recovery operation to finish.';
  job.updatedAt = new Date();
  await flushPersist(job);

  while (Date.now() - startedAt < JOB_LOCK_TIMEOUT_MS) {
    const result = await client.query(
      'SELECT pg_try_advisory_lock(hashtext($1)) AS locked',
      [JOB_LOCK_NAME]
    );
    if (result.rows[0]?.locked) return true;

    const waited = Date.now() - startedAt;
    if (waited - lastPersistAt >= 5000) {
      lastPersistAt = waited;
      job.message = `Waiting for another recovery operation (${Math.floor(waited / 1000)}s).`;
      job.updatedAt = new Date();
      schedulePersist(job, 50);
    }
    await sleep(500);
  }

  const error = new Error(
    'Another recovery operation is still running. Wait for it to finish, then try again.'
  );
  error.code = 'IMPORT_LOCK_TIMEOUT';
  error.publicMessage = error.message;
  throw error;
}

function publicJobError(error) {
  if (error?.publicMessage) return text(error.publicMessage, 1000);
  if (error?.code === 'TRANSCRIPT_BRIDGE_TRUNCATED') return text(error.message, 1000);
  if (error?.code === 'CATEGORY_IMPORT_ALL_SOURCES_FAILED') return text(error.message, 1000);
  return 'The operation failed. Check Web Panel logs for the detailed error.';
}

async function createJob(type, executor) {
  if (typeof executor !== 'function') {
    throw new TypeError('Import job executor must be a function.');
  }

  await cleanOldJobs();

  const now = new Date();
  const job = {
    id: crypto.randomUUID(),
    type: text(type || 'operation', 120) || 'operation',
    status: 'queued',
    stage: 'Queued',
    progress: 0,
    processed: 0,
    total: 0,
    message: 'Waiting to start.',
    details: [],
    result: null,
    error: null,
    createdAt: now,
    updatedAt: now,
    finishedAt: null,
  };

  jobs.set(job.id, job);
  await persistJob(job);

  const report = (update = {}) => {
    if (typeof update.stage === 'string') job.stage = text(update.stage, 240);
    if (Number.isFinite(update.progress)) {
      job.progress = Math.max(0, Math.min(100, Math.round(update.progress)));
    }
    if (Number.isFinite(update.processed)) job.processed = Math.max(0, Math.floor(update.processed));
    if (Number.isFinite(update.total)) job.total = Math.max(0, Math.floor(update.total));
    if (typeof update.message === 'string') job.message = text(update.message, 1200);

    if (typeof update.detail === 'string' && update.detail.trim()) {
      job.details.push(text(update.detail, 1600));
      if (job.details.length > 30) job.details.shift();
    }

    job.updatedAt = new Date();
    schedulePersist(job);
  };

  const run = async () => {
    let lockClient;
    let lockAcquired = false;

    try {
      lockClient = await pool.connect();
      lockAcquired = await acquireJobLock(lockClient, job);

      job.status = 'running';
      job.stage = 'Starting';
      job.message = 'The recovery job is starting.';
      job.updatedAt = new Date();
      await flushPersist(job);

      job.result = await executor(report);
      job.status = 'completed';
      job.stage = 'Completed';
      job.progress = 100;
      job.message = text(job.result?.message || 'Operation completed successfully.', 1200);
    } catch (error) {
      console.error(`[IMPORT JOB ${job.id}]`, error);
      job.status = 'failed';
      job.stage = 'Failed';
      job.error = publicJobError(error);
      job.message = job.error;
    } finally {
      job.updatedAt = new Date();
      job.finishedAt = new Date();
      await flushPersist(job).catch((error) => {
        console.error(`[IMPORT JOB ${job.id}] Final persistence failed:`, error.message);
      });

      if (lockClient) {
        if (lockAcquired) {
          await lockClient
            .query('SELECT pg_advisory_unlock(hashtext($1))', [JOB_LOCK_NAME])
            .catch(() => {});
        }
        lockClient.release();
      }
    }
  };

  executionQueue = executionQueue
    .catch(() => {})
    .then(run);

  return toPublicJob(job);
}

async function getJob(id) {
  const normalizedId = String(id || '').trim();
  if (!/^[0-9a-f-]{20,80}$/i.test(normalizedId)) return null;

  const cached = jobs.get(normalizedId);
  if (cached) return toPublicJob(cached);

  const result = await pool.query(
    'SELECT * FROM runtime_jobs WHERE id = $1 LIMIT 1',
    [normalizedId]
  );
  const job = rowToJob(result.rows[0]);
  if (!job) return null;

  jobs.set(job.id, job);
  return toPublicJob(job);
}

module.exports = {
  CLEANUP_INTERVAL_MS,
  JOB_LOCK_TIMEOUT_MS,
  acquireJobLock,
  cleanOldJobs,
  createJob,
  getJob,
  initJobStore,
  integerInRange,
  publicJobError,
};
