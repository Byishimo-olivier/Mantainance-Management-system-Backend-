// Runs published Studio automations.
//  - Event automations (issue.created / issue.assigned / issue.status_changed) run when the issue
//    routes call emit(); they never slow down or break the request that triggered them.
//  - Reminder automations (issue.overdue / request.pending) run on a 15-minute sweep, and each
//    reminder is sent once per work order (enforced by a unique key in the log).
const { StudioConfig, StudioAutomationLog } = require('./studio.model');
const notificationService = require('../notification/notification.service');
const emailService = require('../emailService/email.service');
const userService = require('../user/user.service');
const issueService = require('../issue/issue.service');

const DONE = new Set(['COMPLETED', 'COMPLETE', 'DONE', 'RESOLVED', 'CLOSED']);
const ADMIN_ROLES = new Set(['client', 'admin', 'manager']);
const norm = (v) => String(v || '').trim().toUpperCase().replace(/[_-]+/g, ' ');
const idOf = (r) => String(r?.id || r?._id || r?.userId || '');
const statusOf = (i) => norm(i?.status) || 'OPEN';
const isDone = (i) => DONE.has(statusOf(i));
const priorityOf = (i) => {
  const p = norm(i?.priority);
  if (['HIGH', 'URGENT', 'CRITICAL', 'EMERGENCY'].includes(p)) return 'High';
  return p === 'LOW' ? 'Low' : 'Medium';
};
const deadlineOf = (i) => { const d = new Date(i?.fixDeadline || i?.dueDate || ''); return Number.isNaN(d.getTime()) ? null : d; };
const isOverdue = (i, now = new Date()) => !isDone(i) && (i?.overdue === true || Boolean(deadlineOf(i) && deadlineOf(i) < now));
// A request still waiting for a manager's approval.
const isPendingRequest = (i) => !i?.approved && !i?.rejected && ['PENDING', 'OPEN', 'SUBMITTED'].includes(statusOf(i));
const ref = (i) => `#${idOf(i).slice(-6).toUpperCase()}`;
const titleCase = (s) => String(s || '').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());

function render(template, issue, extra = {}) {
  const values = {
    title: issue?.title || 'Untitled',
    ref: ref(issue),
    status: titleCase(statusOf(issue)),
    priority: priorityOf(issue),
    location: issue?.property?.name || issue?.location || '-',
    category: issue?.category || '-',
    assignee: extra.assigneeName || '-',
    company: issue?.companyName || '',
  };
  return String(template || '').replace(/\{(\w+)\}/g, (m, k) => (k in values ? values[k] : m));
}

function matches(def, issue, extra = {}) {
  const c = def.conditions || {};
  if (c.priority && priorityOf(issue) !== c.priority) return false;
  if (c.category && String(issue?.category || '').trim().toLowerCase() !== c.category.toLowerCase()) return false;
  if (def.trigger === 'issue.status_changed' && c.status && norm(extra.newStatus || issue?.status) !== c.status) return false;
  return true;
}

function assigneeIds(issue, extra = {}) {
  const ids = new Set();
  if (extra.assigneeId) ids.add(String(extra.assigneeId));
  if (issue?.assignedTo && typeof issue.assignedTo === 'string' && /^[a-f0-9]{24}$/i.test(issue.assignedTo)) ids.add(issue.assignedTo);
  if (issue?.technicianId) ids.add(String(issue.technicianId));
  (Array.isArray(issue?.assignees) ? issue.assignees : []).forEach((a) => {
    const id = typeof a === 'string' ? a : idOf(a);
    if (/^[a-f0-9]{24}$/i.test(id)) ids.add(id);
  });
  return [...ids];
}

async function recipientsFor(to, issue, companyName, extra) {
  if (to === 'assignee') return assigneeIds(issue, extra);
  if (to === 'requester') return issue?.userId ? [String(issue.userId)] : [];
  const users = await userService.getAllUsers({ companyName }).catch(() => []);
  return (users || []).filter((u) => ADMIN_ROLES.has(String(u?.role || '').toLowerCase()) && String(u?.status || 'active') !== 'inactive').map(idOf).filter(Boolean);
}

async function deliver(action, issue, companyName, automationName, extra) {
  const ids = await recipientsFor(action.to, issue, companyName, extra);
  const message = render(action.message, issue, extra);
  const title = `${automationName}`;
  let sent = 0;
  for (const userId of ids) {
    if (action.channel === 'in_app' || action.channel === 'both') {
      if (await notificationService.createNotification({ userId, title, message, type: 'info', link: '/dashboard' })) sent += 1;
    }
    if (action.channel === 'email' || action.channel === 'both') {
      const user = await userService.findUserById(userId).catch(() => null);
      if (user?.email) {
        await emailService.sendEmail({
          to: user.email,
          subject: `${automationName}: ${issue?.title || ref(issue)}`,
          text: message,
          html: `<p>${message.replace(/[<>&]/g, (ch) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[ch]))}</p><p style="color:#888;font-size:12px">Sent by a FixNest Studio automation.</p>`,
        }).catch((err) => console.warn('[Studio] email failed:', err.message));
        if (action.channel === 'email') sent += 1;
      }
    }
  }
  return sent;
}

async function runAutomation(automation, trigger, issue, extra = {}) {
  const def = automation.published || {};
  if (!matches(def, issue, extra)) return;
  const companyName = automation.companyName;
  const reminder = trigger === 'issue.overdue' || trigger === 'request.pending';
  let log;
  try {
    log = await StudioAutomationLog.create({
      companyName,
      automationId: String(automation._id),
      automationName: automation.name,
      trigger,
      issueId: idOf(issue),
      issueTitle: issue?.title || '',
      dedupeKey: reminder ? `${automation._id}:${idOf(issue)}:${trigger}` : '',
    });
  } catch (err) {
    if (err?.code === 11000) return; // this reminder was already sent
    throw err;
  }
  let recipients = 0;
  let ok = true;
  for (const action of def.actions || []) {
    try {
      recipients += await deliver(action, issue, companyName, automation.name, extra);
    } catch (err) {
      ok = false;
      console.warn('[Studio] automation action failed:', err.message);
    }
  }
  await StudioAutomationLog.updateOne({ _id: log._id }, {
    recipients, ok, summary: `${recipients} notification${recipients === 1 ? '' : 's'} sent for ${ref(issue)} "${issue?.title || ''}"`,
  });
}

async function runEvent(trigger, issue, extra = {}) {
  const companyName = String(issue?.companyName || '').trim();
  if (!companyName || !idOf(issue)) return;
  const automations = await StudioConfig.find({
    companyName, kind: 'automation', enabled: true, published: { $ne: null }, 'published.trigger': trigger,
  }).lean();
  for (const automation of automations) {
    await runAutomation(automation, trigger, issue, extra).catch((err) => console.warn('[Studio] automation failed:', err.message));
  }
}

// Called from the issue routes. Fire-and-forget: never delays or breaks the user's request.
function emit(trigger, issue, extra = {}) {
  if (process.env.STUDIO_AUTOMATIONS === 'off' || !issue) return;
  setImmediate(() => runEvent(trigger, issue, extra).catch((err) => console.warn('[Studio] event failed:', err.message)));
}

async function sweep() {
  const automations = await StudioConfig.find({
    kind: 'automation', enabled: true, published: { $ne: null }, 'published.trigger': { $in: ['issue.overdue', 'request.pending'] },
  }).lean();
  const byCompany = new Map();
  automations.forEach((a) => byCompany.set(a.companyName, [...(byCompany.get(a.companyName) || []), a]));
  const now = new Date();
  for (const [companyName, list] of byCompany) {
    const issues = await issueService.getAll(companyName).catch(() => []);
    for (const automation of list) {
      const def = automation.published;
      const due = def.trigger === 'issue.overdue'
        ? issues.filter((i) => isOverdue(i, now))
        : issues.filter((i) => {
          const created = new Date(i?.createdAt || '');
          const hours = Number(def.conditions?.pendingHours) || 24;
          return isPendingRequest(i) && !Number.isNaN(created.getTime()) && now - created >= hours * 3600000;
        });
      for (const issue of due.slice(0, 200)) {
        await runAutomation(automation, def.trigger, issue).catch((err) => console.warn('[Studio] reminder failed:', err.message));
      }
    }
  }
}

let started = false;
function start() {
  if (started || process.env.STUDIO_AUTOMATIONS === 'off') return;
  started = true;
  const run = () => sweep().catch((err) => console.warn('[Studio] sweep failed:', err.message));
  setTimeout(run, 60 * 1000).unref();
  setInterval(run, 15 * 60 * 1000).unref();
}

module.exports = { emit, runEvent, sweep, start, _internal: { render, matches, isOverdue, isPendingRequest } };
