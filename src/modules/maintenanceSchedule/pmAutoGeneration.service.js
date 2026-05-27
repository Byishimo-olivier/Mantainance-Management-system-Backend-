/**
 * PM Auto Generation Service
 * Handles automatic generation of PM instances and work orders on schedule
 */

const pmRecurrenceService = require('./pmRecurrence.service');
const mongoose = require('mongoose');

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const sameMoment = (left, right) => {
  const leftTime = left instanceof Date ? left.getTime() : new Date(left).getTime();
  const rightTime = right instanceof Date ? right.getTime() : new Date(right).getTime();
  return Number.isFinite(leftTime) && Number.isFinite(rightTime) && leftTime === rightTime;
};

const occurrenceDateKey = (value) => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return new Date().toISOString().slice(0, 10);
  return date.toISOString().slice(0, 10);
};

const dayRange = (value) => {
  const date = value instanceof Date ? new Date(value) : new Date(value);
  if (Number.isNaN(date.getTime())) {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    return { start: now, end: new Date(now.getTime() + 86400000) };
  }
  date.setHours(0, 0, 0, 0);
  return { start: date, end: new Date(date.getTime() + 86400000) };
};

const addDays = (date, days) => new Date(date.getTime() + days * 86400000);

const escapeHtml = (value) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const formatEmailDate = (value, options = {}) => {
  if (!value) return 'N/A';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return 'N/A';
  return date.toLocaleString('en-US', options);
};

const formatDisplayText = (value, fallback = 'N/A') => {
  const text = String(value || fallback).trim();
  if (!text) return fallback;
  return text
    .toLowerCase()
    .split(/([\s_-]+)/)
    .map((part) => (/^[a-z]/.test(part) ? part.charAt(0).toUpperCase() + part.slice(1) : part))
    .join('');
};

const buildTriggeredWorkOrderEmail = ({ issueData, schedule, notifyUser, workOrderId }) => {
  const frontendUrl = (process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/+$/, '');
  const workOrderUrl = `${frontendUrl}/manager-dashboard?tab=manage-issue&id=${encodeURIComponent(workOrderId || '')}`;
  const title = issueData.title || schedule?.name || 'Preventive Maintenance';
  const createdBy = schedule?.createdByName || schedule?.userName || schedule?.ownerName || schedule?.createdBy || 'Fixnest';
  const location = issueData.location || schedule?.location || schedule?.propertyName || schedule?.branchLocation || 'N/A';
  const workOrderNumber = workOrderId ? `#${String(workOrderId).slice(-6).toUpperCase()}` : 'N/A';
  const status = formatDisplayText(issueData.status || 'Open');
  const priority = formatDisplayText(issueData.priority || 'Medium');
  const duration = issueData.estimatedTime || issueData.durationHours || issueData.duration;
  const time = duration ? `${duration} hours` : 'N/A';

  return `
    <div style="margin:0;padding:0;background:#111111;color:#d1d5db;font-family:Arial,Helvetica,sans-serif;">
      <div style="max-width:620px;margin:0 auto;background:#171717;padding:28px 22px;">
        <div style="text-align:center;padding:26px 0 22px;">
          <div style="font-size:28px;font-weight:800;color:#ef4444;letter-spacing:.2px;">Fixnest</div>
        </div>

        <div style="border:1px solid #9ca3af;">
          <div style="padding:28px 24px;border-bottom:1px solid #9ca3af;">
            <p style="margin:0 0 20px;font-size:18px;line-height:1.5;color:#9ca3af;">Hey ${escapeHtml(notifyUser?.name || 'there')},</p>
            <p style="margin:0 0 20px;font-size:18px;line-height:1.45;color:#9ca3af;">
              <strong style="color:#c7c7c7;">${escapeHtml(title)}</strong><br/>
              was Created!
            </p>
            <p style="margin:0;font-size:18px;line-height:1.45;color:#9ca3af;">
              You are being notified because this preventive maintenance work order was triggered by Fixnest.
            </p>
          </div>

          <div style="padding:22px 18px;border-bottom:1px solid #9ca3af;">
            <h2 style="margin:0 0 26px;font-size:26px;line-height:1.25;font-weight:400;color:#bdbdbd;">${escapeHtml(title)}</h2>
            <p style="margin:0 0 28px;font-size:18px;line-height:1.45;color:#bdbdbd;">${escapeHtml(issueData.description || schedule?.description || 'No description provided.')}</p>
            <div style="font-size:20px;font-weight:700;color:#ef4444;">${escapeHtml(status)}</div>
          </div>

          <div style="padding:28px 18px;">
            <div style="margin-bottom:22px;">
              <div style="font-size:16px;color:#8b8b8b;">Work Order #</div>
              <div style="font-size:17px;color:#f3f4f6;font-weight:700;">${escapeHtml(workOrderNumber)}</div>
            </div>
            <div style="margin-bottom:22px;">
              <div style="font-size:16px;color:#8b8b8b;">Created by</div>
              <div style="font-size:17px;color:#f3f4f6;">${escapeHtml(createdBy)}</div>
            </div>
            <div style="margin-bottom:22px;">
              <div style="font-size:16px;color:#8b8b8b;">Created On</div>
              <div style="font-size:17px;color:#f3f4f6;">${escapeHtml(formatEmailDate(issueData.createdAt, { month: '2-digit', day: '2-digit', year: 'numeric' }))}</div>
            </div>
            <div style="margin-bottom:42px;">
              <div style="font-size:16px;color:#8b8b8b;">Location</div>
              <div style="font-size:17px;color:#f3f4f6;">${escapeHtml(location)}</div>
            </div>
            <div style="margin-bottom:22px;">
              <div style="font-size:16px;color:#8b8b8b;">Due Date</div>
              <div style="font-size:17px;color:#f3f4f6;">${escapeHtml(formatEmailDate(issueData.dueDate))}</div>
            </div>
            <div style="margin-bottom:22px;">
              <div style="font-size:16px;color:#8b8b8b;">Priority</div>
              <div style="font-size:17px;color:#fbbf24;">${escapeHtml(priority)}</div>
            </div>
            <div style="margin-bottom:22px;">
              <div style="font-size:16px;color:#8b8b8b;">Last Updated</div>
              <div style="font-size:17px;color:#f3f4f6;">${escapeHtml(formatEmailDate(issueData.updatedAt, { month: '2-digit', day: '2-digit', year: 'numeric' }))}</div>
            </div>
            <div>
              <div style="font-size:16px;color:#8b8b8b;">Time</div>
              <div style="font-size:17px;color:#f3f4f6;">${escapeHtml(time)}</div>
            </div>
          </div>

          <div style="padding:36px 18px;text-align:center;border-top:1px solid #9ca3af;">
            <a href="${workOrderUrl}" style="display:inline-block;min-width:320px;max-width:90%;background:#dc2626;color:#ffffff;text-decoration:none;font-size:22px;border-radius:36px;padding:18px 28px;">View Work Order</a>
          </div>
        </div>

        <div style="padding:28px 8px 4px;text-align:center;">
          <p style="margin:0 0 18px;font-size:16px;line-height:1.55;color:#d1d5db;">Have a question or need help? Fixnest support is here for you.</p>
          <p style="margin:0 0 22px;font-size:16px;"><a href="${frontendUrl}" style="color:#ef4444;text-decoration:none;">Use Web App</a></p>
          <p style="margin:0;font-size:14px;color:#8b8b8b;">&copy; ${new Date().getFullYear()} Fixnest.</p>
        </div>
      </div>
    </div>
  `;
};

const buildTriggeredWorkOrderSubject = (issueData, schedule) => (
  `Triggered Work Order: ${issueData.title || schedule?.name || 'Preventive Maintenance'}`
);

const addRecipient = (recipients, value, fallbackName = '') => {
  if (!value && value !== 0) return;
  if (Array.isArray(value)) {
    value.forEach((entry) => addRecipient(recipients, entry, fallbackName));
    return;
  }

  if (typeof value === 'object') {
    const email = String(value.email || value.mail || '').trim();
    const id = String(value.id || value._id || value.userId || value.value || '').trim();
    const name = String(value.name || value.fullName || value.label || fallbackName || '').trim();
    if (email && EMAIL_REGEX.test(email)) {
      recipients.set(email.toLowerCase(), { email, id, name });
    }
    return;
  }

  const raw = String(value).trim();
  if (EMAIL_REGEX.test(raw)) {
    recipients.set(raw.toLowerCase(), { email: raw, id: '', name: fallbackName || raw });
  }
};

const resolvePersonById = async (db, id) => {
  const raw = String(id || '').trim();
  if (!raw || raw === 'N/A') return null;
  if (EMAIL_REGEX.test(raw)) return { email: raw, id: '', name: raw };

  const candidates = [];
  const isObjectId = /^[a-fA-F0-9]{24}$/.test(raw);
  if (isObjectId) {
    try {
      const { ObjectId } = require('mongodb');
      candidates.push(new ObjectId(raw));
    } catch (error) {
      // keep string-only lookup
    }
  }
  candidates.push(raw);

  const collections = ['User', 'users', 'InternalTechnician', 'internaltechnicians', 'Technician', 'technicians'];
  for (const collectionName of collections) {
    const collection = db.collection(collectionName);
    for (const candidate of candidates) {
      const person = await collection.findOne({
        $or: [
          { _id: candidate },
          { id: raw },
          { userId: raw },
          { email: raw },
        ],
      });
      if (person?.email) {
        return {
          id: String(person._id || person.id || person.userId || raw),
          name: person.name || person.fullName || person.email,
          email: person.email,
        };
      }
    }
  }

  return null;
};

const resolveWorkOrderNotificationRecipients = async (db, schedule) => {
  const recipients = new Map();
  const ids = new Set();
  const collectId = (value) => {
    if (!value && value !== 0) return;
    if (Array.isArray(value)) {
      value.forEach(collectId);
      return;
    }
    if (typeof value === 'object') {
      addRecipient(recipients, value);
      const id = value.id || value._id || value.userId || value.value;
      if (id) ids.add(String(id).trim());
      return;
    }
    const raw = String(value).trim();
    if (!raw) return;
    if (EMAIL_REGEX.test(raw)) addRecipient(recipients, raw);
    else ids.add(raw);
  };

  addRecipient(recipients, schedule.woNotifyUsers);
  addRecipient(recipients, schedule.assignedToEmail, schedule.assignedToName);
  addRecipient(recipients, schedule.technicianEmail, schedule.technicianName);
  addRecipient(recipients, schedule.email);
  addRecipient(recipients, schedule.assignees);
  addRecipient(recipients, schedule.woAssignees);

  collectId(schedule.woNotifyUsers);
  collectId(schedule.assignees);
  collectId(schedule.woAssignees);
  collectId(schedule.assignedTo);
  collectId(schedule.technicianUserId);
  collectId(schedule.technicianId);

  if (schedule.employees) {
    String(schedule.employees)
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean)
      .forEach(collectId);
  }

  (schedule.assetsRows || []).forEach((row) => {
    addRecipient(recipients, row?.assigneeEmail || row?.assignedToEmail || row?.technicianEmail || row?.email, row?.assigneeName || row?.assignedToName);
    collectId(row?.assignee || row?.assignedTo || row?.technicianId || row?.userId);
  });

  for (const id of ids) {
    const person = await resolvePersonById(db, id);
    addRecipient(recipients, person);
  }

  return Array.from(recipients.values());
};

/**
 * Auto-generate work order for a PM instance
 */
const generateWorkOrderForPM = async (schedule, pmInstance, sendNotification = true) => {
  try {
    const db = mongoose.connection.db;
    if (!db) {
      console.warn('[PM Auto Gen] Cannot generate work order: no DB connection');
      return null;
    }

    // Check if auto-generation is enabled
    if (schedule.autoGenerateWorkOrders === false) {
      console.log('[PM Auto Gen] Auto-generation disabled for schedule:', schedule._id);
      return null;
    }

    const scheduleId = schedule.id || schedule._id;
    const scheduleKey = String(scheduleId);
    const dueDate = pmInstance.dueDate || schedule.nextDate;
    const workOrderCreatedAt = new Date();
    const workOrderDueDate = addDays(workOrderCreatedAt, 1);
    const { start: dueStart, end: dueEnd } = dayRange(dueDate);
    const pmOccurrenceKey = `${scheduleKey}:${occurrenceDateKey(dueDate)}`;
    await db.collection('Issue').createIndex(
      { pmOccurrenceKey: 1 },
      { unique: true, sparse: true, name: 'unique_pm_work_order_occurrence' }
    ).catch((indexError) => {
      console.warn('[PM Auto Gen] Could not ensure PM work order occurrence index:', indexError.message);
    });
    const scheduleMatch = [
        { parentScheduleId: scheduleId },
        { parentScheduleId: scheduleKey },
        { maintenanceScheduleId: scheduleId },
        { maintenanceScheduleId: scheduleKey },
        { scheduleId },
        { scheduleId: scheduleKey },
    ];
    const occurrenceNumber = Number(pmInstance.instanceNumber || schedule.occurrenceCount || 1);
    const existingConditions = [
      {
        $or: scheduleMatch,
        createdBySchedule: true,
        dueDate: { $gte: dueStart, $lt: dueEnd },
      },
      { pmOccurrenceKey },
    ];
    if (pmInstance.id) {
      existingConditions.push({
        $or: scheduleMatch,
        pmInstanceId: pmInstance.id,
      });
      existingConditions.push({
        $or: scheduleMatch,
        pmInstanceId: String(pmInstance.id),
      });
    }
    if (occurrenceNumber <= 1) {
      existingConditions.push({
        $or: scheduleMatch,
        dueDate: { $exists: false },
      });
    }

    const existingIssue = await db.collection('Issue').findOne({
      $or: existingConditions,
    });
    if (existingIssue) {
      console.log('[PM Auto Gen] Work order already exists for schedule/due date:', scheduleId);
      return existingIssue._id;
    }

    const workOrderTitle = schedule.workOrderTitle || schedule.name || 'Preventive Maintenance';
    const issueData = {
      title: workOrderTitle,
      description: schedule.workOrderDescription || schedule.description || 'Auto-generated preventive maintenance work order',
      location: schedule.location || 'Preventive Maintenance',
      propertyId: schedule.assetsRows?.[0]?.propertyId || schedule.assetsRows?.[0]?.locationId || schedule.propertyId || null,
      assetId: schedule.assetsRows?.[0]?.assetId || null,
      tags: ['recurring-pm', 'auto-generated'],
      assignedTo: schedule.assignedTo || schedule.technicianUserId || null,
      assignedToName: schedule.assignedToName || schedule.technicianName || null,
      assignees: Array.isArray(schedule.woAssignees)
        ? schedule.woAssignees
        : (schedule.assignedTo || schedule.technicianUserId ? [{
            id: schedule.assignedTo || schedule.technicianUserId,
            name: schedule.assignedToName || schedule.technicianName || 'Assigned',
          }] : []),
      time: 'Scheduled',
      userId: schedule.userId || null,
      clientId: schedule.clientId || schedule.userId || null,
      requestorId: schedule.requestorId || schedule.userId || null,
      createdBy: schedule.userId || null,
      submissionType: 'inspection',
      issueType: 'preventive',
      isPreventive: true,
      approved: true,
      status: 'OPEN',
      priority: (schedule.priority || 'MEDIUM').toUpperCase(),
      category: schedule.category || 'General',
      scheduleId,
      maintenanceScheduleId: scheduleId,
      parentScheduleId: scheduleId, // Reference to the recurring PM
      pmInstanceId: pmInstance.id, // Reference to this PM instance
      pmInstanceNumber: pmInstance.instanceNumber || 1,
      pmOccurrenceKey,
      pmTrigger: schedule.name || schedule.workOrderTitle || 'Preventive Maintenance',
      preventiveMaintenanceName: schedule.name || schedule.workOrderTitle || 'Preventive Maintenance',
      dueDate: workOrderDueDate,
      fixDeadline: workOrderDueDate,
      createdAt: workOrderCreatedAt,
      updatedAt: workOrderCreatedAt,
      createdBySchedule: true,
      companyName: schedule.companyName || schedule.company || null,
      referenceType: schedule.woReferenceType || 'workOrder',
    };

    // Add assignees if available
    if (schedule.woAssignees && Array.isArray(schedule.woAssignees)) {
      issueData.assignees = schedule.woAssignees;
    } else if (schedule.assignedTo || schedule.technicianUserId) {
      issueData.assignedTo = schedule.assignedTo || schedule.technicianUserId;
      issueData.assignedToName = schedule.assignedToName || schedule.technicianName || 'Assigned';
      issueData.assignees = [
        {
          id: schedule.assignedTo || schedule.technicianUserId,
          name: schedule.assignedToName || schedule.technicianName || 'Assigned',
        },
      ];
    }

    const result = await db.collection('Issue').findOneAndUpdate(
      { pmOccurrenceKey },
      { $setOnInsert: issueData },
      { upsert: true, returnDocument: 'after' }
    );
    const savedIssue = result.value || result || await db.collection('Issue').findOne({ pmOccurrenceKey });
    const workOrderId = String(savedIssue?._id || result.lastErrorObject?.upserted || '');
    console.log('[PM Auto Gen] Work order created:', workOrderId);

    // Send work-order generated notification if enabled.
    if (sendNotification) {
      try {
        const notificationService = require('../notification/notification.service');
        const emailService = require('../emailService/email.service');
        const resolvedRecipients = await resolveWorkOrderNotificationRecipients(db, schedule);
        const recipientMap = new Map(resolvedRecipients.map((entry) => [String(entry.email || '').toLowerCase(), entry]));
        const companyEmails = await emailService.getAdminManagerClientEmails(schedule.companyName || schedule.company);
        companyEmails.forEach((email) => addRecipient(recipientMap, email));
        const recipients = Array.from(recipientMap.values());
        
        if (recipients.length === 0) {
          console.log('[PM Auto Gen] No recipients found for work-order generated email:', scheduleId);
        }

        for (const notifyUser of recipients) {
          if (notifyUser.id) {
            await notificationService.createNotification({
              userId: notifyUser.id,
              type: 'workorder-created',
              title: `Work Order Created: ${issueData.title}`,
              message: `A new work order has been created for PM schedule: ${schedule.name}`,
              relatedItemId: workOrderId,
              relatedItemType: 'WorkOrder',
            });
          }

          await emailService.sendEmail({
            to: notifyUser.email,
            fromName: 'Fixnest',
            subject: buildTriggeredWorkOrderSubject(issueData, schedule),
            html: buildTriggeredWorkOrderEmail({ issueData, schedule, notifyUser, workOrderId }),
          });
        }
      } catch (notificationError) {
        console.warn('[PM Auto Gen] Failed to send notification:', notificationError.message);
      }
    }

    return workOrderId;
  } catch (error) {
    console.error('[PM Auto Gen] Failed to generate work order:', error);
    throw error;
  }
};

/**
 * Create a PM instance (copy) for recurring PM
 */
const createPMInstance = async (schedule, nextInstanceDate, instanceNumber) => {
  try {
    const db = mongoose.connection.db;
    if (!db) {
      throw new Error('No database connection');
    }

    const scheduleId = schedule.id || schedule._id;
    const scheduleKey = String(scheduleId);
    const { start: dueStart, end: dueEnd } = dayRange(nextInstanceDate);
    const pmOccurrenceKey = `${scheduleKey}:${occurrenceDateKey(nextInstanceDate)}`;
    await db.collection('PMInstance').createIndex(
      { pmOccurrenceKey: 1 },
      { unique: true, sparse: true, name: 'unique_pm_instance_occurrence' }
    ).catch((indexError) => {
      console.warn('[PM Auto Gen] Could not ensure PM instance occurrence index:', indexError.message);
    });
    const existingInstance = await db.collection('PMInstance').findOne({
      $or: [
        { pmOccurrenceKey },
        {
          $or: [
            { parentScheduleId: scheduleId },
            { parentScheduleId: scheduleKey },
            { scheduleId },
            { scheduleId: scheduleKey },
          ],
          dueDate: { $gte: dueStart, $lt: dueEnd },
          createdBySchedule: true,
        },
      ],
    });
    if (existingInstance) {
      return {
        id: existingInstance._id,
        instanceNumber: existingInstance.instanceNumber || instanceNumber || 1,
        dueDate: existingInstance.dueDate || nextInstanceDate,
      };
    }

    const pmInstanceData = {
      parentScheduleId: scheduleId,
      scheduleId,
      instanceNumber: instanceNumber || 1,
      dueDate: nextInstanceDate,
      pmOccurrenceKey,
      status: 'Pending',
      workOrderId: null,
      createdAt: new Date(),
      createdBySchedule: true,
    };

    const result = await db.collection('PMInstance').findOneAndUpdate(
      { pmOccurrenceKey },
      { $setOnInsert: pmInstanceData },
      { upsert: true, returnDocument: 'after' }
    );
    const savedInstance = result.value || result || await db.collection('PMInstance').findOne({ pmOccurrenceKey });
    return {
      id: savedInstance?._id || result.lastErrorObject?.upserted,
      instanceNumber: savedInstance?.instanceNumber || instanceNumber || 1,
      dueDate: savedInstance?.dueDate || nextInstanceDate,
    };
  } catch (error) {
    console.error('[PM Auto Gen] Failed to create PM instance:', error);
    throw error;
  }
};

/**
 * Check and auto-generate overdue PM instances and work orders
 */
const processOverduePMInstances = async () => {
  try {
    const db = mongoose.connection.db;
    if (!db) {
      console.warn('[PM Auto Gen Cron] No database connection');
      return [];
    }

    const maintenanceCollection = db.collection('MaintenanceSchedule');
    const createdPMs = [];

    // Find all recurring PMs that are not completed
    const recurringPMs = await maintenanceCollection
      .find({
        routine: true,
        status: { $ne: 'Completed' },
        'calendarRule.recurrenceType': { $in: ['daily', 'weekly', 'monthly', 'yearly'] },
      })
      .toArray();

    console.log(`[PM Auto Gen Cron] Found ${recurringPMs.length} recurring PMs to check`);

    for (const schedule of recurringPMs) {
      try {
        const calendarRule = schedule.calendarRule || {};
        const nextDate = schedule.nextDate ? new Date(schedule.nextDate) : null;
        const now = new Date();

        // Check if it's time to generate
        if (!nextDate || nextDate > now) {
          continue;
        }

        const existingInstance = await maintenanceCollection.db.collection('PMInstance').findOne({
          parentScheduleId: schedule._id,
          dueDate: nextDate,
          createdBySchedule: true,
        });
        if (existingInstance) {
          const nextOccurrence = pmRecurrenceService.calculateNextOccurrence(nextDate, calendarRule);
          await maintenanceCollection.updateOne(
            { _id: schedule._id, nextDate },
            {
              $set: {
                nextDate: nextOccurrence || nextDate,
                lastGeneratedDate: now,
              },
              $max: { occurrenceCount: existingInstance.instanceNumber || (schedule.occurrenceCount || 0) + 1 },
            }
          );
          continue;
        }

        // Check recurrence end conditions
        if (
          calendarRule.recurrenceEndType === 'date' &&
          calendarRule.recurrenceEndDate &&
          now > new Date(calendarRule.recurrenceEndDate)
        ) {
          console.log(
            `[PM Auto Gen] Schedule ${schedule._id} has reached end date, marking as completed`
          );
          await maintenanceCollection.updateOne(
            { _id: schedule._id },
            { $set: { status: 'Completed' } }
          );
          continue;
        }

        if (
          calendarRule.recurrenceEndType === 'occurrences' &&
          calendarRule.recurrenceMaxOccurrences
        ) {
          const occurrenceCount = schedule.occurrenceCount || 0;
          if (occurrenceCount >= Number(calendarRule.recurrenceMaxOccurrences)) {
            console.log(
              `[PM Auto Gen] Schedule ${schedule._id} has reached max occurrences, marking as completed`
            );
            await maintenanceCollection.updateOne(
              { _id: schedule._id },
              { $set: { status: 'Completed' } }
            );
            continue;
          }
        }

        // Create PM instance
        const pmInstance = await createPMInstance(schedule, nextDate, (schedule.occurrenceCount || 0) + 1);

        // Generate work order
        const workOrderId = await generateWorkOrderForPM(schedule, pmInstance);

        // Calculate next occurrence
        const nextOccurrence = pmRecurrenceService.calculateNextOccurrence(nextDate, calendarRule);

        // Update schedule with next date
        const updateData = {
          nextDate: nextOccurrence || nextDate,
          occurrenceCount: (schedule.occurrenceCount || 0) + 1,
          lastGeneratedDate: now,
        };

        await maintenanceCollection.updateOne(
          { _id: schedule._id },
          { $set: updateData }
        );

        createdPMs.push({
          scheduleId: schedule._id,
          pmInstanceId: pmInstance.id,
          workOrderId: workOrderId,
          dueDate: nextDate,
          nextDate: nextOccurrence,
        });

        console.log(
          `[PM Auto Gen] Generated PM instance and work order for schedule ${schedule._id}`
        );
      } catch (scheduleError) {
        console.error(
          `[PM Auto Gen] Error processing schedule ${schedule._id}:`,
          scheduleError
        );
        // Continue with next schedule instead of failing entirely
      }
    }

    return createdPMs;
  } catch (error) {
    console.error('[PM Auto Gen Cron] Error processing overdue PMs:', error);
    throw error;
  }
};

/**
 * Start cron job for auto-generating PMs
 */
const startPMAutoGenerationCron = (cronService) => {
  if (!cronService) {
    console.warn('[PM Auto Gen] Cron service not available');
    return;
  }

  // Run every 5 minutes
  const jobId = cronService.schedule('*/5 * * * *', async () => {
    try {
      console.log('[PM Auto Gen Cron] Running scheduled PM auto-generation check');
      const createdPMs = await processOverduePMInstances();
      console.log(
        `[PM Auto Gen Cron] Completed - Generated ${createdPMs.length} PM instances`
      );
    } catch (error) {
      console.error('[PM Auto Gen Cron] Error in scheduled job:', error);
    }
  });

  return jobId;
};

module.exports = {
  generateWorkOrderForPM,
  createPMInstance,
  processOverduePMInstances,
  startPMAutoGenerationCron,
};
