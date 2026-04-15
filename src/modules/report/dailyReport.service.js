const { PrismaClient } = require('@prisma/client');
const DailyReportSettings = require('./dailyReport.model');
const User = require('../user/user.model');
const emailService = require('../emailService/email.service');
const Issue = require('../issue/issue.model');
const MaintenanceSchedule = require('../maintenanceSchedule/maintenanceSchedule.model');

const prisma = new PrismaClient();

/**
 * Generate daily report for a company
 */
async function generateDailyReport(companyName, reportSettings) {
  try {
    const today = new Date();
    const dayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0);
    const dayEnd = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59);

    const reportData = {
      date: today.toISOString().split('T')[0],
      companyName,
      sections: {},
    };

    // Open Issues
    if (reportSettings.reportContent.openIssues) {
      const openIssues = await Issue.find({
        companyName,
        status: { $nin: ['Closed', 'Completed', 'Done'] },
      })
        .select('_id title status priority assignedTo createdAt dueDate')
        .lean();

      reportData.sections.openIssues = {
        count: openIssues.length,
        items: openIssues.slice(0, 10), // Top 10
      };
    }

    // Completed Issues Today
    if (reportSettings.reportContent.completedIssues) {
      const completedIssues = await Issue.find({
        companyName,
        status: { $in: ['Closed', 'Completed', 'Done'] },
        updatedAt: { $gte: dayStart, $lte: dayEnd },
      })
        .select('_id title completedAt assignedTo')
        .lean();

      reportData.sections.completedIssues = {
        count: completedIssues.length,
        items: completedIssues.slice(0, 5),
      };
    }

    // Maintenance Schedule for Next 7 Days
    if (reportSettings.reportContent.maintenanceSchedule) {
      const sevenDaysLater = new Date(today);
      sevenDaysLater.setDate(sevenDaysLater.getDate() + 7);

      const schedules = await MaintenanceSchedule.find({
        companyName,
        date: { $gte: today, $lte: sevenDaysLater },
      })
        .select('_id asset date maintenanceType assignedTo')
        .lean();

      reportData.sections.maintenanceSchedule = {
        count: schedules.length,
        items: schedules,
      };
    }

    // Work Orders (Open)
    if (reportSettings.reportContent.workOrders) {
      const workOrders = await Issue.find({
        companyName,
        workOrderNumber: { $exists: true, $ne: null },
        status: { $nin: ['Closed', 'Completed'] },
      })
        .select('_id workOrderNumber title status priority assignedTo')
        .lean();

      reportData.sections.workOrders = {
        count: workOrders.length,
        items: workOrders.slice(0, 10),
      };
    }

    // Assets Status
    if (reportSettings.reportContent.assets) {
      const assets = await prisma.asset.findMany({
        where: { companyName },
        select: { id: true, name: true, status: true, lastMaintenanceDate: true },
        take: 10,
      });

      reportData.sections.assets = {
        count: assets.length,
        items: assets,
      };
    }

    // Technicians Status
    if (reportSettings.reportContent.techniciansStatus) {
      const technicians = await User.find({
        companyName,
        role: 'technician',
        status: 'active',
      })
        .select('_id name email assignedIssues')
        .lean();

      reportData.sections.techniciansStatus = {
        count: technicians.length,
        items: technicians,
      };
    }

    return reportData;
  } catch (error) {
    console.error(`Error generating daily report for ${companyName}:`, error);
    throw error;
  }
}

/**
 * Generate HTML email template for daily report
 */
function generateReportHtml(reportData, companyName) {
  const sections = reportData.sections;

  let html = `
    <div style="font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px;">
      <h1 style="color: #1a2b43; border-bottom: 3px solid #1769ff; padding-bottom: 10px;">
        Daily Report - ${companyName}
      </h1>
      <p style="color: #666; font-size: 14px;">
        Report for: <strong>${reportData.date}</strong>
      </p>
  `;

  // Open Issues Section
  if (sections.openIssues) {
    html += `
      <div style="margin-top: 30px; border-left: 4px solid #ff6b6b; padding-left: 15px;">
        <h2 style="color: #1a2b43; margin-top: 0;">📋 Open Issues</h2>
        <p style="color: #666;">Total: <strong>${sections.openIssues.count}</strong></p>
        <ul style="list-style: none; padding: 0;">
          ${sections.openIssues.items.slice(0, 5).map(issue => `
            <li style="padding: 8px; background: #f9f9f9; margin-bottom: 5px; border-radius: 4px;">
              <strong>${issue.title}</strong>
              <div style="font-size: 12px; color: #666;">Status: ${issue.status} | Priority: ${issue.priority}</div>
            </li>
          `).join('')}
        </ul>
      </div>
    `;
  }

  // Completed Issues Section
  if (sections.completedIssues) {
    html += `
      <div style="margin-top: 30px; border-left: 4px solid #51cf66; padding-left: 15px;">
        <h2 style="color: #1a2b43; margin-top: 0;">✅ Completed Today</h2>
        <p style="color: #666;">Total: <strong>${sections.completedIssues.count}</strong></p>
        <ul style="list-style: none; padding: 0;">
          ${sections.completedIssues.items.map(issue => `
            <li style="padding: 8px; background: #f9f9f9; margin-bottom: 5px; border-radius: 4px;">
              <strong>${issue.title}</strong>
            </li>
          `).join('')}
        </ul>
      </div>
    `;
  }

  // Maintenance Schedule Section
  if (sections.maintenanceSchedule) {
    html += `
      <div style="margin-top: 30px; border-left: 4px solid #4dabf7; padding-left: 15px;">
        <h2 style="color: #1a2b43; margin-top: 0;">🔧 Upcoming Maintenance</h2>
        <p style="color: #666;">Next 7 days: <strong>${sections.maintenanceSchedule.count}</strong> scheduled</p>
      </div>
    `;
  }

  // Work Orders Section
  if (sections.workOrders) {
    html += `
      <div style="margin-top: 30px; border-left: 4px solid #ffd43b; padding-left: 15px;">
        <h2 style="color: #1a2b43; margin-top: 0;">📦 Open Work Orders</h2>
        <p style="color: #666;">Total: <strong>${sections.workOrders.count}</strong></p>
      </div>
    `;
  }

  // Footer
  html += `
    <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #e0e0e0; color: #999; font-size: 12px;">
      <p>This is an automated daily report. Please do not reply to this email.</p>
      <p>© ${new Date().getFullYear()} FixNest Maintenance Management System</p>
    </div>
    </div>
  `;

  return html;
}

/**
 * Send daily reports to recipients
 */
async function sendDailyReports(companyName, reportSettings) {
  try {
    // Generate report data
    const reportData = await generateDailyReport(companyName, reportSettings);

    // Get email recipients based on settings
    const recipients = [];

    if (reportSettings.recipients.admins) {
      const admins = await User.find({
        companyName,
        role: 'admin',
        status: 'active',
      }).select('email name');
      recipients.push(...admins);
    }

    if (reportSettings.recipients.technicians) {
      const technicians = await User.find({
        companyName,
        role: 'technician',
        status: 'active',
      }).select('email name');
      recipients.push(...technicians);
    }

    if (reportSettings.recipients.clients) {
      const clients = await User.find({
        companyName,
        role: 'client',
        status: 'active',
      }).select('email name');
      recipients.push(...clients);
    }

    if (recipients.length === 0) {
      console.log(`No active recipients found for ${companyName}`);
      return { sent: 0, failed: 0 };
    }

    // Generate email content
    const htmlContent = generateReportHtml(reportData, companyName);

    // Send emails
    let successCount = 0;
    let failureCount = 0;

    for (const recipient of recipients) {
      try {
        await emailService.sendEmail({
          to: recipient.email,
          subject: `Daily Report - ${companyName} - ${reportData.date}`,
          html: htmlContent,
          template: 'daily-report',
          context: {
            recipientName: recipient.name,
            companyName,
            reportData,
          },
        });
        successCount++;
      } catch (error) {
        console.error(`Failed to send report to ${recipient.email}:`, error);
        failureCount++;
      }
    }

    // Update last sent date
    await DailyReportSettings.updateOne(
      { companyName },
      { lastSentDate: new Date() }
    );

    console.log(`Daily report sent for ${companyName}: ${successCount} success, ${failureCount} failed`);
    return { sent: successCount, failed: failureCount };
  } catch (error) {
    console.error(`Error sending daily reports for ${companyName}:`, error);
    throw error;
  }
}

/**
 * Check and send pending daily reports
 * This function should be called by a cron job
 */
async function processPendingDailyReports() {
  try {
    const now = new Date();
    const currentHour = String(now.getHours()).padStart(2, '0');
    const currentMinute = String(now.getMinutes()).padStart(2, '0');
    const currentTime = `${currentHour}:${currentMinute}`;

    console.log(`[Daily Report Scheduler] Checking for reports to send at ${currentTime}`);

    // Get all enabled report settings
    const enabledReports = await DailyReportSettings.find({
      enabled: true,
    });

    for (const setting of enabledReports) {
      // Check if it's not weekend (if configured)
      if (!setting.includeWeekendReports) {
        const dayOfWeek = now.getDay();
        if (dayOfWeek === 0 || dayOfWeek === 6) {
          console.log(
            `[Daily Report] Skipping weekend report for ${setting.companyName}`
          );
          continue;
        }
      }

      // Check if report was already sent today
      const lastSent = setting.lastSentDate ? new Date(setting.lastSentDate) : null;
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

      if (lastSent) {
        const lastSentDate = new Date(
          lastSent.getFullYear(),
          lastSent.getMonth(),
          lastSent.getDate()
        );
        if (lastSentDate.getTime() === today.getTime()) {
          console.log(
            `[Daily Report] Report already sent today for ${setting.companyName}`
          );
          continue;
        }
      }

      // Check if it's time to send this report
      if (setting.sendTime === currentTime) {
        console.log(
          `[Daily Report] Sending report for ${setting.companyName} at ${currentTime}`
        );
        await sendDailyReports(setting.companyName, setting);
      }
    }
  } catch (error) {
    console.error('[Daily Report Scheduler] Error processing pending reports:', error);
  }
}

module.exports = {
  generateDailyReport,
  sendDailyReports,
  processPendingDailyReports,
  generateReportHtml,
};
