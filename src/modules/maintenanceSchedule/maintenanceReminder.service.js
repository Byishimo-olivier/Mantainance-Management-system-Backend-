const nodeCron = require('node-cron');
const mongoose = require('mongoose');
const { PrismaClient } = require('@prisma/client');
const maintenanceScheduleModel = require('./maintenanceSchedule.model');
const emailService = require('../emailService/email.service');
const User = require('../user/user.model');

const prisma = new PrismaClient();

class MaintenanceReminderService {
  constructor() {
    this.started = false;
    this.running = false;
  }

  start() {
    if (this.started) {
      console.log('[PM Reminder] Scheduler already started');
      return;
    }

    nodeCron.schedule('*/5 * * * *', async () => {
      if (this.running) return;
      this.running = true;
      try {
        await this.processDueReminders();
      } catch (error) {
        console.error('[PM Reminder] Scheduled run failed:', error);
      } finally {
        this.running = false;
      }
    });

    this.started = true;
    console.log('[PM Reminder] Scheduler initialized - checking every 5 minutes');
  }

  async processDueReminders() {
    const schedules = await maintenanceScheduleModel.findAll();
    const now = new Date();

    for (const schedule of schedules || []) {
      try {
        if (!this.isEligibleSchedule(schedule)) continue;

        const reminderInfo = this.getReminderWindow(schedule, now);
        if (!reminderInfo.shouldSend) continue;

        const recipients = await this.resolveRecipients(schedule);
        if (recipients.length === 0) continue;

        await emailService.sendMaintenanceReminder(
          {
            ...schedule,
            nextDate: reminderInfo.occurrenceAt.toISOString(),
            reminderLeadMinutes: reminderInfo.leadMinutes,
          },
          recipients.map((recipient) => recipient.email)
        );

        await maintenanceScheduleModel.update(schedule.id || schedule._id, {
          lastReminder: now,
          lastReminderOccurrence: reminderInfo.occurrenceAt.toISOString(),
          reminderLeadMinutes: reminderInfo.leadMinutes,
        });

        console.log(
          `[PM Reminder] Sent reminder for schedule ${schedule.id || schedule._id} to ${recipients
            .map((recipient) => recipient.email)
            .join(', ')}`
        );
      } catch (error) {
        console.error(`[PM Reminder] Failed schedule ${schedule?.id || schedule?._id}:`, error);
      }
    }
  }

  isEligibleSchedule(schedule) {
    if (!schedule) return false;
    const status = String(schedule.status || '').toLowerCase();
    if (status.includes('complete') || status.includes('archived')) return false;
    if (schedule.paused || schedule.archived) return false;
    if (!schedule.calendarRule && !schedule.nextDate) return false;
    return true;
  }

  getReminderWindow(schedule, now) {
    const leadMinutes = Number(schedule.reminderLeadMinutes || 60);
    const occurrenceAt = this.getNextOccurrence(schedule, now);
    if (!occurrenceAt) {
      return { shouldSend: false, leadMinutes, occurrenceAt: null };
    }

    const reminderAt = new Date(occurrenceAt.getTime() - leadMinutes * 60000);
    const lastReminder = schedule.lastReminder ? new Date(schedule.lastReminder) : null;
    const lastReminderOccurrence = schedule.lastReminderOccurrence ? new Date(schedule.lastReminderOccurrence) : null;
    const windowEnd = new Date(reminderAt.getTime() + 5 * 60000);

    const alreadySentForOccurrence = lastReminderOccurrence
      && lastReminderOccurrence.getTime() === occurrenceAt.getTime()
      && lastReminder
      && lastReminder >= reminderAt;

    return {
      shouldSend: now >= reminderAt && now <= windowEnd && !alreadySentForOccurrence,
      leadMinutes,
      occurrenceAt,
    };
  }

  getNextOccurrence(schedule, now) {
    if (schedule.calendarRule) {
      return this.getNextCalendarOccurrence(schedule, now);
    }

    if (schedule.nextDate) {
      const nextDate = new Date(schedule.nextDate);
      return Number.isNaN(nextDate.getTime()) ? null : nextDate;
    }

    return null;
  }

  getNextCalendarOccurrence(schedule, now) {
    const rule = schedule.calendarRule || {};
    const every = Math.max(1, Number(rule.every) || 1);
    const unit = String(rule.unit || 'day').toLowerCase();
    const offsetMinutes = this.parseTimezoneOffsetMinutes(schedule.timezone || schedule.assetsRows?.[0]?.timezone);
    const baseDate = this.getBaseLocalDate(schedule, offsetMinutes);
    const timeString = String(rule.time || '09:00');
    const [hoursRaw, minutesRaw] = timeString.split(':');
    const hours = Number(hoursRaw) || 0;
    const minutes = Number(minutesRaw) || 0;
    const nowLocal = this.toOffsetDate(now, offsetMinutes);
    let candidateLocal = new Date(Date.UTC(
      baseDate.getUTCFullYear(),
      baseDate.getUTCMonth(),
      baseDate.getUTCDate(),
      hours,
      minutes,
      0,
      0
    ));

    let guard = 0;
    while (candidateLocal.getTime() - offsetMinutes * 60000 < now.getTime() && guard < 1000) {
      if (unit.startsWith('week')) {
        candidateLocal.setUTCDate(candidateLocal.getUTCDate() + 7 * every);
      } else if (unit.startsWith('month')) {
        candidateLocal.setUTCMonth(candidateLocal.getUTCMonth() + every);
      } else {
        candidateLocal.setUTCDate(candidateLocal.getUTCDate() + every);
      }
      guard += 1;
    }

    if (guard >= 1000) {
      console.warn('[PM Reminder] Could not resolve next calendar occurrence safely', schedule.id || schedule._id);
      return null;
    }

    const occurrenceUtc = new Date(candidateLocal.getTime() - offsetMinutes * 60000);
    if (Number.isNaN(occurrenceUtc.getTime())) return null;

    if (occurrenceUtc < now && nowLocal.getUTCDate() === candidateLocal.getUTCDate()) {
      return occurrenceUtc;
    }

    return occurrenceUtc;
  }

  getBaseLocalDate(schedule, offsetMinutes) {
    const rawStart =
      schedule?.assetsRows?.find((row) => row?.startDate)?.startDate ||
      schedule?.date ||
      schedule?.nextDate ||
      schedule?.createdAt ||
      new Date().toISOString();

    if (typeof rawStart === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(rawStart)) {
      const [year, month, day] = rawStart.split('-').map(Number);
      return new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
    }

    const sourceDate = new Date(rawStart);
    if (Number.isNaN(sourceDate.getTime())) {
      const nowLocal = this.toOffsetDate(new Date(), offsetMinutes);
      return new Date(Date.UTC(nowLocal.getUTCFullYear(), nowLocal.getUTCMonth(), nowLocal.getUTCDate(), 0, 0, 0, 0));
    }

    const localDate = this.toOffsetDate(sourceDate, offsetMinutes);
    return new Date(Date.UTC(localDate.getUTCFullYear(), localDate.getUTCMonth(), localDate.getUTCDate(), 0, 0, 0, 0));
  }

  toOffsetDate(date, offsetMinutes) {
    return new Date(date.getTime() + offsetMinutes * 60000);
  }

  parseTimezoneOffsetMinutes(timezoneLabel) {
    const match = String(timezoneLabel || '').match(/UTC([+-]\d{2}):(\d{2})/i);
    if (!match) return 0;
    const sign = match[1].startsWith('-') ? -1 : 1;
    const hours = Math.abs(Number(match[1]));
    const minutes = Number(match[2]) || 0;
    return sign * (hours * 60 + minutes);
  }

  async resolveRecipients(schedule) {
    const ids = new Set();

    (schedule.assetsRows || []).forEach((row) => {
      if (row?.assignee) ids.add(String(row.assignee));
    });

    if (schedule.assignedTo) ids.add(String(schedule.assignedTo));
    if (schedule.technicianId) ids.add(String(schedule.technicianId));

    if (schedule.employees) {
      String(schedule.employees)
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean)
        .forEach((value) => ids.add(value));
    }

    const resolved = [];
    for (const id of ids) {
      const person = await this.resolvePersonById(id);
      if (person?.email) resolved.push(person);
    }

    const deduped = new Map();
    resolved.forEach((person) => {
      const key = String(person.email || '').toLowerCase();
      if (key && !deduped.has(key)) deduped.set(key, person);
    });
    return Array.from(deduped.values());
  }

  async resolvePersonById(id) {
    if (!id) return null;

    if (mongoose.Types.ObjectId.isValid(id)) {
      const user = await User.findById(id).select('name email');
      if (user?.email) return { id: String(user._id), name: user.name, email: user.email };

      const internalCollection = mongoose.connection?.db?.collection('InternalTechnician');
      if (internalCollection) {
        const internalTech = await internalCollection.findOne({ _id: new mongoose.Types.ObjectId(id) });
        if (internalTech?.email) {
          return { id: String(internalTech._id), name: internalTech.name, email: internalTech.email };
        }
      }
    }

    try {
      const technician = await prisma.technician.findUnique({
        where: { id },
        select: { id: true, name: true, email: true },
      });
      if (technician?.email) return technician;
    } catch (error) {
      console.warn('[PM Reminder] Technician lookup failed for id', id, error?.message || error);
    }

    return null;
  }
}

module.exports = new MaintenanceReminderService();
