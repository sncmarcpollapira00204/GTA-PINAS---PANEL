'use strict';

const pool = require('../db');
const { schoolTicketPredicate } = require('../services/schoolTicketAccess.service');
const {
  parsePagePagination,
  paginationMeta,
  normalizeSearch,
} = require('../utils/pagination');

const ALLOWED_STATUSES = new Set(['open', 'closed']);

function sendInternalError(req, res, label, error) {
  console.error(`[${label} ${req.requestId}]`, error);
  return res.status(500).json({
    error: 'Internal server error.',
    requestId: req.requestId,
  });
}

const SCHOOL_WHERE = schoolTicketPredicate('t');
const TICKET_SELECT = `
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
`;

exports.getDashboardStats = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        COUNT(*)::INTEGER AS open_tickets,
        MAX(COALESCE(updated_at, last_activity_at, created_at)) AS tickets_version
      FROM tickets t
      WHERE ${SCHOOL_WHERE}
    `);
    const row = result.rows[0] || {};
    const openTickets = Number(row.open_tickets || 0);
    return res.json({
      openTickets,
      closedTickets: 0,
      totalTickets: openTickets,
      ticketsVersion: row.tickets_version || null,
      staffOnline: 0,
    });
  } catch (error) {
    return sendInternalError(req, res, 'SCHOOL DASHBOARD', error);
  }
};

exports.getTickets = async (req, res) => {
  const status = ALLOWED_STATUSES.has(String(req.query.status || ''))
    ? String(req.query.status)
    : null;

  if (status === 'closed') return res.json([]);

  try {
    const result = await pool.query(`
      ${TICKET_SELECT}
      WHERE ${SCHOOL_WHERE}
      ORDER BY t.created_at DESC
    `);
    return res.json(result.rows);
  } catch (error) {
    return sendInternalError(req, res, 'SCHOOL TICKETS', error);
  }
};

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

  if (status === 'closed') {
    return res.json({
      items: [],
      pagination: paginationMeta({ page, limit, total: 0 }),
      filters: { status, category: category || null, search: search || null },
    });
  }

  const values = [];
  const conditions = [SCHOOL_WHERE];

  if (category) {
    values.push(category);
    conditions.push(`LOWER(COALESCE(t.category, '')) = $${values.length}`);
  }
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
        ${TICKET_SELECT}
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
    return sendInternalError(req, res, 'SCHOOL V2 TICKETS', error);
  }
};
