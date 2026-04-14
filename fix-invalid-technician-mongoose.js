const mongoose = require('mongoose');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/mms', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
}).then(async () => {
  try {
    console.log('Cleaning up invalid technician IDs in maintenance schedules...\n');
    
    // Check Mongoose collection for N/A values
    console.log('Checking Mongoose MaintenanceSchedule collection...');
    const mongoSchedules = mongoose.connection?.db?.collection('MaintenanceSchedule');
    
    if (mongoSchedules) {
      const result1 = await mongoSchedules.updateMany(
        {
          $or: [
            { technician: 'N/A' },
            { technician: '' },
            { assignedTo: 'N/A' },
            { assignedTo: '' }
          ]
        },
        { 
          $set: { 
            technician: null,
            assignedTo: null 
          } 
        }
      );
      console.log(`✓ Updated ${result1.modifiedCount} Mongoose records`);
    }
    
    // Fix Prisma - find schedules with invalid IDs
    console.log('\nChecking Prisma MaintenanceSchedule collection...');
    const allSchedules = await prisma.maintenanceSchedule.findMany({
      select: { id: true, name: true, technicianId: true },
      take: 200
    });
    
    const invalidIds = [];
    for (const schedule of allSchedules) {
      if (schedule.technicianId && 
          !/^[0-9a-f]{24}$/i.test(schedule.technicianId)) {
        console.log(`  ❌ Invalid: "${schedule.technicianId}" in ${schedule.name}`);
        invalidIds.push(schedule.id);
      }
    }
    
    if (invalidIds.length > 0) {
      for (const scheduleId of invalidIds) {
        await prisma.maintenanceSchedule.update({
          where: { id: scheduleId },
          data: { technicianId: null }
        });
      }
      console.log(`✓ Fixed ${invalidIds.length} Prisma records`);
    } else {
      console.log('✓ No invalid Prisma records found');
    }
    
    console.log('\n✅ Cleanup completed!');
    
  } catch (e) {
    console.error('Error:', e.message);
  } finally {
    await mongoose.connection.close();
    await prisma.$disconnect();
  }
})
.catch(err => {
  console.error('MongoDB connection error:', err.message);
  process.exit(1);
});
