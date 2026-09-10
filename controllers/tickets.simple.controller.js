'use strict';

const pool = require('../db');
const config = require('../config.json');
const identityBackfill = require('../services/ticketIdentityBackfill.service');

const transcriptChannelIds = [
  ...Object.values(config.transcriptChannels || {}),
  config.mainTranscriptChannelId,
  config.importSources?.transcriptChannelId,
].filter(Boolean).map(String).filter((value, index, array) => array.indexOf(value) === index);

identityBackfill.schedule();

function sendInternalError(req, res, error) {
  console.error('[API SIMPLE TICKETS ERROR]', error);
  return res.status(500).json({ error: 'Internal server error.', requestId: req.requestId });
}

function isPlaceholderName(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return !normalized || ['unknown user', 'archived user', 'discord user'].includes(normalized);
}

function parseTicketDetails(details) {
  if (!details) return null;
  try {
    if (typeof details === 'object') return details;
    const parsed = JSON.parse(String(details));
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

function buildDefaultDiscordAvatar(userId) {
  const id = String(userId || '').trim();
  if (!/^\d{15,22}$/.test(id)) return null;
  try {
    const index = Number((BigInt(id) >> 22n) % 6n);
    return `https://cdn.discordapp.com/embed/avatars/${index}.png`;
  } catch {
    return null;
  }
}

function withAvatarFallback(avatar, userId) {
  const value = String(avatar || '').trim();
  return value || buildDefaultDiscordAvatar(userId);
}

function hydrateIdentityFallbacks(rows) {
  return rows.map((ticket) => {
    const details = parseTicketDetails(ticket.details);
    const ownerFallback = String(details?.ticketOwnerName || details?.ownerName || '').trim();
    const closerFallback = String(details?.closedByName || details?.closed_by_name || '').trim();

    return {
      ...ticket,
      user_username: isPlaceholderName(ticket.user_username) && ownerFallback && !isPlaceholderName(ownerFallback)
        ? ownerFallback
        : ticket.user_username,
      closed_by_username: isPlaceholderName(ticket.closed_by_username) && closerFallback && !isPlaceholderName(closerFallback)
        ? closerFallback
        : ticket.closed_by_username,
      user_avatar: withAvatarFallback(ticket.user_avatar, ticket.user_id),
      assigned_by_avatar: withAvatarFallback(ticket.assigned_by_avatar, ticket.assigned_to),
      claimed_by_avatar: withAvatarFallback(ticket.claimed_by_avatar, ticket.claimed_by),
      closed_by_avatar: withAvatarFallback(ticket.closed_by_avatar, ticket.closed_by),
    };
  });
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
      return res.json(hydrateIdentityFallbacks(result.rows));
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
      return res.json(hydrateIdentityFallbacks(result.rows.map((ticket) => ({
        ...ticket,
        user_username: null,
        user_avatar: null,
        staff_username: null,
        staff_avatar: null,
        claimed_by_username: null,
        claimed_by_avatar: null,
        closed_by_username: null,
        closed_by_avatar: null,
      }))));
    }
  } catch (error) {
    return sendInternalError(req, res, error);
  }
};
