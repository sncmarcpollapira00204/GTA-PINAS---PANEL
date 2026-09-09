const pool = require('../db');
const archiver = require('archiver');
const config = require('../config.json');

const TABLES = [
  'users',
  'staff',
  'tickets',
  'ticket_messages',
  'ticket_transcripts',
  'attachments',
  'ticket_logs',
];

const RESTORE_ORDER = [
  'users',
  'staff',
  'tickets',
  'ticket_messages',
  'ticket_transcripts',
  'attachments',
  'ticket_logs',
];

const MAX_RESTORE_ROWS = Math.max(1000, Number(process.env.MAX_RESTORE_ROWS || 500000));
const MAX_TABLE_RESTORE_ROWS = Math.max(1000, Number(process.env.MAX_TABLE_RESTORE_ROWS || 300000));
const MAX_TRANSCRIPT_HTML_BYTES = Math.max(1024 * 1024, Number(process.env.MAX_TRANSCRIPT_HTML_BYTES || 10 * 1024 * 1024));

function isPlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function validateTableRows(table, rows) {
  if (rows.length > MAX_TABLE_RESTORE_ROWS) {
    throw new Error(`Backup table ${table} exceeds the configured row limit.`);
  }

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    if (!isPlainObject(row)) {
      throw new Error(`Backup table ${table} contains an invalid row at index ${index}.`);
    }

    if (row.id === undefined || row.id === null || String(row.id).length > 100) {
      throw new Error(`Backup table ${table} contains an invalid id at index ${index}.`);
    }

    if (table === 'ticket_transcripts' && row.html_content != null) {
      const bytes = Buffer.byteLength(String(row.html_content), 'utf8');
      if (bytes > MAX_TRANSCRIPT_HTML_BYTES) {
        throw new Error(`A transcript in the backup exceeds the configured HTML size limit.`);
      }
    }
  }
}

function normalizeBackupPayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('The selected file is not a valid JSON backup object.');
  }

  const tables = payload.tables && typeof payload.tables === 'object'
    ? payload.tables
    : payload;

  const normalized = {};
  for (const table of TABLES) {
    normalized[table] = Array.isArray(tables[table]) ? tables[table] : [];
    validateTableRows(table, normalized[table]);
  }

  const totalRows = Object.values(normalized).reduce(
    (total, rows) => total + rows.length,
    0
  );

  if (!totalRows) {
    throw new Error('The JSON file does not contain any supported ticket tables.');
  }
  if (totalRows > MAX_RESTORE_ROWS) {
    throw new Error('The JSON backup exceeds the configured total row limit.');
  }

  return {
    metadata: payload.metadata || {
      format: 'legacy-5th-avenue-backup',
      version: 1,
    },
    tables: normalized,
    totalRows,
  };
}

async function generateJSONBackup() {
  const client = await pool.connect();

  try {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');

    const tables = {};
    const counts = {};

    for (const table of TABLES) {
      const result = await client.query(`SELECT * FROM ${table} ORDER BY 1`);
      tables[table] = result.rows;
      counts[table] = result.rowCount;
    }

    await client.query('COMMIT');

    return {
      metadata: {
        format: '5th-avenue-ticket-backup',
        version: 2,
        exportedAt: new Date().toISOString(),
        guildId: process.env.GUILD_ID || config.guildId || null,
        databasePurpose: '5th Avenue Ticket Web Panel',
        counts,
        restoreMode: 'merge-safe',
      },
      tables,
    };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

async function generateZIPBackup(res) {
  const backupData = await generateJSONBackup();
  const json = JSON.stringify(backupData, null, 2);
  const readme = [
    '5TH AVENUE TICKET DATABASE BACKUP',
    '=================================',
    '',
    `Exported: ${backupData.metadata.exportedAt}`,
    `Guild ID: ${backupData.metadata.guildId || 'Not configured'}`,
    '',
    'RESTORE ORDER',
    '1. Deploy the Web Panel and a fresh Postgres-Tickets service.',
    '2. Open Backup Center.',
    '3. Select database-backup.json.',
    '4. Press Restore JSON Backup.',
    '5. Run Import Open Tickets, then Import Closed Transcripts.',
    '',
    'The restore operation is merge-safe and can be run more than once.',
  ].join('\n');

  res.attachment(
    `5th-Avenue-Ticket-Backup-${new Date().toISOString().slice(0, 10)}.zip`
  );
  res.setHeader('Content-Type', 'application/zip');

  const archive = archiver('zip', { zlib: { level: 9 } });

  archive.on('warning', (error) => {
    console.warn('[ZIP BACKUP WARNING]', error.message);
  });

  archive.on('error', (error) => {
    if (!res.destroyed) res.destroy(error);
  });

  archive.pipe(res);
  archive.append(json, { name: 'database-backup.json' });
  archive.append(readme, { name: 'RESTORE-INSTRUCTIONS.txt' });
  await archive.finalize();
}

async function getTableColumns(client, table) {
  const result = await client.query(
    `
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = $1
    ORDER BY ordinal_position
    `,
    [table]
  );

  return result.rows.map((row) => row.column_name);
}

async function restoreTable(client, table, rows, report) {
  if (!rows.length) return 0;

  const columns = await getTableColumns(client, table);
  const usableColumns = columns.filter(
    (column) => rows.some((row) => Object.prototype.hasOwnProperty.call(row, column))
  );

  if (!usableColumns.includes('id')) {
    throw new Error(`Backup table ${table} does not contain the required id column.`);
  }

  const quotedColumns = usableColumns.map((column) => `"${column}"`).join(', ');
  const updateColumns = usableColumns.filter((column) => column !== 'id');
  const conflictAction = updateColumns.length
    ? `DO UPDATE SET ${updateColumns
        .map((column) => `"${column}" = EXCLUDED."${column}"`)
        .join(', ')}`
    : 'DO NOTHING';

  const chunkSize = 250;
  let restored = 0;

  for (let offset = 0; offset < rows.length; offset += chunkSize) {
    const chunk = rows.slice(offset, offset + chunkSize);

    await client.query(
      `
      INSERT INTO "${table}" (${quotedColumns})
      SELECT ${quotedColumns}
      FROM jsonb_populate_recordset(NULL::"${table}", $1::jsonb)
      ON CONFLICT (id) ${conflictAction}
      `,
      [JSON.stringify(chunk)]
    );

    restored += chunk.length;

    report?.({
      stage: `Restoring ${table}`,
      message: `Restored ${restored}/${rows.length} rows in ${table}.`,
    });
  }

  return restored;
}

async function restoreJSONBackup(payload, report = () => {}) {
  const backup = normalizeBackupPayload(payload);
  const client = await pool.connect();
  const counts = {};
  let completedRows = 0;

  report({
    stage: 'Validating JSON backup',
    progress: 2,
    processed: 0,
    total: backup.totalRows,
    message: `Validated ${backup.totalRows} supported rows.`,
  });

  try {
    await client.query('BEGIN');
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtext('5th-avenue-json-restore'))"
    );

    for (const table of RESTORE_ORDER) {
      const rows = backup.tables[table];
      counts[table] = await restoreTable(client, table, rows, (update) => {
        report({
          ...update,
          processed: completedRows,
          total: backup.totalRows,
          progress: 5 + ((completedRows / backup.totalRows) * 90),
        });
      });
      completedRows += counts[table];

      report({
        stage: `Restored ${table}`,
        processed: completedRows,
        total: backup.totalRows,
        progress: 5 + ((completedRows / backup.totalRows) * 90),
        detail: `${table}: ${counts[table]} rows merged.`,
      });
    }

    await client.query(`
      SELECT setval(
        pg_get_serial_sequence('ticket_logs', 'id'),
        GREATEST(COALESCE((SELECT MAX(id) FROM ticket_logs), 1), 1),
        TRUE
      )
    `);

    await client.query(
      `
      INSERT INTO ticket_logs (action, description, metadata)
      VALUES ('RESTORE_JSON', $1, $2::jsonb)
      `,
      [
        `Merged ${completedRows} rows from a JSON backup.`,
        JSON.stringify({
          sourceMetadata: backup.metadata,
          counts,
        }),
      ]
    );

    await client.query('COMMIT');

    const message = `Restored and merged ${completedRows} database rows safely.`;
    report({
      stage: 'JSON restore complete',
      progress: 100,
      processed: completedRows,
      total: backup.totalRows,
      message,
    });

    return {
      message,
      restoredRows: completedRows,
      counts,
      sourceMetadata: backup.metadata,
    };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

module.exports = {
  generateJSONBackup,
  generateZIPBackup,
  restoreJSONBackup,
};
