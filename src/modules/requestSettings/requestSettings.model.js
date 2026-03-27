const mongoose = require('mongoose');

const fieldSettingSchema = new mongoose.Schema({
  create: { type: String, enum: ['Required', 'Optional', 'Hidden'], default: 'Optional' },
  approval: { type: String, enum: ['Required', 'Optional', 'Hidden'], default: 'Optional' },
}, { _id: false });

const generalSettingsSchema = new mongoose.Schema({
  language: { type: String, default: 'English' },
  dateFormat: { type: String, default: 'MM/DD/YY' },
  currency: { type: String, default: 'RWF - Rwandan Franc' },
  timeZone: { type: String, default: 'Africa/Kigali +02:00 CAT' },
}, { _id: false });

const workflowConditionSchema = new mongoose.Schema({
  type: { type: String, default: '' },
  value: { type: mongoose.Schema.Types.Mixed, default: '' },
}, { _id: false });

const workflowSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  ifCondition: { type: String, required: true, trim: true },
  andConditions: { type: [workflowConditionSchema], default: [] },
  thenAction: { type: String, required: true, trim: true },
  thenValue: { type: mongoose.Schema.Types.Mixed, default: '' },
}, { timestamps: true });

const rolePermissionSectionSchema = new mongoose.Schema({
  section: { type: String, required: true, trim: true },
  permissions: { type: [String], default: [] },
}, { _id: false });

const customRoleSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 50 },
  description: { type: String, required: true, trim: true, maxlength: 150 },
  externalId: { type: String, required: true, trim: true, maxlength: 50 },
  type: { type: String, enum: ['Paid', 'Free'], default: 'Paid' },
  permissions: { type: [rolePermissionSectionSchema], default: [] },
}, { timestamps: true });

const assetFieldSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 80 },
  type: {
    type: String,
    enum: ['Single Line Text', 'Multi-Line Text', 'Dropdown', 'Date', 'Number', 'Currency'],
    required: true,
  },
  source: { type: String, enum: ['Default', 'Custom'], default: 'Custom' },
  options: { type: [String], default: [] },
}, { _id: false });

const assetOperatingBlockSchema = new mongoose.Schema({
  day: {
    type: String,
    enum: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
    required: true,
  },
  from: { type: String, required: true, trim: true },
  to: { type: String, required: true, trim: true },
}, { _id: false });

const assetOperatingScheduleSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 120 },
  blocks: { type: [assetOperatingBlockSchema], default: [] },
}, { timestamps: true });

const assetStatusSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 80 },
}, { timestamps: true });

const partGroupSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 80 },
  description: { type: String, trim: true, maxlength: 200, default: '' },
}, { timestamps: true });

const workOrderStatusSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 80 },
  type: { type: String, required: true, trim: true, maxlength: 80 },
  createdBy: { type: String, default: '-' },
}, { timestamps: true });

const workOrderCategorySchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 80 },
  isDefault: { type: Boolean, default: false },
}, { timestamps: true });

const workOrderTimerSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 80 },
}, { timestamps: true });

const purchaseOrderCategorySchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 80 },
}, { timestamps: true });

const meterCategorySchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 80 },
}, { timestamps: true });

const tagSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 80 },
  model: { type: String, trim: true, default: '' },
}, { timestamps: true });

const requestSettingsSchema = new mongoose.Schema({
  companyName: { type: String, required: true, unique: true, trim: true },
  general: {
    type: generalSettingsSchema,
    default: () => ({}),
  },
  internalRequests: {
    title: { type: fieldSettingSchema, default: () => ({ create: 'Required', approval: 'Required' }) },
    description: { type: fieldSettingSchema, default: () => ({ create: 'Optional', approval: 'Optional' }) },
    priority: { type: fieldSettingSchema, default: () => ({ create: 'Optional', approval: 'Optional' }) },
    images: { type: fieldSettingSchema, default: () => ({ create: 'Optional', approval: 'Optional' }) },
    primaryWorker: { type: fieldSettingSchema, default: () => ({ create: 'Hidden', approval: 'Optional' }) },
    assignedTeam: { type: fieldSettingSchema, default: () => ({ create: 'Hidden', approval: 'Optional' }) },
    files: { type: fieldSettingSchema, default: () => ({ create: 'Optional', approval: 'Optional' }) },
    additionalWorkers: { type: fieldSettingSchema, default: () => ({ create: 'Hidden', approval: 'Optional' }) },
    startDate: { type: fieldSettingSchema, default: () => ({ create: 'Hidden', approval: 'Optional' }) },
    estimatedDuration: { type: fieldSettingSchema, default: () => ({ create: 'Hidden', approval: 'Optional' }) },
    checklists: { type: fieldSettingSchema, default: () => ({ create: 'Hidden', approval: 'Optional' }) },
    signature: { type: fieldSettingSchema, default: () => ({ create: 'Hidden', approval: 'Optional' }) },
  },
  legacyPublicRequests: {
    companyRequestPortalEnabled: { type: Boolean, default: false },
  },
  branding: {
    logoUrl: { type: String, default: '' },
    primaryColor: { type: String, default: '#d3ac2a' },
    heroBackground: { type: String, default: '#2c8214' },
    header: { type: String, default: '#2c8214' },
    footer: { type: String, default: '#2c8214' },
    pageBackground: { type: String, default: '#c4cc9c' },
  },
  automation: {
    workflows: { type: [workflowSchema], default: [] },
  },
  userRoles: {
    customRoles: { type: [customRoleSchema], default: [] },
  },
  assets: {
    fields: { type: [assetFieldSchema], default: [] },
    operatingHours: { type: [assetOperatingScheduleSchema], default: [] },
    statuses: { type: [assetStatusSchema], default: [] },
    checkInOut: {
      cascadingHierarchyEnabled: { type: Boolean, default: false },
    },
  },
  partsInventory: {
    general: {
      enableMultipleInventoryLines: { type: Boolean, default: true },
      allocatedPartQuantitiesSyncedAt: { type: Date, default: null },
    },
    groupParts: { type: [partGroupSchema], default: [] },
    customFields: { type: [assetFieldSchema], default: [] },
  },
  workOrders: {
    general: {
      includeLaborCostsInTotalCost: { type: Boolean, default: true },
      notifyRequestersOfUpdates: { type: Boolean, default: true },
      automaticallyUpdateTimerByStatusChanges: { type: Boolean, default: false },
      startingWorkOrderNumber: { type: Number, default: 3 },
      autoAssignWorkOrders: { type: Boolean, default: false },
      autoAssignRequests: { type: Boolean, default: false },
      askForFeedback: { type: Boolean, default: true },
      continueToNotifyAfterCompletion: { type: Boolean, default: false },
    },
    configuration: {
      createFields: { type: Map, of: { type: String, enum: ['Required', 'Optional', 'Hidden'], default: 'Optional' }, default: {} },
      completeFields: { type: Map, of: { type: String, enum: ['Required', 'Optional', 'Hidden'], default: 'Optional' }, default: {} },
    },
    statuses: { type: [workOrderStatusSchema], default: [] },
    categories: { type: [workOrderCategorySchema], default: [] },
    timers: { type: [workOrderTimerSchema], default: [] },
    customFields: { type: [assetFieldSchema], default: [] },
  },
  purchaseOrders: {
    general: {
      startCount: { type: Number, default: 1 },
      prefix: { type: String, trim: true, default: '' },
    },
    categories: { type: [purchaseOrderCategorySchema], default: [] },
    publicRequestPortal: {
      enabled: { type: Boolean, default: false },
    },
  },
  meters: {
    categories: { type: [meterCategorySchema], default: [] },
  },
  tags: {
    items: { type: [tagSchema], default: [] },
  },
}, { timestamps: true });

module.exports = mongoose.models.RequestSettings || mongoose.model('RequestSettings', requestSettingsSchema);
