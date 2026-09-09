'use strict';

const authService = require('../services/auth.service');

async function getAccessLogs(req, res) {
  try {
    const overview = await authService.getAccessLogsOverview({
      eventLimit: req.query.limit,
      onlineWindowMinutes: 2,
    });

    res.setHeader('Cache-Control', 'no-store');
    return res.json(overview);
  } catch (error) {
    console.error('[ACCESS LOGS ERROR]', error);
    return res.status(500).json({
      error: 'Unable to load Web Panel access logs.',
      code: 'ACCESS_LOGS_FAILED',
    });
  }
}

module.exports = { getAccessLogs };
