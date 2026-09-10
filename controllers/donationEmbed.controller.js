'use strict';

const DONATION_GUILD_ID = String(process.env.DONATION_GUILD_ID || '1536917083185483837').trim();
const DONATION_CHANNEL_IDS = new Set(
  String(process.env.DONATION_CHANNEL_IDS || '1536917086020833427,1536917085005946891,1536917087962796150,1536917087056961595,1536917087480713218')
    .split(',')
    .map(value => value.trim())
    .filter(Boolean)
);

const MAX_TITLE = 256;
const MAX_DESCRIPTION = 4000;
const MAX_FOOTER = 2048;
const MAX_AUTHOR = 256;
const MAX_URL = 2048;

function fail(status, message, code) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

function text(value, maxLength) {
  const result = String(value ?? '').trim();
  return result.slice(0, maxLength);
}

function httpUrl(value) {
  const valueText = text(value, MAX_URL);
  if (!valueText) return '';
  try {
    const url = new URL(valueText);
    if (!['http:', 'https:'].includes(url.protocol)) return '';
    return url.href;
  } catch (_) {
    return '';
  }
}

function normalizeColor(value) {
  const raw = text(value, 7).replace(/^#/, '');
  if (!raw) return null;
  if (!/^[0-9a-fA-F]{6}$/.test(raw)) throw fail(400, 'Color must be a 6-digit hexadecimal value such as #2563EB.', 'INVALID_COLOR');
  return parseInt(raw, 16);
}

function normalizeEmbed(input = {}) {
  const title = text(input.title, MAX_TITLE);
  const description = text(input.description, MAX_DESCRIPTION);
  if (!description) throw fail(400, 'Embed description is required.', 'DESCRIPTION_REQUIRED');

  const embed = { description };
  if (title) embed.title = title;

  const color = normalizeColor(input.color);
  if (color !== null) embed.color = color;

  const image = httpUrl(input.image);
  if (input.image && !image) throw fail(400, 'Image URL must be a valid HTTP/HTTPS URL.', 'INVALID_IMAGE_URL');
  if (image) embed.image = { url: image };

  const thumbnail = httpUrl(input.thumbnail);
  if (input.thumbnail && !thumbnail) throw fail(400, 'Thumbnail URL must be a valid HTTP/HTTPS URL.', 'INVALID_THUMBNAIL_URL');
  if (thumbnail) embed.thumbnail = { url: thumbnail };

  const footer = text(input.footer, MAX_FOOTER);
  if (footer) embed.footer = { text: footer };

  const author = text(input.author, MAX_AUTHOR);
  if (author) embed.author = { name: author };

  return embed;
}

async function discordRequest(pathname, options = {}) {
  const token = String(process.env.DISCORD_TOKEN || '').trim();
  if (!token) throw fail(503, 'DISCORD_TOKEN is not configured on the panel.', 'DISCORD_TOKEN_MISSING');

  const response = await fetch(`https://discord.com/api/v10${pathname}`, {
    ...options,
    headers: {
      Authorization: `Bot ${token}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });

  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const detail = body?.message ? ` Discord: ${body.message}` : '';
    throw fail(response.status === 403 ? 403 : 502, `Discord API request failed.${detail}`, 'DISCORD_API_ERROR');
  }
  return body;
}

exports.getDonationChannels = async (req, res) => {
  try {
    const channels = await discordRequest(`/guilds/${encodeURIComponent(DONATION_GUILD_ID)}/channels`);
    const allowed = channels
      .filter(channel => DONATION_CHANNEL_IDS.has(String(channel.id)))
      .filter(channel => [0, 5].includes(Number(channel.type)))
      .map(channel => ({ id: channel.id, name: channel.name, type: channel.type }));

    return res.json({ guildId: DONATION_GUILD_ID, channels: allowed });
  } catch (error) {
    console.error(`[DONATION EMBED ${req.requestId}]`, error);
    return res.status(error.status || 500).json({ error: error.message || 'Unable to load donation channels.', code: error.code || 'DONATION_CHANNELS_FAILED' });
  }
};

exports.sendEmbed = async (req, res) => {
  try {
    const channelId = String(req.body?.channelId || '').trim();
    if (!DONATION_CHANNEL_IDS.has(channelId)) {
      throw fail(403, 'That channel is not an approved GTA Pinas donation channel.', 'DONATION_CHANNEL_BLOCKED');
    }

    const embed = normalizeEmbed(req.body?.embed || {});
    const channel = await discordRequest(`/channels/${encodeURIComponent(channelId)}`);

    if (String(channel.guild_id || '') !== DONATION_GUILD_ID) {
      throw fail(403, 'The selected channel does not belong to the GTA Pinas donation server.', 'DONATION_GUILD_MISMATCH');
    }
    if (![0, 5].includes(Number(channel.type))) {
      throw fail(400, 'The selected donation destination is not a text channel.', 'INVALID_DONATION_CHANNEL');
    }

    const sent = await discordRequest(`/channels/${encodeURIComponent(channelId)}/messages`, {
      method: 'POST',
      body: JSON.stringify({
        embeds: [embed],
        allowed_mentions: { parse: [] },
      }),
    });

    console.log(`[DONATION EMBED] ${req.auth?.user?.username || req.auth?.user?.id || 'panel-user'} sent embed to #${channel.name} (${channelId}).`);
    return res.status(201).json({ success: true, messageId: sent?.id || null, channel: { id: channel.id, name: channel.name } });
  } catch (error) {
    console.error(`[DONATION EMBED ${req.requestId}]`, error);
    return res.status(error.status || 500).json({ error: error.message || 'Unable to send donation embed.', code: error.code || 'DONATION_EMBED_FAILED' });
  }
};

exports.normalizeEmbed = normalizeEmbed;
