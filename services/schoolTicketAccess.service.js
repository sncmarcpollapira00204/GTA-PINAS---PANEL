'use strict';

const pool = require('../db');

function isSchoolTicketUser(user) {
  return user?.accessScope === 'school_tickets';
}

function schoolTicketPredicate(alias = 't') {
  const prefix = String(alias || 't').replace(/[^a-zA-Z0-9_]/g, '') || 't';
  return `(
    ${prefix}.status = 'open'
    AND COALESCE(${prefix}.import_source, 'live') IN ('live', 'discord_open_import')
    AND (
      LOWER(COALESCE(${prefix}.details, '')) LIKE '%student_complains%'
      OR LOWER(COALESCE(${prefix}.details, '')) LIKE '%teacher_application%'
      OR LOWER(COALESCE(${prefix}.channel_name, '')) LIKE 'osa-%'
      OR LOWER(COALESCE(${prefix}.channel_name, '')) LIKE 'professor-%'
    )
  )`;
}

async function canReadTicket(user, ticketId) {
  if (!isSchoolTicketUser(user)) return true;
  if (!ticketId) return false;

  const result = await pool.query(
    `SELECT 1 FROM tickets t WHERE t.id = $1 AND ${schoolTicketPredicate('t')} LIMIT 1`,
    [String(ticketId)]
  );
  return result.rowCount > 0;
}

module.exports = {
  isSchoolTicketUser,
  schoolTicketPredicate,
  canReadTicket,
};
