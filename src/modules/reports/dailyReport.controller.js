const dailyReportService = require('./dailyReport.service');

/**
 * Controller for daily report operations
 */
class DailyReportController {
  /**
   * Manually trigger daily reports (admin only)
   * POST /api/reports/daily/trigger
   */
  async triggerDailyReports(req, res) {
    try {
      console.log('📧 [Admin] Manually triggered daily reports');
      await dailyReportService.triggerReportsNow();

      res.json({
        success: true,
        message: 'Daily reports have been triggered successfully. Emails are being sent...',
      });
    } catch (error) {
      console.error('Error triggering reports:', error.message);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  /**
   * Get report status/logs
   * GET /api/reports/daily/status
   */
  async getReportStatus(req, res) {
    try {
      res.json({
        success: true,
        status: 'active',
        schedule: '6 AM UTC daily',
        lastUpdated: new Date().toISOString(),
        message: 'Daily reports are scheduled and will be sent automatically',
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }
}

module.exports = new DailyReportController();
