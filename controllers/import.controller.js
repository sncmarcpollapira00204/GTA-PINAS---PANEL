'use strict';

const crypto = require('crypto');
const pool = require('../db');
const config = require('../config.json');
const jobs = new Map();

const DISCORD_API = 'https://discord.com/api/v10';

const SOURCES = {
  report: { label: 'Report', id: String(config.importSources?.categories?.report || '1531348087224926399'), prefixes: ['report-ticket-'] },
  suggestions: { label: 'Suggestions', id: String(config.importSources?.categories?.suggestions || '1531460333065994330'), prefixes: ['suggestion-'] },
  ban_appeal: { label: 'Ban Appeal', id: String(config.importSources?.categories?.ban_appeal || '1531348383027953906'), prefixes: ['banapeal-ticket-'] },
  booster: { label: 'Booster', id: String(config.importSources?.categories?.booster || '1531855766946840657'), prefixes: ['boostclaim-'] },
};

function token() {
  return process.env.DISCORD_TOKEN || process.env.BOT_TOKEN || process.env.DISCORD_BOT_TOKEN || '';
}

function setJob(id, patch) {
  const job = jobs.get(id);
  if (!job) return;
  Object.assign(job, patch, { updatedAt: Date.now() });
}

function apiHeaders() {
  const value = token();
  if (!value) throw new Error('DISCORD_TOKEN is missing from Railway Variables.');
  return { Authorization: `Bot ${value}`, 'User-Agent': 'GTA-Pinas-Web-Panel/1.0' };
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function discordRequest(pathname, options = {}, maxAttempts = 4) {
  let lastError = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const response = await fetch(`${DISCORD_API}${pathname}`, {
        ...options,
        headers: { ...apiHeaders(), ...(options.headers || {}) },
      });
      const payload = await response.text();
      let data = null;
      try { data = JSON.parse(payload); } catch {}

      if (response.ok) return data;

      const detail = data?.message || payload || `Discord request failed (${response.status}).`;
      const error = new Error(detail);
      error.status = response.status;
      lastError = error;

      if (![429, 500, 502, 503, 504].includes(response.status) || attempt >= maxAttempts) throw error;

      const retryAfter = Number(data?.retry_after || response.headers.get('retry-after') || 1);
      await sleep(Math.min(5000, Math.max(250, retryAfter * 1000)));
    } catch (error) {
      lastError = error;
      if (attempt >= maxAttempts) throw error;
      if (error?.status && ![429, 500, 502, 503, 504].includes(error.status)) throw error;
      await sleep(500 * attempt);
    }
  }

  throw lastError || new Error('Discord request failed.');
}

async function fetchChannelMessages(channelId, limit = 1000) {
  const all = [];
  let before = null;
  while (all.length < limit) {
    const batchSize = Math.min(100, limit - all.length);
    const query = new URLSearchParams({ limit: String(batchSize) });
    if (before) query.set('before', before);
    const batch = await discordRequest(`/channels/${channelId}/messages?${query.toString()}`);
    if (!Array.isArray(batch) || !batch.length) break;
    all.push(...batch);
    before = batch[batch.length - 1].id;
    if (batch.length < batchSize) break;
  }
  return all;
}

function cleanText(value) {
  return String(value || '').replace(/<@!?\d+>/g, '').trim();
}

function fieldMap(message) {
  const fields = message?.embeds?.[0]?.fields || [];
  return Object.fromEntries(fields.map((field) => [String(field.name || '').toLowerCase().trim(), String(field.value || '').trim()]));
}

function ticketNameMatches(name, source) {
  const normalized = String(name || '').toLowerCase();
  return source.prefixes.some((prefix) => normalized.startsWith(prefix));
}

function parseOwnerId(value) {
  return String(value || '').match(/<@!?(\d+)>/)?.[1] || null;
}

function findAttachmentMessage(messages, index, ticketName) {
  for (let offset = 1; offset <= 5; offset += 1) {
    const message = messages[index - offset];
    if (message?.attachments?.length) return message;
    if (message?.embeds?.some((embed) => String(embed?.title || '').toLowerCase().includes(String(ticketName || '').toLowerCase()))) {
      const next = messages[index - offset + 1];
      if (next?.attachments?.length) return next;
    }
  }
  for (let offset = 1; offset <= 5; offset += 1) {
    const message = messages[index + offset];
    if (message?.attachments?.length) return message;
  }
  return null;
}

function buildAvatarUrl(user) {
  if (!user?.id) return null;
  if (user.avatar) {
    return `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.${String(user.avatar).startsWith('a_') ? 'gif' : 'png'}?size=128`;
  }
  try {
    const defaultIndex = Number((BigInt(String(user.id)) >> 22n) % 6n);
    return `https://cdn.discordapp.com/embed/avatars/${defaultIndex}.png`;
  } catch {
    return null;
  }
}

async function fetchGuildMember(discordId) {
  if (!discordId) return null;
  try {
    return await discordRequest(`/guilds/${String(config.guildId)}/members/${String(discordId)}`);
  } catch (error) {
    // Profile enrichment is optional; an unavailable member must never fail the import.
    console.warn(`[IMPORT IDENTITY] Skipping ${discordId}: ${error.message}`);
    return null;
  }
}

async function upsertUser(userId, username, avatar = null) {
  if (!userId) return;
  await pool.query(
    `INSERT INTO users (id, username, avatar, is_bot, updated_at)
     VALUES ($1, $2, $3, FALSE, CURRENT_TIMESTAMP)
     ON CONFLICT (id) DO UPDATE SET
       username = CASE
         WHEN EXCLUDED.username IS NULL OR EXCLUDED.username = '' OR EXCLUDED.username = 'Unknown User' THEN users.username
         ELSE EXCLUDED.username
       END,
       avatar = COALESCE(EXCLUDED.avatar, users.avatar),
       updated_at = CURRENT_TIMESTAMP`,
    [String(userId), username ? String(username) : 'Unknown User', avatar || null]
  );
}

async function upsertStaff(staffId, username, avatar = null) {
  if (!staffId) return;
  await pool.query(
    `INSERT INTO staff (id, username, avatar, updated_at)
     VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
     ON CONFLICT (id) DO UPDATE SET
       username = CASE
         WHEN EXCLUDED.username IS NULL OR EXCLUDED.username = '' OR EXCLUDED.username = 'Unknown Staff' THEN staff.username
         ELSE EXCLUDED.username
       END,
       avatar = COALESCE(EXCLUDED.avatar, staff.avatar),
       updated_at = CURRENT_TIMESTAMP`,
    [String(staffId), username ? String(username) : 'Unknown Staff', avatar || null]
  );
}

async function storeImportedTranscript({ source, summary, ownerId, ticketOwnerName, ticketName, panelName, closedById, closedByName, transcriptUrl }) {
  const deterministicId = `import-${crypto.createHash('sha256').update(`${config.guildId}:${summary.id}`).digest('hex').slice(0, 48)}`;
  const transcriptId = `${deterministicId}-transcript`;
  const ticketNumber = ticketName.match(/-(\d{4,})$/)?.[1] || null;
  const details = JSON.stringify({
    importSource: 'discord_transcript',
    sourceCategoryId: source.id,
    transcriptSummaryMessageId: summary.id,
    panelName: panelName || null,
    ticketOwnerName: ticketOwnerName || null,
    closedByName: closedByName || null,
  });

  await pool.query(
    `INSERT INTO tickets
      (id, ticket_id, ticket_number, guild_id, channel_id, channel_name, user_id, category,
       status, details, closed_at, closed_by, transcript_message_id, transcript_channel_id, transcript_url,
       import_source, updated_at)
     VALUES ($1,$1,$2,$3,$4,$5,$6,$7,'closed',$8,CURRENT_TIMESTAMP,$9,$10,$11,$12,'discord_transcript',CURRENT_TIMESTAMP)
     ON CONFLICT (id) DO UPDATE SET
       ticket_number=EXCLUDED.ticket_number,
       channel_name=EXCLUDED.channel_name,
       user_id=EXCLUDED.user_id,
       category=EXCLUDED.category,
       status='closed',
       details=EXCLUDED.details,
       closed_by=EXCLUDED.closed_by,
       transcript_message_id=EXCLUDED.transcript_message_id,
       transcript_channel_id=EXCLUDED.transcript_channel_id,
       transcript_url=EXCLUDED.transcript_url,
       updated_at=CURRENT_TIMESTAMP
     RETURNING id`,
    [
      deterministicId,
      ticketNumber,
      String(config.guildId),
      `discord-${summary.id}`,
      ticketName,
      ownerId,
      source.label,
      details,
      closedById,
      summary.id,
      String(config.importSources.transcriptChannelId),
      transcriptUrl || null,
    ]
  );

  if (ownerId) await upsertUser(ownerId, ticketOwnerName || null);
  if (closedById) await upsertStaff(closedById, closedByName || null);

  await pool.query(
    `DELETE FROM ticket_transcripts WHERE ticket_id=$1;
     INSERT INTO ticket_transcripts
       (id,ticket_id,html_content,discord_url,log_channel_id,log_message_id)
     VALUES ($2,$1,NULL,$3,$4,$5)`,
    [deterministicId, transcriptId, transcriptUrl || null, String(config.importSources.transcriptChannelId), summary.id]
  );

  await pool.query(
    `INSERT INTO ticket_logs (ticket_id, action, description, metadata)
     SELECT $1, 'imported', $2, $3::jsonb
     WHERE NOT EXISTS (
       SELECT 1 FROM ticket_logs WHERE ticket_id=$1 AND action='imported' AND metadata->>'summaryMessageId'=$4
     )`,
    [deterministicId, `Imported ${ticketName} from Discord transcript channel.`, JSON.stringify({ summaryMessageId: summary.id, sourceCategoryId: source.id, panelName }), summary.id]
  );

  return { ticketId: deterministicId, transcriptUrl, hasTranscript: Boolean(transcriptUrl) };
}

async function runImport(job, sourceKey) {
  const source = SOURCES[sourceKey];
  const channelId = String(config.importSources?.transcriptChannelId || config.mainTranscriptChannelId || '');
  if (!source || !channelId) throw new Error('Import source configuration is incomplete.');

  setJob(job.id, { status: 'running', stage: 'Fetching Discord messages', progress: 5, message: `Reading transcript channel ${channelId}...` });
  const messages = await fetchChannelMessages(channelId, Number(config.maxTranscriptMessagesPerChannel || 1000));
  messages.sort((a, b) => String(a.id).localeCompare(String(b.id)));

  const candidates = messages.filter((message) => {
    if (!message?.embeds?.length) return false;
    const fields = fieldMap(message);
    return ticketNameMatches(fields['ticket name'], source);
  });

  let imported = 0;
  let failed = 0;
  let transcriptCount = 0;
  const failures = [];

  for (let index = 0; index < candidates.length; index += 1) {
    const summary = candidates[index];
    const fields = fieldMap(summary);
    const ticketName = cleanText(fields['ticket name']);
    const rawOwner = String(fields['ticket owner'] || '');
    const ownerId = parseOwnerId(rawOwner);
    const closedByRaw = String(fields['closed by'] || fields['closed_by'] || fields['closed by staff'] || fields['handled by'] || '');
    const closedById = parseOwnerId(closedByRaw);
    const attachmentMessage = findAttachmentMessage(messages, messages.indexOf(summary), ticketName);
    const transcriptUrl = attachmentMessage?.attachments?.[0]?.url || null;

    let ticketOwnerName = cleanText(rawOwner);
    let closedByName = cleanText(closedByRaw);
    let ownerAvatar = null;
    let closerAvatar = null;

    try {
      if (ownerId) {
        const ownerMember = await fetchGuildMember(ownerId);
        if (ownerMember?.user) {
          ticketOwnerName = ownerMember.nick || ownerMember.user.global_name || ownerMember.user.username || ticketOwnerName;
          ownerAvatar = buildAvatarUrl(ownerMember.user);
        }
      }

      if (closedById) {
        const closedByMember = await fetchGuildMember(closedById);
        if (closedByMember?.user) {
          closedByName = closedByMember.nick || closedByMember.user.global_name || closedByMember.user.username || closedByName;
          closerAvatar = buildAvatarUrl(closedByMember.user);
        }
      }

      const result = await storeImportedTranscript({
        source,
        summary,
        ownerId,
        ticketOwnerName,
        ticketName,
        panelName: cleanText(fields['panel name']),
        closedById,
        closedByName,
        transcriptUrl,
      });

      if (ownerId) await upsertUser(ownerId, ticketOwnerName, ownerAvatar);
      if (closedById) await upsertStaff(closedById, closedByName, closerAvatar);
      if (result.hasTranscript) transcriptCount += 1;
      imported += 1;
    } catch (error) {
      failed += 1;
      failures.push({ ticketName: ticketName || `candidate-${index + 1}`, error: error.message });
      console.error('[IMPORT ITEM FAILED]', ticketName, error.message);
    }

    const progress = 10 + Math.round(((index + 1) / Math.max(1, candidates.length)) * 85);
    setJob(job.id, {
      progress,
      stage: `Importing ${source.label}`,
      message: `${index + 1}/${candidates.length} processed${transcriptUrl ? '' : ' (ticket saved, transcript attachment not detected)'}.`,
    });
  }

  const nothingFound = candidates.length === 0;
  setJob(job.id, {
    status: failed > 0 && imported === 0 ? 'failed' : 'completed',
    progress: 100,
    stage: failed > 0 && imported === 0 ? 'Import failed' : 'Import complete',
    message: nothingFound
      ? `${source.label}: no matching ticket summaries found in the configured transcript channel.`
      : `${source.label}: ${imported} tickets imported, ${transcriptCount} transcript links saved, ${failed} failed.${failures.length ? ` First error: ${failures[0].error}` : ''}`,
    error: failures[0]?.error || null,
    result: { imported, transcriptCount, failed, categoryId: source.id, transcriptChannelId: channelId, candidates: candidates.length, failures },
  });
}

exports.startCategoryImport = async (req, res) => {
  const sourceKey = String(req.params.category || '').trim();
  if (!SOURCES[sourceKey]) return res.status(400).json({ error: 'Unknown import category.' });

  const existing = [...jobs.values()].find((job) => job.status === 'queued' || job.status === 'running');
  if (existing) return res.status(409).json({ error: 'Another ticket import is already running.', job: existing });

  const job = {
    id: crypto.randomUUID(),
    category: sourceKey,
    status: 'queued',
    progress: 0,
    stage: 'Queued',
    message: 'Import queued.',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  jobs.set(job.id, job);
  setTimeout(() => runImport(job, sourceKey).catch((error) => setJob(job.id, {
    status: 'failed',
    stage: 'Import failed',
    error: error.message,
    message: error.message,
  })), 0);
  return res.status(202).json({ message: `Starting ${SOURCES[sourceKey].label} import.`, job });
};

exports.getImportJob = async (req, res) => {
  const job = jobs.get(String(req.params.jobId || ''));
  if (!job) return res.status(404).json({ error: 'Import job not found.' });
  return res.json(job);
};

setInterval(() => {
  const cutoff = Date.now() - 60 * 60 * 1000;
  for (const [id, job] of jobs) if (job.updatedAt < cutoff) jobs.delete(id);
}, 15 * 60 * 1000).unref();
