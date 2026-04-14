const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

(async () => {
  try {
    // Check the test company we created
    const company = await prisma.company.findUnique({
      where: { id: '69dca9142bd8b765eeb2c581' },
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
    
    console.log('Test Company:');
    console.log(JSON.stringify(company, null, 2));
    
    if (company) {
      // Also check its subscription
      const subscription = await prisma.subscription.findFirst({
        where: { companyId: company.id },
        select: {
          id: true,
          status: true,
          isTrialPeriod: true,
          trialDaysRemaining: true,
          trialEndDate: true
        }
      });
      
      console.log('\nSubscription:');
      console.log(JSON.stringify(subscription, null, 2));
    }
  } catch (e) {
    console.error('Error:', e.message);
  } finally {
    await prisma.$disconnect();
  }
})();
