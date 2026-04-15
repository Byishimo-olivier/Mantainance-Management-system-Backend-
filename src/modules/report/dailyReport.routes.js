const express = require('express');
const router = express.Router();
const {
  getDailyReportSettings,
  updateDailyReportSettings,
  sendTestDailyReport,
  toggleDailyReport,
} = require('./dailyReport.controller');

// Middleware for authentication (adjust based on your auth setup)
const authMiddleware = (req, res, next) => {
  // Add your authentication logic here
  next();
};

/**
 * GET /api/daily-reports/settings/:companyName
 * Get daily report settings for a company
 */
router.get('/settings/:companyName', authMiddleware, getDailyReportSettings);

/**
 * POST/PUT /api/daily-reports/settings/:companyName
 * Create or update daily report settings
 */
router.put('/settings/:companyName', authMiddleware, updateDailyReportSettings);
router.post('/settings/:companyName', authMiddleware, updateDailyReportSettings);

/**
 * POST /api/daily-reports/test/:companyName
 * Send a test daily report
 */
router.post('/test/:companyName', authMiddleware, sendTestDailyReport);

/**
 * POST /api/daily-reports/toggle/:companyName
 * Toggle daily report enabled/disabled
 */
router.post('/toggle/:companyName', authMiddleware, toggleDailyReport);

module.exports = router;
