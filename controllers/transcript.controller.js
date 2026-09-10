'use strict';

const crypto = require('crypto');
const pool = require('../db');
const config = require('../config.json');
const {
  TRANSCRIPT_COMPONENT_SRC,
  extractDiscordTranscriptState,
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

async function discordJson(pathname) {
  const token = getDiscordToken();
  if (!token) return null;
  const response = await fetch(`${DISCORD_API}${pathname}`, {
    headers: {
      Authorization: `Bot ${token}`,
      'User-Agent': 'GTA-Pinas-Web-Panel/Transcript-Identity',
    },
    signal: AbortSignal.timeout(8000),
  }).catch(() => null);
  if (!response?.ok) return null;
  return response.json().catch(() => null);
}

function isPlaceholderName(value) {
  return /^(user|unknown user|archived user|discord user)$/i.test(String(value || '').trim());
}

async function resolveDiscordProfile(discordId) {
  const id = String(discordId || '').trim();
  if (!/^\d{15,22}$/.test(id)) return null;

  const member = config.guildId
    ? await discordJson(`/guilds/${encodeURIComponent(String(config.guildId))}/members/${encodeURIComponent(id)}`)
    : null;
  const user = member?.user || await discordJson(`/users/${encodeURIComponent(id)}`);
  if (!user?.id) return null;

  const displayName = String(
    member?.nick || user.global_name || user.username || ''
  ).trim();
  if (!displayName) return null;

  let avatar = '';
  if (user.avatar) {
    avatar = `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.${String(user.avatar).startsWith('a_') ? 'gif' : 'png'}?size=128`;
  } else {
    try {
      const index = Number((BigInt(String(user.id)) >> 22n) % 6n);
      avatar = `https://cdn.discordapp.com/embed/avatars/${index}.png`;
    } catch (_) {}
  }

  return { id: String(user.id), author: displayName, avatar: avatar || null, bot: Boolean(user.bot) };
}

async function hydrateTranscriptProfiles(html) {
  const state = extractDiscordTranscriptState(html);
  const profiles = state && typeof state.profiles === 'object' && state.profiles !== null
    ? state.profiles
    : {};

  const entries = Object.entries(profiles);
  if (!entries.length) return state;

  const resolved = await Promise.all(entries.map(async ([profileId, profile]) => {
    const current = profile && typeof profile === 'object' ? { ...profile } : {};
    if (!/^\d{15,22}$/.test(String(profileId)) || !isPlaceholderName(current.author)) {
      return [profileId, current];
    }

    const identity = await resolveDiscordProfile(profileId);
    if (!identity) return [profileId, current];

    return [profileId, {
      ...current,
      author: identity.author,
      avatar: identity.avatar || current.avatar,
      bot: current.bot ?? identity.bot,
    }];
  }));

  return { ...state, profiles: Object.fromEntries(resolved) };
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

    if (!html) {
      html = await fetchDiscordTranscript(ticket.discord_url || ticket.transcript_url);
    }

    if (!html) {
      return res.status(404).send('Transcript file is no longer available from Discord.');
    }

    const state = await hydrateTranscriptProfiles(html);
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

    return res.send(buildSafeTranscriptHtml(html, nonce, state));
  } catch (error) {
    console.error(`[API TRANSCRIPT HTML ${req.requestId}]`, error);
    return res.status(500).send('Unable to load the saved transcript.');
  }
};
