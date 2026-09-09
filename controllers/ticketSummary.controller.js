'use strict';

const pool = require('../db');
const config = require('../config.json');
const { buildDiscordChannelUrl } = require('../utils/discordChannelUrl');

exports.getTicketSummary = async (req, res) => {
  const ticketId = String(req.params.id || '').trim();
  if (!ticketId) return res.status(400).json({ error: 'Ticket ID is required.' });

  try {
    const result = await pool.query(
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
          closed.avatar AS closed_by_avatar,
          transcript.discord_url AS transcript_discord_url
        FROM tickets t
        LEFT JOIN users u ON t.user_id = u.id
        LEFT JOIN staff assigned ON t.assigned_to = assigned.id
        LEFT JOIN staff claimed ON t.claimed_by = claimed.id
        LEFT JOIN staff closed ON t.closed_by = closed.id
        LEFT JOIN LATERAL (
          SELECT tr.discord_url
          FROM ticket_transcripts tr
          WHERE tr.ticket_id = t.id
          ORDER BY tr.generated_at DESC
          LIMIT 1
        ) transcript ON TRUE
        WHERE t.id = $1
        LIMIT 1
      `,
      [ticketId]
    );

    if (!result.rowCount) return res.status(404).json({ error: 'Ticket not found.' });

    const ticket = result.rows[0];
    const channelUrl = buildDiscordChannelUrl(config.guildId, ticket.channel_id);
    const transcriptUrl = /^https:\/\/discord\.com\/channels\//i.test(String(ticket.transcript_discord_url || ''))
      ? String(ticket.transcript_discord_url)
      : '';

    return res.json({
      ticket,
      discord: {
        guildId: String(config.guildId || ''),
        channelUrl,
        transcriptUrl,
        targetUrl: ticket.status === 'closed'
          ? (transcriptUrl || channelUrl)
          : channelUrl,
      },
    });
  } catch (error) {
    console.error(`[API TICKET SUMMARY ${req.requestId}]`, error);
    return res.status(500).json({
      error: 'Internal server error.',
      requestId: req.requestId,
    });
  }
};
