/**
 * PM Auto Generation Service
 * Handles automatic generation of PM instances and work orders on schedule
 */

const pmRecurrenceService = require('./pmRecurrence.service');
const mongoose = require('mongoose');

/**
 * Auto-generate work order for a PM instance
 */
const generateWorkOrderForPM = async (schedule, pmInstance) => {
  try {
    const db = mongoose.connection.db;
    if (!db) {
      console.warn('[PM Auto Gen] Cannot generate work order: no DB connection');
      return null;
    }

    const issueData = {
      title: `${schedule.workOrderTitle || schedule.name || 'Preventive Maintenance'} - Instance ${pmInstance.instanceNumber || 1}`,
      description: schedule.workOrderDescription || schedule.description || 'Auto-generated preventive maintenance work order',
      location: schedule.location || 'Preventive Maintenance',
      propertyId: schedule.assetsRows?.[0]?.propertyId || null,
      assetId: schedule.assetsRows?.[0]?.assetId || null,
      tags: ['recurring-pm', 'auto-generated'],
      assignees: [],
      time: 'Scheduled',
      userId: schedule.userId || null,
      status: 'PENDING',
      priority: (schedule.priority || 'MEDIUM').toUpperCase(),
      category: schedule.category || 'General',
      scheduleId: schedule.id || schedule._id,
      parentScheduleId: schedule.id || schedule._id, // Reference to the recurring PM
      pmInstanceId: pmInstance.id, // Reference to this PM instance
      dueDate: pmInstance.dueDate || schedule.nextDate,
      createdAt: new Date(),
      createdBySchedule: true,
      companyName: schedule.companyName || schedule.company || null,
    };

    // Add assignees if available
    if (schedule.assignedTo || schedule.technicianUserId) {
      issueData.assignees = [
        {
          id: schedule.assignedTo || schedule.technicianUserId,
          name: schedule.assignedToName || schedule.technicianName || 'Assigned',
        },
      ];
    }

    const result = await db.collection('Issue').insertOne(issueData);
    console.log('[PM Auto Gen] Work order created:', result.insertedId.toString());
    return result.insertedId;
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

    const pmInstanceData = {
      parentScheduleId: schedule.id || schedule._id,
      scheduleId: schedule.id || schedule._id,
      instanceNumber: instanceNumber || 1,
      dueDate: nextInstanceDate,
      status: 'Pending',
      workOrderId: null,
      createdAt: new Date(),
      createdBySchedule: true,
    };

    const result = await db.collection('PMInstance').insertOne(pmInstanceData);
    return {
      id: result.insertedId,
      instanceNumber,
      dueDate: nextInstanceDate,
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
        'calendarRule.recurrenceType': { $in: ['daily', 'weekly', 'monthly'] },
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
