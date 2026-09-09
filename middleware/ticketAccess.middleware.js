'use strict';

function requireTicketReadAccess(req, res, next) {
  const ticketId = String(req.params.id || '').trim();
  if (!ticketId) {
    return res.status(400).json({ error: 'Ticket ID is required.' });
  }

  return next();
}

module.exports = { requireTicketReadAccess };
