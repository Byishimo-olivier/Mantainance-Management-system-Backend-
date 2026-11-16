// FixNest Studio: company-level configuration (forms, workflows, automations), kept separate from
// the core data. Every item has a working draft and published versions, so admins can preview,
// publish and roll back without touching the live system by accident.
const mongoose = require('mongoose');

const versionSchema = new mongoose.Schema({
  version: { type: Number, required: true },
  definition: { type: mongoose.Schema.Types.Mixed, required: true },
  publishedAt: { type: Date, default: Date.now },
  publishedBy: { type: String, default: '' },
}, { _id: false });

const studioConfigSchema = new mongoose.Schema({
  companyName: { type: String, required: true, trim: true, index: true },
  kind: { type: String, required: true, enum: ['form', 'workflow', 'automation', 'field', 'report'] },
  name: { type: String, required: true, trim: true, maxlength: 120 },
  description: { type: String, trim: true, maxlength: 500, default: '' },
  target: { type: String, trim: true, maxlength: 40, default: '' }, // request | work_order | asset | property | inspection
  draft: { type: mongoose.Schema.Types.Mixed, default: {} },
  published: { type: mongoose.Schema.Types.Mixed, default: null },
  publishedVersion: { type: Number, default: 0 },
  versions: { type: [versionSchema], default: [] },
  enabled: { type: Boolean, default: true }, // automations can be paused without unpublishing
  updatedBy: { type: String, default: '' },
}, { timestamps: true, minimize: false });

studioConfigSchema.index({ companyName: 1, kind: 1, updatedAt: -1 });

const automationLogSchema = new mongoose.Schema({
  companyName: { type: String, required: true, index: true },
  automationId: { type: String, required: true },
  automationName: { type: String, default: '' },
  trigger: { type: String, required: true },
  issueId: { type: String, default: '' },
  issueTitle: { type: String, default: '' },
  dedupeKey: { type: String, default: '' }, // set for reminders so each one is sent once
  recipients: { type: Number, default: 0 },
  summary: { type: String, default: '' },
  ok: { type: Boolean, default: true },
}, { timestamps: true });

automationLogSchema.index({ dedupeKey: 1 }, { unique: true, partialFilterExpression: { dedupeKey: { $type: 'string', $gt: '' } } });
automationLogSchema.index({ companyName: 1, createdAt: -1 });

// Answers to Studio form fields and custom fields, kept beside (not inside) the core records.
const recordValueSchema = new mongoose.Schema({
  companyName: { type: String, required: true },
  target: { type: String, required: true }, // request | work_order | asset | property
  recordId: { type: String, required: true },
  values: { type: mongoose.Schema.Types.Mixed, default: {} },
  updatedBy: { type: String, default: '' },
}, { timestamps: true, minimize: false });
recordValueSchema.index({ companyName: 1, target: 1, recordId: 1 }, { unique: true });

module.exports = {
  StudioRecordValue: mongoose.model('StudioRecordValue', recordValueSchema),
  StudioConfig: mongoose.model('StudioConfig', studioConfigSchema),
  StudioAutomationLog: mongoose.model('StudioAutomationLog', automationLogSchema),
};
