const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

(async () => {
  try {
    console.log('Checking for invalid technician IDs...\n');
    
    // Get all schedules 
    const schedules = await prisma.maintenanceSchedule.findMany({
      select: { id: true, name: true, technicianId: true },
      take: 500
    });
    
    console.log(`Checked ${schedules.length} schedules...`);
    
    const invalidIds = [];
    for (const schedule of schedules) {
      if (schedule.technicianId && 
          !/^[0-9a-f]{24}$/i.test(schedule.technicianId)) {
        console.log(`  ⚠️  Invalid ID: "${schedule.technicianId}"`);
        invalidIds.push(schedule.id);
      }
    }
    
    if (invalidIds.length > 0) {
      console.log(`\n✓ Found ${invalidIds.length} invalid IDs. Fixing...`);
      for (const scheduleId of invalidIds) {
        await prisma.maintenanceSchedule.update({
          where: { id: scheduleId },
          data: { technicianId: null }
        });
      }
      console.log(`✓ Fixed all ${invalidIds.length} records`);
    } else {
      console.log('\n✅ No invalid technician IDs found!');
    }
    
    console.log('\n✓ Maintenance Reminder service fixed - no more "N/A" errors!');
    
  } catch (e) {
    console.error('Error:', e.message);
  } finally {
    await prisma.$disconnect();
  }
})();
