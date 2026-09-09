'use strict';

const staffManagement = require('../services/staffManagement.service');
const authService = require('../services/auth.service');

function validDiscordId(value) {
  return /^\d{15,22}$/.test(String(value || '').trim());
}

function statusFor(error) {
  if (Number.isInteger(error?.status) && error.status >= 400 && error.status <= 599) {
    return error.status;
  }
  if (String(error?.code || '').startsWith('DISCORD_HTTP_')) return 502;
  return 500;
}

function errorResponse(res, error) {
  const status = statusFor(error);
  return res.status(status).json({
    error: error?.message || 'Staff management failed.',
    code: error?.code || 'STAFF_MANAGEMENT_FAILED',
  });
}

exports.list = async (req, res) => {
  try {
    const payload = await staffManagement.listPanelAdmins();
    return res.json({
      ...payload,
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[STAFF MANAGEMENT LIST]', error);
    return errorResponse(res, error);
  }
};

exports.remove = async (req, res) => {
  const discordId = String(req.params.discordId || '').trim();
  const actorId = String(req.auth?.user?.id || '').trim();

  if (!validDiscordId(discordId)) {
    return res.status(400).json({ error: 'Invalid Discord user ID.', code: 'INVALID_DISCORD_ID' });
  }

  if (discordId === actorId) {
    return res.status(409).json({
      error: 'You cannot remove your own Web Panel access.',
      code: 'SELF_ACCESS_REMOVAL_BLOCKED',
    });
  }

  try {
    const member = await staffManagement.removePanelAccess({ discordId, actorId });
    await authService.logAuthEvent({
      userId: discordId,
      username: member.username,
      eventType: 'staff_management',
      req,
      metadata: {
        action: 'remove_panel_access',
        actorId,
      },
    });

    return res.json({
      message: `Web Panel access was removed from ${member.displayName || member.username || discordId}.`,
      member,
    });
  } catch (error) {
    console.error('[STAFF MANAGEMENT REMOVE]', error);
    return errorResponse(res, error);
  }
};
