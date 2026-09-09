'use strict';

const crypto = require('crypto');
const pool = require('../db');
const {
  TRANSCRIPT_COMPONENT_SRC,
  buildSafeTranscriptHtml,
} = require('../utils/transcriptHtml');

exports.getTicketTranscriptHtml = async (req, res) => {
  try {
    const ticketId = String(req.params.id || '').trim();
    if (!ticketId) return res.status(400).send('Ticket ID is required.');

    const result = await pool.query(
      `
        SELECT
          tr.html_content,
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

    if (!result.rows.length || !result.rows[0].html_content) {
      return res.status(404).send('Saved HTML transcript was not found.');
    }

    const ticket = result.rows[0];
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

    return res.send(buildSafeTranscriptHtml(ticket.html_content, nonce));
  } catch (error) {
    console.error(`[API TRANSCRIPT HTML ${req.requestId}]`, error);
    return res.status(500).send('Unable to load the saved transcript.');
  }
};
