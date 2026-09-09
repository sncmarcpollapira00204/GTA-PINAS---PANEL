const staffProfileService = require('../services/staffProfile.service');

function setStaffHeaders(res, state, status, startedAt) {
  const complete = Boolean(status?.complete);
  res.setHeader(
    'Cache-Control',
    complete
      ? 'private, max-age=60, stale-while-revalidate=300'
      : 'private, no-store, max-age=0'
  );
  res.setHeader('X-Staff-Data', state);
  res.setHeader('X-Staff-Complete', complete ? '1' : '0');
  res.setHeader('X-Staff-Resolved', String(status?.resolvedCount || 0));
  res.setHeader('X-Staff-Total', String(status?.totalCount || 0));
  res.setHeader('Server-Timing', `staff;dur=${Date.now() - startedAt}`);
}

exports.getStaffProfiles = async (req, res) => {
  const startedAt = Date.now();

  try {
    const force = String(req.query.refresh || '') === '1';
    const cached = staffProfileService.getCachedStaffProfiles();
    const cachedStatus = staffProfileService.getStaffProfileStatus();

    // A cold deployment returns the configured directory immediately, then the
    // browser revalidates it after the Discord cache finishes warming.
    if (!force && !cached) {
      const fallback = staffProfileService.buildConfiguredFallbackProfiles();
      staffProfileService.warmStaffProfiles();
      setStaffHeaders(
        res,
        'warming',
        {
          complete: false,
          resolvedCount: 0,
          totalCount: fallback.length,
        },
        startedAt
      );
      return res.json(fallback);
    }

    // Never block normal page navigation on Discord. If the current cache is
    // partial, serve it immediately and finish the missing profiles in the
    // background. The client polls only while this state is incomplete.
    if (!force && cached) {
      if (!cachedStatus.complete) staffProfileService.warmStaffProfiles();
      setStaffHeaders(
        res,
        cachedStatus.complete ? 'cache' : 'partial',
        cachedStatus,
        startedAt
      );
      return res.json(cached);
    }

    const profiles = await staffProfileService.loadStaffProfiles({ force: true });
    const status = staffProfileService.getStaffProfileStatus();
    setStaffHeaders(
      res,
      status.complete ? 'refreshed' : 'partial',
      status,
      startedAt
    );
    return res.json(profiles);
  } catch (error) {
    console.error('[STAFF PROFILE API ERROR]', error);
    const fallback = staffProfileService.getCachedStaffProfiles()
      || staffProfileService.buildConfiguredFallbackProfiles();
    const status = staffProfileService.getStaffProfileStatus();

    if (fallback.length) {
      setStaffHeaders(
        res,
        status.hasCache ? 'stale' : 'fallback',
        {
          ...status,
          complete: false,
          totalCount: status.totalCount || fallback.length,
        },
        startedAt
      );
      return res.json(fallback);
    }

    return res.status(500).json({ error: 'Unable to load staff profiles.' });
  }
};
