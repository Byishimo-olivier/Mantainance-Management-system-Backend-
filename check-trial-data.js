const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

(async () => {
  try {
    // Find user with trial company
    const user = await prisma.user.findFirst({
      where: { email: 'aline@example.com' },
      include: { company: true }
    });
    
    console.log('=== USER FOUND ===');
    console.log('Email:', user?.email);
    console.log('CompanyID:', user?.companyId);
    console.log('Company Name:', user?.company?.name);
    console.log('');

    if (user?.companyId) {
      // Check trial data
      const trialData = await prisma.company.findUnique({
        where: { id: user.companyId },
        select: { 
          id: true,
          name: true,
          onFreeTrial: true, 
          trialStartDate: true, 
          trialEndDate: true, 
          trialDaysRemaining: true,
          subscriptionStatus: true
        }
      });
      
      console.log('=== TRIAL DATA ===');
      console.log(JSON.stringify(trialData, null, 2));
      
      // Also check subscription
      const subscription = await prisma.subscription.findFirst({
        where: { companyId: user.companyId },
        select: {
          id: true,
          status: true,
          isTrialPeriod: true,
          trialStartDate: true,
          trialEndDate: true,
          trialDaysRemaining: true
        }
      });
      
      console.log('=== SUBSCRIPTION DATA ===');
      console.log(JSON.stringify(subscription, null, 2));
    }
  } catch (e) {
    console.error('Error:', e.message);
  } finally {
    await prisma.$disconnect();
  }
})();
