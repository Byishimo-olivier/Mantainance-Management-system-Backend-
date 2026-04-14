const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

(async () => {
  try {
    // Update Aline to have the trial company
    const updated = await prisma.user.update({
      where: { email: 'alineuwineza123@gmail.com' },
      data: { companyId: '69dca9142bd8b765eeb2c581' },
      select: { 
        email: true, 
        name: true, 
        companyId: true
      }
    });
    
    console.log('SUCCESS! User updated:');
    console.log('  Email: ' + updated.email);
    console.log('  Name: ' + updated.name);
    console.log('  Company ID: ' + updated.companyId);
    console.log('\nTrial countdown should now appear when logging in!');
  } catch (e) {
    console.error('Error:', e.message);
  } finally {
    await prisma.$disconnect();
  }
})();
