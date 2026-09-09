'use strict';

const pool = require('../db');
const config = require('../config.json');
const {
  parsePagePagination,
  paginationMeta,
  normalizeSearch,
} = require('../utils/pagination');

const currentTranscriptIds = Object.values(config.transcriptChannels || {})
  .filter(Boolean)
  .map(String);
const ALLOWED_STATUSES = new Set(['open', 'closed']);

function sendInternalError(req, res, label, error) {
  console.error(`[${label} ${req.requestId}]`, error);
  return res.status(500).json({
    error: 'Internal server error.',
    requestId: req.requestId,
  });
}

function addFilter(values, conditions, expression, value) {
  values.push(value);
  conditions.push(expression.replace('?', `$${values.length}`));
}

exports.getTicketsPage = async (req, res) => {
  const { page, limit, offset } = parsePagePagination(req.query, {
    defaultLimit: 50,
    maxLimit: 200,
  });
  const status = ALLOWED_STATUSES.has(String(req.query.status || ''))
    ? String(req.query.status)
    : null;
  const category = normalizeSearch(req.query.category, 64).toLowerCase();
  const search = normalizeSearch(req.query.search, 120);

  const values = [currentTranscriptIds];
  const conditions = [`(
    (t.status = 'open' AND COALESCE(t.import_source, 'live') IN ('live', 'discord_open_import'))
    OR (t.status = 'closed' AND t.transcript_channel_id = ANY($1::text[]))
  )`];

  if (status) addFilter(values, conditions, 't.status = ?', status);
  if (category) addFilter(values, conditions, 'LOWER(COALESCE(t.category, \'\')) = ?', category);
  if (search) {
    values.push(`%${search}%`);
    const parameter = `$${values.length}`;
    conditions.push(`(
      t.ticket_number ILIKE ${parameter}
      OR t.channel_name ILIKE ${parameter}
      OR t.ticket_id ILIKE ${parameter}
      OR t.user_id ILIKE ${parameter}
      OR u.username ILIKE ${parameter}
    )`);
  }

  const whereSql = conditions.join('\n AND ');
  const countValues = [...values];
  values.push(limit, offset);
  const limitParameter = `$${values.length - 1}`;
  const offsetParameter = `$${values.length}`;

  try {
    const [countResult, rowsResult] = await Promise.all([
      pool.query(`
        SELECT COUNT(*)::BIGINT AS total
        FROM tickets t
        LEFT JOIN users u ON t.user_id = u.id
        WHERE ${whereSql}
      `, countValues),
      pool.query(`
        SELECT
          t.*,
          u.username AS user_username,
          u.avatar AS user_avatar,
          assigned.username AS staff_username,
          assigned.avatar AS staff_avatar,
          claimed.username AS claimed_by_username,
          claimed.avatar AS claimed_by_avatar,
          closed.username AS closed_by_username,
          closed.avatar AS closed_by_avatar
        FROM tickets t
        LEFT JOIN users u ON t.user_id = u.id
        LEFT JOIN staff assigned ON t.assigned_to = assigned.id
        LEFT JOIN staff claimed ON t.claimed_by = claimed.id
        LEFT JOIN staff closed ON t.closed_by = closed.id
        WHERE ${whereSql}
        ORDER BY COALESCE(t.updated_at, t.last_activity_at, t.created_at) DESC, t.id DESC
        LIMIT ${limitParameter}
        OFFSET ${offsetParameter}
      `, values),
    ]);

    const total = Number(countResult.rows[0]?.total || 0);
    res.setHeader('X-Pagination-Version', '1');
    return res.json({
      items: rowsResult.rows,
      pagination: paginationMeta({ page, limit, total }),
      filters: { status, category: category || null, search: search || null },
    });
  } catch (error) {
    return sendInternalError(req, res, 'API V2 TICKETS', error);
  }
};

exports.getTicketMessagesPage = async (req, res) => {
  const ticketId = String(req.params.id || '').trim();
  if (!ticketId) return res.status(400).json({ error: 'Ticket ID is required.' });

  const { page, limit, offset } = parsePagePagination(req.query, {
    defaultLimit: 100,
    maxLimit: 250,
  });

  try {
    const [ticketResult, countResult, messagesResult] = await Promise.all([
      pool.query('SELECT 1 FROM tickets WHERE id = $1 LIMIT 1', [ticketId]),
      pool.query(
        'SELECT COUNT(*)::BIGINT AS total FROM ticket_messages WHERE ticket_id = $1',
        [ticketId]
      ),
      pool.query(`
        SELECT
          m.id,
          m.ticket_id,
          m.user_id,
          m.username,
          m.avatar,
          m.content,
          m.is_embed,
          m.is_bot,
          m.created_at,
          m.updated_at,
          COALESCE(attachment_data.attachments, '[]'::json) AS attachments
        FROM ticket_messages m
        LEFT JOIN LATERAL (
          SELECT JSON_AGG(
            JSON_BUILD_OBJECT(
              'id', a.id,
              'filename', a.filename,
              'url', a.url,
              'content_type', a.content_type,
              'size_bytes', a.size_bytes
            )
            ORDER BY a.created_at ASC
          ) AS attachments
          FROM attachments a
          WHERE a.message_id = m.id
        ) attachment_data ON TRUE
        WHERE m.ticket_id = $1
        ORDER BY m.created_at ASC, m.id ASC
        LIMIT $2 OFFSET $3
      `, [ticketId, limit, offset]),
    ]);

    if (!ticketResult.rowCount) return res.status(404).json({ error: 'Ticket not found.' });

    const total = Number(countResult.rows[0]?.total || 0);
    res.setHeader('X-Pagination-Version', '1');
    return res.json({
      ticketId,
      items: messagesResult.rows,
      pagination: paginationMeta({ page, limit, total }),
    });
  } catch (error) {
    return sendInternalError(req, res, 'API V2 MESSAGES', error);
  }
};

exports.getTicketLogsPage = async (req, res) => {
  const ticketId = String(req.params.id || '').trim();
  if (!ticketId) return res.status(400).json({ error: 'Ticket ID is required.' });

  const { page, limit, offset } = parsePagePagination(req.query, {
    defaultLimit: 100,
    maxLimit: 250,
  });

  try {
    const [ticketResult, countResult, logsResult] = await Promise.all([
      pool.query('SELECT 1 FROM tickets WHERE id = $1 LIMIT 1', [ticketId]),
      pool.query(
        'SELECT COUNT(*)::BIGINT AS total FROM ticket_logs WHERE ticket_id = $1',
        [ticketId]
      ),
      pool.query(`
        SELECT id, ticket_id, action, actor_id, description, metadata, created_at
        FROM ticket_logs
        WHERE ticket_id = $1
        ORDER BY created_at ASC, id ASC
        LIMIT $2 OFFSET $3
      `, [ticketId, limit, offset]),
    ]);

    if (!ticketResult.rowCount) return res.status(404).json({ error: 'Ticket not found.' });

    const total = Number(countResult.rows[0]?.total || 0);
    res.setHeader('X-Pagination-Version', '1');
    return res.json({
      ticketId,
      items: logsResult.rows,
      pagination: paginationMeta({ page, limit, total }),
    });
  } catch (error) {
    return sendInternalError(req, res, 'API V2 LOGS', error);
  }
};
