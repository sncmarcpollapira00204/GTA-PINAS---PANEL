const express = require('express');
const apiController = require('../controllers/api.controller');
const importController = require('../controllers/import.controller');
const simpleTicketsController = require('../controllers/tickets.simple.controller');
const optimizedController = require('../controllers/optimized.controller');
const ticketReadController = require('../controllers/ticketRead.controller');
const ticketSummaryController = require('../controllers/ticketSummary.controller');
const transcriptController = require('../controllers/transcript.controller');
const staffController = require('../controllers/staff.controller');
const staffPerformanceController = require('../controllers/staffPerformance.controller');
const accessLogsController = require('../controllers/accessLogs.controller');
const mediaController = require('../controllers/media.controller');
const staffManagementController = require('../controllers/staffManagement.controller');
const { requireStaffPerformanceAccess } = require('../middleware/staffPerformance.middleware');
const { requireMediaManager } = require('../middleware/mediaManager.middleware');
const { requirePanelModeratorHidden } = require('../middleware/staffManagement.middleware');
const { requireTicketReadAccess } = require('../middleware/ticketAccess.middleware');

const router = express.Router();
const mediaUploadParser = express.raw({
  type: () => true,
  limit: process.env.MEDIA_UPLOAD_BODY_LIMIT || '45mb',
});

router.get('/dashboard', apiController.getDashboardStats);
router.get('/tickets', apiController.getTickets);
router.get('/tickets/simple', simpleTicketsController.getTickets);
router.get('/tickets/:id/transcript', requireTicketReadAccess, transcriptController.getTicketTranscriptHtml);
router.get('/tickets/:id/summary', requireTicketReadAccess, ticketSummaryController.getTicketSummary);
router.get('/tickets/:id', requireTicketReadAccess, ticketReadController.getTicketById);

router.post('/import/category/:category', importController.startCategoryImport);
router.get('/import/jobs/:jobId', importController.getImportJob);

router.get('/v2/tickets', optimizedController.getTicketsPage);
router.get('/v2/tickets/:id/messages', requireTicketReadAccess, optimizedController.getTicketMessagesPage);
router.get('/v2/tickets/:id/logs', requireTicketReadAccess, optimizedController.getTicketLogsPage);

router.get('/staff', staffController.getStaffProfiles);
router.get('/staff/performance', requireStaffPerformanceAccess, staffPerformanceController.getStaffPerformance);
router.get('/access-logs', requirePanelModeratorHidden, accessLogsController.getAccessLogs);

router.get('/staff-management', requirePanelModeratorHidden, staffManagementController.list);
router.delete('/staff-management/:discordId', requirePanelModeratorHidden, staffManagementController.remove);

router.get('/media/settings', mediaController.getSettings);
router.put('/media/:slot', requireMediaManager, mediaUploadParser, mediaController.upload);
router.delete('/media/:slot', requireMediaManager, mediaController.reset);

module.exports = router;
