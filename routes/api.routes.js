const express = require('express');
const apiController = require('../controllers/api.controller');
const optimizedController = require('../controllers/optimized.controller');
const schoolTicketController = require('../controllers/schoolTicket.controller');
const ticketReadController = require('../controllers/ticketRead.controller');
const ticketSummaryController = require('../controllers/ticketSummary.controller');
const transcriptController = require('../controllers/transcript.controller');
const staffController = require('../controllers/staff.controller');
const staffPerformanceController = require('../controllers/staffPerformance.controller');
const accessLogsController = require('../controllers/accessLogs.controller');
const mediaController = require('../controllers/media.controller');
const staffManagementController = require('../controllers/staffManagement.controller');
const { requirePanelOwnerHidden } = require('../middleware/owner.middleware');
const { requireStaffPerformanceAccess } = require('../middleware/staffPerformance.middleware');
const { requireMediaManager } = require('../middleware/mediaManager.middleware');
const { requireStaffManagerHidden } = require('../middleware/staffManagement.middleware');
const { requireTicketReadAccess } = require('../middleware/ticketAccess.middleware');

const router = express.Router();
const mediaUploadParser = express.raw({
  type: () => true,
  limit: process.env.MEDIA_UPLOAD_BODY_LIMIT || '45mb',
});

function scopedTicketHandler(fullHandler, schoolHandler) {
  return (req, res, next) => {
    if (req.auth?.user?.accessScope === 'school_tickets') {
      return schoolHandler(req, res, next);
    }
    return fullHandler(req, res, next);
  };
}

router.get('/dashboard', scopedTicketHandler(apiController.getDashboardStats, schoolTicketController.getDashboardStats));
router.get('/tickets', scopedTicketHandler(apiController.getTickets, schoolTicketController.getTickets));
router.get('/tickets/:id/transcript', requireTicketReadAccess, transcriptController.getTicketTranscriptHtml);
router.get('/tickets/:id/summary', requireTicketReadAccess, ticketSummaryController.getTicketSummary);
router.get('/tickets/:id', requireTicketReadAccess, ticketReadController.getTicketById);

// Versioned, paginated endpoints are available for future UI upgrades without
// changing the current response shapes or panel flow.
router.get('/v2/tickets', scopedTicketHandler(optimizedController.getTicketsPage, schoolTicketController.getTicketsPage));
router.get('/v2/tickets/:id/messages', requireTicketReadAccess, optimizedController.getTicketMessagesPage);
router.get('/v2/tickets/:id/logs', requireTicketReadAccess, optimizedController.getTicketLogsPage);

router.get('/staff', staffController.getStaffProfiles);
router.get('/staff/performance', requireStaffPerformanceAccess, staffPerformanceController.getStaffPerformance);
router.get('/access-logs', requirePanelOwnerHidden, accessLogsController.getAccessLogs);

// Owner / Executive only: list currently eligible panel admins and revoke panel access.
// Discord roles are never added, removed, or changed from this feature.
router.get('/staff-management', requireStaffManagerHidden, staffManagementController.list);
router.delete('/staff-management/:discordId', requireStaffManagerHidden, staffManagementController.remove);

// Every authenticated staff member may view the Web Panel Settings section and
// its access state. Only the Panel Owner, Owner, and Executives may mutate media.
router.get('/media/settings', mediaController.getSettings);
router.put('/media/:slot', requireMediaManager, mediaUploadParser, mediaController.upload);
router.delete('/media/:slot', requireMediaManager, mediaController.reset);

module.exports = router;
