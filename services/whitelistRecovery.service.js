'use strict';

const mainBotControl = require('./mainBotControl.service');
const { PANEL_OWNER_USER_ID } = require('../middleware/owner.middleware');

const CACHE_TTL_MS = 10 * 60 * 1000;
const DISCORD_API = 'https://discord.com/api/v10';
const cache = new Map();

const sources = [
  {
    channelId: String(process.env.WHITELIST_CHANNEL_ID || '1501573119926603917').trim(),
    whitelistType: 'voucher',
  },
  {
    channelId: String(process.env.NO_VOUCHER_CHANNEL_ID || '1502354509844840589').trim(),
    whitelistType: 'nonvoucher',
  },
];

function cleanMarkdown(value) {
  return String(value || '')
    .replace(/[*_`~]/g, '')
    .replace(/^#+\s*/, '')
    .trim();
}

function collectComponentText(value, output = [], depth = 0) {
  if (value == null || depth > 14) return output;

  if (Array.isArray(value)) {
    for (const item of value) collectComponentText(item, output, depth + 1);
    return output;
  }

  if (typeof value !== 'object') return output;

  if (typeof value.content === 'string') output.push(value.content);
  if (typeof value.label === 'string') output.push(value.label);

  for (const [key, child] of Object.entries(value)) {
    if (key === 'content' || key === 'label') continue;
    if (child && (typeof child === 'object' || Array.isArray(child))) {
      collectComponentText(child, output, depth + 1);
    }
  }

  return output;
}

function embedText(embed) {
  if (!embed) return '';
  return [
    embed.title || '',
    embed.description || '',
    ...(embed.fields || []).flatMap((field) => [field.name || '', field.value || '']),
    embed.author?.name || '',
    embed.footer?.text || '',
  ].filter(Boolean).join('\n');
}

function messageText(message) {
  return [
    message?.content || '',
    ...(message?.embeds || []).map(embedText),
    ...collectComponentText(message?.components || []),
  ].filter(Boolean).join('\n');
}

function fieldValue(message, labels) {
  const wanted = new Set(labels.map((label) => cleanMarkdown(label).replace(/:+$/, '').toUpperCase()));

  for (const embed of message?.embeds || []) {
    for (const field of embed?.fields || []) {
      const name = cleanMarkdown(field?.name).replace(/:+$/, '').toUpperCase();
      if (wanted.has(name)) return String(field?.value || '').trim();
    }
  }

  return '';
}

function sectionValue(text, label) {
  const escaped = String(label).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  const block = String(text || '').match(
    new RegExp(`\\*\\*${escaped}:?\\*\\*\\s*\\n+([^\\n]+)`, 'i')
  );
  if (block?.[1]) return block[1].trim();

  const inline = String(text || '').match(
    new RegExp(`\\*\\*${escaped}:?\\*\\*\\s*([^\\n]+)`, 'i')
  );
  return inline?.[1]?.trim() || '';
}

function extractIds(value) {
  return [...new Set((String(value || '').match(/\d{15,22}/g) || []))];
}

function normalizePeople(value) {
  const ids = extractIds(value);
  if (ids.length) return ids.map((id) => `<@${id}>`).join(' ');

  const text = cleanMarkdown(value);
  if (!text || /^(?:none|null|n\/a|unknown)$/i.test(text)) return 'NONE';
  return text;
}

function applicantIdFromMessage(message, text) {
  const uid = String(text || '').match(/UID:\s*(\d{15,22})/i)?.[1];
  if (uid) return uid;

  const discordUser = fieldValue(message, ['DISCORD USER'])
    || sectionValue(text, 'DISCORD USER');
  const discordUserId = extractIds(discordUser)[0];
  if (discordUserId) return discordUserId;

  const applicant = fieldValue(message, ['APPLICANT'])
    || sectionValue(text, 'APPLICANT');
  const applicantId = extractIds(applicant)[0];
  if (applicantId) return applicantId;

  const applicantBlock = String(text || '').match(
    /\*\*APPLICANT\*\*[\s\S]{0,160}?<@!?(\d{15,22})>/i
  );
  if (applicantBlock?.[1]) return applicantBlock[1];

  return null;
}

function applicantName(message, text, discordId) {
  const raw = fieldValue(message, ['APPLICANT', 'CHARACTER NAME', 'IN-GAME NAME', 'IN GAME NAME'])
    || sectionValue(text, 'APPLICANT')
    || sectionValue(text, 'CHARACTER NAME')
    || sectionValue(text, 'IN-GAME NAME')
    || sectionValue(text, 'IN GAME NAME');

  const cleaned = cleanMarkdown(raw)
    .replace(new RegExp(`<@!?${discordId}>`, 'g'), '')
    .replace(new RegExp(discordId, 'g'), '')
    .replace(/^#+\s*/, '')
    .replace(/\s*[·•|–—-]\s*$/g, '')
    .trim();

  return cleaned || 'Unknown';
}

function parseStatus(message, text, whitelistedBy) {
  const raw = fieldValue(message, ['STATUS', 'APPLICATION STATUS'])
    || sectionValue(text, 'STATUS')
    || sectionValue(text, 'APPLICATION STATUS');
  const normalized = cleanMarkdown(raw).toLowerCase();

  if (normalized.includes('denied')) return 'denied';
  if (normalized.includes('whitelisted') && !normalized.includes('not whitelisted')) {
    return 'whitelisted';
  }
  if (normalizePeople(whitelistedBy) !== 'NONE') return 'whitelisted';
  return 'pending';
}

function parseRecord(message, discordId, whitelistType) {
  const text = messageText(message);
  if (applicantIdFromMessage(message, text) !== discordId) return null;

  const steamProfile = String(text).match(
    /https:\/\/steamcommunity\.com\/(?:id|profiles)\/[^\s)\]]+/i
  )?.[0] || '';

  const vouchersRaw = fieldValue(message, ['VOUCHED BY', 'VOUCHERS'])
    || sectionValue(text, 'VOUCHED BY')
    || sectionValue(text, 'VOUCHERS');
  const whitelistedByRaw = fieldValue(message, ['WHITELISTED BY'])
    || sectionValue(text, 'WHITELISTED BY');
  const interviewerRaw = fieldValue(message, ['INTERVIEWED BY'])
    || sectionValue(text, 'INTERVIEWED BY');
  const accountAgeRaw = fieldValue(message, ['ACCOUNT AGE'])
    || sectionValue(text, 'ACCOUNT AGE');

  const whitelistedBy = normalizePeople(
    whitelistType === 'nonvoucher' && interviewerRaw ? interviewerRaw : whitelistedByRaw
  );
  const status = parseStatus(message, text, whitelistedBy);

  return {
    discordId,
    characterName: applicantName(message, text, discordId),
    steamProfile,
    vouchers: whitelistType === 'voucher' ? normalizePeople(vouchersRaw) : 'NONE',
    revokedVouches: 'NONE',
    whitelistType,
    interviewer: whitelistType === 'nonvoucher'
      ? normalizePeople(interviewerRaw || whitelistedByRaw)
      : 'NONE',
    accountAge: cleanMarkdown(accountAgeRaw) || 'UNKNOWN',
    whitelistedBy: status === 'whitelisted' ? whitelistedBy : 'NONE',
    createdAt: message?.timestamp || (message?.createdTimestamp
      ? new Date(message.createdTimestamp).toISOString()
      : null),
    status,
  };
}

function normalizeRawDiscordMessage(message) {
  return {
    ...message,
    createdTimestamp: message?.timestamp ? Date.parse(message.timestamp) : 0,
    timestamp: message?.timestamp || null,
    content: String(message?.content || ''),
    embeds: Array.isArray(message?.embeds) ? message.embeds : [],
    components: Array.isArray(message?.components) ? message.components : [],
  };
}

async function directDiscordChannelMessages(channelId, maximum = 10000) {
  const token = String(process.env.DISCORD_TOKEN || process.env.TOKEN || '').trim();
  if (!token) {
    const error = new Error('No Discord bot token is configured in the Web Panel service.');
    error.code = 'DISCORD_TOKEN_NOT_CONFIGURED';
    throw error;
  }

  const messages = [];
  let before = null;

  while (messages.length < maximum) {
    const limit = Math.min(100, maximum - messages.length);
    const params = new URLSearchParams({ limit: String(limit) });
    if (before) params.set('before', before);

    let response = await fetch(
      `${DISCORD_API}/channels/${encodeURIComponent(channelId)}/messages?${params}`,
      {
        headers: {
          Authorization: `Bot ${token}`,
          'User-Agent': '5th-Avenue-Web-Panel-Whitelist-Recovery',
        },
        signal: AbortSignal.timeout(15000),
      }
    );

    if (response.status === 429) {
      const payload = await response.json().catch(() => ({}));
      const delay = Math.min(5000, Math.max(250, Number(payload.retry_after || 1) * 1000));
      await new Promise((resolve) => setTimeout(resolve, delay));
      response = await fetch(
        `${DISCORD_API}/channels/${encodeURIComponent(channelId)}/messages?${params}`,
        {
          headers: {
            Authorization: `Bot ${token}`,
            'User-Agent': '5th-Avenue-Web-Panel-Whitelist-Recovery',
          },
          signal: AbortSignal.timeout(15000),
        }
      );
    }

    if (!response.ok) {
      const error = new Error(`Discord channel history returned HTTP ${response.status}.`);
      error.code = 'DISCORD_CHANNEL_HISTORY_ERROR';
      error.status = response.status;
      throw error;
    }

    const batch = await response.json();
    if (!Array.isArray(batch) || !batch.length) break;

    messages.push(...batch.map(normalizeRawDiscordMessage));
    before = String(batch[batch.length - 1]?.id || '');
    if (!before || batch.length < limit) break;
  }

  messages.sort((left, right) => Number(left.createdTimestamp) - Number(right.createdTimestamp));
  return {
    channelId,
    channelName: channelId,
    messages,
  };
}

async function loadSourceMessages(source) {
  try {
    return await mainBotControl.getTranscriptMessages(
      PANEL_OWNER_USER_ID,
      source.channelId,
      10000
    );
  } catch (controlError) {
    try {
      const direct = await directDiscordChannelMessages(source.channelId, 10000);
      console.warn(
        `[WHITELIST RECOVERY] MAIN-BOT bridge unavailable; using direct Discord read for ${source.channelId}.`
      );
      return direct;
    } catch (directError) {
      directError.controlError = controlError;
      throw directError;
    }
  }
}

async function recoverByDiscordId(discordId) {
  const normalizedId = String(discordId || '').trim();
  if (!/^\d{15,22}$/.test(normalizedId)) return null;

  const cached = cache.get(normalizedId);
  if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
    return cached.record;
  }

  let lastError = null;

  for (const source of sources) {
    if (!/^\d{15,22}$/.test(source.channelId)) continue;

    let payload;
    try {
      payload = await loadSourceMessages(source);
    } catch (error) {
      lastError = error;
      continue;
    }

    const messages = Array.isArray(payload?.messages) ? payload.messages : [];
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const record = parseRecord(messages[index], normalizedId, source.whitelistType);
      if (!record) continue;

      cache.set(normalizedId, { record, cachedAt: Date.now() });
      console.log(
        `[WHITELIST RECOVERY] Found ${normalizedId} in #${payload.channelName || source.channelId}.`
      );
      return record;
    }
  }

  if (lastError) {
    console.error('[WHITELIST RECOVERY] Discord fallback failed:', lastError.message);
  }

  cache.set(normalizedId, { record: null, cachedAt: Date.now() });
  return null;
}

module.exports = {
  applicantIdFromMessage,
  directDiscordChannelMessages,
  messageText,
  parseRecord,
  recoverByDiscordId,
};
