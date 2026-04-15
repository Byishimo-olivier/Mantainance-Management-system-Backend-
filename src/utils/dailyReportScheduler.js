const cron = require('node-cron');
const { processPendingDailyReports } = require('../modules/report/dailyReport.service');

/**
 * Initialize the daily report scheduler
 * Runs every minute to check if any reports need to be sent
 */
function initializeDailyReportScheduler() {
  console.log('[Daily Report Scheduler] Initializing...');

  // Run every minute at 00 seconds
  // This allows us to check each minute if a report should be sent
  const job = cron.schedule('0 * * * * *', async () => {
    try {
      await processPendingDailyReports();
    } catch (error) {
      console.error('[Daily Report Scheduler] Error in scheduled task:', error);
    }
  });

  console.log('[Daily Report Scheduler] Started - will check every minute');

  return job;
}

/**
 * Alternative: Run daily reports at specific times
 * This version runs every day at specific intervals
 */
function initializeDailyReportSchedulerV2() {
  console.log('[Daily Report Scheduler V2] Initializing...');

  // Run at 12:00AM, 1:00AM, 2:00AM, ... 11:00AM daily
  const timesToCheck = [
    '0 0 * * *',  // 00:00
    '0 1 * * *',  // 01:00
    '0 2 * * *',  // 02:00
    '0 3 * * *',  // 03:00
    '0 4 * * *',  // 04:00
    '0 5 * * *',  // 05:00
    '0 6 * * *',  // 06:00
    '0 7 * * *',  // 07:00 (default recommended)
    '0 8 * * *',  // 08:00
    '0 9 * * *',  // 09:00
    '0 10 * * *', // 10:00
    '0 11 * * *', // 11:00
    '0 12 * * *', // 12:00
    '0 13 * * *', // 13:00
    '0 14 * * *', // 14:00
    '0 15 * * *', // 15:00
    '0 16 * * *', // 16:00
    '0 17 * * *', // 17:00
    '0 18 * * *', // 18:00
    '0 19 * * *', // 19:00
    '0 20 * * *', // 20:00
    '0 21 * * *', // 21:00
    '0 22 * * *', // 22:00
    '0 23 * * *', // 23:00
  ];

  const jobs = timesToCheck.map(schedule => {
    return cron.schedule(schedule, async () => {
      try {
        await processPendingDailyReports();
      } catch (error) {
        console.error('[Daily Report Scheduler V2] Error in scheduled task:', error);
      }
    });
  });

  console.log('[Daily Report Scheduler V2] Started - will check hourly');

  return jobs;
}

/**
 * Clean stop of scheduler
 */
function stopDailyReportScheduler(job) {
  if (job) {
    job.stop();
    console.log('[Daily Report Scheduler] Stopped');
  }
}

module.exports = {
  initializeDailyReportScheduler,
  initializeDailyReportSchedulerV2,
  stopDailyReportScheduler,
};
