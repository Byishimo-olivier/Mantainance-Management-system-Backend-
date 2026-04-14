const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

(async () => {
  try {
    // Find first user with a company
    const users = await prisma.user.findMany({
      take: 10,
      select: { 
        id: true,
        email: true, 
        name: true,
        companyId: true 
      }
    });
    
    console.log('Recent users:');
    users.forEach(u => {
      console.log('  Email: ' + u.email + ' | Company: ' + u.companyId + ' | Name: ' + u.name);
    });
  } finally {
    await prisma.$disconnect();
  }
})();
