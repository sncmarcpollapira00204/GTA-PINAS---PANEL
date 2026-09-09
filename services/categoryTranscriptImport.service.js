'use strict';

const { ChannelType } = require('discord.js');
const config = require('../config.json');
const discordService = require('./discord.service');
const {
  fetchDiscordJsMessages,
  fetchDiscordRestMessages,
} = require('./discordImportFetch.service');
const {
  findField,
  getEmbedFields,
  getEmbeds,
  getMessageTimestamp,
  isAllowedTranscriptUrl,
  isHtmlFilename,
  persistTranscript,
} = require('./transcriptImportShared.service');

const CATEGORY_LABELS = Object.freeze({
  report: 'Report',
  partnership: 'Partnership',
  pov_check: 'POV / PC Check',
  boost_claim: 'Server Boost',
  ban_appeal: 'Ban Appeal',
});

const ALLOWED_CATEGORIES = new Set(Object.keys(CATEGORY_LABELS));

function normalizeCategory(value) {
  const text = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

  if (text === 'pov' || text === 'pov_ticket' || text === 'pc_check') return 'pov_check';
  if (text === 'boost' || text === 'server_boost') return 'boost_claim';
  if (text === 'ban' || text === 'ban_ticket') return 'ban_appeal';
  return text;
}

function assertCategory(value) {
  const category = normalizeCategory(value);
  if (!ALLOWED_CATEGORIES.has(category)) {
    const error = new Error('Unsupported ticket category.');
    error.code = 'INVALID_IMPORT_CATEGORY';
    error.status = 400;
    throw error;
  }
  return category;
}

function attachmentArray(message) {
  const attachments = message?.attachments;
  if (!attachments) return [];
  if (Array.isArray(attachments)) return attachments;
  if (typeof attachments.values === 'function') return Array.from(attachments.values());
  return [];
}

function filenameFromUrl(value) {
  try {
    const url = new URL(String(value || ''));
    const last = url.pathname.split('/').filter(Boolean).pop() || '';
    return decodeURIComponent(last) || null;
  } catch (_) {
    return null;
  }
}

function canonicalUrl(value) {
  try {
    const url = new URL(String(value || ''));
    url.search = '';
    url.hash = '';
    return url.toString();
  } catch (_) {
    return String(value || '').trim();
  }
}

function extractUrls(value) {
  const matches = String(value || '').match(/https?:\/\/[^\s<>"']+/gi) || [];
  return matches
    .map((url) => url.replace(/[)\],.;}]+$/g, ''))
    .filter(Boolean);
}

function walkPayload(value, visitor, depth = 0) {
  if (value == null || depth > 12) return;
  if (Array.isArray(value)) {
    for (const child of value) walkPayload(child, visitor, depth + 1);
    return;
  }
  if (typeof value !== 'object') {
    visitor(value);
    return;
  }
  for (const child of Object.values(value)) walkPayload(child, visitor, depth + 1);
}

function componentPayload(component) {
  if (!component) return null;
  if (typeof component.toJSON === 'function') {
    try {
      return component.toJSON();
    } catch (_) {
      return component.data || component;
    }
  }
  return component.data || component;
}

function collectMessageUrls(message) {
  const urls = [];
  const seen = new Set();
  const add = (value) => {
    for (const raw of extractUrls(value)) {
      const key = raw.trim();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      urls.push(key);
    }
  };

  add(message?.content);
  for (const embed of getEmbeds(message)) {
    if (embed?.url) add(embed.url);
    if (embed?.author?.url) add(embed.author.url);
    if (embed?.image?.url) add(embed.image.url);
    if (embed?.thumbnail?.url) add(embed.thumbnail.url);
    add(embed?.title);
    add(embed?.description);
    add(embed?.footer?.text);
    for (const field of embed?.fields || []) {
      add(field.name);
      add(field.value);
    }
  }

  for (const component of Array.from(message?.components || [])) {
    walkPayload(componentPayload(component), (value) => {
      if (typeof value === 'string') add(value);
    });
  }

  return urls;
}

function collectComponentAttachmentReferences(message) {
  const references = [];
  const seen = new Set();

  for (const component of Array.from(message?.components || [])) {
    walkPayload(componentPayload(component), (value) => {
      if (typeof value !== 'string') return;
      const match = value.trim().match(/^attachment:\/\/(.+\.html?)$/i);
      if (!match) return;
      const filename = decodeURIComponent(match[1]);
      const key = filename.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      references.push(filename);
    });
  }

  return references;
}

function transcriptCandidatesFromMessage(message) {
  const candidates = [];
  const seen = new Set();

  const add = (candidate) => {
    const url = String(candidate?.url || '').trim();
    if (!url || !isAllowedTranscriptUrl(url)) return;

    const name = String(candidate?.name || filenameFromUrl(url) || 'transcript.html').trim();
    if (!isHtmlFilename(name)) return;

    const key = candidate?.id
      ? `id:${candidate.id}`
      : `url:${canonicalUrl(url)}`;
    if (seen.has(key)) return;
    seen.add(key);

    candidates.push({
      id: candidate?.id ? String(candidate.id) : null,
      name,
      url,
      contentType: candidate?.contentType || candidate?.content_type || null,
      size: Number.isFinite(Number(candidate?.size)) ? Number(candidate.size) : null,
      source: candidate?.source || 'linked-url',
    });
  };

  for (const attachment of attachmentArray(message)) {
    add({
      id: attachment.id,
      name: attachment.name || attachment.filename,
      url: attachment.url || attachment.proxyURL || attachment.proxy_url,
      contentType: attachment.contentType || attachment.content_type,
      size: attachment.size,
      source: attachment.source || 'attachment',
    });
  }

  for (const url of collectMessageUrls(message)) {
    if (!isAllowedTranscriptUrl(url)) continue;
    add({
      name: filenameFromUrl(url),
      url,
      source: 'message-link',
    });
  }

  return candidates;
}

function hasSummaryFields(message) {
  for (const embed of getEmbeds(message)) {
    const fields = getEmbedFields(embed);
    if (
      findField(fields, ['ticket owner']) ||
      findField(fields, ['ticket name']) ||
      findField(fields, ['panel name']) ||
      findField(fields, ['closed by'])
    ) {
      return true;
    }
  }
  return false;
}

function linkedDiscordMessageIds(message) {
  const ids = new Set();
  for (const urlValue of collectMessageUrls(message)) {
    try {
      const url = new URL(urlValue);
      if (!['discord.com', 'www.discord.com'].includes(url.hostname.toLowerCase())) continue;
      const match = url.pathname.match(/^\/channels\/\d{15,22}\/\d{15,22}\/(\d{15,22})\/?$/);
      if (match) ids.add(match[1]);
    } catch (_) {}
  }
  return ids;
}

function buildSummaryLinkIndex(messages) {
  const index = new Map();
  for (const message of messages) {
    if (!hasSummaryFields(message)) continue;
    for (const messageId of linkedDiscordMessageIds(message)) {
      if (!index.has(messageId)) index.set(messageId, message);
    }
  }
  return index;
}

function findTranscriptSummary(messages, attachmentIndex, summaryLinkIndex = null) {
  const attachmentMessage = messages[attachmentIndex];
  if (!attachmentMessage) return null;
  if (hasSummaryFields(attachmentMessage)) return attachmentMessage;

  const linked = summaryLinkIndex?.get?.(String(attachmentMessage.id || ''));
  if (linked) return linked;

  const attachmentTimestamp = getMessageTimestamp(attachmentMessage);
  let best = null;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (let offset = 1; offset < 12; offset += 1) {
    for (const index of [attachmentIndex + offset, attachmentIndex - offset]) {
      if (index < 0 || index >= messages.length) continue;
      const candidate = messages[index];
      if (!hasSummaryFields(candidate)) continue;
      const secondsApart = Math.abs(getMessageTimestamp(candidate) - attachmentTimestamp) / 1000;
      if (secondsApart > 600 || secondsApart >= bestDistance) continue;
      best = candidate;
      bestDistance = secondsApart;
    }
  }

  return best || attachmentMessage;
}

function discoverTranscriptEntries(messages) {
  const entries = [];
  const seen = new Set();
  const summaryLinkIndex = buildSummaryLinkIndex(messages);

  messages.forEach((message, index) => {
    for (const attachment of transcriptCandidatesFromMessage(message)) {
      const key = attachment.id
        ? `id:${attachment.id}`
        : `url:${canonicalUrl(attachment.url)}`;
      if (seen.has(key)) continue;
      seen.add(key);

      entries.push({
        attachmentMessage: message,
        summaryMessage: findTranscriptSummary(messages, index, summaryLinkIndex),
        attachment,
      });
    }
  });

  return entries;
}

function countUnresolvedLegacyFiles(messages) {
  let total = 0;
  for (const message of messages) {
    const available = new Set(
      attachmentArray(message)
        .map((attachment) => String(attachment?.name || attachment?.filename || '').toLowerCase())
        .filter(Boolean)
    );
    for (const reference of collectComponentAttachmentReferences(message)) {
      if (!available.has(reference.toLowerCase())) total += 1;
    }
  }
  return total;
}

async function refreshStaffCountersQuietly(report) {
  try {
    await discordService.refreshStaffCounters();
    return null;
  } catch (error) {
    const warning = `Ticket import finished, but staff counters could not refresh: ${error.message}`;
    report({ detail: warning });
    console.warn('[CATEGORY IMPORT STAFF REFRESH]', error.message);
    return warning;
  }
}

async function importCategory(categoryValue, report = () => {}) {
  const category = assertCategory(categoryValue);
  const channelId = String(config.transcriptChannels?.[category] || '').trim();

  if (!channelId) {
    const error = new Error(`${CATEGORY_LABELS[category]} transcript channel is not configured.`);
    error.code = 'TRANSCRIPT_CHANNEL_NOT_CONFIGURED';
    error.status = 503;
    throw error;
  }

  await discordService.ensureDiscordReady();

  const guildId = String(process.env.GUILD_ID || config.guildId || '').trim();
  const guild = await discordService.client.guilds.fetch(guildId);
  const logChannel = await guild.channels.fetch(channelId).catch(() => null);

  const validTypes = new Set([ChannelType.GuildText, ChannelType.GuildAnnouncement]);
  if (!logChannel || !validTypes.has(logChannel.type)) {
    const error = new Error(`${CATEGORY_LABELS[category]} transcript log channel is unavailable.`);
    error.code = 'TRANSCRIPT_CHANNEL_UNAVAILABLE';
    error.status = 503;
    throw error;
  }

  report({
    stage: `Importing ${CATEGORY_LABELS[category]} tickets`,
    progress: 2,
    message: `Reading #${logChannel.name}.`,
  });

  const maximum = Math.min(10000, Math.max(100, Number(config.maxTranscriptMessagesPerChannel || 10000)));
  let messages = await fetchDiscordJsMessages(logChannel, maximum, report);
  let entries = discoverTranscriptEntries(messages);
  let discoveryMode = 'discord.js';

  if (!entries.length && messages.length) {
    report({
      stage: `Importing ${CATEGORY_LABELS[category]} tickets`,
      progress: 48,
      message: `No standard HTML attachments were exposed by discord.js. Retrying #${logChannel.name} through Discord REST.`,
      detail: `Scanned ${messages.length} messages with discord.js and found 0 safe HTML transcript candidates.`,
    });

    try {
      const rawMessages = await fetchDiscordRestMessages(logChannel, maximum, report);
      const rawEntries = discoverTranscriptEntries(rawMessages);
      if (rawEntries.length || rawMessages.length > messages.length) {
        messages = rawMessages;
        entries = rawEntries;
        discoveryMode = 'discord-rest';
      }
    } catch (error) {
      report({ detail: `Raw Discord transcript retry failed: ${error.message}` });
    }
  }

  const unresolvedLegacyFiles = countUnresolvedLegacyFiles(messages);
  const result = {
    category,
    label: CATEGORY_LABELS[category],
    logChannelId: logChannel.id,
    logChannelName: logChannel.name,
    scannedMessages: messages.length,
    discoveryMode,
    found: entries.length,
    unresolvedLegacyFiles,
    importedTickets: 0,
    importedTranscripts: 0,
    downloadedBytes: 0,
    errors: [],
    warnings: [],
  };

  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    report({
      stage: `Importing ${CATEGORY_LABELS[category]} tickets`,
      processed: index,
      total: entries.length,
      progress: 50 + Math.floor((index / Math.max(entries.length, 1)) * 45),
      message: `Importing ${entry.attachment.name || `transcript ${index + 1}`}.`,
    });

    try {
      const saved = await persistTranscript({
        guild,
        logChannel,
        category,
        entry,
        source: 'Discord HTML transcript',
      });
      result.importedTickets += 1;
      result.importedTranscripts += 1;
      result.downloadedBytes += saved.htmlSize;
    } catch (error) {
      result.errors.push({
        attachment: entry.attachment.name || entry.attachmentMessage.id,
        code: error.code || null,
        error: error.message,
      });
      report({
        detail: `Failed ${entry.attachment.name || entry.attachmentMessage.id}: ${error.message}`,
      });
    }
  }

  const staffWarning = await refreshStaffCountersQuietly(report);
  if (staffWarning) result.warnings.push(staffWarning);

  if (!result.found && result.unresolvedLegacyFiles) {
    result.message =
      `Found ${result.unresolvedLegacyFiles} legacy Components V2 HTML file reference(s) in ` +
      `#${result.logChannelName}, but Discord did not expose a downloadable attachment URL.`;
  } else if (!result.found) {
    result.message =
      `No safe HTML ${result.label} transcripts were detected in #${result.logChannelName} ` +
      `after scanning ${result.scannedMessages} messages.`;
  } else if (result.errors.length) {
    result.message =
      `Imported ${result.importedTranscripts} of ${result.found} ${result.label} transcripts. ` +
      `${result.errors.length} failed.`;
  } else {
    result.message = `Imported ${result.importedTranscripts} ${result.label} transcripts.`;
  }

  report({
    stage: `${CATEGORY_LABELS[category]} import complete`,
    processed: entries.length,
    total: entries.length,
    progress: 100,
    message: result.message,
  });

  return result;
}

module.exports = {
  CATEGORY_LABELS,
  assertCategory,
  buildSummaryLinkIndex,
  collectComponentAttachmentReferences,
  collectMessageUrls,
  countUnresolvedLegacyFiles,
  discoverTranscriptEntries,
  findTranscriptSummary,
  importCategory,
  linkedDiscordMessageIds,
  normalizeCategory,
  transcriptCandidatesFromMessage,
};
