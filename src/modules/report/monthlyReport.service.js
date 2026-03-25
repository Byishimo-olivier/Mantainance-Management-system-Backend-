const { PrismaClient } = require('@prisma/client');
const User = require('../user/user.model');
const MonthlyReportLog = require('./monthlyReportLog.model');
const emailService = require('../emailService/email.service');

const prisma = new PrismaClient();

function startOfUtcDay(date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 0, 0, 0, 0));
}

function endOfUtcDay(date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 23, 59, 59, 999));
}

function getLastDayOfMonthUtc(year, monthIndex) {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

function getScheduledDateForMonth(userCreatedAt, referenceDate = new Date()) {
  const year = referenceDate.getUTCFullYear();
  const monthIndex = referenceDate.getUTCMonth();
  const signupDay = new Date(userCreatedAt).getUTCDate();
  const lastDay = getLastDayOfMonthUtc(year, monthIndex);
  const scheduledDay = Math.min(signupDay, lastDay);
  return new Date(Date.UTC(year, monthIndex, scheduledDay, 0, 0, 0, 0));
}

function isLastDayOfMonth(date) {
  return date.getUTCDate() === getLastDayOfMonthUtc(date.getUTCFullYear(), date.getUTCMonth());
}

function getPeriodKey(date) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

function getDailyPeriodKey(date) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `daily:${year}-${month}-${day}`;
}

function getWeekStartUtc(date) {
  const d = startOfUtcDay(date);
  const day = d.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diff);
  return startOfUtcDay(d);
}

function getWeekEndUtc(date) {
  const start = getWeekStartUtc(date);
  return endOfUtcDay(new Date(Date.UTC(
    start.getUTCFullYear(),
    start.getUTCMonth(),
    start.getUTCDate() + 6,
    23, 59, 59, 999
  )));
}

function getWeeklyPeriodKey(date) {
  const weekStart = getWeekStartUtc(date);
  const year = weekStart.getUTCFullYear();
  const month = String(weekStart.getUTCMonth() + 1).padStart(2, '0');
  const day = String(weekStart.getUTCDate()).padStart(2, '0');
  return `weekly:${year}-${month}-${day}`;
}

function getMonthlyPeriodKey(date) {
  return `monthly:${getPeriodKey(date)}`;
}

function normalizeCompanyName(companyName) {
  return String(companyName || '').trim();
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function isResolvedStatus(status) {
  const normalized = String(status || '').trim().toLowerCase();
  return ['done', 'closed', 'completed', 'resolved'].includes(normalized);
}

function isRejectedRequest(issue = {}) {
  const normalized = String(issue.status || '').trim().toUpperCase();
  return normalized === 'REJECTED' || normalized === 'DECLINED';
}

function isApprovedWorkOrder(issue = {}) {
  const normalized = String(issue.status || '').trim().toUpperCase();
  const hasWorkOrderRef = Boolean(
    issue.workOrderId ||
    issue.workOrder ||
    issue.workOrderNumber ||
    issue.workOrderNo ||
    issue.workOrderCode ||
    issue.workOrderRef
  );
  return Boolean(issue.approved) || hasWorkOrderRef || normalized === 'APPROVED' || normalized.includes('IN PROGRESS') || normalized.includes('COMPLETE');
}

function isInProgressStatus(status) {
  return String(status || '').trim().toUpperCase().includes('IN PROGRESS');
}

async function buildCompanyScope(user) {
  const companyName = normalizeCompanyName(user.companyName);
  const companyUsers = await User.find({ companyName, status: 'active' }).select('_id email name role createdAt companyName status');
  const companyUserIds = companyUsers.map((entry) => String(entry._id));

  return {
    companyName,
    companyUsers,
    companyUserIds
  };
}

async function collectIssueMetrics(companyName, companyUserIds, periodStart, periodEnd) {
  const issues = await prisma.issue.findMany({
    where: {
      createdAt: { gte: periodStart, lte: periodEnd },
      OR: [
        { companyName },
        { userId: { in: companyUserIds } }
      ]
    },
    select: {
      status: true,
      priority: true,
      category: true
    }
  });

  const summary = {
    totalCreated: issues.length,
    open: 0,
    resolved: 0,
    highPriority: 0,
    topCategory: 'N/A'
  };

  const categoryCounts = new Map();
  for (const issue of issues) {
    if (isResolvedStatus(issue.status)) {
      summary.resolved += 1;
    } else {
      summary.open += 1;
    }

    if (String(issue.priority || '').trim().toLowerCase() === 'high') {
      summary.highPriority += 1;
    }

    const category = String(issue.category || '').trim();
    if (category) {
      categoryCounts.set(category, (categoryCounts.get(category) || 0) + 1);
    }
  }

  if (categoryCounts.size > 0) {
    summary.topCategory = [...categoryCounts.entries()].sort((a, b) => b[1] - a[1])[0][0];
  }

  return summary;
}

async function collectOperationalSummary(companyName, companyUserIds, periodStart, periodEnd) {
  const createdDuringPeriod = await prisma.issue.findMany({
    where: {
      createdAt: { gte: periodStart, lte: periodEnd },
      OR: [
        { companyName },
        { userId: { in: companyUserIds } }
      ]
    },
    select: {
      status: true,
      approved: true,
      workOrderId: true,
      workOrderNumber: true,
      workOrderNo: true,
      workOrderCode: true,
      workOrderRef: true,
      workOrder: true
    }
  });

  const completedDuringPeriod = await prisma.issue.findMany({
    where: {
      updatedAt: { gte: periodStart, lte: periodEnd },
      OR: [
        { companyName },
        { userId: { in: companyUserIds } }
      ]
    },
    select: {
      status: true,
      approved: true,
      workOrderId: true,
      workOrderNumber: true,
      workOrderNo: true,
      workOrderCode: true,
      workOrderRef: true,
      workOrder: true
    }
  });

  const companySnapshotIssues = await prisma.issue.findMany({
    where: {
      OR: [
        { companyName },
        { userId: { in: companyUserIds } }
      ]
    },
    select: {
      status: true,
      approved: true,
      workOrderId: true,
      workOrderNumber: true,
      workOrderNo: true,
      workOrderCode: true,
      workOrderRef: true,
      workOrder: true
    }
  });

  const requestsSubmitted = createdDuringPeriod.filter((issue) => !isRejectedRequest(issue)).length;
  const workOrdersCompleted = completedDuringPeriod.filter((issue) => isApprovedWorkOrder(issue) && isResolvedStatus(issue.status)).length;
  const workOrdersInProgress = companySnapshotIssues.filter((issue) => isApprovedWorkOrder(issue) && isInProgressStatus(issue.status)).length;

  return {
    requestsSubmitted,
    workOrdersCompleted,
    workOrdersInProgress
  };
}

async function collectSummary(user, periodStart, periodEnd) {
  const { companyName, companyUsers, companyUserIds } = await buildCompanyScope(user);

  const [issueSummary, operationalSummary, propertiesCreated, assetsCreated, activeSubscriptions] = await Promise.all([
    collectIssueMetrics(companyName, companyUserIds, periodStart, periodEnd),
    collectOperationalSummary(companyName, companyUserIds, periodStart, periodEnd),
    prisma.property.count({
      where: {
        userId: { in: companyUserIds },
        createdAt: { gte: periodStart, lte: periodEnd }
      }
    }),
    prisma.asset.count({
      where: {
        userId: { in: companyUserIds },
        createdAt: { gte: periodStart, lte: periodEnd }
      }
    }),
    prisma.subscription.count({
      where: {
        clientId: { in: companyUserIds },
        status: 'active'
      }
    })
  ]);

  const usersJoined = companyUsers.filter((entry) => {
    const createdAt = new Date(entry.createdAt);
    return createdAt >= periodStart && createdAt <= periodEnd;
  }).length;

  return {
    companyName,
    usersJoined,
    totalActiveUsers: companyUsers.length,
    propertiesCreated,
    assetsCreated,
    activeSubscriptions,
    issueSummary,
    operationalSummary
  };
}

async function getLastReportLog(userId) {
  return MonthlyReportLog.findOne({ userId }).sort({ periodEnd: -1 });
}

async function hasReportForPeriod(userId, periodKey, reportType) {
  const existing = await MonthlyReportLog.findOne({ userId, periodKey, reportType }).lean();
  return Boolean(existing);
}

async function createReportLog(payload) {
  return MonthlyReportLog.create(payload);
}

async function sendMonthlyReportForUser(user, runDate = new Date()) {
  if (!user || !user._id || !user.createdAt || !user.email) {
    return { skipped: true, reason: 'missing-required-user-fields' };
  }

  const createdAt = new Date(user.createdAt);
  const today = startOfUtcDay(runDate);
  const scheduledFor = getScheduledDateForMonth(createdAt, today);
  const dueToday = today.getTime() === scheduledFor.getTime() || isLastDayOfMonth(today);

  if (!dueToday) {
    return { skipped: true, reason: 'not-scheduled-day' };
  }

  const periodKey = getMonthlyPeriodKey(today);
  const alreadySent = await hasReportForPeriod(user._id, periodKey, 'monthly');
  if (alreadySent) {
    return { skipped: true, reason: 'already-sent' };
  }

  const lastLog = await getLastReportLog(user._id);
  const periodStart = lastLog ? new Date(lastLog.periodEnd.getTime() + 1) : createdAt;
  const periodEnd = endOfUtcDay(today);
  const summary = await collectSummary(user, periodStart, periodEnd);

  await emailService.sendOperationalSummary({
    email: normalizeEmail(user.email),
    name: user.name,
    companyName: summary.companyName,
    reportType: 'monthly',
    periodStart,
    periodEnd,
    summary
  });

  await createReportLog({
    userId: user._id,
    companyName: summary.companyName,
    recipientEmail: normalizeEmail(user.email),
    reportType: 'monthly',
    periodKey,
    periodStart,
    periodEnd,
    scheduledFor,
    sentAt: new Date()
  });

  return {
    sent: true,
    email: normalizeEmail(user.email),
    companyName: summary.companyName,
    periodKey
  };
}

async function sendDailyReportForUser(user, runDate = new Date()) {
  if (!user || !user._id || !user.email) {
    return { skipped: true, reason: 'missing-required-user-fields' };
  }

  const today = startOfUtcDay(runDate);
  const periodKey = getDailyPeriodKey(today);
  const alreadySent = await hasReportForPeriod(user._id, periodKey, 'daily');
  if (alreadySent) {
    return { skipped: true, reason: 'already-sent' };
  }

  const periodStart = today;
  const periodEnd = endOfUtcDay(today);
  const summary = await collectSummary(user, periodStart, periodEnd);

  await emailService.sendOperationalSummary({
    email: normalizeEmail(user.email),
    name: user.name,
    companyName: summary.companyName,
    reportType: 'daily',
    periodStart,
    periodEnd,
    summary
  });

  await createReportLog({
    userId: user._id,
    companyName: summary.companyName,
    recipientEmail: normalizeEmail(user.email),
    reportType: 'daily',
    periodKey,
    periodStart,
    periodEnd,
    scheduledFor: periodEnd,
    sentAt: new Date()
  });

  return {
    sent: true,
    email: normalizeEmail(user.email),
    companyName: summary.companyName,
    periodKey
  };
}

async function sendWeeklyReportForUser(user, runDate = new Date()) {
  if (!user || !user._id || !user.email) {
    return { skipped: true, reason: 'missing-required-user-fields' };
  }

  const today = startOfUtcDay(runDate);
  if (today.getUTCDay() !== 0) {
    return { skipped: true, reason: 'not-week-end' };
  }

  const periodKey = getWeeklyPeriodKey(today);
  const alreadySent = await hasReportForPeriod(user._id, periodKey, 'weekly');
  if (alreadySent) {
    return { skipped: true, reason: 'already-sent' };
  }

  const periodStart = getWeekStartUtc(today);
  const periodEnd = endOfUtcDay(today);
  const summary = await collectSummary(user, periodStart, periodEnd);

  await emailService.sendOperationalSummary({
    email: normalizeEmail(user.email),
    name: user.name,
    companyName: summary.companyName,
    reportType: 'weekly',
    periodStart,
    periodEnd,
    summary
  });

  await createReportLog({
    userId: user._id,
    companyName: summary.companyName,
    recipientEmail: normalizeEmail(user.email),
    reportType: 'weekly',
    periodKey,
    periodStart,
    periodEnd,
    scheduledFor: periodEnd,
    sentAt: new Date()
  });

  return {
    sent: true,
    email: normalizeEmail(user.email),
    companyName: summary.companyName,
    periodKey
  };
}

async function sendDueMonthlyReports(runDate = new Date()) {
  const activeUsers = await User.find({
    status: 'active',
    email: { $exists: true, $ne: null },
    role: { $in: ['admin', 'manager', 'client'] },
    createdAt: { $lte: endOfUtcDay(runDate) },
    companyName: { $exists: true, $ne: null }
  }).select('_id name email companyName createdAt status role');

  const results = [];
  for (const user of activeUsers) {
    try {
      const dailyResult = await sendDailyReportForUser(user, runDate);
      results.push({ userId: String(user._id), reportType: 'daily', ...dailyResult });

      const weeklyResult = await sendWeeklyReportForUser(user, runDate);
      results.push({ userId: String(user._id), reportType: 'weekly', ...weeklyResult });

      const monthlyResult = await sendMonthlyReportForUser(user, runDate);
      results.push({ userId: String(user._id), reportType: 'monthly', ...monthlyResult });
    } catch (error) {
      console.error('[monthly-report] failed for user', String(user._id), error);
      results.push({
        userId: String(user._id),
        email: normalizeEmail(user.email),
        error: error.message
      });
    }
  }

  return results;
}

function startMonthlyReportScheduler() {
  const enabled = String(process.env.ENABLE_MONTHLY_REPORT_SCHEDULER || '').toLowerCase();
  if (!['1', 'true', 'yes'].includes(enabled)) {
    return null;
  }

  const intervalHours = parseInt(process.env.MONTHLY_REPORT_SCHEDULER_HOURS, 10) || 6;
  const intervalMs = Math.max(intervalHours, 1) * 60 * 60 * 1000;

  const run = async () => {
    try {
      const results = await sendDueMonthlyReports(new Date());
      const sentCount = results.filter((entry) => entry.sent).length;
      console.log(`[company-summary-report] scheduler run complete. Sent ${sentCount} report(s).`);
    } catch (error) {
      console.error('[company-summary-report] scheduler run failed:', error);
    }
  };

  run();
  return setInterval(run, intervalMs);
}

module.exports = {
  sendDailyReportForUser,
  sendWeeklyReportForUser,
  sendMonthlyReportForUser,
  sendDueMonthlyReports,
  startMonthlyReportScheduler,
  getScheduledDateForMonth
};
