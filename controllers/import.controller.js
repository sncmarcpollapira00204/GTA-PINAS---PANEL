'use strict';

const crypto = require('crypto');
const pool = require('../db');
const config = require('../config.json');

const DISCORD_API = 'https://discord.com/api/v10';
const jobs = new Map();

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

async function discordRequest(pathname, options = {}) {
  const response = await fetch(`${DISCORD_API}${pathname}`, {
    ...options,
    headers: { ...apiHeaders(), ...(options.headers || {}) },
  });
  const payload = await response.text();
  let data = null;
  try { data = JSON.parse(payload); } catch {}
  if (!response.ok) {
    const detail = data?.message || payload || `Discord request failed (${response.status}).`;
    const error = new Error(detail);
    error.status = response.status;
    throw error;
  }
  return data;
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

function findAttachmentMessage(messages, index) {
  for (let offset = 1; offset <= 3; offset += 1) {
    const message = messages[index - offset];
    if (message?.attachments?.length) return message;
  }
  for (let offset = 1; offset <= 2; offset += 1) {
    const message = messages[index + offset];
    if (message?.attachments?.length) return message;
  }
  return null;
}

function parseOwnerId(value) {
  return String(value || '').match(/<@!?([0-9]+)>/)?.[1] || null;
}

async function upsertUser(userId, username) {
  if (!userId) return;
  await pool.query(
    `INSERT INTO users (id, username, is_bot, updated_at)
     VALUES ($1, $2, FALSE, CURRENT_TIMESTAMP)
     ON CONFLICT (id) DO UPDATE SET username=EXCLUDED.username, updated_at=CURRENT_TIMESTAMP`,
    [String(userId), String(username || 'Unknown User')]
  );
}

async function storeImportedTranscript({ source, summary, attachmentMessage, ownerId, ticketName, panelName }) {
  const transcriptUrl = attachmentMessage?.attachments?.[0]?.url || null;
  let htmlContent = null;

  if (transcriptUrl) {
    const response = await fetch(transcriptUrl);
    if (response.ok) {
      const text = await response.text();
      if (text.length <= 15 * 1024 * 1024) htmlContent = text;
    }
  }

  const deterministicId = `import-${crypto.createHash('sha256').update(`${config.guildId}:${summary.id}`).digest('hex').slice(0, 48)}`;
  const ticketNumber = ticketName.match(/-(\d{4,})$/)?.[1] || null;
  const details = JSON.stringify({
    importSource: 'discord_transcript',
    sourceCategoryId: source.id,
    transcriptSummaryMessageId: summary.id,
    transcriptAttachmentMessageId: attachmentMessage?.id || null,
    panelName: panelName || null,
  });

  await pool.query(
    `INSERT INTO tickets
      (id, ticket_id, ticket_number, guild_id, channel_id, channel_name, user_id, category,
       status, details, closed_at, transcript_message_id, transcript_channel_id, transcript_url,
       import_source, updated_at)
     VALUES ($1,$1,$2,$3,$4,$5,$6,$7,'closed',$8,CURRENT_TIMESTAMP,$9,$10,$11,'discord_transcript',CURRENT_TIMESTAMP)
     ON CONFLICT (id) DO UPDATE SET
       ticket_number=EXCLUDED.ticket_number,
       channel_name=EXCLUDED.channel_name,
       user_id=EXCLUDED.user_id,
       category=EXCLUDED.category,
       status='closed',
       details=EXCLUDED.details,
       transcript_message_id=EXCLUDED.transcript_message_id,
       transcript_channel_id=EXCLUDED.transcript_channel_id,
       transcript_url=EXCLUDED.transcript_url,
       updated_at=CURRENT_TIMESTAMP
     RETURNING id`,
    [deterministicId, ticketNumber, String(config.guildId), `discord-${summary.id}`, ticketName, ownerId, source.label, details, summary.id, String(config.importSources.transcriptChannelId), transcriptUrl]
  );

  if (ownerId) await upsertUser(ownerId, cleanText(fieldMap(summary)['ticket owner']) || 'Unknown User');

  if (htmlContent) {
    await pool.query(
      `DELETE FROM ticket_transcripts WHERE ticket_id=$1;
       INSERT INTO ticket_transcripts
         (id,ticket_id,html_content,discord_url,log_channel_id,log_message_id)
       VALUES ($1 || '-transcript',$1,$2,$3,$4,$5)`,
      [deterministicId, htmlContent, transcriptUrl, String(config.importSources.transcriptChannelId), summary.id]
    );
  }

  await pool.query(
    `INSERT INTO ticket_logs (ticket_id, action, description, metadata)
     SELECT $1, 'imported', $2, $3::jsonb
     WHERE NOT EXISTS (
       SELECT 1 FROM ticket_logs WHERE ticket_id=$1 AND action='imported' AND metadata->>'summaryMessageId'=$4
     )`,
    [deterministicId, `Imported ${ticketName} from Discord transcript channel.`, JSON.stringify({ summaryMessageId: summary.id, sourceCategoryId: source.id, panelName }), summary.id]
  );

  return { ticketId: deterministicId, transcriptUrl, htmlImported: Boolean(htmlContent) };
}

async function runImport(job, sourceKey) {
  const source = SOURCES[sourceKey];
  const channelId = String(config.importSources?.transcriptChannelId || config.mainTranscriptChannelId || '');
  if (!source || !channelId) throw new Error('Import source configuration is incomplete.');

  setJob(job.id, { status: 'running', stage: 'Fetching Discord messages', progress: 5, message: `Reading transcript channel ${channelId}...` });
  const messages = await fetchChannelMessages(channelId, Number(config.maxTranscriptMessagesPerChannel || 1000));
  messages.sort((a, b) => Number(a.id) - Number(b.id));

  const candidates = messages.filter((message) => {
    if (!message?.embeds?.length) return false;
    const fields = fieldMap(message);
    return ticketNameMatches(fields['ticket name'], source);
  });

  let imported = 0;
  let failed = 0;
  let htmlCount = 0;

  for (let index = 0; index < candidates.length; index += 1) {
    const summary = candidates[index];
    const fields = fieldMap(summary);
    const ticketName = cleanText(fields['ticket name']);
    const ownerId = parseOwnerId(fields['ticket owner']);
    const attachmentMessage = findAttachmentMessage(messages, messages.indexOf(summary));
    try {
      const result = await storeImportedTranscript({
        source,
        summary,
        attachmentMessage,
        ownerId,
        ticketName,
        panelName: cleanText(fields['panel name']),
      });
      imported += 1;
      if (result.htmlImported) htmlCount += 1;
    } catch (error) {
      failed += 1;
      console.error('[IMPORT ITEM FAILED]', ticketName, error.message);
    }
    const progress = 10 + Math.round(((index + 1) / Math.max(1, candidates.length)) * 85);
    setJob(job.id, { progress, stage: `Importing ${source.label}`, message: `${index + 1}/${candidates.length} processed.` });
  }

  setJob(job.id, {
    status: 'completed',
    progress: 100,
    stage: 'Import complete',
    message: `${source.label}: ${imported} imported, ${failed} failed, ${htmlCount} transcripts saved.`,
    result: { imported, failed, htmlCount, categoryId: source.id, transcriptChannelId: channelId },
  });
}

exports.startCategoryImport = async (req, res) => {
  const sourceKey = String(req.params.category || '').trim();
  if (!SOURCES[sourceKey]) return res.status(400).json({ error: 'Unknown import category.' });

  const existing = [...jobs.values()].find((job) => job.status === 'queued' || job.status === 'running');
  if (existing) return res.status(409).json({ error: 'Another ticket import is already running.', job: existing });

  const job = { id: crypto.randomUUID(), category: sourceKey, status: 'queued', progress: 0, stage: 'Queued', message: 'Import queued.', createdAt: Date.now(), updatedAt: Date.now() };
  jobs.set(job.id, job);
  setTimeout(() => runImport(job, sourceKey).catch((error) => setJob(job.id, { status: 'failed', stage: 'Import failed', error: error.message, message: error.message })), 0);
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
