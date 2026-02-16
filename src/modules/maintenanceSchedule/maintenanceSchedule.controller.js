const model = require('./maintenanceSchedule.model');

function normalizeExtendedJSON(value) {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map(normalizeExtendedJSON);
  if (value instanceof Date) return value.toISOString();
  if (value && typeof value === 'object') {
    // MongoDB extended JSON: {$oid: '...'}
    if (value.$oid) return String(value.$oid);
    // MongoDB extended date forms: {$date: '...'} or {$date: {$numberLong: '...'}}
    if (value.$date) {
      if (typeof value.$date === 'string') return value.$date;
      if (typeof value.$date === 'number') return new Date(value.$date).toISOString();
      if (value.$date.$numberLong) return new Date(Number(value.$date.$numberLong)).toISOString();
    }
    // BSON ObjectId instance
    if (value._bsontype === 'ObjectID' && typeof value.toHexString === 'function') return value.toHexString();

    const out = {};
    for (const k of Object.keys(value)) {
      out[k] = normalizeExtendedJSON(value[k]);
    }
    return out;
  }
  return value;
}

module.exports = {
  async create(req, res) {
    try {
      const data = { ...req.body };
      console.log('[Schedule Create] Initial data:', JSON.stringify(data, null, 2));
      // Accept all new fields from the form
      // If date/time fields are present, combine into nextDate (preserve local time)
      if (data.date) {
        if (data.time) {
          // Combine date and time into local ISO-like string then create Date
          // e.g., date='2026-02-01', time='14:30' => new Date('2026-02-01T14:30:00')
          const dateStr = `${data.date}T${data.time}`;
          data.nextDate = new Date(dateStr);
          console.log('[Schedule Create] Combined nextDate:', data.nextDate, 'from:', dateStr);
        } else {
          data.nextDate = new Date(data.date);
        }
      }

      if (isNaN(data.nextDate?.getTime())) {
        console.warn('[Schedule Create] Invalid nextDate generated, defaulting to now');
        data.nextDate = new Date();
      }

      if (req.user && req.user.userId) {
        data.userId = String(req.user.userId);
      }
      console.log('[Schedule Create] Creating with userId:', data.userId);
      // If date/time fields are present they remain on the object as strings for clients if needed
      const schedule = await model.create(data);
      res.status(201).json(normalizeExtendedJSON(schedule));
    } catch (err) {
      console.error('[maintenanceSchedule.controller.js:create] ERROR:', err);
      res.status(400).json({ error: err.message, stack: process.env.NODE_ENV === 'development' ? err.stack : undefined });
    }
  },
  async getAll(req, res) {
    try {
      let schedules = await model.findAll();
      // Persist overdue status for any schedule whose nextDate is past and not completed
      try {
        const now = new Date();
        const updates = [];
        for (const s of schedules) {
          if (!s) continue;
          const next = s.nextDate ? new Date(s.nextDate) : null;
          const isComplete = s.status && String(s.status).toLowerCase().includes('complete');
          if (next && next < now && !isComplete && String(s.status || '').toLowerCase() !== 'overdue') {
            updates.push(model.update(s.id || s._id, { status: 'Overdue' }));
          }
        }
        if (updates.length) {
          await Promise.all(updates);
          schedules = await model.findAll();
        }
      } catch (uErr) {
        console.error('[maintenanceSchedule.controller.js:getAll] overdue update failed', uErr);
      }
      res.json(normalizeExtendedJSON(schedules));
    } catch (err) {
      console.error('[maintenanceSchedule.controller.js:getAll]', err);
      res.status(500).json({ error: err.message });
    }
  },
  async getById(req, res) {
    try {
      let schedule = await model.findById(req.params.id);
      if (!schedule) return res.status(404).json({ error: 'Not found' });
      try {
        const now = new Date();
        const next = schedule.nextDate ? new Date(schedule.nextDate) : null;
        const isComplete = schedule.status && String(schedule.status).toLowerCase().includes('complete');
        if (next && next < now && !isComplete && String(schedule.status || '').toLowerCase() !== 'overdue') {
          await model.update(req.params.id, { status: 'Overdue' });
          schedule = await model.findById(req.params.id);
        }
      } catch (u) {
        console.error('[maintenanceSchedule.controller.js:getById] overdue update failed', u);
      }
      res.json(normalizeExtendedJSON(schedule));
    } catch (err) {
      console.error('[maintenanceSchedule.controller.js:getById]', err);
      res.status(500).json({ error: err.message });
    }
  },
  async dismiss(req, res) {
    try {
      const id = req.params.id;
      const schedule = await model.findById(id);
      if (!schedule) return res.status(404).json({ error: 'Not found' });
      const userId = req.body && req.body.userId;
      const updates = {};
      // update lastReminder for backward compatibility
      updates.lastReminder = schedule.nextDate ? new Date(schedule.nextDate) : new Date();
      // if userId provided, persist per-user dismissal
      if (userId) {
        let dismissed = {};
        try {
          dismissed = schedule.dismissedBy && typeof schedule.dismissedBy === 'object' ? schedule.dismissedBy : {};
        } catch (e) {
          dismissed = {};
        }
        dismissed[userId] = new Date().toISOString();
        updates.dismissedBy = dismissed;
      }
      const updated = await model.update(id, updates);
      res.json(normalizeExtendedJSON(updated));
    } catch (err) {
      console.error('[maintenanceSchedule.controller.js:dismiss]', err);
      res.status(400).json({ error: err.message });
    }
  },

  async snooze(req, res) {
    try {
      const id = req.params.id;
      const { minutes = 60, userId } = req.body || {};
      const schedule = await model.findById(id);
      if (!schedule) return res.status(404).json({ error: 'Not found' });
      // compute snoozedUntil as now + minutes
      const snoozedUntil = new Date(Date.now() + Number(minutes) * 60000);
      const updates = { snoozedUntil };
      // also update lastReminder so it won't immediately reappear
      updates.lastReminder = new Date();
      const updated = await model.update(id, updates);
      res.json(normalizeExtendedJSON(updated));
    } catch (err) {
      console.error('[maintenanceSchedule.controller.js:snooze]', err);
      res.status(400).json({ error: err.message });
    }
  },

  async emailReminder(req, res) {
    try {
      const id = req.params.id;
      const schedule = await model.findById(id);
      if (!schedule) return res.status(404).json({ error: 'Not found' });
      const emailService = require('../emailService/email.service');
      const recipients = [];
      if (schedule.email) recipients.push(schedule.email);
      if (schedule.employees) {
        const ids = typeof schedule.employees === 'string' ? schedule.employees.split(',').map(x => x.trim()).filter(Boolean) : Array.isArray(schedule.employees) ? schedule.employees : [];
        const techModel = require('../internalTechnician/internalTechnician.model');
        for (const tid of ids) {
          try {
            const tech = await techModel.findById(tid);
            if (tech && tech.email) recipients.push(tech.email);
          } catch (e) {
            // ignore
          }
        }
      }
      const uniqRecipients = [...new Set(recipients)];
      if (uniqRecipients.length === 0) return res.status(400).json({ error: 'No recipients' });
      await emailService.sendMaintenanceReminder(schedule, uniqRecipients);
      // update lastReminder
      await model.update(id, { lastReminder: new Date() });
      // record reminder log
      try {
        const { PrismaClient } = require('@prisma/client');
        const prisma = new PrismaClient();
        await prisma.maintenanceReminderLog.create({ data: { scheduleId: id, recipients: uniqRecipients, method: 'dashboard', sentAt: new Date() } });
        await prisma.$disconnect();
      } catch (logErr) {
        console.error('[maintenanceSchedule.controller.js:emailReminder] failed to write reminder log', logErr);
      }
      res.json({ success: true });
    } catch (err) {
      console.error('[maintenanceSchedule.controller.js:emailReminder]', err);
      res.status(500).json({ error: err.message });
    }
  },

  async getReminderLogs(req, res) {
    try {
      const id = req.params.id;
      const { PrismaClient } = require('@prisma/client');
      const prisma = new PrismaClient();
      const logs = await prisma.maintenanceReminderLog.findMany({ where: { scheduleId: id }, orderBy: { sentAt: 'desc' } });
      await prisma.$disconnect();
      res.json(logs || []);
    } catch (err) {
      console.error('[maintenanceSchedule.controller.js:getReminderLogs]', err);
      res.status(500).json({ error: err.message });
    }
  },
  async update(req, res) {
    try {
      const data = { ...req.body };
      console.log('[Schedule Update] ID:', req.params.id, 'Data:', JSON.stringify(data, null, 2));
      // Accept date/time fields for updates as well
      if (data.date) {
        if (data.time) {
          data.nextDate = new Date(`${data.date}T${data.time}`);
        } else {
          data.nextDate = new Date(data.date);
        }
      } else if (data.nextDate) {
        data.nextDate = new Date(data.nextDate);
      }
      const schedule = await model.update(req.params.id, data);
      res.json(normalizeExtendedJSON(schedule));
    } catch (err) {
      console.error('[maintenanceSchedule.controller.js:update] ERROR:', err);
      res.status(400).json({ error: err.message });
    }
  },
  async remove(req, res) {
    try {
      await model.delete(req.params.id);
      res.json({ success: true });
    } catch (err) {
      console.error('[maintenanceSchedule.controller.js:remove]', err);
      res.status(500).json({ error: err.message });
    }
  },
};