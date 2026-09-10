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
const PLACEHOLDER_NAMES = /^(?:user|unknown user|archived user|discord user)$/i;

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

function buildDiscordAvatarUrl(user) {
  if (!user?.id) return null;
  if (user.avatar) {
    const extension = String(user.avatar).startsWith('a_') ? 'gif' : 'png';
    return `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.${extension}?size=128`;
  }

  try {
    const index = Number((BigInt(String(user.id)) >> 22n) % 6n);
    return `https://cdn.discordapp.com/embed/avatars/${index}.png`;
  } catch (_) {
    return null;
  }
}

async function resolveDiscordProfile(discordId) {
  const id = String(discordId || '').trim();
  if (!/^\d{15,22}$/.test(id)) return null;

  // Discord is the source of truth for the current username/display name and avatar.
  // A local database record is only used as a fallback when Discord cannot be queried.
  const member = config.guildId
    ? await discordJson(
        `/guilds/${encodeURIComponent(String(config.guildId))}/members/${encodeURIComponent(id)}`
      )
    : null;
  const user = member?.user || await discordJson(`/users/${encodeURIComponent(id)}`);

  if (user?.id) {
    const username = String(user.username || '').trim();
    const displayName = String(
      member?.nick || user.global_name || username || ''
    ).trim();

    if (username || displayName) {
      return {
        id: String(user.id),
        username: username || displayName,
        displayName: displayName || username,
        author: displayName || username,
        avatar: buildDiscordAvatarUrl(user),
        bot: Boolean(user.bot),
      };
    }
  }

  // Fallback: older/imported installations may have enough identity data locally.
  try {
    const local = await pool.query(
      `SELECT username, avatar_url FROM users WHERE discord_id = $1 LIMIT 1`,
      [id]
    );
    const row = local.rows?.[0];
    const localName = String(row?.username || '').trim();
    if (localName && !PLACEHOLDER_NAMES.test(localName)) {
      return {
        id,
        username: localName,
        displayName: localName,
        author: localName,
        avatar: row?.avatar_url ? String(row.avatar_url) : null,
        bot: false,
      };
    }
  } catch (_) {
    // Older schemas may not expose the local discord_id/avatar_url columns.
  }

  return null;
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
    const identity = await resolveDiscordProfile(profileId);
    if (!identity) return [profileId, current];

    // DerockDev's Discord transcript component consumes the `author` and `avatar`
    // profile fields. Preserve the rest of the saved profile state, but replace
    // placeholder/stale identity data with the current Discord identity.
    const currentAuthor = String(current.author || '').trim();
    const currentDisplayName = String(current.displayName || '').trim();
    const author = identity.displayName || identity.username || currentDisplayName || currentAuthor || 'Unknown User';

    return [profileId, {
      ...current,
      id: identity.id || current.id || profileId,
      username: identity.username || current.username,
      displayName: identity.displayName || current.displayName,
      globalName: identity.displayName || current.globalName,
      author,
      avatar: identity.avatar || current.avatar,
      bot: identity.bot,
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
    if (!html) html = await fetchDiscordTranscript(ticket.discord_url || ticket.transcript_url);
    if (!html) return res.status(404).send('Transcript file is no longer available from Discord.');

    const state = await hydrateTranscriptProfiles(html);
    const safeName = String(ticket.ticket_number || ticket.channel_name || ticketId).replace(/[^a-zA-Z0-9_-]/g, '-');
    const nonce = crypto.randomBytes(18).toString('base64');

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Content-Disposition', `inline; filename="transcript-${safeName}.html"`);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', [
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
    ].join('; '));
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Transcript-Renderer', TRANSCRIPT_COMPONENT_SRC);
    return res.send(buildSafeTranscriptHtml(html, nonce, state));
  } catch (error) {
    console.error(`[API TRANSCRIPT HTML ${req.requestId}]`, error);
    return res.status(500).send('Unable to load the saved transcript.');
  }
};
