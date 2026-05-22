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
    const normalizedDueDate = dueDate ? new Date(dueDate) : null;
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
      dueDate: normalizedDueDate,
      fixDeadline: normalizedDueDate,
      createdAt: new Date(),
      updatedAt: new Date(),
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
            subject: `Work Order Created: ${issueData.title}`,
            html: `
              <h2>Work Order Created</h2>
              <p>A new work order has been created for the PM schedule: <strong>${schedule.name || 'Preventive Maintenance'}</strong></p>
              <p><strong>Title:</strong> ${issueData.title}</p>
              <p><strong>Due Date:</strong> ${issueData.dueDate ? new Date(issueData.dueDate).toLocaleString() : 'Not set'}</p>
              <p><strong>Priority:</strong> ${issueData.priority}</p>
              <p><strong>Description:</strong> ${issueData.description}</p>
            `,
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
