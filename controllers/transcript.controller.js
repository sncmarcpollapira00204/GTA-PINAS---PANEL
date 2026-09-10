'use strict';

const crypto = require('crypto');
const pool = require('../db');
const {
  TRANSCRIPT_COMPONENT_SRC,
  buildSafeTranscriptHtml,
} = require('../utils/transcriptHtml');

const DISCORD_API = 'https://discord.com/api/v10';

function getDiscordToken() {
  return String(
    process.env.DISCORD_TOKEN || process.env.BOT_TOKEN || process.env.DISCORD_BOT_TOKEN || ''
  ).trim().replace(/^['"]|['"]$/g, '');
}

async function fetchDiscordTranscript(url) {
  if (!url) return null;
  const response = await fetch(String(url), {
    headers: { 'User-Agent': 'GTA-Pinas-Web-Panel/Transcript-Proxy' },
    signal: AbortSignal.timeout(15000),
  }).catch(() => null);
  if (!response?.ok) return null;
  const contentType = String(response.headers.get('content-type') || '').toLowerCase();
  if (contentType && !contentType.includes('text/html')) return null;
  const html = await response.text().catch(() => '');
  if (!html || html.length > 20 * 1024 * 1024) return null;
  return html;
}

exports.getTicketTranscriptHtml = async (req, res) => {
  try {
    const ticketId = String(req.params.id || '').trim();
    if (!ticketId) return res.status(400).send('Ticket ID is required.');

    const result = await pool.query(
      `
        SELECT
          tr.html_content,
          tr.discord_url,
          t.transcript_url,
          t.ticket_number,
          t.channel_name
        FROM ticket_transcripts tr
        JOIN tickets t ON t.id = tr.ticket_id
        WHERE tr.ticket_id = $1
        ORDER BY tr.generated_at DESC
        LIMIT 1
      `,
      [ticketId]
    );

    if (!result.rows.length) {
      const fallback = await pool.query(
        `SELECT transcript_url, ticket_number, channel_name FROM tickets WHERE id=$1 LIMIT 1`,
        [ticketId]
      );
      if (!fallback.rows.length) return res.status(404).send('Transcript was not found.');
      result.rows.push({ ...fallback.rows[0], html_content: null, discord_url: null });
    }

    const ticket = result.rows[0];
    let html = String(ticket.html_content || '');

    // New transcripts are stored in Discord and referenced by URL only.
    // Fetch the file on demand so PostgreSQL does not hold a second full copy.
    if (!html) {
      html = await fetchDiscordTranscript(ticket.discord_url || ticket.transcript_url);
    }

    if (!html) {
      return res.status(404).send('Transcript file is no longer available from Discord.');
    }

    const safeName = String(
      ticket.ticket_number || ticket.channel_name || ticketId
    ).replace(/[^a-zA-Z0-9_-]/g, '-');
    const nonce = crypto.randomBytes(18).toString('base64');

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `inline; filename="transcript-${safeName}.html"`
    );
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader(
      'Content-Security-Policy',
      [
        'sandbox allow-scripts',
        "default-src 'none'",
        `script-src 'nonce-${nonce}' https://cdn.jsdelivr.net`,
        "style-src 'unsafe-inline' https://fonts.bunny.net",
        'img-src https: data: blob:',
        'media-src https: data: blob:',
        'font-src https: data:',
        "connect-src 'none'",
        "frame-src 'none'",
        "object-src 'none'",
        "base-uri 'none'",
        "form-action 'none'",
      ].join('; ')
    );
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Transcript-Renderer', TRANSCRIPT_COMPONENT_SRC);

    return res.send(buildSafeTranscriptHtml(html, nonce));
  } catch (error) {
    console.error(`[API TRANSCRIPT HTML ${req.requestId}]`, error);
    return res.status(500).send('Unable to load the saved transcript.');
  }
};
