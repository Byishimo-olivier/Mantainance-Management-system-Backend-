const RequestSettings = require('./requestSettings.model');
const RequestPortal = require('./requestPortal.model');
const User = require('../user/user.model');

const defaultInternalRequests = {
  title: { create: 'Required', approval: 'Required' },
  description: { create: 'Optional', approval: 'Optional' },
  priority: { create: 'Optional', approval: 'Optional' },
  images: { create: 'Optional', approval: 'Optional' },
  primaryWorker: { create: 'Hidden', approval: 'Optional' },
  assignedTeam: { create: 'Hidden', approval: 'Optional' },
  files: { create: 'Optional', approval: 'Optional' },
  additionalWorkers: { create: 'Hidden', approval: 'Optional' },
  startDate: { create: 'Hidden', approval: 'Optional' },
  estimatedDuration: { create: 'Hidden', approval: 'Optional' },
  checklists: { create: 'Hidden', approval: 'Optional' },
  signature: { create: 'Hidden', approval: 'Optional' },
};

const defaultGeneralSettings = {
  language: 'English',
  dateFormat: 'MM/DD/YY',
  currency: 'RWF - Rwandan Franc',
  timeZone: 'Africa/Kigali +02:00 CAT',
};

const defaultApiSettings = {
  version: '2022-09-14',
};

const defaultAuthenticationSettings = {
  saml: {
    provider: '',
    configured: false,
  },
};

const defaultWebhookSettings = {
  items: [],
};

const defaultBranding = {
  logoUrl: '',
  primaryColor: '#d3ac2a',
  heroBackground: '#2c8214',
  header: '#2c8214',
  footer: '#2c8214',
  pageBackground: '#c4cc9c',
};

const defaultAssetFields = [
  { name: 'Additional Information', type: 'Multi-Line Text', source: 'Default', options: [] },
  { name: 'Additional Worker', type: 'Dropdown', source: 'Default', options: [] },
  { name: 'Area', type: 'Single Line Text', source: 'Default', options: [] },
  { name: 'Category', type: 'Single Line Text', source: 'Default', options: [] },
  { name: 'Customers', type: 'Dropdown', source: 'Default', options: [] },
  { name: 'Description', type: 'Multi-Line Text', source: 'Default', options: [] },
  { name: 'Model', type: 'Single Line Text', source: 'Default', options: [] },
  { name: 'Manufacturer', type: 'Single Line Text', source: 'Default', options: [] },
  { name: 'Serial Number', type: 'Single Line Text', source: 'Default', options: [] },
  { name: 'Barcode', type: 'Single Line Text', source: 'Default', options: [] },
  { name: 'Location Code', type: 'Single Line Text', source: 'Default', options: [] },
  { name: 'Purchase Date', type: 'Date', source: 'Default', options: [] },
  { name: 'Warranty Expiration', type: 'Date', source: 'Default', options: [] },
  { name: 'Purchase Price', type: 'Currency', source: 'Default', options: [] },
  { name: 'Replacement Cost', type: 'Currency', source: 'Default', options: [] },
  { name: 'Useful Life', type: 'Number', source: 'Default', options: [] },
  { name: 'Condition Score', type: 'Number', source: 'Default', options: [] },
  { name: 'Notes', type: 'Multi-Line Text', source: 'Default', options: [] },
];

const defaultAssetSettings = {
  fields: defaultAssetFields,
  operatingHours: [],
  statuses: [],
  checkInOut: {
    cascadingHierarchyEnabled: false,
  },
};

const defaultPartsInventorySettings = {
  general: {
    enableMultipleInventoryLines: true,
    allocatedPartQuantitiesSyncedAt: null,
  },
  groupParts: [],
  customFields: [
    { name: 'Part Number', type: 'Single Line Text', source: 'Default', options: [] },
    { name: 'Description', type: 'Multi-Line Text', source: 'Default', options: [] },
    { name: 'Quantity On Hand', type: 'Number', source: 'Default', options: [] },
    { name: 'Unit Cost', type: 'Currency', source: 'Default', options: [] },
    { name: 'Category', type: 'Dropdown', source: 'Default', options: [] },
    { name: 'Supplier', type: 'Single Line Text', source: 'Default', options: [] },
  ],
};

const defaultWorkOrderSettings = {
  general: {
    includeLaborCostsInTotalCost: true,
    notifyRequestersOfUpdates: true,
    automaticallyUpdateTimerByStatusChanges: false,
    startingWorkOrderNumber: 3,
    autoAssignWorkOrders: false,
    autoAssignRequests: false,
    askForFeedback: true,
    continueToNotifyAfterCompletion: false,
  },
  configuration: {
    createFields: {
      description: 'Optional',
      priority: 'Optional',
      images: 'Optional',
      primaryWorker: 'Optional',
      additionalWorkers: 'Optional',
      assignedTeam: 'Optional',
      assignedAsset: 'Optional',
      assignedLocation: 'Optional',
      dueDate: 'Optional',
      category: 'Optional',
      purchaseOrders: 'Optional',
      files: 'Optional',
      signature: 'Optional',
    },
    completeFields: {
      files: 'Optional',
      time: 'Optional',
      parts: 'Optional',
      cost: 'Optional',
    },
  },
  statuses: [
    { id: 'default-open', name: 'Open', type: 'Open', createdBy: '-', lastUpdated: null, isDefault: true },
    { id: 'default-in-progress', name: 'In Progress', type: 'In Progress', createdBy: '-', lastUpdated: null, isDefault: true },
    { id: 'default-on-hold', name: 'On Hold', type: 'On Hold', createdBy: '-', lastUpdated: null, isDefault: true },
    { id: 'default-complete', name: 'Complete', type: 'Complete', createdBy: '-', lastUpdated: null, isDefault: true },
  ],
  categories: [
    { id: 'default-none', name: 'None', isDefault: true },
    { id: 'default-damage', name: 'Damage', isDefault: true },
    { id: 'default-electrical', name: 'Electrical', isDefault: true },
    { id: 'default-meter-reading', name: 'Meter Reading', isDefault: true },
    { id: 'default-inspection', name: 'Inspection', isDefault: true },
    { id: 'default-preventative', name: 'Preventative', isDefault: true },
    { id: 'default-project', name: 'Project', isDefault: true },
    { id: 'default-safety', name: 'Safety', isDefault: true },
  ],
  timers: [
    { id: 'default-other-time', name: 'Other Time', createdAt: '2018-12-20T00:00:00.000Z', isDefault: true },
    { id: 'default-drive-time', name: 'Drive Time', createdAt: '2018-12-20T00:00:00.000Z', isDefault: true },
    { id: 'default-vendor-time', name: 'Vendor Time', createdAt: '2018-12-20T00:00:00.000Z', isDefault: true },
    { id: 'default-wrench-time', name: 'Wrench Time', createdAt: '2018-12-20T00:00:00.000Z', isDefault: true },
    { id: 'default-inspection-time', name: 'Inspection Time', createdAt: '2018-12-20T00:00:00.000Z', isDefault: true },
  ],
  customFields: [],
};

const defaultPurchaseOrderSettings = {
  general: {
    startCount: 1,
    prefix: '',
  },
  categories: [],
  publicRequestPortal: {
    enabled: false,
  },
};

const defaultMeterSettings = {
  categories: [],
};

const defaultTagSettings = {
  items: [],
};

const allowedAuthenticationProviders = ['', 'okta', 'google', 'custom_saml_2_0'];

const ensureWorkOrderCategoryDefaults = async (settings) => {
  settings.workOrders = settings.workOrders || { ...defaultWorkOrderSettings };
  settings.workOrders.categories = Array.isArray(settings.workOrders.categories) ? settings.workOrders.categories : [];

  let changed = false;
  for (const defaultCategory of defaultWorkOrderSettings.categories) {
    const exists = settings.workOrders.categories.some(
      (category) => String(category?.name || '').toLowerCase() === String(defaultCategory.name || '').toLowerCase()
    );
    if (!exists) {
      settings.workOrders.categories.push({
        name: defaultCategory.name,
        isDefault: true,
      });
      changed = true;
    }
  }

  if (changed) {
    await settings.save();
  }

  return settings;
};

const defaultRoleRows = [
  { name: 'Administrator (default)', externalId: 'admin', type: 'Paid', match: (user) => ['admin', 'manager'].includes(String(user?.role || '').toLowerCase()) && String(user?.accessLevel || 'full').toLowerCase() !== 'limited' },
  { name: 'Limited Administrator (default)', externalId: 'limited_admin', type: 'Paid', match: (user) => String(user?.role || '').toLowerCase() === 'manager' && String(user?.accessLevel || '').toLowerCase() === 'limited' },
  { name: 'Technician (default)', externalId: 'tech', type: 'Paid', match: (user) => String(user?.role || '').toLowerCase() === 'technician' && String(user?.accessLevel || 'full').toLowerCase() !== 'limited' },
  { name: 'Limited Technician (default)', externalId: 'limited_tech', type: 'Paid', match: (user) => String(user?.role || '').toLowerCase() === 'technician' && String(user?.accessLevel || '').toLowerCase() === 'limited' },
  { name: 'View Only (default)', externalId: 'view_only', type: 'Free', match: (user) => String(user?.role || '').toLowerCase() === 'client' },
  { name: 'Requester (default)', externalId: 'requester', type: 'Free', match: (user) => String(user?.role || '').toLowerCase() === 'requestor' },
];

const normalizeWorkflowValue = (value) => {
  if (value === null || value === undefined) return {};
  if (typeof value === 'string') return value.trim();
  if (typeof value !== 'object' || Array.isArray(value)) return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [key, typeof entry === 'string' ? entry.trim() : entry])
  );
};

const hasWorkflowValue = (value) => {
  if (value === null || value === undefined || value === '') return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (typeof value !== 'object') return true;
  return Object.values(value).some((entry) => String(entry || '').trim().length > 0);
};

const sanitizeSettings = (doc) => ({
  general: {
    ...defaultGeneralSettings,
    ...(doc?.general || {}),
  },
  api: {
    ...defaultApiSettings,
    ...(doc?.api || {}),
  },
  authentication: {
    ...defaultAuthenticationSettings,
    saml: {
      ...defaultAuthenticationSettings.saml,
      ...(doc?.authentication?.saml || {}),
    },
  },
  internalRequests: doc?.internalRequests || defaultInternalRequests,
  legacyPublicRequests: {
    companyRequestPortalEnabled: !!doc?.legacyPublicRequests?.companyRequestPortalEnabled,
  },
  branding: {
    ...defaultBranding,
    ...(doc?.branding || {}),
  },
  webhooks: {
    items: Array.isArray(doc?.webhooks?.items)
      ? doc.webhooks.items.map((webhook) => ({
          id: String(webhook?._id || ''),
          title: webhook?.title || '',
          endpoint: webhook?.endpoint || '',
          allEvents: webhook?.allEvents !== false,
          events: Array.isArray(webhook?.events) ? webhook.events.filter(Boolean) : [],
          active: webhook?.active !== false,
          createdAt: webhook?.createdAt || null,
          updatedAt: webhook?.updatedAt || null,
        }))
      : [],
  },
  automation: {
    workflows: Array.isArray(doc?.automation?.workflows)
      ? doc.automation.workflows.map((workflow) => ({
          id: String(workflow?._id || ''),
          title: workflow?.title || '',
          ifCondition: workflow?.ifCondition || '',
          andConditions: Array.isArray(workflow?.andConditions) ? workflow.andConditions : [],
          thenAction: workflow?.thenAction || '',
          thenValue: workflow?.thenValue ?? '',
        }))
      : [],
  },
  userRoles: {
    customRoles: Array.isArray(doc?.userRoles?.customRoles)
      ? doc.userRoles.customRoles.map((role) => ({
          id: String(role?._id || ''),
          name: role?.name || '',
          description: role?.description || '',
          externalId: role?.externalId || '',
          type: role?.type || 'Paid',
          permissions: Array.isArray(role?.permissions) ? role.permissions : [],
        }))
      : [],
  },
  assets: {
    fields: Array.isArray(doc?.assets?.fields) && doc.assets.fields.length > 0
      ? doc.assets.fields.map((field) => ({
          name: field?.name || '',
          type: field?.type || 'Single Line Text',
          source: field?.source || 'Custom',
          options: Array.isArray(field?.options) ? field.options : [],
        }))
      : defaultAssetFields,
    operatingHours: Array.isArray(doc?.assets?.operatingHours)
      ? doc.assets.operatingHours.map((schedule) => ({
          id: String(schedule?._id || ''),
          name: schedule?.name || '',
          blocks: Array.isArray(schedule?.blocks) ? schedule.blocks.map((block) => ({
            day: block?.day || '',
            from: block?.from || '',
            to: block?.to || '',
          })) : [],
        }))
      : [],
    statuses: Array.isArray(doc?.assets?.statuses)
      ? doc.assets.statuses.map((status) => ({
          id: String(status?._id || ''),
          name: status?.name || '',
        }))
      : [],
    checkInOut: {
      cascadingHierarchyEnabled: !!doc?.assets?.checkInOut?.cascadingHierarchyEnabled,
    },
  },
  partsInventory: {
    general: {
      ...defaultPartsInventorySettings.general,
      ...(doc?.partsInventory?.general || {}),
    },
    groupParts: Array.isArray(doc?.partsInventory?.groupParts)
      ? doc.partsInventory.groupParts.map((group) => ({
          id: String(group?._id || ''),
          name: group?.name || '',
          description: group?.description || '',
        }))
      : [],
    customFields: Array.isArray(doc?.partsInventory?.customFields) && doc.partsInventory.customFields.length > 0
      ? doc.partsInventory.customFields.map((field) => ({
          name: field?.name || '',
          type: field?.type || 'Single Line Text',
          source: field?.source || 'Custom',
          options: Array.isArray(field?.options) ? field.options : [],
        }))
      : defaultPartsInventorySettings.customFields,
  },
  workOrders: {
    general: {
      ...defaultWorkOrderSettings.general,
      ...(doc?.workOrders?.general || {}),
    },
    configuration: {
      createFields: {
        ...defaultWorkOrderSettings.configuration.createFields,
        ...(doc?.workOrders?.configuration?.createFields ? Object.fromEntries(Object.entries(doc.workOrders.configuration.createFields)) : {}),
      },
      completeFields: {
        ...defaultWorkOrderSettings.configuration.completeFields,
        ...(doc?.workOrders?.configuration?.completeFields ? Object.fromEntries(Object.entries(doc.workOrders.configuration.completeFields)) : {}),
      },
    },
    statuses: [
      ...defaultWorkOrderSettings.statuses,
      ...((Array.isArray(doc?.workOrders?.statuses) ? doc.workOrders.statuses : []).map((status) => ({
        id: String(status?._id || ''),
        name: status?.name || '',
        type: status?.type || 'Open',
        createdBy: status?.createdBy || '-',
        lastUpdated: status?.updatedAt || status?.createdAt || null,
        isDefault: false,
      }))),
    ],
    categories: [
      ...((Array.isArray(doc?.workOrders?.categories) ? doc.workOrders.categories : []).map((category) => ({
        id: String(category?._id || ''),
        name: category?.name || '',
        isDefault: !!category?.isDefault,
      }))),
    ],
    timers: [
      ...defaultWorkOrderSettings.timers,
      ...((Array.isArray(doc?.workOrders?.timers) ? doc.workOrders.timers : []).map((timer) => ({
        id: String(timer?._id || ''),
        name: timer?.name || '',
        createdAt: timer?.createdAt || null,
        isDefault: false,
      }))),
    ],
    customFields: Array.isArray(doc?.workOrders?.customFields)
      ? doc.workOrders.customFields.map((field) => ({
          name: field?.name || '',
          type: field?.type || 'Single Line Text',
          source: field?.source || 'Custom',
          options: Array.isArray(field?.options) ? field.options : [],
        }))
      : [],
  },
  purchaseOrders: {
    general: {
      ...defaultPurchaseOrderSettings.general,
      ...(doc?.purchaseOrders?.general || {}),
    },
    categories: Array.isArray(doc?.purchaseOrders?.categories)
      ? doc.purchaseOrders.categories.map((category) => ({
          id: String(category?._id || ''),
          name: category?.name || '',
          createdAt: category?.createdAt || null,
        }))
      : [],
    publicRequestPortal: {
      enabled: !!doc?.purchaseOrders?.publicRequestPortal?.enabled,
    },
  },
  meters: {
    categories: Array.isArray(doc?.meters?.categories)
      ? doc.meters.categories.map((category) => ({
          id: String(category?._id || ''),
          name: category?.name || '',
          createdAt: category?.createdAt || null,
        }))
      : [],
  },
  tags: {
    items: Array.isArray(doc?.tags?.items)
      ? doc.tags.items.map((tag) => ({
          id: String(tag?._id || ''),
          name: tag?.name || '',
          model: tag?.model || '',
          createdAt: tag?.createdAt || null,
        }))
      : [],
  },
});

const sanitizePortal = (doc) => ({
  id: String(doc?._id || ''),
  name: doc?.name || '',
  customUrl: doc?.customUrl || '',
  type: doc?.type || 'general',
  selectedLocationId: doc?.selectedLocationId || '',
  selectedAssetId: doc?.selectedAssetId || '',
  options: doc?.options || {},
  customFields: Array.isArray(doc?.customFields) ? doc.customFields : [],
  createdAt: doc?.createdAt || null,
  updatedAt: doc?.updatedAt || null,
});

const getCompanyName = (req) => String(req.user?.companyName || '').trim();

const ensureSettings = async (companyName) => {
  let settings = await RequestSettings.findOne({ companyName });
  if (!settings) {
    settings = await RequestSettings.create({ companyName });
  }
  settings.purchaseOrders = settings.purchaseOrders || { ...defaultPurchaseOrderSettings };
  settings.meters = settings.meters || { ...defaultMeterSettings };
  settings.tags = settings.tags || { ...defaultTagSettings };
  return settings;
};

const buildRoleRows = (users = [], customRoles = []) => {
  const defaults = defaultRoleRows.map((role) => ({
    name: role.name,
    users: users.filter((user) => role.match(user)).length,
    externalId: role.externalId,
    type: role.type,
    isDefault: true,
  }));
  const customs = (Array.isArray(customRoles) ? customRoles : []).map((role) => ({
    id: String(role?._id || ''),
    name: role?.name || '',
    users: 0,
    externalId: role?.externalId || '',
    type: role?.type || 'Paid',
    isDefault: false,
  }));
  return [...defaults, ...customs];
};

exports.getRequestSettings = async (req, res) => {
  try {
    const companyName = getCompanyName(req);
    if (!companyName) return res.status(400).json({ error: 'Company not found on user token.' });
    const settings = await ensureWorkOrderCategoryDefaults(await ensureSettings(companyName));
    const companyUsers = await User.find({ companyName }).select('role accessLevel');
    const portals = await RequestPortal.find({ companyName }).sort({ createdAt: -1 });
    return res.json({
      ...sanitizeSettings(settings),
      portals: portals.map(sanitizePortal),
      roleRows: buildRoleRows(companyUsers, settings?.userRoles?.customRoles),
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

exports.updatePartsInventoryGeneral = async (req, res) => {
  try {
    const companyName = getCompanyName(req);
    if (!companyName) return res.status(400).json({ error: 'Company not found on user token.' });
    const settings = await ensureWorkOrderCategoryDefaults(await ensureSettings(companyName));
    settings.partsInventory = settings.partsInventory || { ...defaultPartsInventorySettings };
    settings.partsInventory.general = {
      ...defaultPartsInventorySettings.general,
      ...(settings.partsInventory.general || {}),
      ...(req.body?.general || {}),
    };
    await settings.save();
    return res.json({ partsInventory: sanitizeSettings(settings).partsInventory });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

exports.autoGroupParts = async (req, res) => {
  try {
    const companyName = getCompanyName(req);
    if (!companyName) return res.status(400).json({ error: 'Company not found on user token.' });
    const settings = await ensureWorkOrderCategoryDefaults(await ensureSettings(companyName));
    const confirmed = !!req.body?.allPartsHavePartNumber;
    if (!confirmed) {
      return res.status(400).json({ error: 'Please confirm that all parts have a part number.' });
    }
    settings.partsInventory = settings.partsInventory || { ...defaultPartsInventorySettings };
    settings.partsInventory.groupParts = Array.isArray(settings.partsInventory.groupParts) ? settings.partsInventory.groupParts : [];
    const existing = settings.partsInventory.groupParts.some((group) => String(group?.name || '').toLowerCase() === 'auto grouped parts');
    if (!existing) {
      settings.partsInventory.groupParts.push({
        name: 'Auto Grouped Parts',
        description: 'Generated from the Part Number field.',
      });
    }
    await settings.save();
    return res.json({ partsInventory: sanitizeSettings(settings).partsInventory });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

exports.syncAllocatedPartQuantities = async (req, res) => {
  try {
    const companyName = getCompanyName(req);
    if (!companyName) return res.status(400).json({ error: 'Company not found on user token.' });
    const settings = await ensureWorkOrderCategoryDefaults(await ensureSettings(companyName));
    settings.partsInventory = settings.partsInventory || { ...defaultPartsInventorySettings };
    settings.partsInventory.general = {
      ...defaultPartsInventorySettings.general,
      ...(settings.partsInventory.general || {}),
      allocatedPartQuantitiesSyncedAt: new Date(),
    };
    await settings.save();
    return res.json({ partsInventory: sanitizeSettings(settings).partsInventory });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

exports.updateInternalRequests = async (req, res) => {
  try {
    const companyName = getCompanyName(req);
    if (!companyName) return res.status(400).json({ error: 'Company not found on user token.' });
    const settings = await ensureWorkOrderCategoryDefaults(await ensureSettings(companyName));
    settings.internalRequests = {
      ...defaultInternalRequests,
      ...(req.body?.internalRequests || {}),
    };
    await settings.save();
    return res.json({ internalRequests: settings.internalRequests });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

exports.updateGeneralSettings = async (req, res) => {
  try {
    const companyName = getCompanyName(req);
    if (!companyName) return res.status(400).json({ error: 'Company not found on user token.' });
  const settings = await ensureWorkOrderCategoryDefaults(await ensureSettings(companyName));
    settings.general = {
      ...defaultGeneralSettings,
      ...(settings.general || {}),
      ...(req.body?.general || {}),
    };
    await settings.save();
    return res.json({ general: settings.general });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

exports.updateApiSettings = async (req, res) => {
  try {
    const version = String(req.body?.version || defaultApiSettings.version).trim() || defaultApiSettings.version;
    const settings = await findOrCreateSettings(req.user);
    settings.api = { version };
    await settings.save();
    return res.json({ api: sanitizeSettings(settings).api });
  } catch (error) {
    console.error('updateApiSettings error:', error);
    return res.status(500).json({ message: 'Failed to update API settings' });
  }
};

exports.updateAuthenticationSettings = async (req, res) => {
  try {
    const provider = String(req.body?.provider || '').trim().toLowerCase();
    if (!allowedAuthenticationProviders.includes(provider)) {
      return res.status(400).json({ message: 'Invalid authentication provider' });
    }

    const settings = await findOrCreateSettings(req.user);
    settings.authentication = {
      saml: {
        provider,
        configured: provider !== '',
      },
    };
    await settings.save();
    return res.json({ authentication: sanitizeSettings(settings).authentication });
  } catch (error) {
    console.error('updateAuthenticationSettings error:', error);
    return res.status(500).json({ message: 'Failed to update authentication settings' });
  }
};

exports.updateLegacyPublicRequests = async (req, res) => {
  try {
    const companyName = getCompanyName(req);
    if (!companyName) return res.status(400).json({ error: 'Company not found on user token.' });
  const settings = await ensureWorkOrderCategoryDefaults(await ensureSettings(companyName));
    settings.legacyPublicRequests = {
      companyRequestPortalEnabled: !!req.body?.companyRequestPortalEnabled,
    };
    await settings.save();
    return res.json({ legacyPublicRequests: settings.legacyPublicRequests });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

exports.updateBranding = async (req, res) => {
  try {
    const companyName = getCompanyName(req);
    if (!companyName) return res.status(400).json({ error: 'Company not found on user token.' });
  const settings = await ensureWorkOrderCategoryDefaults(await ensureSettings(companyName));
    const nextBranding = {
      ...defaultBranding,
      ...(settings.branding || {}),
      ...(req.body || {}),
    };
    if (req.file?.filename) {
      nextBranding.logoUrl = `/uploads/${req.file.filename}`;
    }
    settings.branding = nextBranding;
    await settings.save();
    return res.json({ branding: settings.branding });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

exports.createWebhook = async (req, res) => {
  try {
    const title = String(req.body?.title || '').trim();
    const endpoint = String(req.body?.endpoint || '').trim();
    const allEvents = req.body?.allEvents !== false;
    const events = Array.isArray(req.body?.events)
      ? req.body.events.map((event) => String(event || '').trim()).filter(Boolean)
      : [];

    if (!title) {
      return res.status(400).json({ message: 'Webhook title is required' });
    }

    try {
      new URL(endpoint);
    } catch {
      return res.status(400).json({ message: 'Endpoint must be a valid URL' });
    }

    if (!allEvents && events.length === 0) {
      return res.status(400).json({ message: 'Select at least one webhook event' });
    }

    const settings = await findOrCreateSettings(req.user);
    if (!settings.webhooks) settings.webhooks = { items: [] };
    settings.webhooks.items.push({
      title,
      endpoint,
      allEvents,
      events: allEvents ? [] : events,
      active: true,
    });
    await settings.save();
    return res.status(201).json({ webhooks: sanitizeSettings(settings).webhooks });
  } catch (error) {
    console.error('createWebhook error:', error);
    return res.status(500).json({ message: 'Failed to create webhook' });
  }
};

exports.updateWebhook = async (req, res) => {
  try {
    const title = String(req.body?.title || '').trim();
    const endpoint = String(req.body?.endpoint || '').trim();
    const allEvents = req.body?.allEvents !== false;
    const events = Array.isArray(req.body?.events)
      ? req.body.events.map((event) => String(event || '').trim()).filter(Boolean)
      : [];

    if (!title) {
      return res.status(400).json({ message: 'Webhook title is required' });
    }

    try {
      new URL(endpoint);
    } catch {
      return res.status(400).json({ message: 'Endpoint must be a valid URL' });
    }

    if (!allEvents && events.length === 0) {
      return res.status(400).json({ message: 'Select at least one webhook event' });
    }

    const settings = await findOrCreateSettings(req.user);
    const webhook = settings.webhooks?.items?.id(req.params.id);
    if (!webhook) {
      return res.status(404).json({ message: 'Webhook not found' });
    }

    webhook.title = title;
    webhook.endpoint = endpoint;
    webhook.allEvents = allEvents;
    webhook.events = allEvents ? [] : events;
    webhook.active = req.body?.active !== false;
    await settings.save();
    return res.json({ webhooks: sanitizeSettings(settings).webhooks });
  } catch (error) {
    console.error('updateWebhook error:', error);
    return res.status(500).json({ message: 'Failed to update webhook' });
  }
};

exports.deleteWebhook = async (req, res) => {
  try {
    const settings = await findOrCreateSettings(req.user);
    const webhook = settings.webhooks?.items?.id(req.params.id);
    if (!webhook) {
      return res.status(404).json({ message: 'Webhook not found' });
    }

    webhook.deleteOne();
    await settings.save();
    return res.json({ webhooks: sanitizeSettings(settings).webhooks });
  } catch (error) {
    console.error('deleteWebhook error:', error);
    return res.status(500).json({ message: 'Failed to delete webhook' });
  }
};

exports.updateAutomationSettings = async (req, res) => {
  try {
    const companyName = getCompanyName(req);
    if (!companyName) return res.status(400).json({ error: 'Company not found on user token.' });
    const settings = await ensureSettings(companyName);
    const workflows = Array.isArray(req.body?.workflows)
      ? req.body.workflows
          .filter((workflow) => String(workflow?.title || '').trim() && String(workflow?.ifCondition || '').trim() && String(workflow?.thenAction || '').trim())
          .map((workflow) => ({
            title: String(workflow.title || '').trim(),
            ifCondition: String(workflow.ifCondition || '').trim(),
            andConditions: Array.isArray(workflow.andConditions)
              ? workflow.andConditions
                  .filter((condition) => String(condition?.type || '').trim())
                  .map((condition) => ({
                    type: String(condition.type || '').trim(),
                    value: normalizeWorkflowValue(condition?.value),
                  }))
                  .filter((condition) => hasWorkflowValue(condition.value))
              : [],
            thenAction: String(workflow.thenAction || '').trim(),
            thenValue: normalizeWorkflowValue(workflow?.thenValue),
          }))
      : [];
    settings.automation = { workflows };
    await settings.save();
    return res.json(sanitizeSettings(settings).automation);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

exports.createUserRole = async (req, res) => {
  try {
    const companyName = getCompanyName(req);
    if (!companyName) return res.status(400).json({ error: 'Company not found on user token.' });
    const settings = await ensureSettings(companyName);
    const payload = req.body || {};
    const name = String(payload.name || '').trim();
    const description = String(payload.description || '').trim();
    const externalId = String(payload.externalId || '').trim();
    const type = String(payload.type || 'Paid').trim() === 'Free' ? 'Free' : 'Paid';
    if (!name || name.length > 50) {
      return res.status(400).json({ error: 'Name is required and must be 50 characters or less.' });
    }
    if (!description || description.length > 150) {
      return res.status(400).json({ error: 'Description is required and must be 150 characters or less.' });
    }
    if (!/^[a-z]+(?:_[a-z]+)*$/.test(externalId) || externalId.length > 50) {
      return res.status(400).json({ error: 'External ID is required, must be 50 characters or less, can only have letters and underscores and cannot start or end with an underscore.' });
    }
    const existingExternalIds = new Set([
      ...defaultRoleRows.map((role) => role.externalId),
      ...((settings.userRoles?.customRoles || []).map((role) => String(role.externalId || '').trim())),
    ]);
    if (existingExternalIds.has(externalId)) {
      return res.status(400).json({ error: 'External ID must be unique.' });
    }
    const permissions = Array.isArray(payload.permissions)
      ? payload.permissions
          .filter((section) => String(section?.section || '').trim())
          .map((section) => ({
            section: String(section.section || '').trim(),
            permissions: Array.isArray(section.permissions) ? section.permissions.map((permission) => String(permission || '').trim()).filter(Boolean) : [],
          }))
      : [];

    settings.userRoles = settings.userRoles || { customRoles: [] };
    settings.userRoles.customRoles.push({
      name,
      description,
      externalId,
      type,
      permissions,
    });
    await settings.save();
    const companyUsers = await User.find({ companyName }).select('role accessLevel');
    return res.status(201).json({
      userRoles: sanitizeSettings(settings).userRoles,
      roleRows: buildRoleRows(companyUsers, settings?.userRoles?.customRoles),
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

exports.createAssetField = async (req, res) => {
  try {
    const companyName = getCompanyName(req);
    if (!companyName) return res.status(400).json({ error: 'Company not found on user token.' });
    const settings = await ensureSettings(companyName);
    const name = String(req.body?.name || '').trim();
    const type = String(req.body?.type || '').trim();
    const allowedTypes = ['Single Line Text', 'Multi-Line Text', 'Dropdown', 'Date', 'Number', 'Currency'];
    if (!name) return res.status(400).json({ error: 'Field name is required.' });
    if (!allowedTypes.includes(type)) return res.status(400).json({ error: 'Invalid field type.' });
    const options = type === 'Dropdown' && Array.isArray(req.body?.options)
      ? req.body.options.map((option) => String(option || '').trim()).filter(Boolean)
      : [];

    settings.assets = settings.assets || { ...defaultAssetSettings };
    settings.assets.fields = Array.isArray(settings.assets.fields) && settings.assets.fields.length > 0
      ? settings.assets.fields
      : defaultAssetFields.map((field) => ({ ...field }));
    settings.assets.fields.push({
      name,
      type,
      source: 'Custom',
      options,
    });
    await settings.save();
    return res.status(201).json({ assets: sanitizeSettings(settings).assets });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

exports.createAssetOperatingSchedule = async (req, res) => {
  try {
    const companyName = getCompanyName(req);
    if (!companyName) return res.status(400).json({ error: 'Company not found on user token.' });
    const settings = await ensureSettings(companyName);
    const name = String(req.body?.name || '').trim();
    const blocks = Array.isArray(req.body?.blocks)
      ? req.body.blocks
          .map((block) => ({
            day: String(block?.day || '').trim(),
            from: String(block?.from || '').trim(),
            to: String(block?.to || '').trim(),
          }))
          .filter((block) => block.day && block.from && block.to)
      : [];
    if (!name) return res.status(400).json({ error: 'Schedule name is required.' });
    if (blocks.length === 0) return res.status(400).json({ error: 'At least one operating-hours block is required.' });

    settings.assets = settings.assets || { ...defaultAssetSettings };
    settings.assets.operatingHours = Array.isArray(settings.assets.operatingHours) ? settings.assets.operatingHours : [];
    settings.assets.operatingHours.push({ name, blocks });
    await settings.save();
    return res.status(201).json({ assets: sanitizeSettings(settings).assets });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

exports.createAssetStatus = async (req, res) => {
  try {
    const companyName = getCompanyName(req);
    if (!companyName) return res.status(400).json({ error: 'Company not found on user token.' });
    const settings = await ensureSettings(companyName);
    const name = String(req.body?.name || '').trim();
    if (!name) return res.status(400).json({ error: 'Status name is required.' });

    settings.assets = settings.assets || { ...defaultAssetSettings };
    settings.assets.statuses = Array.isArray(settings.assets.statuses) ? settings.assets.statuses : [];
    const exists = settings.assets.statuses.some((status) => String(status?.name || '').toLowerCase() === name.toLowerCase());
    if (exists) return res.status(400).json({ error: 'Status already exists.' });

    settings.assets.statuses.push({ name });
    await settings.save();
    return res.status(201).json({ assets: sanitizeSettings(settings).assets });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

exports.updateAssetCheckInOut = async (req, res) => {
  try {
    const companyName = getCompanyName(req);
    if (!companyName) return res.status(400).json({ error: 'Company not found on user token.' });
    const settings = await ensureSettings(companyName);
    settings.assets = settings.assets || { ...defaultAssetSettings };
    settings.assets.checkInOut = {
      cascadingHierarchyEnabled: !!req.body?.cascadingHierarchyEnabled,
    };
    await settings.save();
    return res.json({ assets: sanitizeSettings(settings).assets });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

exports.createPartGroup = async (req, res) => {
  try {
    const companyName = getCompanyName(req);
    if (!companyName) return res.status(400).json({ error: 'Company not found on user token.' });
    const settings = await ensureSettings(companyName);
    const name = String(req.body?.name || '').trim();
    const description = String(req.body?.description || '').trim();
    if (!name) return res.status(400).json({ error: 'Group name is required.' });

    settings.partsInventory = settings.partsInventory || { ...defaultPartsInventorySettings };
    settings.partsInventory.groupParts = Array.isArray(settings.partsInventory.groupParts) ? settings.partsInventory.groupParts : [];
    settings.partsInventory.groupParts.push({ name, description });
    await settings.save();
    return res.status(201).json({ partsInventory: sanitizeSettings(settings).partsInventory });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

exports.createPartCustomField = async (req, res) => {
  try {
    const companyName = getCompanyName(req);
    if (!companyName) return res.status(400).json({ error: 'Company not found on user token.' });
    const settings = await ensureSettings(companyName);
    const name = String(req.body?.name || '').trim();
    const type = String(req.body?.type || '').trim();
    const allowedTypes = ['Single Line Text', 'Multi-Line Text', 'Dropdown', 'Date', 'Number', 'Currency'];
    if (!name) return res.status(400).json({ error: 'Field name is required.' });
    if (!allowedTypes.includes(type)) return res.status(400).json({ error: 'Invalid field type.' });
    const options = type === 'Dropdown' && Array.isArray(req.body?.options)
      ? req.body.options.map((option) => String(option || '').trim()).filter(Boolean)
      : [];

    settings.partsInventory = settings.partsInventory || { ...defaultPartsInventorySettings };
    settings.partsInventory.customFields = Array.isArray(settings.partsInventory.customFields) && settings.partsInventory.customFields.length > 0
      ? settings.partsInventory.customFields
      : defaultPartsInventorySettings.customFields.map((field) => ({ ...field }));
    settings.partsInventory.customFields.push({
      name,
      type,
      source: 'Custom',
      options,
    });
    await settings.save();
    return res.status(201).json({ partsInventory: sanitizeSettings(settings).partsInventory });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

exports.updateWorkOrderGeneral = async (req, res) => {
  try {
    const companyName = getCompanyName(req);
    if (!companyName) return res.status(400).json({ error: 'Company not found on user token.' });
    const settings = await ensureSettings(companyName);
    settings.workOrders = settings.workOrders || { ...defaultWorkOrderSettings };
    settings.workOrders.general = {
      ...defaultWorkOrderSettings.general,
      ...(settings.workOrders.general || {}),
      ...(req.body?.general || {}),
    };
    await settings.save();
    return res.json({ workOrders: sanitizeSettings(settings).workOrders });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

exports.updateWorkOrderConfiguration = async (req, res) => {
  try {
    const companyName = getCompanyName(req);
    if (!companyName) return res.status(400).json({ error: 'Company not found on user token.' });
    const settings = await ensureSettings(companyName);
    settings.workOrders = settings.workOrders || { ...defaultWorkOrderSettings };
    settings.workOrders.configuration = settings.workOrders.configuration || { ...defaultWorkOrderSettings.configuration };
    settings.workOrders.configuration.createFields = {
      ...defaultWorkOrderSettings.configuration.createFields,
      ...(settings.workOrders.configuration.createFields ? Object.fromEntries(Object.entries(settings.workOrders.configuration.createFields)) : {}),
      ...(req.body?.configuration?.createFields || {}),
    };
    settings.workOrders.configuration.completeFields = {
      ...defaultWorkOrderSettings.configuration.completeFields,
      ...(settings.workOrders.configuration.completeFields ? Object.fromEntries(Object.entries(settings.workOrders.configuration.completeFields)) : {}),
      ...(req.body?.configuration?.completeFields || {}),
    };
    await settings.save();
    return res.json({ workOrders: sanitizeSettings(settings).workOrders });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

exports.createWorkOrderStatus = async (req, res) => {
  try {
    const companyName = getCompanyName(req);
    if (!companyName) return res.status(400).json({ error: 'Company not found on user token.' });
    const settings = await ensureSettings(companyName);
    const name = String(req.body?.name || '').trim();
    const type = String(req.body?.type || 'Open').trim();
    if (!name) return res.status(400).json({ error: 'Status name is required.' });
    if (!['Open', 'In Progress', 'On Hold', 'Complete'].includes(type)) {
      return res.status(400).json({ error: 'Invalid status type.' });
    }

    const existsInDefaults = defaultWorkOrderSettings.statuses.some((status) => String(status.name || '').toLowerCase() === name.toLowerCase());
    const existingStatuses = Array.isArray(settings.workOrders?.statuses) ? settings.workOrders.statuses : [];
    const existsInCustoms = existingStatuses.some((status) => String(status?.name || '').toLowerCase() === name.toLowerCase());
    if (existsInDefaults || existsInCustoms) {
      return res.status(400).json({ error: 'Status already exists.' });
    }

    settings.workOrders = settings.workOrders || { ...defaultWorkOrderSettings };
    settings.workOrders.statuses = existingStatuses;
    settings.workOrders.statuses.push({
      name,
      type,
      createdBy: req.user?.name || req.user?.email || '-',
    });
    await settings.save();
    return res.status(201).json({ workOrders: sanitizeSettings(settings).workOrders });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

exports.createWorkOrderCategory = async (req, res) => {
  try {
    const companyName = getCompanyName(req);
    if (!companyName) return res.status(400).json({ error: 'Company not found on user token.' });
    const settings = await ensureSettings(companyName);
    const name = String(req.body?.name || '').trim();
    if (!name) return res.status(400).json({ error: 'Category name is required.' });

    const existsInDefaults = defaultWorkOrderSettings.categories.some((category) => String(category.name || '').toLowerCase() === name.toLowerCase());
    const existingCategories = Array.isArray(settings.workOrders?.categories) ? settings.workOrders.categories : [];
    const existsInCustoms = existingCategories.some((category) => String(category?.name || '').toLowerCase() === name.toLowerCase());
    if (existsInDefaults || existsInCustoms) {
      return res.status(400).json({ error: 'Category already exists.' });
    }

    settings.workOrders = settings.workOrders || { ...defaultWorkOrderSettings };
    settings.workOrders.categories = existingCategories;
    settings.workOrders.categories.push({ name });
    await settings.save();
    return res.status(201).json({ workOrders: sanitizeSettings(settings).workOrders });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

exports.updateWorkOrderCategory = async (req, res) => {
  try {
    const companyName = getCompanyName(req);
    if (!companyName) return res.status(400).json({ error: 'Company not found on user token.' });
    const settings = await ensureSettings(companyName);
    const categoryId = String(req.params.id || '').trim();
    const name = String(req.body?.name || '').trim();
    if (!name) return res.status(400).json({ error: 'Category name is required.' });
    settings.workOrders = settings.workOrders || { ...defaultWorkOrderSettings };
    const category = Array.isArray(settings.workOrders.categories)
      ? settings.workOrders.categories.id(categoryId)
      : null;
    if (!category) return res.status(404).json({ error: 'Category not found.' });
    category.name = name;
    await settings.save();
    return res.json({ workOrders: sanitizeSettings(settings).workOrders });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

exports.deleteWorkOrderCategory = async (req, res) => {
  try {
    const companyName = getCompanyName(req);
    if (!companyName) return res.status(400).json({ error: 'Company not found on user token.' });
    const settings = await ensureSettings(companyName);
    const categoryId = String(req.params.id || '').trim();
    settings.workOrders = settings.workOrders || { ...defaultWorkOrderSettings };
    settings.workOrders.categories = (Array.isArray(settings.workOrders.categories) ? settings.workOrders.categories : []).filter(
      (category) => String(category?._id || '') !== categoryId
    );
    await settings.save();
    return res.json({ workOrders: sanitizeSettings(settings).workOrders });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

exports.createWorkOrderTimer = async (req, res) => {
  try {
    const companyName = getCompanyName(req);
    if (!companyName) return res.status(400).json({ error: 'Company not found on user token.' });
    const settings = await ensureSettings(companyName);
    const name = String(req.body?.name || '').trim();
    if (!name) return res.status(400).json({ error: 'Timer name is required.' });

    const existsInDefaults = defaultWorkOrderSettings.timers.some((timer) => String(timer.name || '').toLowerCase() === name.toLowerCase());
    const existingTimers = Array.isArray(settings.workOrders?.timers) ? settings.workOrders.timers : [];
    const existsInCustoms = existingTimers.some((timer) => String(timer?.name || '').toLowerCase() === name.toLowerCase());
    if (existsInDefaults || existsInCustoms) {
      return res.status(400).json({ error: 'Timer already exists.' });
    }

    settings.workOrders = settings.workOrders || { ...defaultWorkOrderSettings };
    settings.workOrders.timers = existingTimers;
    settings.workOrders.timers.push({ name });
    await settings.save();
    return res.status(201).json({ workOrders: sanitizeSettings(settings).workOrders });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

exports.updateWorkOrderTimer = async (req, res) => {
  try {
    const companyName = getCompanyName(req);
    if (!companyName) return res.status(400).json({ error: 'Company not found on user token.' });
    const settings = await ensureSettings(companyName);
    const timerId = String(req.params.id || '').trim();
    const name = String(req.body?.name || '').trim();
    if (!name) return res.status(400).json({ error: 'Timer name is required.' });
    settings.workOrders = settings.workOrders || { ...defaultWorkOrderSettings };
    const timer = Array.isArray(settings.workOrders.timers)
      ? settings.workOrders.timers.id(timerId)
      : null;
    if (!timer) return res.status(404).json({ error: 'Timer not found.' });
    timer.name = name;
    await settings.save();
    return res.json({ workOrders: sanitizeSettings(settings).workOrders });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

exports.deleteWorkOrderTimer = async (req, res) => {
  try {
    const companyName = getCompanyName(req);
    if (!companyName) return res.status(400).json({ error: 'Company not found on user token.' });
    const settings = await ensureSettings(companyName);
    const timerId = String(req.params.id || '').trim();
    settings.workOrders = settings.workOrders || { ...defaultWorkOrderSettings };
    settings.workOrders.timers = (Array.isArray(settings.workOrders.timers) ? settings.workOrders.timers : []).filter(
      (timer) => String(timer?._id || '') !== timerId
    );
    await settings.save();
    return res.json({ workOrders: sanitizeSettings(settings).workOrders });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

exports.createWorkOrderCustomField = async (req, res) => {
  try {
    const companyName = getCompanyName(req);
    if (!companyName) return res.status(400).json({ error: 'Company not found on user token.' });
    const settings = await ensureSettings(companyName);
    const name = String(req.body?.name || '').trim();
    const type = String(req.body?.type || '').trim();
    const allowedTypes = ['Single Line Text', 'Multi-Line Text', 'Dropdown', 'Date', 'Number', 'Currency'];
    if (!name) return res.status(400).json({ error: 'Field name is required.' });
    if (!allowedTypes.includes(type)) return res.status(400).json({ error: 'Invalid field type.' });
    const options = type === 'Dropdown' && Array.isArray(req.body?.options)
      ? req.body.options.map((option) => String(option || '').trim()).filter(Boolean)
      : [];

    settings.workOrders = settings.workOrders || { ...defaultWorkOrderSettings };
    settings.workOrders.customFields = Array.isArray(settings.workOrders.customFields) ? settings.workOrders.customFields : [];
    settings.workOrders.customFields.push({
      name,
      type,
      source: 'Custom',
      options,
    });
    await settings.save();
    return res.status(201).json({ workOrders: sanitizeSettings(settings).workOrders });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

exports.updatePurchaseOrderGeneral = async (req, res) => {
  try {
    const companyName = getCompanyName(req);
    if (!companyName) return res.status(400).json({ error: 'Company not found on user token.' });
    const settings = await ensureSettings(companyName);
    settings.purchaseOrders = settings.purchaseOrders || { ...defaultPurchaseOrderSettings };
    settings.purchaseOrders.general = {
      ...defaultPurchaseOrderSettings.general,
      ...(settings.purchaseOrders.general || {}),
      startCount: Number(req.body?.general?.startCount ?? settings.purchaseOrders.general?.startCount ?? 1) || 1,
      prefix: String(req.body?.general?.prefix ?? settings.purchaseOrders.general?.prefix ?? '').trim(),
    };
    await settings.save();
    return res.json({ purchaseOrders: sanitizeSettings(settings).purchaseOrders });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

exports.createPurchaseOrderCategory = async (req, res) => {
  try {
    const companyName = getCompanyName(req);
    if (!companyName) return res.status(400).json({ error: 'Company not found on user token.' });
    const settings = await ensureSettings(companyName);
    const name = String(req.body?.name || '').trim();
    if (!name) return res.status(400).json({ error: 'Category name is required.' });
    settings.purchaseOrders = settings.purchaseOrders || { ...defaultPurchaseOrderSettings };
    const categories = Array.isArray(settings.purchaseOrders.categories) ? settings.purchaseOrders.categories : [];
    if (categories.some((category) => String(category?.name || '').toLowerCase() === name.toLowerCase())) {
      return res.status(400).json({ error: 'Category already exists.' });
    }
    settings.purchaseOrders.categories = categories;
    settings.purchaseOrders.categories.push({ name });
    await settings.save();
    return res.status(201).json({ purchaseOrders: sanitizeSettings(settings).purchaseOrders });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

exports.updatePurchaseOrderCategory = async (req, res) => {
  try {
    const companyName = getCompanyName(req);
    if (!companyName) return res.status(400).json({ error: 'Company not found on user token.' });
    const settings = await ensureSettings(companyName);
    const categoryId = String(req.params.id || '').trim();
    const name = String(req.body?.name || '').trim();
    if (!name) return res.status(400).json({ error: 'Category name is required.' });
    settings.purchaseOrders = settings.purchaseOrders || { ...defaultPurchaseOrderSettings };
    const category = Array.isArray(settings.purchaseOrders.categories) ? settings.purchaseOrders.categories.id(categoryId) : null;
    if (!category) return res.status(404).json({ error: 'Category not found.' });
    category.name = name;
    await settings.save();
    return res.json({ purchaseOrders: sanitizeSettings(settings).purchaseOrders });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

exports.deletePurchaseOrderCategory = async (req, res) => {
  try {
    const companyName = getCompanyName(req);
    if (!companyName) return res.status(400).json({ error: 'Company not found on user token.' });
    const settings = await ensureSettings(companyName);
    const categoryId = String(req.params.id || '').trim();
    settings.purchaseOrders = settings.purchaseOrders || { ...defaultPurchaseOrderSettings };
    settings.purchaseOrders.categories = (Array.isArray(settings.purchaseOrders.categories) ? settings.purchaseOrders.categories : []).filter(
      (category) => String(category?._id || '') !== categoryId
    );
    await settings.save();
    return res.json({ purchaseOrders: sanitizeSettings(settings).purchaseOrders });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

exports.updatePurchaseOrderPublicRequestPortal = async (req, res) => {
  try {
    const companyName = getCompanyName(req);
    if (!companyName) return res.status(400).json({ error: 'Company not found on user token.' });
    const settings = await ensureSettings(companyName);
    settings.purchaseOrders = settings.purchaseOrders || { ...defaultPurchaseOrderSettings };
    settings.purchaseOrders.publicRequestPortal = {
      enabled: !!req.body?.enabled,
    };
    await settings.save();
    return res.json({ purchaseOrders: sanitizeSettings(settings).purchaseOrders });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

exports.createMeterCategory = async (req, res) => {
  try {
    const companyName = getCompanyName(req);
    if (!companyName) return res.status(400).json({ error: 'Company not found on user token.' });
    const settings = await ensureSettings(companyName);
    const name = String(req.body?.name || '').trim();
    if (!name) return res.status(400).json({ error: 'Category name is required.' });
    settings.meters = settings.meters || { ...defaultMeterSettings };
    const categories = Array.isArray(settings.meters.categories) ? settings.meters.categories : [];
    if (categories.some((category) => String(category?.name || '').toLowerCase() === name.toLowerCase())) {
      return res.status(400).json({ error: 'Category already exists.' });
    }
    settings.meters.categories = categories;
    settings.meters.categories.push({ name });
    await settings.save();
    return res.status(201).json({ meters: sanitizeSettings(settings).meters });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

exports.updateMeterCategory = async (req, res) => {
  try {
    const companyName = getCompanyName(req);
    if (!companyName) return res.status(400).json({ error: 'Company not found on user token.' });
    const settings = await ensureSettings(companyName);
    const categoryId = String(req.params.id || '').trim();
    const name = String(req.body?.name || '').trim();
    if (!name) return res.status(400).json({ error: 'Category name is required.' });
    settings.meters = settings.meters || { ...defaultMeterSettings };
    const category = Array.isArray(settings.meters.categories) ? settings.meters.categories.id(categoryId) : null;
    if (!category) return res.status(404).json({ error: 'Category not found.' });
    category.name = name;
    await settings.save();
    return res.json({ meters: sanitizeSettings(settings).meters });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

exports.deleteMeterCategory = async (req, res) => {
  try {
    const companyName = getCompanyName(req);
    if (!companyName) return res.status(400).json({ error: 'Company not found on user token.' });
    const settings = await ensureSettings(companyName);
    const categoryId = String(req.params.id || '').trim();
    settings.meters = settings.meters || { ...defaultMeterSettings };
    settings.meters.categories = (Array.isArray(settings.meters.categories) ? settings.meters.categories : []).filter(
      (category) => String(category?._id || '') !== categoryId
    );
    await settings.save();
    return res.json({ meters: sanitizeSettings(settings).meters });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

exports.createTag = async (req, res) => {
  try {
    const companyName = getCompanyName(req);
    if (!companyName) return res.status(400).json({ error: 'Company not found on user token.' });
    const settings = await ensureSettings(companyName);
    const name = String(req.body?.name || '').trim();
    const model = String(req.body?.model || '').trim();
    if (!name) return res.status(400).json({ error: 'Tag name is required.' });
    settings.tags = settings.tags || { ...defaultTagSettings };
    const items = Array.isArray(settings.tags.items) ? settings.tags.items : [];
    if (items.some((tag) => String(tag?.name || '').toLowerCase() === name.toLowerCase())) {
      return res.status(400).json({ error: 'Tag already exists.' });
    }
    settings.tags.items = items;
    settings.tags.items.push({ name, model });
    await settings.save();
    return res.status(201).json({ tags: sanitizeSettings(settings).tags });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

exports.updateTag = async (req, res) => {
  try {
    const companyName = getCompanyName(req);
    if (!companyName) return res.status(400).json({ error: 'Company not found on user token.' });
    const settings = await ensureSettings(companyName);
    const tagId = String(req.params.id || '').trim();
    const name = String(req.body?.name || '').trim();
    const model = String(req.body?.model || '').trim();
    if (!name) return res.status(400).json({ error: 'Tag name is required.' });
    settings.tags = settings.tags || { ...defaultTagSettings };
    const tag = Array.isArray(settings.tags.items) ? settings.tags.items.id(tagId) : null;
    if (!tag) return res.status(404).json({ error: 'Tag not found.' });
    tag.name = name;
    tag.model = model;
    await settings.save();
    return res.json({ tags: sanitizeSettings(settings).tags });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

exports.deleteTag = async (req, res) => {
  try {
    const companyName = getCompanyName(req);
    if (!companyName) return res.status(400).json({ error: 'Company not found on user token.' });
    const settings = await ensureSettings(companyName);
    const tagId = String(req.params.id || '').trim();
    settings.tags = settings.tags || { ...defaultTagSettings };
    settings.tags.items = (Array.isArray(settings.tags.items) ? settings.tags.items : []).filter(
      (tag) => String(tag?._id || '') !== tagId
    );
    await settings.save();
    return res.json({ tags: sanitizeSettings(settings).tags });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

exports.listPortals = async (req, res) => {
  try {
    const companyName = getCompanyName(req);
    if (!companyName) return res.status(400).json({ error: 'Company not found on user token.' });
    const portals = await RequestPortal.find({ companyName }).sort({ createdAt: -1 });
    return res.json(portals.map(sanitizePortal));
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

exports.createPortal = async (req, res) => {
  try {
    const companyName = getCompanyName(req);
    if (!companyName) return res.status(400).json({ error: 'Company not found on user token.' });
    const payload = req.body || {};
    if (!String(payload.name || '').trim()) {
      return res.status(400).json({ error: 'Portal name is required.' });
    }
    const portal = await RequestPortal.create({
      companyName,
      name: String(payload.name || '').trim(),
      customUrl: String(payload.customUrl || '').trim(),
      type: ['general', 'location', 'asset'].includes(String(payload.type || '')) ? payload.type : 'general',
      selectedLocationId: String(payload.selectedLocationId || '').trim(),
      selectedAssetId: String(payload.selectedAssetId || '').trim(),
      options: payload.options || {},
      customFields: Array.isArray(payload.customFields) ? payload.customFields : [],
    });
    return res.status(201).json(sanitizePortal(portal));
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

exports.updatePortal = async (req, res) => {
  try {
    const companyName = getCompanyName(req);
    if (!companyName) return res.status(400).json({ error: 'Company not found on user token.' });
    const portalId = String(req.params.id || '').trim();
    const payload = req.body || {};
    const portal = await RequestPortal.findOne({ _id: portalId, companyName });
    if (!portal) return res.status(404).json({ error: 'Request portal not found.' });
    if (!String(payload.name || portal.name || '').trim()) {
      return res.status(400).json({ error: 'Portal name is required.' });
    }
    portal.name = String(payload.name || portal.name).trim();
    portal.customUrl = String(payload.customUrl || '').trim();
    portal.type = ['general', 'location', 'asset'].includes(String(payload.type || '')) ? payload.type : portal.type;
    portal.selectedLocationId = String(payload.selectedLocationId || '').trim();
    portal.selectedAssetId = String(payload.selectedAssetId || '').trim();
    portal.options = payload.options || portal.options || {};
    portal.customFields = Array.isArray(payload.customFields) ? payload.customFields : [];
    await portal.save();
    return res.json(sanitizePortal(portal));
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
