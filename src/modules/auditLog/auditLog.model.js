const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema({
  actorId: { type: String, default: null, index: true },
  actorName: { type: String, default: null },
  actorEmail: { type: String, default: null },
  actorRole: { type: String, default: null, index: true },
  companyName: { type: String, default: null, index: true },
  action: { type: String, required: true, index: true },
  entityType: { type: String, default: 'system', index: true },
  entityId: { type: String, default: null, index: true },
  method: { type: String, default: null },
  path: { type: String, default: null, index: true },
  statusCode: { type: Number, default: null },
  success: { type: Boolean, default: true, index: true },
  severity: { type: String, default: 'info', index: true },
  ipAddress: { type: String, default: null },
  userAgent: { type: String, default: null },
  metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
}, { timestamps: true });

module.exports = mongoose.models.AuditLog || mongoose.model('AuditLog', auditLogSchema);
