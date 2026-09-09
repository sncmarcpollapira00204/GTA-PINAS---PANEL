'use strict';

const pool = require('../db');
const discordService = require('./discord.service');

const DISCORD_ATTACHMENT_HOSTS = new Set([
  'cdn.discordapp.com',
  'media.discordapp.net',
]);
const RETRYABLE_HTTP_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);
const RETRYABLE_NETWORK_CODES = new Set([
  'ECONNRESET',
  'ECONNREFUSED',
  'EHOSTUNREACH',
  'ENETDOWN',
  'ENETUNREACH',
  'ETIMEDOUT',
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_HEADERS_TIMEOUT',
  'UND_ERR_SOCKET',
]);

function integerInRange(value, fallback, minimum, maximum) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(maximum, Math.max(minimum, Math.floor(parsed)));
}

const MAX_TRANSCRIPT_HTML_BYTES = integerInRange(
  process.env.MAX_TRANSCRIPT_HTML_BYTES,
  10 * 1024 * 1024,
  1024 * 1024,
  25 * 1024 * 1024
);
const TRANSCRIPT_DOWNLOAD_TIMEOUT_MS = integerInRange(
  process.env.TRANSCRIPT_DOWNLOAD_TIMEOUT_MS,
  30000,
  5000,
  120000
);
const TRANSCRIPT_DOWNLOAD_ATTEMPTS = integerInRange(
  process.env.TRANSCRIPT_DOWNLOAD_ATTEMPTS,
  3,
  1,
  5
);

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function stripCodeBlock(value) {
  return String(value || '')
    .replace(/^```[a-z]*\s*/i, '')
    .replace(/```$/i, '')
    .trim();
}

function extractMentionId(value) {
  return String(value || '').match(/<@!?(\d{15,22})>/)?.[1] || null;
}

function getEmbeds(message) {
  return Array.from(message?.embeds || []);
}

function getEmbedFields(embed) {
  const fields = new Map();
  for (const field of embed?.fields || []) {
    fields.set(
      String(field.name || '').trim().toLowerCase(),
      String(field.value || '').trim()
    );
  }
  return fields;
}

function findField(fields, names) {
  for (const name of names) {
    for (const [fieldName, value] of fields.entries()) {
      if (fieldName.includes(name)) return value;
    }
  }
  return null;
}

function getMessageTimestamp(message) {
  if (Number.isFinite(message?.createdTimestamp)) return message.createdTimestamp;
  const parsed = Date.parse(message?.timestamp || '');
  return Number.isFinite(parsed) ? parsed : 0;
}

function getMessageDate(message) {
  if (message?.createdAt instanceof Date) return message.createdAt;
  const timestamp = getMessageTimestamp(message);
  return timestamp ? new Date(timestamp) : new Date();
}

function getMessageUrl(message, guildId, channelId) {
  if (message?.url) return message.url;
  const messageId = String(message?.id || '').trim();
  return messageId ? `https://discord.com/channels/${guildId}/${channelId}/${messageId}` : null;
}

function avatarUrl(user) {
  if (!user || typeof user.displayAvatarURL !== 'function') return null;
  return user.displayAvatarURL({ extension: 'png', size: 256 });
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

function isHtmlFilename(value) {
  return /\.html?$/i.test(String(value || '').trim());
}

function parseAllowedTranscriptUrl(value) {
  let url;
  try {
    url = new URL(String(value || '').trim());
  } catch (_) {
    return null;
  }

  if (url.protocol !== 'https:') return null;
  if (url.username || url.password) return null;
  if (url.port && url.port !== '443') return null;

  const hostname = url.hostname.toLowerCase();
  if (!DISCORD_ATTACHMENT_HOSTS.has(hostname)) return null;

  let pathname;
  try {
    pathname = decodeURIComponent(url.pathname || '');
  } catch (_) {
    return null;
  }

  if (!pathname.startsWith('/attachments/')) return null;
  if (!isHtmlFilename(pathname.split('/').pop())) return null;
  return url;
}

function isAllowedTranscriptUrl(value) {
  return Boolean(parseAllowedTranscriptUrl(value));
}

function assertAllowedTranscriptUrl(value) {
  const parsed = parseAllowedTranscriptUrl(value);
  if (parsed) return parsed;

  const error = new Error(
    'Transcript URL was rejected because it is not a Discord HTML attachment URL.'
  );
  error.code = 'TRANSCRIPT_URL_REJECTED';
  throw error;
}

function isRetryableNetworkError(error) {
  const code = String(error?.code || error?.cause?.code || '').toUpperCase();
  if (RETRYABLE_NETWORK_CODES.has(code)) return true;
  const message = String(error?.message || '').toLowerCase();
  return message.includes('timeout') || message.includes('timed out') || message.includes('socket');
}

function retryDelayMs(response, attempt) {
  const retryAfter = Number(response?.headers?.get?.('retry-after'));
  if (Number.isFinite(retryAfter) && retryAfter > 0) {
    return retryAfter > 1000 ? Math.ceil(retryAfter) : Math.ceil(retryAfter * 1000);
  }
  return Math.min(5000, 300 * (2 ** Math.max(0, attempt - 1)));
}

async function readResponseBodyLimited(response, maximum = MAX_TRANSCRIPT_HTML_BYTES) {
  const declaredLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > maximum) {
    const error = new Error(
      `Transcript download is ${(declaredLength / 1024 / 1024).toFixed(2)} MB, above the configured limit.`
    );
    error.code = 'TRANSCRIPT_TOO_LARGE';
    throw error;
  }

  if (!response.body?.getReader) {
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length > maximum) {
      const error = new Error('Transcript download exceeded the configured size limit.');
      error.code = 'TRANSCRIPT_TOO_LARGE';
      throw error;
    }
    return buffer;
  }

  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = Buffer.from(value);
      total += chunk.length;
      if (total > maximum) {
        const error = new Error('Transcript download exceeded the configured size limit.');
        error.code = 'TRANSCRIPT_TOO_LARGE';
        throw error;
      }
      chunks.push(chunk);
    }
  } finally {
    reader.releaseLock?.();
  }

  return Buffer.concat(chunks, total);
}

function validateHtmlBuffer(buffer) {
  if (!buffer?.length) {
    const error = new Error('Transcript download returned an empty file.');
    error.code = 'TRANSCRIPT_EMPTY';
    throw error;
  }

  const sample = buffer.subarray(0, Math.min(buffer.length, 16384)).toString('utf8');
  if (!/(?:<!doctype\s+html|<html[\s>])/i.test(sample)) {
    const error = new Error('Downloaded transcript did not look like a valid HTML document.');
    error.code = 'TRANSCRIPT_INVALID_HTML';
    throw error;
  }
}

async function fetchTranscriptBuffer(urlValue) {
  const url = assertAllowedTranscriptUrl(urlValue);
  let lastError;

  for (let attempt = 1; attempt <= TRANSCRIPT_DOWNLOAD_ATTEMPTS; attempt += 1) {
    let response;
    try {
      response = await fetch(url, {
        redirect: 'error',
        headers: {
          Accept: 'text/html,application/octet-stream;q=0.9,*/*;q=0.1',
          'User-Agent': '5th-Avenue-Web-Panel/1.0',
        },
        signal: AbortSignal.timeout(TRANSCRIPT_DOWNLOAD_TIMEOUT_MS),
      });
    } catch (error) {
      lastError = error;
      if (attempt >= TRANSCRIPT_DOWNLOAD_ATTEMPTS || !isRetryableNetworkError(error)) {
        const wrapped = new Error(`Transcript download failed: ${error.message}`);
        wrapped.code = error?.name === 'TimeoutError'
          ? 'TRANSCRIPT_DOWNLOAD_TIMEOUT'
          : 'TRANSCRIPT_DOWNLOAD_FAILED';
        throw wrapped;
      }
      await sleep(Math.min(5000, 300 * (2 ** (attempt - 1))));
      continue;
    }

    if (!response.ok) {
      const status = response.status;
      if (attempt < TRANSCRIPT_DOWNLOAD_ATTEMPTS && RETRYABLE_HTTP_STATUS.has(status)) {
        await response.body?.cancel?.().catch?.(() => {});
        await sleep(retryDelayMs(response, attempt));
        continue;
      }

      const error = new Error(`Transcript download returned HTTP ${status}.`);
      error.code = 'TRANSCRIPT_DOWNLOAD_HTTP_ERROR';
      error.status = status;
      throw error;
    }

    const buffer = await readResponseBodyLimited(response);
    validateHtmlBuffer(buffer);
    return buffer;
  }

  throw lastError || new Error('Transcript download failed.');
}

async function downloadTranscriptHtml(attachment) {
  const size = Number(attachment?.size);
  if (Number.isFinite(size) && size > MAX_TRANSCRIPT_HTML_BYTES) {
    const error = new Error('Transcript attachment exceeds the configured HTML size limit.');
    error.code = 'TRANSCRIPT_TOO_LARGE';
    throw error;
  }

  const buffer = await fetchTranscriptBuffer(attachment?.url);
  return {
    html: buffer.toString('utf8'),
    bytes: buffer.length,
  };
}

async function upsertUser(client, user, fallbackId = null) {
  const userId = String(user?.id || fallbackId || '').trim();
  if (!userId) return;

  await client.query(
    `INSERT INTO users (id, username, avatar, is_bot, updated_at)
     VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
     ON CONFLICT (id)
     DO UPDATE SET
       username = EXCLUDED.username,
       avatar = COALESCE(EXCLUDED.avatar, users.avatar),
       is_bot = EXCLUDED.is_bot,
       updated_at = CURRENT_TIMESTAMP`,
    [
      userId,
      user?.username || user?.globalName || `Discord User ${userId}`,
      avatarUrl(user),
      Boolean(user?.bot),
    ]
  );
}

async function upsertStaff(client, guild, userId) {
  if (!userId) return;

  const user = discordService.client.users.cache.get(userId)
    || await discordService.client.users.fetch(userId).catch(() => null);
  const member = guild.members.cache.get(userId)
    || await guild.members.fetch(userId).catch(() => null);
  const role = member?.roles?.cache
    ?.filter((item) => item.id !== guild.id)
    ?.sort((left, right) => right.position - left.position)
    ?.first()?.name || 'Ticket Handler';

  await upsertUser(client, user, userId);
  await client.query(
    `INSERT INTO staff (id, username, role, avatar, updated_at)
     VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
     ON CONFLICT (id)
     DO UPDATE SET
       username = EXCLUDED.username,
       role = EXCLUDED.role,
       avatar = COALESCE(EXCLUDED.avatar, staff.avatar),
       updated_at = CURRENT_TIMESTAMP`,
    [
      userId,
      user?.username || member?.displayName || `Staff ${userId}`,
      role,
      avatarUrl(user),
    ]
  );
}

function transcriptMetadata(entry) {
  const { attachmentMessage, summaryMessage, attachment } = entry;
  const embed = getEmbeds(summaryMessage)[0] || getEmbeds(attachmentMessage)[0] || null;
  const fields = getEmbedFields(embed);

  const ownerId = extractMentionId(findField(fields, ['ticket owner', 'owner']));
  const closedById = extractMentionId(findField(fields, ['closed by']));
  const ticketNameValue = findField(fields, ['ticket name', 'channel']);
  const panelName = stripCodeBlock(findField(fields, ['panel name', 'category']));
  const filename = String(
    attachment?.name || attachment?.filename || filenameFromUrl(attachment?.url) ||
    `transcript-${attachmentMessage?.id || 'unknown'}.html`
  ).trim();
  const filenameTicketName = filename
    .replace(/^transcript-/i, '')
    .replace(/\.html?$/i, '');
  const ticketName = stripCodeBlock(ticketNameValue) || filenameTicketName;
  const ticketNumber = String(ticketName).match(/(\d{3,})$/)?.[1]
    || String(attachmentMessage?.id || '').slice(-6)
    || String(Date.now()).slice(-6);

  return {
    ownerId,
    closedById,
    ticketName,
    ticketNumber,
    panelName,
    filename,
  };
}

async function persistTranscript({
  guild,
  logChannel,
  category,
  entry,
  source = 'Discord HTML transcript',
}) {
  const attachmentMessageId = String(entry?.attachmentMessage?.id || '').trim();
  if (!attachmentMessageId) {
    const error = new Error('Transcript attachment message ID is missing.');
    error.code = 'TRANSCRIPT_MESSAGE_ID_MISSING';
    throw error;
  }

  const metadata = transcriptMetadata(entry);
  const downloaded = await downloadTranscriptHtml(entry.attachment);
  const database = await pool.connect();

  try {
    await database.query('BEGIN');

    const owner = metadata.ownerId
      ? discordService.client.users.cache.get(metadata.ownerId)
        || await discordService.client.users.fetch(metadata.ownerId).catch(() => null)
      : null;
    if (metadata.ownerId) await upsertUser(database, owner, metadata.ownerId);
    if (metadata.closedById) await upsertStaff(database, guild, metadata.closedById);

    const summaryId = String(entry.summaryMessage?.id || attachmentMessageId);
    const existing = await database.query(
      `SELECT id
         FROM tickets
        WHERE transcript_message_id = $1
           OR (
             status = 'closed'
             AND channel_name = $2
             AND ($3::text IS NULL OR user_id = $3)
           )
        ORDER BY created_at DESC
        LIMIT 1`,
      [summaryId, metadata.ticketName, metadata.ownerId]
    );

    const ticketId = existing.rows[0]?.id || `discord-transcript-${attachmentMessageId}`;
    const closedAt = getMessageDate(entry.summaryMessage || entry.attachmentMessage).toISOString();
    const discordMessageUrl = getMessageUrl(
      entry.summaryMessage || entry.attachmentMessage,
      guild.id,
      logChannel.id
    );
    const discoverySource = entry.attachment?.source || source;

    await database.query(
      `INSERT INTO tickets (
         id, ticket_id, ticket_number, guild_id, channel_id, channel_name,
         user_id, category, priority, status, details,
         created_at, last_activity_at, closed_at, closed_by, close_reason,
         transcript_message_id, transcript_channel_id, transcript_url,
         import_source, updated_at
       )
       VALUES (
         $1, $1, $2, $3, NULL, $4,
         $5, $6, 'normal', 'closed', $7,
         $8::timestamptz, $8::timestamptz, $8::timestamptz, $9, $10,
         $11, $12, $13,
         'discord_transcript_import', CURRENT_TIMESTAMP
       )
       ON CONFLICT (id)
       DO UPDATE SET
         ticket_number = EXCLUDED.ticket_number,
         guild_id = EXCLUDED.guild_id,
         channel_name = EXCLUDED.channel_name,
         user_id = COALESCE(EXCLUDED.user_id, tickets.user_id),
         category = EXCLUDED.category,
         status = 'closed',
         closed_at = EXCLUDED.closed_at,
         closed_by = COALESCE(EXCLUDED.closed_by, tickets.closed_by),
         close_reason = EXCLUDED.close_reason,
         transcript_message_id = EXCLUDED.transcript_message_id,
         transcript_channel_id = EXCLUDED.transcript_channel_id,
         transcript_url = EXCLUDED.transcript_url,
         import_source = CASE
           WHEN tickets.import_source = 'live' THEN 'live'
           ELSE EXCLUDED.import_source
         END,
         updated_at = CURRENT_TIMESTAMP`,
      [
        ticketId,
        metadata.ticketNumber,
        guild.id,
        metadata.ticketName,
        metadata.ownerId,
        category,
        JSON.stringify({
          imported: true,
          source,
          discoverySource,
          panelName: metadata.panelName || null,
        }),
        closedAt,
        metadata.closedById,
        'Imported from Discord transcript logs',
        summaryId,
        logChannel.id,
        entry.attachment.url,
      ]
    );

    await database.query(
      `INSERT INTO ticket_transcripts (
         id, ticket_id, html_content, discord_url,
         log_channel_id, log_message_id, generated_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7::timestamptz)
       ON CONFLICT (id)
       DO UPDATE SET
         ticket_id = EXCLUDED.ticket_id,
         html_content = EXCLUDED.html_content,
         discord_url = EXCLUDED.discord_url,
         log_channel_id = EXCLUDED.log_channel_id,
         log_message_id = EXCLUDED.log_message_id,
         generated_at = EXCLUDED.generated_at`,
      [
        `transcript-${attachmentMessageId}`,
        ticketId,
        downloaded.html,
        discordMessageUrl,
        logChannel.id,
        summaryId,
        closedAt,
      ]
    );

    await database.query(
      `INSERT INTO ticket_logs (ticket_id, action, actor_id, description, metadata)
       SELECT $1, 'IMPORT_CLOSED', $2, $3, $4::jsonb
       WHERE NOT EXISTS (
         SELECT 1 FROM ticket_logs WHERE ticket_id = $1 AND action = 'IMPORT_CLOSED'
       )`,
      [
        ticketId,
        metadata.closedById,
        `Recovered closed ticket transcript ${metadata.filename}.`,
        JSON.stringify({
          category,
          logChannelId: logChannel.id,
          attachmentMessageId,
          summaryMessageId: summaryId,
          discoverySource,
        }),
      ]
    );

    await database.query('COMMIT');
    return {
      ticketId,
      ticketName: metadata.ticketName,
      htmlSize: downloaded.bytes,
    };
  } catch (error) {
    await database.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    database.release();
  }
}

module.exports = {
  DISCORD_ATTACHMENT_HOSTS,
  MAX_TRANSCRIPT_HTML_BYTES,
  assertAllowedTranscriptUrl,
  downloadTranscriptHtml,
  fetchTranscriptBuffer,
  findField,
  getEmbedFields,
  getEmbeds,
  getMessageDate,
  getMessageTimestamp,
  getMessageUrl,
  isAllowedTranscriptUrl,
  isHtmlFilename,
  persistTranscript,
  stripCodeBlock,
  transcriptMetadata,
};
