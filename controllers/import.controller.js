'use strict';

const discordService = require('../services/discord.service');
const backupService = require('../services/backup.service');
const jobService = require('../services/importJob.service');
const categoryTranscriptImport = require('../services/categoryTranscriptImport.service');
const mainBotTranscriptImport = require('../services/mainBotTranscriptImport.service');
const { getAuthenticatedUserId } = require('../middleware/owner.middleware');

function sendJobError(req, res, error, operation) {
  console.error(`[${operation} ERROR]`, error);
  return res.status(500).json({
    error: 'Unable to queue the requested operation.',
    requestId: req.requestId,
  });
}

exports.getImportStatus = async (req, res) => {
  try {
    const status = await discordService.getDiscordImportStatus();
    return res.json(status);
  } catch (error) {
    console.error('[IMPORT STATUS ERROR]', error);
    return res.status(500).json({ error: 'Internal server error.', requestId: req.requestId });
  }
};

exports.startCategoryImport = async (req, res) => {
  const category = categoryTranscriptImport.normalizeCategory(req.params.category);

  if (!categoryTranscriptImport.CATEGORY_LABELS[category]) {
    return res.status(400).json({ error: 'Unsupported ticket category.' });
  }

  try {
    const label = categoryTranscriptImport.CATEGORY_LABELS[category];
    const controlUserId = getAuthenticatedUserId(req);
    const job = await jobService.createJob(`discord-${category}-transcript-import`, async (report) => {
      let bridgeResult = null;
      let bridgeError = null;

      try {
        bridgeResult = await mainBotTranscriptImport.importCategoryViaMainBot(
          category,
          controlUserId,
          report
        );

        // Main Bot is the source that creates these transcript log messages, so a
        // successful discovery there is authoritative. Legacy unresolved file cards
        // also cannot be improved by scanning the same Discord data a second way.
        if (bridgeResult.found > 0 || bridgeResult.unresolvedLegacyFiles > 0) {
          return bridgeResult;
        }
      } catch (error) {
        bridgeError = error;
        console.warn('[CATEGORY IMPORT MAIN BOT PRIMARY]', error.message);
        report({
          stage: `Retrying ${label} directly`,
          progress: 50,
          message: 'Main Bot recovery was unavailable. Trying the Web Panel Discord client as a safe fallback.',
          detail: `Main Bot recovery failed: ${error.message}`,
        });
      }

      try {
        const direct = await categoryTranscriptImport.importCategory(category, report);
        if (direct.found > 0 || !bridgeResult) {
          if (bridgeError) direct.bridgeError = bridgeError.message;
          return direct;
        }

        // Neither route found a transcript. Preserve the source-bot diagnostics
        // because they are more useful than a generic second zero-result scan.
        return {
          ...bridgeResult,
          directFallback: {
            scannedMessages: direct.scannedMessages,
            discoveryMode: direct.discoveryMode,
            found: direct.found,
            unresolvedLegacyFiles: direct.unresolvedLegacyFiles,
          },
          message:
            `${bridgeResult.message} Direct fallback also scanned ` +
            `${direct.scannedMessages || 0} message(s) and found no additional transcript attachments.`,
        };
      } catch (directError) {
        if (!bridgeError) throw directError;

        const combined = new Error(
          `Main Bot recovery failed (${bridgeError.message}); ` +
          `direct Web Panel recovery also failed (${directError.message}).`
        );
        combined.code = 'CATEGORY_IMPORT_ALL_SOURCES_FAILED';
        throw combined;
      }
    });

    return res.status(202).json({
      message: `${label} transcript import started.`,
      category,
      job,
    });
  } catch (error) {
    return sendJobError(req, res, error, 'CATEGORY IMPORT');
  }
};

// Legacy recovery endpoints remain available for old bookmarks and emergency use,
// but the panel UI now exposes only the five category transcript imports.
exports.startOpenImport = async (req, res) => {
  try {
    const job = await jobService.createJob('discord-open-import', async (report) => {
      return discordService.importOpenTickets(report);
    });

    return res.status(202).json({
      message: 'Open ticket recovery started.',
      job,
    });
  } catch (error) {
    return sendJobError(req, res, error, 'OPEN IMPORT');
  }
};

exports.startClosedImport = async (req, res) => {
  try {
    const job = await jobService.createJob('discord-closed-import', async (report) => {
      return discordService.importClosedTicketsAndTranscripts(report);
    });

    return res.status(202).json({
      message: 'Closed transcript recovery started.',
      job,
    });
  } catch (error) {
    return sendJobError(req, res, error, 'CLOSED IMPORT');
  }
};

exports.startFullDiscordImport = async (req, res) => {
  try {
    const job = await jobService.createJob('discord-full-recovery', async (report) => {
      report({
        stage: 'Full Discord recovery',
        progress: 1,
        message: 'Starting open ticket recovery.',
      });

      const open = await discordService.importOpenTickets((update) => {
        report({
          ...update,
          progress: Math.min(48, Math.round((update.progress || 0) * 0.48)),
        });
      });

      report({
        stage: 'Full Discord recovery',
        progress: 50,
        message: 'Open tickets finished. Starting closed transcripts.',
        detail: open.message,
      });

      const closed = await discordService.importClosedTicketsAndTranscripts((update) => {
        report({
          ...update,
          progress: 50 + Math.min(49, Math.round((update.progress || 0) * 0.49)),
        });
      });

      return {
        message: `${open.message} ${closed.message}`,
        open,
        closed,
      };
    });

    return res.status(202).json({
      message: 'Full Discord recovery started.',
      job,
    });
  } catch (error) {
    return sendJobError(req, res, error, 'FULL IMPORT');
  }
};

exports.startJSONRestore = async (req, res) => {
  const backup = req.body?.backup || req.body;

  if (!backup || typeof backup !== 'object' || Array.isArray(backup)) {
    return res.status(400).json({
      error: 'Send a valid JSON backup in the request body.',
    });
  }

  try {
    const job = await jobService.createJob('json-backup-restore', async (report) => {
      const result = await backupService.restoreJSONBackup(backup, report);
      await discordService.refreshStaffCounters();
      return result;
    });

    return res.status(202).json({
      message: 'JSON backup restore started.',
      job,
    });
  } catch (error) {
    return sendJobError(req, res, error, 'JSON RESTORE');
  }
};

exports.getImportJob = async (req, res) => {
  try {
    const job = await jobService.getJob(req.params.id);

    if (!job) {
      return res.status(404).json({ error: 'Recovery job was not found or expired.' });
    }

    return res.json(job);
  } catch (error) {
    console.error('[IMPORT JOB READ ERROR]', error);
    return res.status(500).json({
      error: 'Unable to read recovery progress.',
      requestId: req.requestId,
    });
  }
};
