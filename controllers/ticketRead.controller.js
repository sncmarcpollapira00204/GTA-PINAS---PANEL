'use strict';

const pool = require('../db');
const { BoundedTtlCache, integerInRange } = require('../utils/boundedTtlCache');

const DETAIL_CACHE_MS = integerInRange(
  process.env.TICKET_DETAIL_CACHE_MS,
  3000,
  500,
  15000
);
const DETAIL_CACHE_MAX = integerInRange(
  process.env.TICKET_DETAIL_CACHE_MAX,
  250,
  25,
  2000
);

const detailCache = new BoundedTtlCache({
  ttlMs: DETAIL_CACHE_MS,
  maxEntries: DETAIL_CACHE_MAX,
});
const detailPromises = new Map();

function forceRefresh(req) {
  const value = String(req.query.refresh || '').trim().toLowerCase();
  return value === '1' || value === 'true';
}

async function queryTicketDetails(ticketId) {
  const ticketResult = await pool.query(
    `
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
      WHERE t.id = $1
      LIMIT 1
    `,
    [ticketId]
  );

  if (!ticketResult.rows.length) return null;

  const [messagesResult, logsResult, transcriptResult] = await Promise.all([
    pool.query(
      `
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
        LEFT JOIN staff author_staff ON author_staff.id = m.user_id
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
      `,
      [ticketId]
    ),
    pool.query(
      `
        SELECT
          id,
          ticket_id,
          action,
          actor_id,
          description,
          metadata,
          created_at
        FROM ticket_logs
        WHERE ticket_id = $1
        ORDER BY created_at ASC, id ASC
      `,
      [ticketId]
    ),
    pool.query(
      `
        SELECT
          id,
          ticket_id,
          discord_url,
          log_channel_id,
          log_message_id,
          generated_at,
          LENGTH(COALESCE(html_content, ''))::INTEGER AS html_size
        FROM ticket_transcripts
        WHERE ticket_id = $1
        ORDER BY generated_at DESC
        LIMIT 1
      `,
      [ticketId]
    ),
  ]);

  const ticket = ticketResult.rows[0];
  let transcript = transcriptResult.rows[0] || null;

  // Imported transcripts are stored as lightweight Discord links on the ticket.
  // Use those fields as the fallback when no local ticket_transcripts row exists.
  if (transcript) {
    transcript = {
      ...transcript,
      discord_url: transcript.discord_url || ticket.transcript_url || null,
      log_channel_id: transcript.log_channel_id || ticket.transcript_channel_id || null,
      log_message_id: transcript.log_message_id || ticket.transcript_message_id || null,
    };
  } else if (ticket.transcript_url) {
    transcript = {
      id: null,
      ticket_id: ticket.id,
      discord_url: ticket.transcript_url,
      log_channel_id: ticket.transcript_channel_id || null,
      log_message_id: ticket.transcript_message_id || null,
      generated_at: ticket.closed_at || ticket.updated_at || null,
      html_size: null,
    };
  }

  return {
    ticket,
    messages: messagesResult.rows,
    logs: logsResult.rows,
    transcript,
  };
}

async function loadTicketDetails(ticketId, { force = false } = {}) {
  if (!force) {
    const cached = detailCache.get(ticketId);
    if (cached) return { payload: cached, cacheStatus: 'HIT' };
  }

  const existingPromise = detailPromises.get(ticketId);
  if (existingPromise) {
    return { payload: await existingPromise, cacheStatus: 'COALESCED' };
  }

  const promise = queryTicketDetails(ticketId)
    .then((payload) => {
      if (payload) detailCache.set(ticketId, payload);
      else detailCache.delete(ticketId);
      return payload;
    })
    .finally(() => {
      if (detailPromises.get(ticketId) === promise) detailPromises.delete(ticketId);
    });

  detailPromises.set(ticketId, promise);
  return { payload: await promise, cacheStatus: 'MISS' };
}

exports.getTicketById = async (req, res) => {
  const ticketId = String(req.params.id || '').trim();
  if (!ticketId) return res.status(400).json({ error: 'Ticket ID is required.' });

  try {
    const result = await loadTicketDetails(ticketId, { force: forceRefresh(req) });
    if (!result.payload) return res.status(404).json({ error: 'Ticket not found.' });

    res.setHeader('X-Ticket-Read-Cache', result.cacheStatus);
    return res.json(result.payload);
  } catch (error) {
    console.error(`[API TICKET DETAILS ${req.requestId}]`, error);
    return res.status(500).json({
      error: 'Internal server error.',
      requestId: req.requestId,
    });
  }
};

exports.clearTicketDetailCache = (ticketId = null) => {
  if (ticketId === null || ticketId === undefined) detailCache.clear();
  else detailCache.delete(ticketId);
};

exports.getTicketDetailCacheMetrics = () => ({
  entries: detailCache.size,
  inFlight: detailPromises.size,
  ttlMs: DETAIL_CACHE_MS,
  maxEntries: DETAIL_CACHE_MAX,
});
