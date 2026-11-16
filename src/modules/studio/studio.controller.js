const { StudioConfig, StudioAutomationLog, StudioRecordValue } = require('./studio.model');
const { cleanDefinition, cleanTarget, publishProblems, cleanValues, CUSTOM_FIELD_TARGETS } = require('./studio.validation');

const KINDS = { forms: 'form', workflows: 'workflow', automations: 'automation', fields: 'field', reports: 'report' };
const MAX_ITEMS = 100;
const MAX_VERSIONS = 20;

const company = (req) => String(req.user?.companyName || '').trim();
const actor = (req) => String(req.user?.name || req.user?.email || req.user?.userId || '');
const kindOf = (req) => KINDS[req.params.kind];

const view = (doc) => {
  const o = doc.toObject ? doc.toObject() : doc;
  const changed = JSON.stringify(o.draft || {}) !== JSON.stringify(o.published || {});
  return {
    id: String(o._id),
    kind: o.kind,
    name: o.name,
    description: o.description,
    target: o.target,
    draft: o.draft,
    published: o.published,
    publishedVersion: o.publishedVersion,
    versions: (o.versions || []).map((v) => ({ version: v.version, publishedAt: v.publishedAt, publishedBy: v.publishedBy })),
    enabled: o.enabled,
    state: !o.published ? 'draft' : changed ? 'changed' : 'published',
    updatedAt: o.updatedAt,
    updatedBy: o.updatedBy,
  };
};

async function findOwn(req) {
  const doc = await StudioConfig.findOne({ _id: req.params.id, companyName: company(req), kind: kindOf(req) }).catch(() => null);
  return doc;
}

exports.guard = (req, res, next) => {
  if (!company(req)) return res.status(403).json({ error: 'Studio is available to company accounts only.' });
  if (!kindOf(req) && req.params.kind) return res.status(404).json({ error: 'Unknown Studio module.' });
  return next();
};

exports.list = async (req, res) => {
  const docs = await StudioConfig.find({ companyName: company(req), kind: kindOf(req) }).sort({ updatedAt: -1 }).limit(MAX_ITEMS);
  res.json(docs.map(view));
};

exports.create = async (req, res) => {
  const kind = kindOf(req);
  const count = await StudioConfig.countDocuments({ companyName: company(req), kind });
  if (count >= MAX_ITEMS) return res.status(400).json({ error: `You can have up to ${MAX_ITEMS} items here.` });
  const name = String(req.body?.name || '').trim().slice(0, 120);
  if (!name) return res.status(400).json({ error: 'Please give it a name.' });
  const doc = await StudioConfig.create({
    companyName: company(req),
    kind,
    name,
    description: String(req.body?.description || '').slice(0, 500),
    target: cleanTarget(kind, req.body?.target),
    draft: cleanDefinition(kind, req.body?.draft, cleanTarget(kind, req.body?.target)),
    updatedBy: actor(req),
  });
  res.status(201).json(view(doc));
};

exports.saveDraft = async (req, res) => {
  const doc = await findOwn(req);
  if (!doc) return res.status(404).json({ error: 'Not found.' });
  if (req.body?.name !== undefined) doc.name = String(req.body.name).trim().slice(0, 120) || doc.name;
  if (req.body?.description !== undefined) doc.description = String(req.body.description).slice(0, 500);
  if (req.body?.target !== undefined) doc.target = cleanTarget(doc.kind, req.body.target);
  if (req.body?.draft !== undefined) doc.draft = cleanDefinition(doc.kind, req.body.draft, doc.target);
  if (req.body?.enabled !== undefined) doc.enabled = Boolean(req.body.enabled);
  doc.updatedBy = actor(req);
  doc.markModified('draft');
  await doc.save();
  res.json(view(doc));
};

exports.publish = async (req, res) => {
  const doc = await findOwn(req);
  if (!doc) return res.status(404).json({ error: 'Not found.' });
  const definition = cleanDefinition(doc.kind, doc.draft, doc.target);
  const problems = publishProblems(doc.kind, definition);
  if (problems.length) return res.status(400).json({ error: problems.join(' '), problems });
  const version = (doc.versions.at(-1)?.version || 0) + 1;
  doc.versions.push({ version, definition, publishedBy: actor(req) });
  if (doc.versions.length > MAX_VERSIONS) doc.versions = doc.versions.slice(-MAX_VERSIONS);
  doc.published = definition;
  doc.draft = definition;
  doc.publishedVersion = version;
  doc.updatedBy = actor(req);
  doc.markModified('published');
  doc.markModified('draft');
  await doc.save();
  res.json(view(doc));
};

exports.rollback = async (req, res) => {
  const doc = await findOwn(req);
  if (!doc) return res.status(404).json({ error: 'Not found.' });
  const target = doc.versions.find((v) => v.version === Number(req.body?.version));
  if (!target) return res.status(404).json({ error: 'That version no longer exists.' });
  doc.published = target.definition;
  doc.draft = target.definition;
  doc.publishedVersion = target.version;
  doc.updatedBy = actor(req);
  doc.markModified('published');
  doc.markModified('draft');
  await doc.save();
  res.json(view(doc));
};

exports.unpublish = async (req, res) => {
  const doc = await findOwn(req);
  if (!doc) return res.status(404).json({ error: 'Not found.' });
  doc.published = null;
  doc.publishedVersion = 0;
  doc.updatedBy = actor(req);
  doc.markModified('published');
  await doc.save();
  res.json(view(doc));
};

exports.remove = async (req, res) => {
  const doc = await findOwn(req);
  if (!doc) return res.status(404).json({ error: 'Not found.' });
  await doc.deleteOne();
  res.json({ success: true });
};

// Published forms/workflows for the rest of the app (read-only, any signed-in company user).
exports.published = async (req, res) => {
  const docs = await StudioConfig.find({ companyName: company(req), kind: kindOf(req), published: { $ne: null } })
    .select('name target published publishedVersion').lean();
  res.json(docs.map((d) => ({ id: String(d._id), name: d.name, target: d.target, version: d.publishedVersion, definition: d.published })));
};

exports.activity = async (req, res) => {
  const logs = await StudioAutomationLog.find({ companyName: company(req) }).sort({ createdAt: -1 }).limit(50).lean();
  res.json(logs.map((l) => ({
    id: String(l._id), automationName: l.automationName, trigger: l.trigger, summary: l.summary, ok: l.ok, recipients: l.recipients, at: l.createdAt,
  })));
};

// ---------- what the rest of the app uses ----------
const VALUE_TARGETS = new Set(CUSTOM_FIELD_TARGETS);

// All published fields for a record type: the published form for it, then its custom fields.
async function publishedFields(companyName, target) {
  const docs = await StudioConfig.find({ companyName, kind: { $in: ['form', 'field'] }, target, published: { $ne: null } })
    .sort({ updatedAt: -1 }).lean();
  const form = docs.find((d) => d.kind === 'form');
  const sets = docs.filter((d) => d.kind === 'field');
  const seen = new Set();
  const fields = [];
  [[form, 'form'], ...sets.map((d) => [d, 'field'])].forEach(([d, source]) => {
    (d?.published?.fields || []).forEach((f) => {
      if (seen.has(f.key)) {
        // Same field defined twice (form + custom fields): it is required if either says so.
        const existing = fields.find((x) => x.key === f.key);
        if (f.required) existing.required = true;
        return;
      }
      seen.add(f.key);
      fields.push({ ...f, source });
    });
  });
  return { fields, form: form ? { id: String(form._id), name: form.name, version: form.publishedVersion } : null };
}
exports.publishedFields = publishedFields;

// GET /api/studio/runtime/:target -> fields, report layout and workflow the app should use for this record type
exports.runtime = async (req, res) => {
  const target = String(req.params.target || '');
  if (!VALUE_TARGETS.has(target)) return res.status(404).json({ error: 'Unknown record type.' });
  const companyName = company(req);
  const { fields, form } = await publishedFields(companyName, target);
  const [report, workflow] = await Promise.all([
    StudioConfig.findOne({ companyName, kind: 'report', target, published: { $ne: null } }).sort({ updatedAt: -1 }).lean(),
    StudioConfig.findOne({ companyName, kind: 'workflow', target, published: { $ne: null } }).sort({ updatedAt: -1 }).lean(),
  ]);
  res.json({
    target,
    fields,
    form,
    report: report ? { id: String(report._id), name: report.name, version: report.publishedVersion, definition: report.published } : null,
    workflow: workflow ? { id: String(workflow._id), name: workflow.name, version: workflow.publishedVersion, definition: workflow.published } : null,
  });
};

exports.getValues = async (req, res) => {
  const { target, recordId } = req.params;
  if (!VALUE_TARGETS.has(target)) return res.status(404).json({ error: 'Unknown record type.' });
  const doc = await StudioRecordValue.findOne({ companyName: company(req), target, recordId: String(recordId).slice(0, 64) }).lean();
  res.json({ values: doc?.values || {}, updatedAt: doc?.updatedAt || null, updatedBy: doc?.updatedBy || '' });
};

exports.putValues = async (req, res) => {
  const { target, recordId } = req.params;
  if (!VALUE_TARGETS.has(target)) return res.status(404).json({ error: 'Unknown record type.' });
  if (!/^[\w-]{6,64}$/.test(String(recordId || ''))) return res.status(400).json({ error: 'Invalid record.' });
  const { fields } = await publishedFields(company(req), target);
  const cleaned = cleanValues(fields, req.body?.values || {});
  const missing = req.body?.enforceRequired
    ? fields.filter((f) => f.required && (cleaned[f.key] === undefined || cleaned[f.key] === '' || cleaned[f.key] === false)).map((f) => f.label)
    : [];
  if (missing.length) return res.status(400).json({ error: `Please fill in: ${missing.join(', ')}.`, missing });
  const existing = await StudioRecordValue.findOne({ companyName: company(req), target, recordId });
  if (existing) {
    existing.values = { ...(existing.values || {}), ...cleaned };
    existing.updatedBy = actor(req);
    existing.markModified('values');
    await existing.save();
    return res.json({ values: existing.values, updatedAt: existing.updatedAt, updatedBy: existing.updatedBy });
  }
  const created = await StudioRecordValue.create({ companyName: company(req), target, recordId, values: cleaned, updatedBy: actor(req) });
  res.json({ values: created.values, updatedAt: created.updatedAt, updatedBy: created.updatedBy });
};
