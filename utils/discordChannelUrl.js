'use strict';

function normalizeDiscordId(value) {
  const normalized = String(value || '').trim();
  return /^\d{15,22}$/.test(normalized) ? normalized : '';
}

function buildDiscordChannelUrl(guildId, channelId) {
  const guild = normalizeDiscordId(guildId);
  const channel = normalizeDiscordId(channelId);
  if (!guild || !channel) return '';
  return `https://discord.com/channels/${guild}/${channel}`;
}

module.exports = {
  normalizeDiscordId,
  buildDiscordChannelUrl,
};
