// Cleans and checks Studio definitions before they are saved or published. Only known field types,
// triggers and actions are kept, so a published configuration can never contain arbitrary code.

const FORM_TARGETS = ['request', 'work_order', 'asset', 'property', 'inspection'];
const FIELD_TYPES = ['text', 'textarea', 'number', 'date', 'select', 'checkbox', 'email', 'phone', 'photo'];
const CUSTOM_FIELD_TARGETS = ['request', 'work_order', 'asset', 'property'];
const REPORT_TARGETS = ['work_order', 'request', 'asset'];
// Sections a report may contain, per record type, in their default order.
const REPORT_SECTIONS = {
  work_order: ['summary', 'location', 'people', 'description', 'checklist', 'costs', 'custom_fields', 'signatures'],
  request: ['summary', 'location', 'people', 'description', 'custom_fields', 'signatures'],
  asset: ['summary', 'location', 'description', 'custom_fields', 'work_history', 'signatures'],
};
const WORKFLOW_TARGETS = ['request', 'work_order'];
const ROLES = ['client', 'admin', 'manager', 'technician', 'requestor'];
const TRIGGERS = ['issue.created', 'issue.assigned', 'issue.status_changed', 'issue.overdue', 'request.pending'];
const RECIPIENTS = ['assignee', 'admins', 'requester'];
const CHANNELS = ['in_app', 'email', 'both'];
const PRIORITIES = ['', 'High', 'Medium', 'Low'];
const STATUSES = ['', 'OPEN', 'PENDING', 'APPROVED', 'IN PROGRESS', 'ON HOLD', 'COMPLETED', 'CLOSED'];

const str = (v, max = 200) => String(v ?? '').trim().slice(0, max);
const slug = (v) => str(v, 60).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
const pick = (v, allowed, fallback) => (allowed.includes(v) ? v : fallback);

function cleanForm(def = {}, allowedTypes = FIELD_TYPES) {
  const seen = new Set();
  const fields = (Array.isArray(def.fields) ? def.fields : []).slice(0, 60).map((f, i) => {
    let key = slug(f?.key || f?.label) || `field_${i + 1}`;
    while (seen.has(key)) key = `${key}_${i + 1}`;
    seen.add(key);
    const type = pick(f?.type, allowedTypes, 'text');
    return {
      key,
      label: str(f?.label, 80) || `Field ${i + 1}`,
      type,
      required: Boolean(f?.required),
      placeholder: str(f?.placeholder, 120),
      help: str(f?.help, 200),
      options: type === 'select' ? (Array.isArray(f?.options) ? f.options : []).map((o) => str(o, 60)).filter(Boolean).slice(0, 30) : [],
    };
  });
  return { fields };
}

function cleanWorkflow(def = {}) {
  const stages = (Array.isArray(def.stages) ? def.stages : []).slice(0, 15).map((s, i) => ({
    key: slug(s?.key || s?.name) || `stage_${i + 1}`,
    name: str(s?.name, 60) || `Stage ${i + 1}`,
    status: pick(String(s?.status || '').toUpperCase(), STATUSES.filter(Boolean), 'OPEN'),
    roles: (Array.isArray(s?.roles) ? s.roles : []).filter((r) => ROLES.includes(r)),
    requiresApproval: Boolean(s?.requiresApproval),
    notifyRoles: (Array.isArray(s?.notifyRoles) ? s.notifyRoles : []).filter((r) => ROLES.includes(r)),
  }));
  return { stages };
}

function cleanAutomation(def = {}) {
  const trigger = pick(def.trigger, TRIGGERS, 'issue.created');
  const c = def.conditions || {};
  const conditions = {
    priority: pick(c.priority || '', PRIORITIES, ''),
    status: trigger === 'issue.status_changed' ? pick(String(c.status || '').toUpperCase(), STATUSES, '') : '',
    category: str(c.category, 60),
    pendingHours: trigger === 'request.pending' ? Math.min(Math.max(Number(c.pendingHours) || 24, 1), 720) : undefined,
  };
  if (conditions.pendingHours === undefined) delete conditions.pendingHours;
  const actions = (Array.isArray(def.actions) ? def.actions : []).slice(0, 5).map((a) => ({
    type: 'notify',
    to: pick(a?.to, RECIPIENTS, 'admins'),
    channel: pick(a?.channel, CHANNELS, 'in_app'),
    message: str(a?.message, 400),
  }));
  return { trigger, conditions, actions };
}

function cleanReport(def = {}, target = 'work_order') {
  const allowed = REPORT_SECTIONS[target] || REPORT_SECTIONS.work_order;
  const given = (Array.isArray(def.sections) ? def.sections : []).filter((x) => allowed.includes(x?.key));
  const seen = new Set(given.map((x) => x.key));
  const sections = [...given.map((x) => ({ key: x.key, enabled: x.enabled !== false })),
    ...allowed.filter((k) => !seen.has(k)).map((k) => ({ key: k, enabled: false }))];
  const accent = /^#[0-9a-f]{6}$/i.test(String(def.accent || '')) ? def.accent : '#1b2559';
  return {
    title: str(def.title, 80) || 'Maintenance report',
    accent,
    showCompany: def.showCompany !== false,
    sections,
    signatures: (Array.isArray(def.signatures) ? def.signatures : []).map((x) => str(x, 40)).filter(Boolean).slice(0, 4),
    footer: str(def.footer, 200),
  };
}

const CLEANERS = {
  form: (d) => cleanForm(d),
  field: (d) => cleanForm(d, FIELD_TYPES.filter((t) => t !== 'photo')),
  workflow: cleanWorkflow,
  automation: cleanAutomation,
  report: cleanReport,
};

function cleanDefinition(kind, def, target) {
  return CLEANERS[kind] ? CLEANERS[kind](def || {}, target) : {};
}

function cleanTarget(kind, target) {
  if (kind === 'form') return pick(target, FORM_TARGETS, 'request');
  if (kind === 'workflow') return pick(target, WORKFLOW_TARGETS, 'work_order');
  if (kind === 'field') return pick(target, CUSTOM_FIELD_TARGETS, 'work_order');
  if (kind === 'report') return pick(target, REPORT_TARGETS, 'work_order');
  return '';
}

// Problems that block publishing (drafts may be incomplete).
function publishProblems(kind, def) {
  const problems = [];
  if (kind === 'form' || kind === 'field') {
    if (!def.fields.length) problems.push('Add at least one field.');
    def.fields.filter((f) => f.type === 'select' && f.options.length < 2).forEach((f) => problems.push(`"${f.label}" needs at least two options.`));
  }
  if (kind === 'workflow') {
    if (def.stages.length < 2) problems.push('A workflow needs at least two stages.');
  }
  if (kind === 'report') {
    if (!def.sections.some((x) => x.enabled)) problems.push('Turn on at least one section.');
  }
  if (kind === 'automation') {
    if (!def.actions.length) problems.push('Add at least one action.');
    def.actions.filter((a) => !a.message).forEach(() => problems.push('Every notification needs a message.'));
  }
  return problems;
}

// Check one record's answers against the published fields: keep known keys, coerce types, limit sizes.
function cleanValues(fields, input = {}) {
  const out = {};
  fields.forEach((f) => {
    if (!(f.key in input)) return;
    const v = input[f.key];
    if (f.type === 'checkbox') out[f.key] = Boolean(v);
    else if (f.type === 'number') { const n = Number(v); if (v !== '' && v !== null && Number.isFinite(n)) out[f.key] = n; }
    else if (f.type === 'select') { if (f.options.includes(String(v))) out[f.key] = String(v); }
    else if (f.type === 'photo') { if (v && typeof v === 'object' && /^\/uploads\//.test(String(v.url || ''))) out[f.key] = { url: String(v.url).slice(0, 300), name: str(v.name, 120) }; }
    else if (f.type === 'date') { if (/^\d{4}-\d{2}-\d{2}$/.test(String(v))) out[f.key] = String(v); }
    else out[f.key] = str(v, f.type === 'textarea' ? 4000 : 300);
  });
  return out;
}

module.exports = { cleanDefinition, cleanTarget, publishProblems, cleanValues, TRIGGERS, FORM_TARGETS, CUSTOM_FIELD_TARGETS, REPORT_SECTIONS };
