const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const fs = require('fs');

async function main() {
    const diagnostic = { timestamp: new Date().toISOString() };

    diagnostic.users = await prisma.user.findMany();
    diagnostic.internalTechs = await prisma.internalTechnician.findMany();
    diagnostic.schedules = await prisma.maintenanceSchedule.findMany();
    diagnostic.issues = await prisma.issue.findMany();

    fs.writeFileSync('diagnostic_results.json', JSON.stringify(diagnostic, null, 2));
    console.log('Diagnostic results written to diagnostic_results.json');
}

main()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect());
