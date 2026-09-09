'use strict';

const schoolTicketAccess = require('../services/schoolTicketAccess.service');

async function requireTicketReadAccess(req, res, next) {
  if (!schoolTicketAccess.isSchoolTicketUser(req.auth?.user)) return next();

  const ticketId = String(req.params.id || '').trim();
  if (!ticketId) {
    return res.status(400).json({ error: 'Ticket ID is required.' });
  }

  try {
    if (await schoolTicketAccess.canReadTicket(req.auth.user, ticketId)) return next();
    return res.status(404).json({ error: 'Ticket not found.' });
  } catch (error) {
    console.error(`[TICKET ACCESS ${req.requestId}]`, error);
    return res.status(500).json({
      error: 'Internal server error.',
      requestId: req.requestId,
    });
  }
}

module.exports = { requireTicketReadAccess };
