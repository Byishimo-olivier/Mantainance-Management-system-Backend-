// Enforces a company's published Studio workflow when a work order / request changes status.
// No published workflow = no change in behaviour. Statuses that are not part of the workflow
// (e.g. DECLINED) are left alone, so existing flows keep working.
const { StudioConfig } = require('./studio.model');
const notificationService = require('../notification/notification.service');
const userService = require('../user/user.service');

const OVERRIDE_ROLES = new Set(['client', 'admin', 'superadmin']); // owners and admins may always move work
const APPROVER_ROLES = new Set(['client', 'admin', 'manager', 'superadmin']);
const ROLE_LABELS = { requestor: 'requesters', client: 'the owner', admin: 'admins', manager: 'managers', technician: 'technicians' };

const norm = (v) => {
  const s = String(v || '').trim().toUpperCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ');
  if (s === 'COMPLETE' || s === 'DONE' || s === 'RESOLVED') return 'COMPLETED';
  if (s === 'INPROGRESS') return 'IN PROGRESS';
  if (s === 'ONHOLD') return 'ON HOLD';
  return s;
};
// Same rule the dashboard uses: approved (or already in work) = work order, otherwise a request.
const WORK_STATUSES = new Set(['APPROVED', 'OPEN', 'IN PROGRESS', 'ON HOLD', 'COMPLETED', 'CLOSED']);
const targetOf = (issue) => (issue?.approved || WORK_STATUSES.has(norm(issue?.status)) ? 'work_order' : 'request');

async function publishedWorkflow(companyName, target) {
  if (!companyName) return null;
  return StudioConfig.findOne({ companyName, kind: 'workflow', target, published: { $ne: null } }).sort({ updatedAt: -1 }).lean();
}

// { ok: true } or { ok: false, error } — called before the status is saved.
async function checkTransition({ issue, newStatus, user }) {
  const companyName = String(issue?.companyName || user?.companyName || '').trim();
  const from = norm(issue?.status || 'OPEN');
  const to = norm(newStatus);
  if (!to || from === to) return { ok: true };
  const wf = await publishedWorkflow(companyName, targetOf(issue)).catch(() => null);
  const stages = wf?.published?.stages || [];
  if (stages.length < 2) return { ok: true };

  const role = String(user?.role || '').toLowerCase();
  const fromIdx = stages.findIndex((s) => norm(s.status) === from);
  const toIdx = stages.findIndex((s) => norm(s.status) === to);
  if (toIdx === -1) return { ok: true, workflow: wf };
  const target = stages[toIdx];

  if (fromIdx !== -1 && toIdx > fromIdx + 1) {
    return { ok: false, error: `The "${wf.name}" workflow doesn't allow skipping steps. This is at "${stages[fromIdx].name}"; the next step is "${stages[fromIdx + 1].name}", not "${target.name}".` };
  }
  if (fromIdx !== -1 && toIdx > fromIdx && stages[fromIdx].requiresApproval && !APPROVER_ROLES.has(role)) {
    return { ok: false, error: `"${stages[fromIdx].name}" needs approval from a manager before it can move on.` };
  }
  if (!OVERRIDE_ROLES.has(role) && Array.isArray(target.roles) && target.roles.length && !target.roles.includes(role)) {
    const who = target.roles.map((r) => ROLE_LABELS[r] || r).join(' or ');
    return { ok: false, error: `In the "${wf.name}" workflow, only ${who} can move work to "${target.name}".` };
  }
  return { ok: true, workflow: wf };
}

// After a successful change: notify the roles configured for the stage that was entered.
async function notifyStageEntered({ issue, newStatus }) {
  const companyName = String(issue?.companyName || '').trim();
  const wf = await publishedWorkflow(companyName, targetOf(issue)).catch(() => null);
  const stage = (wf?.published?.stages || []).find((s) => norm(s.status) === norm(newStatus));
  if (!stage || !stage.notifyRoles?.length) return;
  const ids = new Set();
  if (stage.notifyRoles.includes('requestor') && issue?.userId) ids.add(String(issue.userId));
  if (stage.notifyRoles.includes('technician')) {
    if (typeof issue?.assignedTo === 'string' && /^[a-f0-9]{24}$/i.test(issue.assignedTo)) ids.add(issue.assignedTo);
    (Array.isArray(issue?.assignees) ? issue.assignees : []).forEach((a) => {
      const id = typeof a === 'string' ? a : String(a?.id || a?._id || a?.userId || '');
      if (/^[a-f0-9]{24}$/i.test(id)) ids.add(id);
    });
  }
  const staffRoles = stage.notifyRoles.filter((r) => ['client', 'admin', 'manager'].includes(r));
  if (staffRoles.length) {
    const users = await userService.getAllUsers({ companyName }).catch(() => []);
    (users || []).filter((u) => staffRoles.includes(String(u?.role || '').toLowerCase()))
      .forEach((u) => ids.add(String(u.id || u._id)));
  }
  const ref = `#${String(issue?.id || issue?._id || '').slice(-6).toUpperCase()}`;
  await Promise.all([...ids].map((userId) => notificationService.createNotification({
    userId,
    title: `${wf.name}: ${stage.name}`,
    message: `${ref} "${issue?.title || 'Work order'}" is now at "${stage.name}".`,
    type: 'info',
    link: '/dashboard',
  })));
}

function afterChange(args) {
  if (process.env.STUDIO_AUTOMATIONS === 'off') return;
  setImmediate(() => notifyStageEntered(args).catch((err) => console.warn('[Studio] workflow notify failed:', err.message)));
}

module.exports = { checkTransition, afterChange, _internal: { norm, targetOf } };
