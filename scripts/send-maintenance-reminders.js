const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const emailService = require('../src/modules/emailService/email.service');

// Run reminders: find routine schedules with nextDate <= now + window and send reminders
(async function run() {
  try {
    const now = new Date();
    const windowMs = 24 * 60 * 60 * 1000; // 24 hours ahead
    const cutoff = new Date(now.getTime() + windowMs);

    console.log('[reminders] Searching for routine schedules with nextDate <=', cutoff.toISOString());

    const schedules = await prisma.maintenanceSchedule.findMany({
      where: {
        routine: true,
        nextDate: { lte: cutoff }
      }
    });

    console.log('[reminders] Found', schedules.length, 'schedules');

    for (const s of schedules) {
      try {
        // Build recipient list: include business email and any employee emails
        const recipients = [];
        if (s.email) recipients.push(s.email);
        if (s.employees) {
          const ids = typeof s.employees === 'string' ? s.employees.split(',').map(x => x.trim()).filter(Boolean) : Array.isArray(s.employees) ? s.employees : [];
          for (const id of ids) {
            try {
              const tech = await prisma.internalTechnician.findUnique({ where: { id } });
              if (tech && tech.email) recipients.push(tech.email);
            } catch (e) {
              // ignore lookup errors
            }
          }
        }

        // Deduplicate recipients
        const uniqRecipients = [...new Set(recipients)];

        await emailService.sendMaintenanceReminder(s, uniqRecipients);

        // Update lastReminder timestamp
        await prisma.maintenanceSchedule.update({ where: { id: s.id }, data: { lastReminder: new Date() } });

        // create reminder log
        try {
          await prisma.maintenanceReminderLog.create({ data: { scheduleId: s.id, recipients: uniqRecipients, method: 'script', sentAt: new Date() } });
        } catch (logErr) {
          console.error('[reminders] Failed to write reminder log for', s.id, logErr);
        }

        // If nextDate is in the past or equal to now, advance nextDate according to frequency
        const now2 = new Date();
        if (s.nextDate && new Date(s.nextDate) <= now2) {
          let next = new Date(s.nextDate);
          const interval = s.interval || 1;
          const freq = (s.frequency || '').toLowerCase();
          if (freq === 'daily') {
            next.setDate(next.getDate() + interval);
          } else if (freq === 'weekly') {
            next.setDate(next.getDate() + (7 * interval));
          } else if (freq === 'monthly') {
            next.setMonth(next.getMonth() + interval);
          } else {
            // fallback: advance by one day
            next.setDate(next.getDate() + interval);
          }
          await prisma.maintenanceSchedule.update({ where: { id: s.id }, data: { nextDate: next } });
          console.log(`[reminders] Advanced nextDate for schedule ${s.id} to ${next.toISOString()}`);
        }
      } catch (err) {
        console.error('Error processing schedule reminder for', s.id, err);
      }
    }

    console.log('[reminders] Done');
    process.exit(0);
  } catch (err) {
    console.error('[reminders] Failed', err);
    process.exit(1);
  }
})();
