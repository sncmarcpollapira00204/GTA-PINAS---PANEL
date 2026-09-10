'use strict';

const pool = require('../db');
const config = require('../config.json');

const transcriptChannelIds = [
  ...Object.values(config.transcriptChannels || {}),
  config.mainTranscriptChannelId,
  config.importSources?.transcriptChannelId,
].filter(Boolean).map(String).filter((value, index, array) => array.indexOf(value) === index);

function sendInternalError(req, res, error) {
  console.error('[API SIMPLE TICKETS ERROR]', error);
  return res.status(500).json({ error: 'Internal server error.', requestId: req.requestId });
}

exports.getTickets = async (req, res) => {
  try {
    const status = ['open', 'closed'].includes(String(req.query.status || '')) ? String(req.query.status) : null;

    const values = [transcriptChannelIds];
    let query = `
      SELECT
        t.id,
        t.ticket_id,
        t.ticket_number,
        t.guild_id,
        t.channel_id,
        t.channel_name,
        t.user_id,
        t.category,
        t.priority,
        t.status,
        t.details,
        t.claimed_by,
        t.claimed_at,
        t.assigned_to,
        t.assigned_at,
        t.created_at,
        t.last_activity_at,
        t.closed_at,
        t.closed_by,
        t.close_reason,
        t.transcript_message_id,
        t.transcript_channel_id,
        t.transcript_url,
        t.import_source,
        t.updated_at,
        COALESCE(u.username, NULL) AS user_username,
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
        (t.status = 'open' AND COALESCE(t.import_source, 'live') IN ('live', 'discord_open_import'))
        OR (t.status = 'closed' AND t.transcript_channel_id = ANY($1::text[]))
      )
    `;

    if (status) {
      values.push(status);
      query += ' AND t.status = $2';
    }

    query += ' ORDER BY COALESCE(t.updated_at, t.last_activity_at, t.closed_at, t.created_at) DESC';

    try {
      const result = await pool.query(query, values);
      return res.json(result.rows);
    } catch (primaryError) {
      console.warn('[API SIMPLE TICKETS JOIN FALLBACK]', primaryError.message);

      const fallbackValues = [transcriptChannelIds];
      let fallbackQuery = `
        SELECT
          t.id,
          t.ticket_id,
          t.ticket_number,
          t.guild_id,
          t.channel_id,
          t.channel_name,
          t.user_id,
          t.category,
          t.priority,
          t.status,
          t.details,
          t.claimed_by,
          t.claimed_at,
          t.assigned_to,
          t.assigned_at,
          t.created_at,
          t.last_activity_at,
          t.closed_at,
          t.closed_by,
          t.close_reason,
          t.transcript_message_id,
          t.transcript_channel_id,
          t.transcript_url,
          t.import_source,
          t.updated_at
        FROM tickets t
        WHERE (
          (t.status = 'open' AND COALESCE(t.import_source, 'live') IN ('live', 'discord_open_import'))
          OR (t.status = 'closed' AND t.transcript_channel_id = ANY($1::text[]))
        )
      `;

      if (status) {
        fallbackValues.push(status);
        fallbackQuery += ' AND t.status = $2';
      }
      fallbackQuery += ' ORDER BY COALESCE(t.updated_at, t.last_activity_at, t.closed_at, t.created_at) DESC';

      const result = await pool.query(fallbackQuery, fallbackValues);
      return res.json(result.rows.map((ticket) => ({
        ...ticket,
        user_username: null,
        user_avatar: null,
        staff_username: null,
        staff_avatar: null,
        claimed_by_username: null,
        claimed_by_avatar: null,
        closed_by_username: null,
        closed_by_avatar: null,
      })));
    }
  } catch (error) {
    return sendInternalError(req, res, error);
  }
};
