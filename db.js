'use strict';

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
require('dotenv').config();

const databaseUrl = process.env.DATABASE_URL || process.env.TICKET_DATABASE_URL;
const SCHEMA_MIGRATION_ID = '20260805_ticket_schema_v2';
const MIGRATION_LOCK_NAME = '5th-avenue-ticket-schema-migration';
const DATABASE_DIR = path.join(__dirname, 'database');
const MIGRATIONS_DIR = path.join(DATABASE_DIR, 'migrations');
const schemaSql = fs.readFileSync(path.join(DATABASE_DIR, 'schema.sql'), 'utf8');

if (!databaseUrl) {
  throw new Error(
    '[DATABASE ERROR] DATABASE_URL is missing. Add it to Railway Variables.'
  );
}

const isLocalDatabase =
  databaseUrl.includes('localhost') || databaseUrl.includes('127.0.0.1');

function positiveInteger(value, fallback, minimum = 1) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(minimum, Math.floor(parsed)) : fallback;
}

const pool = new Pool({
  connectionString: databaseUrl,
  ssl: isLocalDatabase ? false : { rejectUnauthorized: false },
  keepAlive: true,
  idleTimeoutMillis: positiveInteger(process.env.DATABASE_IDLE_TIMEOUT_MS, 30000, 5000),
  connectionTimeoutMillis: positiveInteger(process.env.DATABASE_CONNECTION_TIMEOUT_MS, 15000, 3000),
  max: positiveInteger(process.env.DATABASE_POOL_MAX, 10, 2),
  statement_timeout: positiveInteger(process.env.DATABASE_STATEMENT_TIMEOUT_MS, 30000, 5000),
  query_timeout: positiveInteger(process.env.DATABASE_QUERY_TIMEOUT_MS, 35000, 5000),
  application_name: '5th-avenue-web-panel',
});

pool.on('error', (error) => {
  console.error('[DATABASE ERROR] Idle PostgreSQL connection error:', error.message);
});

const RETRYABLE_CODES = new Set([
  '08000', '08001', '08003', '08004', '08006', '08007', '08P01',
  '40001', '40P01', '53300', '57P01', '57P02', '57P03',
]);

function shouldRetry(error) {
  return RETRYABLE_CODES.has(error?.code);
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function loadMigrationFiles() {
  if (!fs.existsSync(MIGRATIONS_DIR)) return [];

  return fs.readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.sql'))
    .map((entry) => ({
      id: entry.name.replace(/\.sql$/i, ''),
      name: entry.name,
      sql: fs.readFileSync(path.join(MIGRATIONS_DIR, entry.name), 'utf8'),
    }))
    .sort((left, right) => left.name.localeCompare(right.name));
}

async function applyMigration(client, migration) {
  const existing = await client.query(
    'SELECT 1 FROM schema_migrations WHERE id = $1',
    [migration.id]
  );

  if (existing.rowCount) return false;

  await client.query(migration.sql);
  await client.query(
    'INSERT INTO schema_migrations (id) VALUES ($1)',
    [migration.id]
  );
  console.log(`[DATABASE] Applied migration ${migration.name}.`);
  return true;
}

async function initSchema(maxAttempts = 5) {
  let lastError;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    let client;

    try {
      client = await pool.connect();
      await client.query('BEGIN');
      await client.query(`
        CREATE TABLE IF NOT EXISTS schema_migrations (
          id TEXT PRIMARY KEY,
          applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
      `);
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
        MIGRATION_LOCK_NAME,
      ]);

      const existing = await client.query(
        'SELECT 1 FROM schema_migrations WHERE id = $1',
        [SCHEMA_MIGRATION_ID]
      );

      if (!existing.rowCount) {
        await client.query(schemaSql);
        await client.query(`
          SELECT setval(
            'ticket_number_seq',
            GREATEST(
              COALESCE((SELECT MAX(ticket_number::BIGINT) FROM tickets WHERE ticket_number ~ '^[0-9]+$'), 1000),
              COALESCE((SELECT last_value FROM ticket_number_seq), 1000),
              1000
            ),
            TRUE
          )
        `);
        await client.query(
          'INSERT INTO schema_migrations (id) VALUES ($1)',
          [SCHEMA_MIGRATION_ID]
        );
        console.log('[DATABASE] Applied base Web Panel ticket schema.');
      }

      for (const migration of loadMigrationFiles()) {
        await applyMigration(client, migration);
      }

      await client.query(
        'CREATE SEQUENCE IF NOT EXISTS ticket_number_seq START WITH 1000 INCREMENT BY 1'
      );
      await client.query('COMMIT');
      console.log('[DATABASE] Connected and all migrations are ready.');
      return;
    } catch (error) {
      lastError = error;
      if (client) await client.query('ROLLBACK').catch(() => {});

      console.error(
        `[DATABASE ERROR] Attempt ${attempt}/${maxAttempts} failed: ${error.message}`
      );

      if (!shouldRetry(error) || attempt >= maxAttempts) break;
      await sleep(1000 * (2 ** (attempt - 1)));
    } finally {
      if (client) client.release();
    }
  }

  throw lastError;
}

function getPoolMetrics() {
  return {
    total: pool.totalCount,
    idle: pool.idleCount,
    waiting: pool.waitingCount,
    max: pool.options.max,
  };
}

pool.initSchema = initSchema;
pool.getMetrics = getPoolMetrics;

module.exports = pool;
