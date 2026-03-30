const service = require('./meter.service');
const { normalizeExtendedJSON } = require('../../utils/normalize');
const notificationService = require('../notification/notification.service');
const emailService = require('../emailService/email.service');

exports.getAll = async (req, res) => {
  try {
    const meters = await service.findAll();
    res.json(normalizeExtendedJSON(meters));
  } catch (err) {
    console.error('[meter.getAll]', err);
    res.status(500).json({ error: err.message });
  }
};

exports.getById = async (req, res) => {
  try {
    const m = await service.findById(req.params.id);
    if (!m) return res.status(404).json({ error: 'Not found' });
    res.json(normalizeExtendedJSON(m));
  } catch (err) {
    console.error('[meter.getById]', err);
    res.status(500).json({ error: err.message });
  }
};

exports.create = async (req, res) => {
  try {
    const payload = req.body || {};
    const created = await service.create(payload);
    res.status(201).json(normalizeExtendedJSON(created));
  } catch (err) {
    console.error('[meter.create]', err);
    res.status(500).json({ error: err.message });
  }
};

exports.update = async (req, res) => {
  try {
    const existing = await service.findById(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Not found' });

    const nextPayload = req.body || {};
    const previousTriggerIds = new Set(
      (Array.isArray(existing.triggers) ? existing.triggers : [])
        .map((trigger) => String(trigger?.id || trigger?._id || ''))
        .filter(Boolean)
    );

    const updated = await service.update(req.params.id, nextPayload);

    const incomingTriggers = Array.isArray(nextPayload.triggers) ? nextPayload.triggers : [];
    const createdTriggers = incomingTriggers.filter((trigger) => {
      const triggerId = String(trigger?.id || trigger?._id || '');
      return triggerId && !previousTriggerIds.has(triggerId);
    });

    if (createdTriggers.length > 0) {
      const companyName = req.user?.companyName || updated?.companyName || existing?.companyName || '';
      const meterLabel = updated?.name || existing?.name || 'Meter';

      await Promise.all(createdTriggers.map(async (trigger) => {
        const title = `New meter trigger: ${trigger?.title || meterLabel}`;
        const message = `${req.user?.name || req.user?.email || 'Someone'} created a meter trigger for ${meterLabel}${trigger?.triggerValue ? ` (${trigger.triggerValue})` : ''}.`;

        await notificationService.notifyCompanyAdmins({
          companyName,
          title,
          message,
          type: 'info',
          link: '/dashboard?tab=meters',
        });

        await emailService.sendMeterTriggerCreatedNotification({
          companyName,
          trigger,
          meter: updated || existing,
          actor: req.user || null,
        });
      }));
    }

    res.json(normalizeExtendedJSON(updated));
  } catch (err) {
    console.error('[meter.update]', err);
    res.status(500).json({ error: err.message });
  }
};

exports.delete = async (req, res) => {
  try {
    const result = await service.delete(req.params.id);
    res.json(result);
  } catch (err) {
    console.error('[meter.delete]', err);
    res.status(500).json({ error: err.message });
  }
};
