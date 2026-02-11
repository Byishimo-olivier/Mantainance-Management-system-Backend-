const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

(async () => {
  try {
    console.log('Trying to connect with Prisma...');
    await prisma.$connect();
    console.log('Prisma connected OK');
    await prisma.$disconnect();
    process.exit(0);
  } catch (err) {
    console.error('Prisma connect failed:');
    console.error(err);
    try { await prisma.$disconnect(); } catch(e){}
    process.exit(1);
  }
})();
