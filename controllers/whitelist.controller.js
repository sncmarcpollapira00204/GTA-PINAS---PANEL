'use strict';

const whitelistService = require('../services/whitelist.service');
const whitelistRecoveryService = require('../services/whitelistRecovery.service');

function sendWhitelistError(req, res, error) {
  console.error('[WHITELIST API]', error);

  if (error?.code === 'WHITELIST_DATABASE_NOT_CONFIGURED') {
    return res.status(503).json({ error: 'Whitelist data is temporarily unavailable.', code: error.code, requestId: req.requestId });
  }

  if (error?.code === 'DISCORD_TOKEN_NOT_CONFIGURED') {
    return res.status(503).json({ error: 'Discord profile data is temporarily unavailable.', code: error.code, requestId: req.requestId });
  }

  if (error?.code === 'DISCORD_API_ERROR' || error?.code === 'DISCORD_PROFILE_ID_MISMATCH') {
    return res.status(502).json({
      error: error?.code === 'DISCORD_PROFILE_ID_MISMATCH'
        ? 'Discord returned an unexpected profile. Please try again.'
        : 'Discord profile data is temporarily unavailable.',
      code: error.code,
    });
  }

  return res.status(500).json({
    error: 'Unable to read the whitelist database.',
    code: 'WHITELIST_DATABASE_ERROR',
  });
}

function validDiscordId(value) {
  return /^\d{15,22}$/.test(String(value || '').trim());
}

exports.lookup = async (req, res) => {
  const discordId = String(req.query.discordId || '').trim();
  if (!validDiscordId(discordId)) {
    return res.status(400).json({
      error: 'A valid Discord User ID is required.',
      code: 'INVALID_DISCORD_ID',
    });
  }

  try {
    let record = await whitelistService.lookupByDiscordId(discordId);
    let recoveredFromDiscord = false;

    // The whitelist database can lose historical rows after a restore/rebuild.
    // On a miss, read the original whitelist channels through MAIN-BOT instead
    // of treating the missing PostgreSQL row as proof that the user was never whitelisted.
    if (!record) {
      try {
        record = await whitelistRecoveryService.recoverByDiscordId(discordId);
        recoveredFromDiscord = Boolean(record);
      } catch (recoveryError) {
        console.error('[WHITELIST DISCORD RECOVERY]', recoveryError);
      }
    }

    if (!record) {
      return res.status(404).json({
        error: 'No whitelist application was found for this Discord User ID.',
        code: 'WHITELIST_RECORD_NOT_FOUND',
      });
    }

    let people = {};
    let profileWarning = null;
    try {
      people = await whitelistService.getRecordPeople(record, {
        force: req.query.refreshProfiles === '1',
      });
    } catch (profileError) {
      console.error('[WHITELIST PROFILE ENRICHMENT]', profileError);
      profileWarning = 'Discord names are temporarily unavailable. The whitelist record is still readable.';
    }

    return res.json({ record, people, profileWarning, recoveredFromDiscord });
  } catch (error) {
    return sendWhitelistError(req, res, error);
  }
};

exports.profile = async (req, res) => {
  const discordId = String(req.params.discordId || '').trim();
  if (!validDiscordId(discordId)) {
    return res.status(400).json({
      error: 'A valid Discord User ID is required.',
      code: 'INVALID_DISCORD_ID',
    });
  }

  try {
    const [profile, record] = await Promise.all([
      whitelistService.getDiscordProfile(discordId, { force: req.query.refresh === '1' }),
      whitelistService.lookupByDiscordId(discordId),
    ]);

    if (!profile) {
      return res.status(404).json({
        error: 'Discord could not find this user profile.',
        code: 'DISCORD_PROFILE_NOT_FOUND',
      });
    }

    return res.json({ requestedDiscordId: discordId, profile, record });
  } catch (error) {
    return sendWhitelistError(req, res, error);
  }
};

async function list(req, res, status) {
  try {
    const result = await whitelistService.listByStatus({
      status,
      page: req.query.page,
      pageSize: req.query.pageSize,
      search: req.query.search,
    });

    // Pending and Whitelisted pages are intentionally database-only.
    // Discord profile requests are reserved for Check Voucher/profile lookup.
    return res.json(result);
  } catch (error) {
    return sendWhitelistError(req, res, error);
  }
}

exports.listPending = (req, res) => list(req, res, 'pending');
exports.listWhitelisted = (req, res) => list(req, res, 'whitelisted');


exports.stats = async (req, res) => {
  try {
    const stats = await whitelistService.getWhitelistStats();
    res.setHeader('Cache-Control', 'private, max-age=15');
    return res.json(stats);
  } catch (error) {
    return sendWhitelistError(req, res, error);
  }
};
