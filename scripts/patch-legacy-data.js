const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function patch() {
    console.log('🚀 Starting Data Patch for userId field...');

    try {
        // 1. Find a valid user to act as a fallback (the first admin or manager)
        const fallbackUser = await prisma.user.findFirst();

        if (!fallbackUser) {
            console.error('❌ No users found in database. Please create a user first.');
            process.exit(1);
        }

        console.log(`✅ Using fallback userId: ${fallbackUser.id} (${fallbackUser.name})`);

        // 2. Patch Assets
        const assetsFixed = await prisma.asset.updateMany({
            where: { userId: null },
            data: { userId: fallbackUser.id }
        });
        console.log(`📦 Patched ${assetsFixed.count} Assets.`);

        // 3. Patch Properties
        const propsFixed = await prisma.property.updateMany({
            where: { userId: null },
            data: { userId: fallbackUser.id }
        });
        console.log(`🏠 Patched ${propsFixed.count} Properties.`);

        // 4. Patch MaintenanceSchedules
        const schedsFixed = await prisma.maintenanceSchedule.updateMany({
            where: { userId: null },
            data: { userId: fallbackUser.id }
        });
        console.log(`⏰ Patched ${schedsFixed.count} Maintenance Schedules.`);

        // 5. Patch InternalTechnicians
        const techsFixed = await prisma.internalTechnician.updateMany({
            where: { userId: null },
            data: { userId: fallbackUser.id }
        });
        console.log(`🔧 Patched ${techsFixed.count} Internal Technicians.`);

        console.log('🎉 Data patch complete!');
    } catch (error) {
        console.error('❌ Patch failed:', error);
    } finally {
        await prisma.$disconnect();
    }
}

patch();
