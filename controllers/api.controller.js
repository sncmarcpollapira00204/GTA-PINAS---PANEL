const pool = require('../db');
const config = require('../config.json');
const staffConfig = require('../ticket-staff.js');

const currentTranscriptIds = [
  ...Object.values(config.transcriptChannels || {}),
  config.mainTranscriptChannelId,
  config.importSources?.transcriptChannelId,
].filter(Boolean).map(String).filter((value, index, array) => array.indexOf(value) === index);
const configuredStaffCount = Array.isArray(staffConfig.ticketAssignOptions) ? staffConfig.ticketAssignOptions.length : 0;

const DASHBOARD_CACHE_MS = 5000;
const TICKETS_CACHE_MS = 10000;
let dashboardCache = { expiresAt: 0, payload: null };
let ticketsCache = { expiresAt: 0, rows: null };
let dashboardPromise = null;
let ticketsPromise = null;

function sendInternalError(req, res) {
  return res.status(500).json({ error: 'Internal server error.', requestId: req.requestId });
}

function sanitizeTranscriptHtml(input) {
  let html = String(input || '');
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, '')
    .replace(/<(?:iframe|object|embed|form)\b[^>]*>[\s\S]*?<\/(?:iframe|object|embed|form)\s*>/gi, '')
    .replace(/<(?:iframe|object|embed|form)\b[^>]*\/?>/gi, '')
    .replace(/<meta\b[^>]*http-equiv\s*=\s*(["'])?refresh\1?[^>]*>/gi, '')
    .replace(/<base\b[^>]*>/gi, '')
    .replace(/\s+on[a-z0-9_-]+\s*=\s*(["'])[\s\S]*?\1/gi, '')
    .replace(/\s+on[a-z0-9_-]+\s*=\s*[^\s>]+/gi, '')
    .replace(/(href|src|xlink:href)\s*=\s*(["'])\s*javascript:[\s\S]*?\2/gi, '$1="#"');
}

function buildDashboardPayload(stats) {
  return {
    openTickets: Number(stats.open_tickets || 0),
    closedTickets: Number(stats.closed_tickets || 0),
    totalTickets: Number(stats.total_tickets || 0),
    ticketsVersion: stats.tickets_version || null,
    staffOnline: Number(stats.staff_registered || 0),
  };
}

async function queryDashboard() {
  try {
    const result = await pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE status = 'open')::INTEGER AS open_tickets,
        COUNT(*) FILTER (WHERE status = 'closed' AND transcript_channel_id = ANY($1::text[]))::INTEGER AS closed_tickets,
        COUNT(*) FILTER (WHERE status IN ('open','closed') AND (status = 'open' OR transcript_channel_id = ANY($1::text[])))::INTEGER AS total_tickets,
        MAX(COALESCE(updated_at, last_activity_at, closed_at, created_at)) AS tickets_version,
        $2::INTEGER AS staff_registered
      FROM tickets
    `, [currentTranscriptIds, configuredStaffCount]);
    return buildDashboardPayload(result.rows[0] || {});
  } catch (primaryError) {
    console.error('[API DASHBOARD PRIMARY QUERY ERROR]', primaryError);
    const result = await pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE status = 'open')::INTEGER AS open_tickets,
        COUNT(*) FILTER (WHERE status = 'closed')::INTEGER AS closed_tickets,
        COUNT(*)::INTEGER AS total_tickets,
        MAX(COALESCE(updated_at, last_activity_at, closed_at, created_at)) AS tickets_version,
        $1::INTEGER AS staff_registered
      FROM tickets
    `, [configuredStaffCount]);
    return buildDashboardPayload(result.rows[0] || {});
  }
}

exports.getDashboardStats = async (req, res) => {
  try {
    if (dashboardCache.payload && dashboardCache.expiresAt > Date.now()) return res.json(dashboardCache.payload);
    if (!dashboardPromise) dashboardPromise = queryDashboard().finally(() => { dashboardPromise = null; });

    const payload = await dashboardPromise;
    if (dashboardCache.payload?.ticketsVersion !== payload.ticketsVersion) ticketsCache = { expiresAt: 0, rows: null };
    dashboardCache = { expiresAt: Date.now() + DASHBOARD_CACHE_MS, payload };
    return res.json(payload);
  } catch (error) {
    console.error('[API DASHBOARD ERROR]', error);
    return sendInternalError(req, res);
  }
};

async function queryTickets(normalizedStatus) {
  const values = [currentTranscriptIds];
  let query = `
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
    WHERE (
      t.status = 'open'
      OR (t.status = 'closed' AND t.transcript_channel_id = ANY($1::text[]))
    )
  `;
  if (normalizedStatus) {
    values.push(normalizedStatus);
    query += ' AND t.status = $2';
  }
  query += ' ORDER BY t.created_at DESC';

  try {
    const result = await pool.query(query, values);
    return result.rows;
  } catch (primaryError) {
    console.error('[API TICKETS PRIMARY QUERY ERROR]', primaryError);
    const fallbackValues = [];
    let fallbackQuery = `SELECT t.* FROM tickets t WHERE 1=1`;
    if (normalizedStatus) {
      fallbackValues.push(normalizedStatus);
      fallbackQuery += ' AND t.status = $1';
    }
    fallbackQuery += ' ORDER BY t.created_at DESC';
    const result = await pool.query(fallbackQuery, fallbackValues);
    return result.rows.map((row) => ({
      ...row,
      user_username: null,
      user_avatar: null,
      staff_username: null,
      staff_avatar: null,
      claimed_by_username: null,
      claimed_by_avatar: null,
      closed_by_username: null,
      closed_by_avatar: null,
    }));
  }
}

exports.getTickets = async (req, res) => {
  try {
    const { status } = req.query;
    const normalizedStatus = new Set(['open', 'closed']).has(status) ? status : null;

    if (!normalizedStatus && ticketsCache.rows && ticketsCache.expiresAt > Date.now()) return res.json(ticketsCache.rows);
    if (!normalizedStatus && !ticketsPromise) ticketsPromise = queryTickets(null).finally(() => { ticketsPromise = null; });

    const rows = normalizedStatus ? await queryTickets(normalizedStatus) : await ticketsPromise;
    if (!normalizedStatus) ticketsCache = { expiresAt: Date.now() + TICKETS_CACHE_MS, rows };
    return res.json(rows);
  } catch (error) {
    console.error('[API TICKETS ERROR]', error);
    return sendInternalError(req, res);
  }
};

exports.getTicketById = async (req, res) => {
  try {
    const ticketId = String(req.params.id || '').trim();
    if (!ticketId) return res.status(400).json({ error: 'Ticket ID is required.' });

    const ticketResult = await pool.query(`
      SELECT t.*, u.username AS user_username, u.avatar AS user_avatar,
        assigned.username AS staff_username, assigned.avatar AS staff_avatar,
        claimed_by.username AS claimed_by_username, claimed_by.avatar AS claimed_by_avatar,
        closed.username AS closed_by_username, closed.avatar AS closed_by_avatar
      FROM tickets t
      LEFT JOIN users u ON t.user_id = u.id
      LEFT JOIN staff assigned ON t.assigned_to = assigned.id
      LEFT JOIN staff claimed_by ON t.claimed_by = claimed_by.id
      LEFT JOIN staff closed ON t.closed_by = closed.id
      WHERE t.id = $1 LIMIT 1`, [ticketId]);

    if (!ticketResult.rows.length) return res.status(404).json({ error: 'Ticket not found.' });

    const messagesResult = await pool.query(`
      SELECT
        m.id,
        m.ticket_id,
        m.user_id,
        CASE
          WHEN LOWER(TRIM(COALESCE(m.username, ''))) IN ('user', 'unknown user', 'archived user', 'discord user')
            THEN COALESCE(NULLIF(TRIM(message_user.username), ''), NULLIF(TRIM(author_staff.username), ''), m.username)
          ELSE COALESCE(NULLIF(TRIM(m.username), ''), NULLIF(TRIM(message_user.username), ''), NULLIF(TRIM(author_staff.username), ''), 'Unknown User')
        END AS username,
        COALESCE(NULLIF(TRIM(m.avatar), ''), NULLIF(TRIM(message_user.avatar), ''), NULLIF(TRIM(author_staff.avatar), '')) AS avatar,
        m.content,
        m.is_embed,
        m.is_bot,
        m.created_at,
        m.updated_at,
        CASE
          WHEN m.is_bot = TRUE THEN 'bot'
          WHEN m.user_id = ticket.user_id THEN 'owner'
          WHEN author_staff.id IS NOT NULL THEN 'staff'
          ELSE 'participant'
        END AS author_role,
        author_staff.role AS author_staff_role,
        COALESCE(attachment_data.attachments, '[]'::json) AS attachments
      FROM ticket_messages m
      JOIN tickets ticket ON ticket.id = m.ticket_id
      LEFT JOIN users message_user ON message_user.id = m.user_id
      LEFT JOIN staff author_staff ON author_staff.id = m.user_id
      LEFT JOIN LATERAL (
        SELECT JSON_AGG(JSON_BUILD_OBJECT('id', a.id, 'filename', a.filename, 'url', a.url, 'content_type', a.content_type, 'size_bytes', a.size_bytes) ORDER BY a.created_at ASC) AS attachments
        FROM attachments a WHERE a.message_id = m.id
      ) attachment_data ON TRUE
      WHERE m.ticket_id = $1 ORDER BY m.created_at ASC`, [ticketId]);

    const logsResult = await pool.query(`SELECT id, ticket_id, action, actor_id, description, metadata, created_at FROM ticket_logs WHERE ticket_id = $1 ORDER BY created_at ASC`, [ticketId]);
    const transcriptResult = await pool.query(`SELECT id, ticket_id, discord_url, log_channel_id, log_message_id, generated_at, LENGTH(COALESCE(html_content, ''))::INTEGER AS html_size FROM ticket_transcripts WHERE ticket_id = $1 ORDER BY generated_at DESC LIMIT 1`, [ticketId]);

    return res.json({ ticket: ticketResult.rows[0], messages: messagesResult.rows, logs: logsResult.rows, transcript: transcriptResult.rows[0] || null });
  } catch (error) {
    console.error('[API TICKET DETAILS ERROR]', error);
    return sendInternalError(req, res);
  }
};

exports.getTicketTranscriptHtml = async (req, res) => {
  try {
    const ticketId = String(req.params.id || '').trim();
    if (!ticketId) return res.status(400).send('Ticket ID is required.');
    const result = await pool.query(`
      SELECT tr.html_content, t.ticket_number, t.channel_name
      FROM ticket_transcripts tr JOIN tickets t ON t.id = tr.ticket_id
      WHERE tr.ticket_id = $1 ORDER BY tr.generated_at DESC LIMIT 1`, [ticketId]);
    if (!result.rows.length || !result.rows[0].html_content) return res.status(404).send('Saved HTML transcript was not found.');
    const ticket = result.rows[0];
    const safeName = String(ticket.ticket_number || ticket.channel_name || ticketId).replace(/[^a-zA-Z0-9_-]/g, '-');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Content-Disposition', `inline; filename="transcript-${safeName}.html"`);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', ["sandbox", "default-src 'none'", "script-src 'none'", "style-src 'unsafe-inline'", "img-src https: data: blob:", "media-src https: data: blob:", "font-src https: data:", "connect-src 'none'", "frame-src 'none'", "object-src 'none'", "base-uri 'none'", "form-action 'none'"].join('; '));
    res.setHeader('Cache-Control', 'private, no-store');
    return res.send(sanitizeTranscriptHtml(ticket.html_content));
  } catch (error) {
    console.error('[API TRANSCRIPT HTML ERROR]', error);
    return res.status(500).send('Unable to load the saved transcript.');
  }
};

exports.getStaff = async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM staff ORDER BY tickets_handled DESC, username ASC');
    return res.json(result.rows);
  } catch (error) {
    console.error('[API STAFF ERROR]', error);
    return sendInternalError(req, res);
  }
};
