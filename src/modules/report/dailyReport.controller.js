const DailyReportSettings = require('./dailyReport.model');
const { sendDailyReports } = require('./dailyReport.service');

/**
 * Get daily report settings for a company
 */
async function getDailyReportSettings(req, res) {
  try {
    const { companyName } = req.params;

    const settings = await DailyReportSettings.findOne({ companyName });

    if (!settings) {
      return res.status(404).json({
        success: false,
        message: 'Daily report settings not found',
      });
    }

    return res.status(200).json({
      success: true,
      data: settings,
    });
  } catch (error) {
    console.error('Error fetching daily report settings:', error);
    return res.status(500).json({
      success: false,
      message: 'Error fetching daily report settings',
      error: error.message,
    });
  }
}

/**
 * Create or update daily report settings for a company
 */
async function updateDailyReportSettings(req, res) {
  try {
    const { companyName } = req.params;
    const { sendTime, recipients, reportContent, enabled, includeWeekendReports, timeZone, emailFormat } = req.body;

    // Validate sendTime format (HH:MM)
    if (sendTime && !/^([0-1][0-9]|2[0-3]):[0-5][0-9]$/.test(sendTime)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid time format. Please use HH:MM (24-hour format)',
      });
    }

    const updateData = {};

    if (sendTime) updateData.sendTime = sendTime;
    if (recipients) updateData.recipients = recipients;
    if (reportContent) updateData.reportContent = reportContent;
    if (enabled !== undefined) updateData.enabled = enabled;
    if (includeWeekendReports !== undefined) updateData.includeWeekendReports = includeWeekendReports;
    if (timeZone) updateData.timeZone = timeZone;
    if (emailFormat) updateData.emailFormat = emailFormat;

    updateData.updatedBy = req.user?.email || 'system';

    const settings = await DailyReportSettings.findOneAndUpdate(
      { companyName },
      updateData,
      { new: true, upsert: true }
    );

    return res.status(200).json({
      success: true,
      message: 'Daily report settings updated successfully',
      data: settings,
    });
  } catch (error) {
    console.error('Error updating daily report settings:', error);
    return res.status(500).json({
      success: false,
      message: 'Error updating daily report settings',
      error: error.message,
    });
  }
}

/**
 * Send test daily report
 */
async function sendTestDailyReport(req, res) {
  try {
    const { companyName } = req.params;

    const settings = await DailyReportSettings.findOne({ companyName });

    if (!settings) {
      return res.status(404).json({
        success: false,
        message: 'Daily report settings not found',
      });
    }

    const result = await sendDailyReports(companyName, settings);

    return res.status(200).json({
      success: true,
      message: 'Test report sent successfully',
      data: {
        sent: result.sent,
        failed: result.failed,
      },
    });
  } catch (error) {
    console.error('Error sending test daily report:', error);
    return res.status(500).json({
      success: false,
      message: 'Error sending test report',
      error: error.message,
    });
  }
}

/**
 * Toggle daily report enabled/disabled
 */
async function toggleDailyReport(req, res) {
  try {
    const { companyName } = req.params;
    const { enabled } = req.body;

    if (enabled === undefined) {
      return res.status(400).json({
        success: false,
        message: 'Enabled status is required',
      });
    }

    const settings = await DailyReportSettings.findOneAndUpdate(
      { companyName },
      {
        enabled,
        updatedBy: req.user?.email || 'system',
      },
      { new: true, upsert: true }
    );

    return res.status(200).json({
      success: true,
      message: `Daily reports ${enabled ? 'enabled' : 'disabled'} successfully`,
      data: settings,
    });
  } catch (error) {
    console.error('Error toggling daily report:', error);
    return res.status(500).json({
      success: false,
      message: 'Error toggling daily report',
      error: error.message,
    });
  }
}

module.exports = {
  getDailyReportSettings,
  updateDailyReportSettings,
  sendTestDailyReport,
  toggleDailyReport,
};
