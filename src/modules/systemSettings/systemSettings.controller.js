const { normalizeExtendedJSON } = require('../../utils/normalize');
const settingsService = require('./systemSettings.service');
const auditService = require('../auditLog/auditLog.service');
const paymentService = require('../subscription/payment.service');
const emailService = require('../emailService/email.service');

exports.getSettings = async (req, res) => {
  try {
    const settings = await settingsService.getSettings();
    res.json({ data: normalizeExtendedJSON(settings) });
  } catch (err) {
    console.error('[systemSettings.getSettings]', err);
    res.status(500).json({ error: err.message });
  }
};

exports.updateSettings = async (req, res) => {
  try {
    const previousSettings = await settingsService.getSettings();
    const settings = await settingsService.updateSettings(req.body || {});
    paymentService.setPricing(settings.pricing);
    await auditService.logEvent({
      actorId: req.user?.userId,
      actorRole: req.user?.role,
      companyName: req.user?.companyName,
      action: 'system.settings_updated',
      entityType: 'system_settings',
      entityId: settings.id || settings._id?.toString?.(),
      method: req.method,
      path: req.originalUrl,
      statusCode: 200,
      success: true,
      severity: 'warning',
      metadata: { updatedSections: Object.keys(req.body || {}) },
    });

    const maintenanceEnabled = !Boolean(previousSettings?.platform?.maintenanceMode) && Boolean(settings?.platform?.maintenanceMode);
    if (maintenanceEnabled) {
      await emailService.broadcastMaintenanceModeNotice({
        appName: settings?.platform?.appName,
        supportEmail: settings?.platform?.supportEmail,
      });

      await auditService.logEvent({
        actorId: req.user?.userId,
        actorRole: req.user?.role,
        companyName: req.user?.companyName,
        action: 'system.maintenance_mode_enabled',
        entityType: 'system_settings',
        entityId: settings.id || settings._id?.toString?.(),
        method: req.method,
        path: req.originalUrl,
        statusCode: 200,
        success: true,
        severity: 'critical',
      });
    }

    res.json({ data: normalizeExtendedJSON(settings) });
  } catch (err) {
    console.error('[systemSettings.updateSettings]', err);
    res.status(500).json({ error: err.message });
  }
};
