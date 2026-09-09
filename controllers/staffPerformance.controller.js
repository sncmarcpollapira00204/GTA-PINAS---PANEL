'use strict';

const staffPerformanceService = require('../services/staffPerformance.service');

exports.getStaffPerformance = async (req, res) => {
  try {
    const refreshValue = String(req.query.refresh || '').trim().toLowerCase();
    const force = refreshValue === '1' || refreshValue === 'true';
    const report = await staffPerformanceService.loadStaffPerformance({ force });

    res.setHeader('X-Staff-Performance-Model', report.model || 'unique-records-v2');
    res.setHeader(
      'Cache-Control',
      force ? 'private, no-store' : 'private, max-age=30, stale-while-revalidate=30'
    );
    return res.json(report);
  } catch (error) {
    console.error(`[STAFF PERFORMANCE ${req.requestId}]`, error);
    if (error?.code === 'WHITELIST_DATABASE_NOT_CONFIGURED') {
      return res.status(503).json({
        error: 'Staff performance data is temporarily unavailable.',
        code: error.code,
        requestId: req.requestId,
      });
    }
    return res.status(500).json({
      error: 'Unable to load staff performance.',
      code: 'STAFF_PERFORMANCE_ERROR',
      requestId: req.requestId,
    });
  }
};
