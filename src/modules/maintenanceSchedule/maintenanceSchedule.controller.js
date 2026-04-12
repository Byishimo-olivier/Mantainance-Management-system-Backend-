const model = require('./maintenanceSchedule.model');

const escapeRegExp = (value) => String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const getCompanyUserIds = async (companyName) => {
  if (!companyName) return [];
  try {
    const userService = require('../user/user.service');
    const normalized = String(companyName || '').trim();
    const regex = new RegExp(`^${escapeRegExp(normalized)}$`, 'i');
    let users = await userService.getAllUsers({ companyName: regex });
    if (!users || users.length === 0) {
      const targetSlug = userService.slugifyCompanyName(normalized);
      const allUsers = await userService.getAllUsers({});
      users = (allUsers || []).filter((u) => userService.slugifyCompanyName(u.companyName) === targetSlug);
    }
    return (users || []).map((u) => String(u.id || u._id || u.userId || '')).filter(Boolean);
  } catch (err) {
    console.error('[maintenanceSchedule.controller] Failed to resolve company users:', err);
    return [];
  }
};

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

function normalizeScheduleAssignments(data) {
  if (!data || typeof data !== 'object') return data;

  const rows = Array.isArray(data.assetsRows) ? data.assetsRows : [];
  const normalizedRows = rows.map((row) => (row && typeof row === 'object' ? { ...row } : row));

  const collected = [];
  const pushAssignee = (rawValue, meta = {}) => {
    if (!rawValue && rawValue !== 0) return;

    if (Array.isArray(rawValue)) {
      rawValue.forEach((entry) => pushAssignee(entry, meta));
      return;
    }

    if (typeof rawValue === 'object') {
      const idValue = rawValue.id || rawValue._id || rawValue.userId || rawValue.value || '';
      const nameValue = rawValue.name || rawValue.fullName || rawValue.label || meta.name || '';
      if (idValue || nameValue) {
        collected.push({
          id: idValue ? String(idValue).trim() : '',
          name: nameValue ? String(nameValue).trim() : '',
          email: rawValue.email ? String(rawValue.email).trim() : '',
          role: rawValue.role ? String(rawValue.role).trim() : '',
        });
      }
      return;
    }

    const normalized = String(rawValue).trim();
    if (!normalized) return;
    const looksLikeId = /^[a-fA-F0-9]{24}$/.test(normalized) || /^[a-fA-F0-9-]{32,36}$/.test(normalized);
    collected.push({
      id: looksLikeId ? normalized : '',
      name: meta.name ? String(meta.name).trim() : (looksLikeId ? '' : normalized),
      email: meta.email ? String(meta.email).trim() : '',
      role: meta.role ? String(meta.role).trim() : '',
    });
  };

  normalizedRows.forEach((row) => {
    if (!row || typeof row !== 'object') return;
    const assigneeValue = row.assignee || row.assignedTo || row.technicianId || row.userId;
    const assigneeName = row.assigneeName || row.assignedToName || row.technicianName || '';
    pushAssignee(assigneeValue, { name: assigneeName });
  });

  pushAssignee(data.assignedTo, { name: data.assignedToName, email: data.assignedToEmail });
  pushAssignee(data.technicianId, { name: data.technicianName });
  pushAssignee(data.technicianUserId, { name: data.technicianName });
  pushAssignee(data.assignees);

  const uniqueAssignments = [];
  const seen = new Set();
  collected.forEach((entry) => {
    const id = String(entry?.id || '').trim();
    const name = String(entry?.name || '').trim();
    const email = String(entry?.email || '').trim();
    const key = [id.toLowerCase(), name.toLowerCase(), email.toLowerCase()].join('|');
    if (!key.replace(/\|/g, '')) return;
    if (seen.has(key)) return;
    seen.add(key);
    uniqueAssignments.push({
      ...(id ? { id } : {}),
      ...(name ? { name } : {}),
      ...(email ? { email } : {}),
      ...(entry?.role ? { role: entry.role } : {}),
    });
  });

  const primary = uniqueAssignments[0] || null;
  const employeeIds = uniqueAssignments
    .map((entry) => entry.id || entry.email || entry.name)
    .filter(Boolean);

  if (primary?.id) {
    data.assignedTo = primary.id;
    data.technicianUserId = primary.id;
  } else if (primary?.name) {
    data.assignedTo = primary.name;
    data.technicianUserId = primary.name;
  } else {
    delete data.assignedTo;
    delete data.technicianUserId;
  }

  if (primary?.name) {
    data.assignedToName = primary.name;
    data.technicianName = primary.name;
  } else {
    delete data.assignedToName;
  }

  if (primary?.email) {
    data.assignedToEmail = primary.email;
  } else {
    delete data.assignedToEmail;
  }

  if (uniqueAssignments.length > 0) {
    data.assignees = uniqueAssignments;
    data.employees = employeeIds.join(',');
  } else {
    data.assignees = [];
    data.employees = '';
  }

  data.assetsRows = normalizedRows.map((row) => {
    if (!row || typeof row !== 'object') return row;
    const rowAssignee = row.assignee || row.assignedTo || row.technicianId || row.userId || '';
    const rowName = row.assigneeName || row.assignedToName || row.technicianName || '';
    const nextRow = { ...row };
    if (rowAssignee) {
      nextRow.assignee = String(rowAssignee).trim();
      nextRow.assignedTo = String(rowAssignee).trim();
      nextRow.technicianId = String(rowAssignee).trim();
    }
    if (rowName) {
      nextRow.assigneeName = String(rowName).trim();
      nextRow.assignedToName = String(rowName).trim();
    }
    return nextRow;
  });

  return data;
}

module.exports = {
  async create(req, res) {
    try {
      const data = { ...req.body };
      console.log('[Schedule Create] Initial data:', JSON.stringify(data, null, 2));
      const parseMaybeJson = (value, fallback) => {
        if (value === undefined || value === null || value === '') return fallback;
        if (typeof value !== 'string') return value;
        try {
          return JSON.parse(value);
        } catch (e) {
          return fallback;
        }
      };

      data.tasks = parseMaybeJson(data.tasks, data.tasks || []);
      data.checklist = parseMaybeJson(data.checklist, data.checklist || []);
      data.assetsRows = parseMaybeJson(data.assetsRows, data.assetsRows || []);
      data.calendarRule = parseMaybeJson(data.calendarRule, data.calendarRule || null);
      data.meterRule = parseMaybeJson(data.meterRule, data.meterRule || null);
      data.combinedRule = parseMaybeJson(data.combinedRule, data.combinedRule || null);
      data.attachments = parseMaybeJson(data.attachments, data.attachments || null);
      normalizeScheduleAssignments(data);

      const uploadedPhotos = Array.isArray(req.files?.photos)
        ? req.files.photos.map((file) => ({
            kind: 'photo',
            field: 'photos',
            originalName: file.originalname,
            filename: file.filename,
            mimeType: file.mimetype,
            size: file.size,
            url: `/uploads/${file.filename}`,
          }))
        : [];

      const uploadedFiles = Array.isArray(req.files?.files)
        ? req.files.files.map((file) => ({
            kind: 'file',
            field: 'files',
            originalName: file.originalname,
            filename: file.filename,
            mimeType: file.mimetype,
            size: file.size,
            url: `/uploads/${file.filename}`,
          }))
        : [];

      if (uploadedPhotos.length || uploadedFiles.length) {
        data.attachments = {
          photos: uploadedPhotos,
          files: uploadedFiles,
        };
        if (uploadedPhotos[0]?.url) {
          data.photo = uploadedPhotos[0].url;
          data.image = uploadedPhotos[0].url;
        }
      }
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

      // If nextDate was passed as string or object, normalize to Date
      if (data.nextDate && !(data.nextDate instanceof Date)) {
        try {
          data.nextDate = new Date(data.nextDate);
        } catch (e) {
          console.warn('[Schedule Create] nextDate normalization failed, fallback to now');
          data.nextDate = new Date();
        }
      }

      if (isNaN(data.nextDate?.getTime())) {
        console.warn('[Schedule Create] Invalid nextDate generated, defaulting to now');
        data.nextDate = new Date();
      }

      // Fill required-but-missing legacy fields so Prisma doesn't reject
      if (!data.email) data.email = 'pm@placeholder.local';
      if (!data.employees) data.employees = 'N/A';
      if (!data.date) data.date = new Date(data.nextDate).toISOString().slice(0, 10);
      if (!data.time) data.time = '09:00';
      if (!data.description) data.description = data.workOrderDescription || 'Preventive maintenance schedule';
      if (!data.name) data.name = data.workOrderTitle || 'Preventive Maintenance';

      // Derive counts for assets/locations if provided
      if (Array.isArray(data.assetsRows)) {
        data.assetsCount = data.assetsRows.filter(r => r?.assetId || r?.asset).length;
        data.locationsCount = data.assetsRows.filter(r => r?.locationId || r?.location).length;
      }

      // Default status
      if (!data.status) data.status = 'Pending';

      if (req.user && req.user.userId) {
        data.userId = String(req.user.userId);
      }
      if (!data.company && req.user?.companyName) {
        data.company = req.user.companyName;
      }
      if (!data.companyName && req.user?.companyName) {
        data.companyName = req.user.companyName;
      }
      console.log('[Schedule Create] Creating with userId:', data.userId);
      // If date/time fields are present they remain on the object as strings for clients if needed
      const schedule = await model.create(data);

      // Optionally create initial work order / issue
      if (data.createFirstWorkOrder) {
        try {
          const mongoose = require('mongoose');
          const db = mongoose.connection.db;
          if (db) {
            const issueData = {
              title: data.workOrderTitle || data.name || 'Preventive Maintenance',
              description: data.workOrderDescription || data.description || 'Preventive maintenance generated work order',
              location: data.location || 'Preventive Maintenance',
              propertyId: data.assetsRows?.[0]?.propertyId || null,
              assetId: data.assetsRows?.[0]?.assetId || null,
              tags: [],
              assignees: [],
              time: 'Scheduled',
              userId: data.userId || null,
              status: 'PENDING',
              priority: (data.priority || 'MEDIUM').toUpperCase(),
              category: data.category || 'General',
              scheduleId: schedule.id || schedule._id,
              createdAt: new Date(),
              companyName: data.companyName || data.company || null,
            };
            const result = await db.collection('Issue').insertOne(issueData);
            console.log('[Schedule Create] Work order created with id', result.insertedId.toString());
          } else {
            console.warn('[Schedule Create] Cannot create work order: no DB connection');
          }
        } catch (woErr) {
          console.error('[Schedule Create] Failed to create initial work order', woErr);
        }
      }

      res.status(201).json(normalizeExtendedJSON(schedule));
    } catch (err) {
      console.error('[maintenanceSchedule.controller.js:create] ERROR:', err);
      res.status(400).json({ error: err.message, stack: process.env.NODE_ENV === 'development' ? err.stack : undefined });
    }
  },
  async getAll(req, res) {
    try {
      let schedules = await model.findAll();
      const user = req.user;
      
      // If no user, return empty array for security
      if (!user) {
        console.warn('[maintenanceSchedule.getAll] No authenticated user. Returning empty array.');
        return res.json([]);
      }
      
      const role = String(user.role || '').toLowerCase();
      const isSuperAdmin = ['superadmin', 'super_admin', 'root'].includes(role);
      if (!isSuperAdmin) {
        const rawCompanyName = String(user.companyName || user.company || '').trim();
        const companyName = rawCompanyName.toLowerCase();
        if (!companyName) {
          console.warn('[maintenanceSchedule.getAll] Regular user has no companyName. Returning empty array.');
          return res.json([]);
        }
        const companyUserIds = await getCompanyUserIds(rawCompanyName);
        schedules = schedules.filter((s) => {
          const scheduleUserId = String(s.userId || '');
          const scheduleCompany = String(s.company || s.companyName || '').toLowerCase().trim();
          if (scheduleCompany && scheduleCompany !== companyName) return false;
          return companyUserIds.includes(scheduleUserId) || scheduleCompany === companyName;
        });
      }
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

  async getForTechnician(req, res) {
    try {
      const rawParam = String(req.params.id || '').trim();
      const user = req.user || {};
      const fallbackUserId = String(user.userId || user.id || user._id || '').trim();
      const technicianUserId = (!rawParam || rawParam === 'me' || rawParam === 'undefined' || rawParam === 'null')
        ? fallbackUserId
        : rawParam;
      if (!technicianUserId) {
        return res.json([]);
      }
      const rawCompanyName = String(user.companyName || user.company || '').trim();
      const companyName = rawCompanyName.toLowerCase();
      const companyUserIds = rawCompanyName ? await getCompanyUserIds(rawCompanyName) : [];
      const userEmail = String(user.email || '').toLowerCase().trim();
      const userName = String(user.name || user.fullName || user.userName || '').toLowerCase().trim();
      const techModel = require('../internalTechnician/internalTechnician.model');
      // Find the internal technician record for this user
      let techs = await techModel.findAll({ userId: technicianUserId });
      let techId = techs && techs.length > 0 ? (techs[0].id || techs[0]._id) : null;
      if (!techId && userEmail) {
        try {
          techs = await techModel.findAll({ email: userEmail });
          techId = techs && techs.length > 0 ? (techs[0].id || techs[0]._id) : null;
        } catch (err) {
          // ignore
        }
      }
      if (!techId) {
        try {
          const mongoose = require('mongoose');
          const { ObjectId } = require('mongodb');
          const col = mongoose.connection?.db?.collection('InternalTechnician');
          if (col) {
            const idValue = /^[a-fA-F0-9]{24}$/.test(technicianUserId) ? new ObjectId(technicianUserId) : technicianUserId;
            const rawTech = await col.findOne({
              $or: [
                { userId: idValue },
                { userId: String(technicianUserId) },
                ...(userEmail ? [{ email: userEmail }] : []),
              ],
            });
            techId = rawTech ? String(rawTech._id || rawTech.id) : null;
          }
        } catch (err) {
          // ignore
        }
      }

      const allSchedules = await model.findAll();

      const matchesCompany = (s) => {
        if (!companyName) return true;
        const scheduleCompany = String(s.company || s.companyName || '').toLowerCase().trim();
        if (scheduleCompany) return scheduleCompany === companyName;
        const scheduleUserId = String(s.userId || '');
        return companyUserIds.includes(scheduleUserId);
      };

      const collectIdentityValues = (value) => {
        if (!value) return [];
        if (Array.isArray(value)) {
          return value.flatMap((entry) => collectIdentityValues(entry));
        }
        if (typeof value === 'object') {
          return [
            value.id,
            value._id,
            value.userId,
            value.email,
            value.name,
            value.fullName,
            value.userName,
          ].filter(Boolean);
        }
        return [value];
      };

      const matchesTechIdentity = (value) => {
        const values = collectIdentityValues(value);
        return values.some((entry) => {
          if (!entry) return false;
          const asString = String(entry);
          if (String(technicianUserId) === asString) return true;
          if (techId && String(techId) === asString) return true;
          return false;
        });
      };

      const matchesTechString = (value) => {
        const values = collectIdentityValues(value);
        return values.some((entry) => {
          if (!entry) return false;
          const asString = String(entry).toLowerCase().trim();
          if (userEmail && asString === userEmail) return true;
          if (userName && asString === userName) return true;
          return false;
        });
      };

      const matchesAssigneeLabel = (s) => {
        const fields = [
          s.assignedToName,
          s.technicianName,
          s.assigneeName,
          s.assignedToEmail,
          s.assigneeEmail,
          s.assignedTo,
        ]
          .filter(Boolean)
          .map((value) => String(value).toLowerCase().trim());
        if (userEmail && fields.includes(userEmail)) return true;
        if (userName && fields.includes(userName)) return true;
        return false;
      };

      const filtered = allSchedules.filter(s => {
        if (!s) return false;
        if (!matchesCompany(s)) return false;
        const userIdMatches = [
          s.userId,
          s.assignedTo,
          s.technicianUserId,
          s.createdBy,
        ].some((value) => matchesTechIdentity(value));
        if (userIdMatches) {
          return true;
        }

        if (Array.isArray(s.assignees) && s.assignees.some((entry) => {
          const entryId = entry?.id || entry?._id || entry?.userId || entry?.value || entry;
          return matchesTechIdentity(entryId) || matchesTechString(entry);
        })) {
          return true;
        }

        if (Array.isArray(s.assetsRows) && s.assetsRows.some((row) => {
          const rowAssignee = row?.assignee || row?.assignedTo || row?.technicianId || row?.userId;
          return matchesTechIdentity(rowAssignee) || matchesTechString(rowAssignee);
        })) {
          return true;
        }
        if (matchesAssigneeLabel(s)) {
          return true;
        }

        // Match by technicianId
        const sTechId = s.technicianId ? String(s.technicianId) : null;
        if (techId && sTechId === String(techId)) {
          return true;
        }

        // Match in employees string (comma-separated IDs)
        if (s.employees) {
          const ids = String(s.employees).split(',').map(x => x.trim()).filter(Boolean);
          if ((techId && ids.includes(String(techId))) || ids.includes(String(technicianUserId)) || (userEmail && ids.includes(userEmail))) {
            return true;
          }
        }

        return false;
      });

      res.json(normalizeExtendedJSON(filtered));
    } catch (err) {
      console.error('[maintenanceSchedule.controller.js:getForTechnician]', err);
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
      if (typeof data.assetsRows === 'string') {
        try {
          data.assetsRows = JSON.parse(data.assetsRows);
        } catch (err) {
          // keep original value if parsing fails
        }
      }
      normalizeScheduleAssignments(data);
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
