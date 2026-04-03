const express = require('express');
const dailyReportController = require('./dailyReport.controller');
const { authenticate } = require('../../middleware/auth');

const router = express.Router();

/**
 * Daily Report Routes
 */

// POST /api/reports/daily/trigger - Manually trigger report sending (admin only)
router.post('/daily/trigger', authenticate, dailyReportController.triggerDailyReports);

// GET /api/reports/daily/status - Get report scheduler status
router.get('/daily/status', authenticate, dailyReportController.getReportStatus);

module.exports = router;
