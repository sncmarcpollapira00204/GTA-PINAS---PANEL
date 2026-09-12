'use strict';

const DONATION_GUILD_ID = String(process.env.DONATION_GUILD_ID || '1536917083185483837').trim();
const DONATION_CHANNEL_IDS = new Set(
  String(process.env.DONATION_CHANNEL_IDS || '1536917086020833427,1536917085005946891,1536917086670946421,1536917087962796150,1536917087056961595,1536917087480713218')
    .split(',').map(value => value.trim()).filter(Boolean)
);

const MAX_TITLE = 256;
const MAX_DESCRIPTION = 4000;
const MAX_FOOTER = 2048;
const MAX_AUTHOR = 256;
const MAX_URL = 2048;
const MAX_FIELDS = 25;

function fail(status, message, code) {
  const error = new Error(message); error.status = status; error.code = code; return error;
}
function text(value, maxLength) { return String(value ?? '').trim().slice(0, maxLength); }
function httpUrl(value) {
  const valueText = text(value, MAX_URL); if (!valueText) return '';
  try { const url = new URL(valueText); return ['http:', 'https:'].includes(url.protocol) ? url.href : ''; } catch (_) { return ''; }
}
function normalizeColor(value) {
  const raw = text(value, 7).replace(/^#/, '');
  if (!raw) return null;
  if (!/^[0-9a-fA-F]{6}$/.test(raw)) throw fail(400, 'Color must be a 6-digit hexadecimal value such as #2563EB.', 'INVALID_COLOR');
  return parseInt(raw, 16);
}
function normalizeFields(fields) {
  if (!Array.isArray(fields)) return [];
  return fields.slice(0, MAX_FIELDS).map(field => ({
    name: text(field?.name, 256),
    value: text(field?.value, 1024),
    inline: Boolean(field?.inline),
  })).filter(field => field.name && field.value);
}
function normalizeEmbed(input = {}, preserve = {}) {
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

  const fields = normalizeFields(preserve.fields || input.fields);
  if (fields.length) embed.fields = fields;
  if (preserve.url && httpUrl(preserve.url)) embed.url = httpUrl(preserve.url);
  if (preserve.timestamp) embed.timestamp = preserve.timestamp;
  return embed;
}

async function discordRequest(pathname, options = {}) {
  const token = String(process.env.DISCORD_TOKEN || '').trim();
  if (!token) throw fail(503, 'DISCORD_TOKEN is not configured on the panel.', 'DISCORD_TOKEN_MISSING');
  const response = await fetch(`https://discord.com/api/v10${pathname}`, {
    ...options,
    headers: { Authorization: `Bot ${token}`, 'Content-Type': 'application/json', ...(options.headers || {}) },
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const detail = body?.message ? ` Discord: ${body.message}` : '';
    throw fail(response.status === 403 ? 403 : 502, `Discord API request failed.${detail}`, 'DISCORD_API_ERROR');
  }
  return body;
}

function parseMessageUrl(value) {
  const raw = String(value || '').trim();
  const match = raw.match(/^https?:\/\/discord\.com\/channels\/(\d+)\/(\d+)\/(\d+)(?:\?.*)?$/i);
  if (!match) throw fail(400, 'Paste a valid Discord message link.', 'INVALID_MESSAGE_LINK');
  return { guildId: match[1], channelId: match[2], messageId: match[3] };
}

async function getMessageContext(messageUrl) {
  const parsed = parseMessageUrl(messageUrl);
  const channel = await discordRequest(`/channels/${encodeURIComponent(parsed.channelId)}`);
  if (String(channel.guild_id || '') !== parsed.guildId) throw fail(400, 'The Discord message link is invalid.', 'MESSAGE_LINK_MISMATCH');
  const message = await discordRequest(`/channels/${encodeURIComponent(parsed.channelId)}/messages/${encodeURIComponent(parsed.messageId)}`);
  return { ...parsed, channel, message };
}

exports.getDonationChannels = async (req, res) => {
  try {
    const channels = await discordRequest(`/guilds/${encodeURIComponent(DONATION_GUILD_ID)}/channels`);
    const allowed = channels
      .filter(channel => [0, 5].includes(Number(channel.type)))
      .filter(channel => DONATION_CHANNEL_IDS.size === 0 || DONATION_CHANNEL_IDS.has(String(channel.id)))
      .map(channel => ({ id: channel.id, name: channel.name, type: channel.type }));
    return res.json({ guildId: DONATION_GUILD_ID, channels: allowed });
  } catch (error) {
    console.error(`[DONATION EMBED ${req.requestId}]`, error);
    return res.status(error.status || 500).json({ error: error.message || 'Unable to load Discord channels.', code: error.code || 'DISCORD_CHANNELS_FAILED' });
  }
};

exports.getMessage = async (req, res) => {
  try {
    const context = await getMessageContext(req.query?.url);
    const embed = context.message?.embeds?.[0];
    if (!embed) throw fail(404, 'That Discord message does not contain an embed.', 'EMBED_NOT_FOUND');
    return res.json({
      success: true,
      editable: false,
      messageId: context.message.id,
      channel: { id: context.channel.id, name: context.channel.name, guildId: context.channel.guild_id },
      author: context.message.author ? { id: context.message.author.id, username: context.message.author.username } : null,
      embed,
      messageUrl: req.query.url,
    });
  } catch (error) {
    console.error(`[DONATION EMBED LOAD ${req.requestId}]`, error);
    return res.status(error.status || 500).json({ error: error.message || 'Unable to load Discord embed.', code: error.code || 'DONATION_EMBED_LOAD_FAILED' });
  }
};

exports.sendEmbed = async (req, res) => {
  try {
    const channelId = text(req.body?.channelId, 32);
    if (!/^\d{17,20}$/.test(channelId)) throw fail(400, 'Enter a valid Discord channel ID.', 'INVALID_CHANNEL_ID');
    const embed = normalizeEmbed(req.body?.embed || {}, req.body?.preserve || {});
    const channel = await discordRequest(`/channels/${encodeURIComponent(channelId)}`);
    if (DONATION_GUILD_ID && String(channel.guild_id || '') !== DONATION_GUILD_ID) {
      throw fail(403, 'That channel does not belong to the configured GTA Pinas Discord server.', 'DONATION_GUILD_MISMATCH');
    }
    if (![0, 5].includes(Number(channel.type))) throw fail(400, 'The destination must be a text or announcement channel.', 'INVALID_DONATION_CHANNEL');
    const sent = await discordRequest(`/channels/${encodeURIComponent(channelId)}/messages`, { method: 'POST', body: JSON.stringify({ embeds: [embed], allowed_mentions: { parse: [] } }) });
    return res.status(201).json({ success: true, messageId: sent?.id || null, channel: { id: channel.id, name: channel.name } });
  } catch (error) {
    console.error(`[DONATION EMBED ${req.requestId}]`, error);
    return res.status(error.status || 500).json({ error: error.message || 'Unable to send donation embed.', code: error.code || 'DONATION_EMBED_FAILED' });
  }
};

exports.updateMessage = async (req, res) => {
  try {
    const messageUrl = String(req.body?.messageUrl || '').trim();
    const context = await getMessageContext(messageUrl);
    const bot = await discordRequest('/users/@me');
    if (String(context.message?.author?.id || '') !== String(bot.id || '')) {
      throw fail(403, 'This embed was not sent by this bot, so Discord will not allow this bot to edit it.', 'MESSAGE_NOT_OWNED_BY_BOT');
    }
    const embed = normalizeEmbed(req.body?.embed || {}, req.body?.preserve || {});
    const updated = await discordRequest(`/channels/${encodeURIComponent(context.channel.id)}/messages/${encodeURIComponent(context.message.id)}`, {
      method: 'PATCH', body: JSON.stringify({ embeds: [embed], allowed_mentions: { parse: [] } }),
    });
    return res.json({ success: true, messageId: updated?.id || context.message.id, channel: { id: context.channel.id, name: context.channel.name }, messageUrl });
  } catch (error) {
    console.error(`[DONATION EMBED UPDATE ${req.requestId}]`, error);
    return res.status(error.status || 500).json({ error: error.message || 'Unable to update Discord embed.', code: error.code || 'DONATION_EMBED_UPDATE_FAILED' });
  }
};

exports.normalizeEmbed = normalizeEmbed;
