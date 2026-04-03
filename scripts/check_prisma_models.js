const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkModels() {
  console.log('Prisma Models:', Object.keys(prisma).filter(k => !k.startsWith('_')));
  
  if (prisma.company) {
    console.log('✅ Found company model');
  } else if (prisma.Company) {
    console.log('✅ Found Company model (capitalized)');
  } else {
    console.log('❌ company model NOT found');
    
    // Try to find any model starting with 'Comp'
    const match = Object.keys(prisma).find(k => k.toLowerCase().startsWith('comp'));
    if (match) {
      console.log(`🔍 Found similar model: ${match}`);
    }
  }
}

checkModels().catch(console.error);
