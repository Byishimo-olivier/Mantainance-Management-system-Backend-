const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkData() {
    try {
        const requests = await prisma.materialRequest.findMany();
        const items = await prisma.materialRequestItem.findMany();

        console.log('--- Material Requests ---');
        console.log(JSON.stringify(requests, null, 2));

        console.log('--- Material Request Items ---');
        console.log(JSON.stringify(items, null, 2));
    } catch (err) {
        console.error('Error checking data:', err);
    } finally {
        await prisma.$disconnect();
    }
}

checkData();
