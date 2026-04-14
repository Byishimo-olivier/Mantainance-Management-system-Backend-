const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

(async () => {
  try {
    console.log('Checking maintenance schedules for invalid technician IDs...\n');
    
    // Get all schedules and check technicianId manually
    const allSchedules = await prisma.maintenanceSchedule.findMany({
      select: { id: true, name: true, technicianId: true },
      take: 100
    });
    
    const invalidIds = [];
    for (const schedule of allSchedules) {
      if (schedule.technicianId && schedule.technicianId !== '' && 
          schedule.technicianId.length !== 24) { // Valid MongoDB ObjectIDs are 24 hex chars
        console.log(`❌ Invalid technicianId: "${schedule.technicianId}" in schedule: ${schedule.name}`);
        invalidIds.push(schedule.id);
      }
    }
    
    if (invalidIds.length > 0) {
      console.log(`\nFound ${invalidIds.length} schedules with invalid technician IDs`);
      
      // Fix them by setting to null
      for (const scheduleId of invalidIds) {
        await prisma.maintenanceSchedule.update({
          where: { id: scheduleId },
          data: { technicianId: null }
        });
      }
      console.log(`✓ Fixed ${invalidIds.length} schedules - set technicianId to null`);
    } else {
      console.log('✓ No invalid technician IDs found - all records are valid!');
    }
    
  } catch (e) {
    console.error('Error:', e.message);
  } finally {
    await prisma.$disconnect();
  }
})();
