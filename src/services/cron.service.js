/**
 * Cron Service
 * Centralized service for managing scheduled jobs
 */

const cron = require('node-cron');

const jobs = {};

const schedule = (cronExpression, callback) => {
  try {
    const job = cron.schedule(cronExpression, callback);
    const jobId = `job-${Date.now()}-${Math.random()}`;
    jobs[jobId] = job;
    console.log(`[Cron Service] Scheduled job: ${jobId}`);
    return jobId;
  } catch (error) {
    console.error('[Cron Service] Failed to schedule job:', error);
    throw error;
  }
};

const stop = (jobId) => {
  if (jobs[jobId]) {
    jobs[jobId].stop();
    delete jobs[jobId];
    console.log(`[Cron Service] Stopped job: ${jobId}`);
    return true;
  }
  return false;
};

const stopAll = () => {
  Object.values(jobs).forEach((job) => {
    try {
      job.stop();
    } catch (error) {
      console.error('[Cron Service] Error stopping job:', error);
    }
  });
  Object.keys(jobs).forEach((key) => {
    delete jobs[key];
  });
  console.log('[Cron Service] Stopped all scheduled jobs');
};

const getJobs = () => {
  return Object.keys(jobs).map((id) => ({
    id,
    active: jobs[id]._task ? true : false,
  }));
};

module.exports = {
  schedule,
  stop,
  stopAll,
  getJobs,
};
