'use strict';

const config = require('../config.json');
const discordService = require('./discord.service');
const mainBotControl = require('./mainBotControl.service');
const categoryTranscriptImport = require('./categoryTranscriptImport.service');
const { persistTranscript } = require('./transcriptImportShared.service');

async function refreshStaffCountersQuietly(report) {
  try {
    await discordService.refreshStaffCounters();
    return null;
  } catch (error) {
    const warning = `Ticket import finished, but staff counters could not refresh: ${error.message}`;
    report({ detail: warning });
    console.warn('[MAIN BOT TRANSCRIPT IMPORT STAFF REFRESH]', error.message);
    return warning;
  }
}

async function importCategoryViaMainBot(categoryValue, userId, report = () => {}) {
  const category = categoryTranscriptImport.normalizeCategory(categoryValue);
  const label = categoryTranscriptImport.CATEGORY_LABELS[category];
  const channelId = String(config.transcriptChannels?.[category] || '').trim();

  if (!label || !channelId) {
    const error = new Error('Transcript category is not configured.');
    error.code = 'TRANSCRIPT_CATEGORY_NOT_CONFIGURED';
    throw error;
  }

  report({
    stage: `Importing ${label} through Main Bot`,
    progress: 5,
    message: 'Reading the transcript channel through the Gatekeeper source bot.',
  });

  const maximum = Math.min(10000, Math.max(100, Number(config.maxTranscriptMessagesPerChannel || 10000)));
  const payload = await mainBotControl.getTranscriptMessages(userId, channelId, maximum);
  const messages = Array.isArray(payload.messages) ? payload.messages : [];

  if (payload.truncated) {
    const error = new Error(
      `Main Bot reached its ${Number(payload.maximum || maximum).toLocaleString()}-message transcript scan limit. ` +
      'Increase TRANSCRIPT_BRIDGE_MESSAGE_LIMIT on MAIN-BOT before importing so older transcripts are not skipped.'
    );
    error.code = 'TRANSCRIPT_BRIDGE_TRUNCATED';
    throw error;
  }

  const entries = categoryTranscriptImport.discoverTranscriptEntries(messages);
  const unresolvedLegacyFiles = Number(payload.diagnostics?.unresolvedComponentFiles || 0)
    || categoryTranscriptImport.countUnresolvedLegacyFiles(messages);

  await discordService.ensureDiscordReady();
  const guildId = String(process.env.GUILD_ID || config.guildId || '').trim();
  const guild = await discordService.client.guilds.fetch(guildId);
  const channel = await guild.channels.fetch(channelId).catch(() => null);
  const logChannel = {
    id: channelId,
    name: channel?.name || payload.channelName || `${category}-category`,
  };

  const result = {
    category,
    label,
    logChannelId: channelId,
    logChannelName: logChannel.name,
    scannedMessages: messages.length,
    discoveryMode: 'main-bot-bridge',
    diagnostics: payload.diagnostics || null,
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
      stage: `Importing ${label} tickets through Main Bot`,
      processed: index,
      total: entries.length,
      progress: 10 + Math.floor((index / Math.max(entries.length, 1)) * 85),
      message: `Importing ${entry.attachment.name || `transcript ${index + 1}`}.`,
    });

    try {
      const saved = await persistTranscript({
        guild,
        logChannel,
        category,
        entry,
        source: 'Main Bot transcript bridge',
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
        detail: `Main Bot bridge failed ${entry.attachment.name || entry.attachmentMessage.id}: ${error.message}`,
      });
    }
  }

  const staffWarning = await refreshStaffCountersQuietly(report);
  if (staffWarning) result.warnings.push(staffWarning);

  if (!result.found && unresolvedLegacyFiles) {
    result.message =
      `Main Bot found ${unresolvedLegacyFiles} legacy Components V2 HTML file reference(s) in ` +
      `#${logChannel.name}, but Discord did not expose downloadable attachment URLs for them.`;
  } else if (!result.found) {
    result.message =
      `Main Bot scanned ${messages.length} messages in #${logChannel.name}, ` +
      'but no safe standard HTML transcript attachments were exposed.';
  } else if (result.errors.length) {
    result.message =
      `Imported ${result.importedTranscripts} of ${result.found} ${label} transcripts through Main Bot. ` +
      `${result.errors.length} failed.`;
  } else {
    result.message = `Imported ${result.importedTranscripts} ${label} transcripts through Main Bot.`;
  }

  report({
    stage: `${label} import complete`,
    processed: entries.length,
    total: entries.length,
    progress: 100,
    message: result.message,
  });

  return result;
}

module.exports = {
  importCategoryViaMainBot,
};
