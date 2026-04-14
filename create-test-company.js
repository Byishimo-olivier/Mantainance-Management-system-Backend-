#!/usr/bin/env node
/**
 * Create Test Company with Trial
 * Use this to test the trial system
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function createTestCompany() {
  console.log('\n🧪 CREATING TEST COMPANY WITH TRIAL\n');

  try {
    const now = new Date();
    const trialEndDate = new Date(now);
    trialEndDate.setDate(trialEndDate.getDate() + 5); // 5-day trial

    // Create test company
    const company = await prisma.company.create({
      data: {
        name: `Test Company ${Date.now()}`,
        email: 'test@example.com',
        phone: '+1234567890',
        onFreeTrial: true,
        trialStartDate: now,
        trialEndDate,
        trialDaysRemaining: 5,
        trialExceeded: false,
        subscriptionStatus: 'trial',
      },
    });

    console.log(`✓ Company created: ${company.name}`);
    console.log(`  ID: ${company.id}`);

    // Create trial subscription
    const subscription = await prisma.subscription.create({
      data: {
        companyId: company.id,
        email: 'test@example.com',
        plan: 'basic',
        billingCycle: 'monthly',
        amount: 0,
        status: 'trial',
        paymentStatus: 'pending',
        isTrialPeriod: true,
        trialStartDate: now,
        trialEndDate,
        trialDaysRemaining: 5,
        features: [
          'basic_reporting',
          'user_management',
          'asset_tracking',
          'maintenance_scheduling',
          'issue_tracking',
          'dashboard',
          'mobile_access',
        ],
        startDate: now,
        nextBillingDate: trialEndDate,
      },
    });

    console.log(`✓ Trial subscription created`);
    console.log(`  Subscription ID: ${subscription.id}`);
    console.log(`  Status: ${subscription.status}`);
    console.log(`  Days Remaining: ${subscription.trialDaysRemaining}`);
    console.log(`  Trial End Date: ${trialEndDate.toLocaleDateString()}`);

    console.log('\n✅ TEST SETUP COMPLETE\n');
    console.log('Next steps:');
    console.log('1. Log in with your user account');
    console.log('2. Update your user to use this company ID in Mongoose:');
    console.log(`   db.users.updateOne({_id: ObjectId("YOUR_USER_ID")}, {$set: {companyId: "${company.id}"}})`);
    console.log('3. Refresh dashboard and you should see the trial countdown!\n');

  } catch (error) {
    console.error('❌ Failed:', error.message);
  } finally {
    await prisma.$disconnect();
    process.exit(0);
  }
}

createTestCompany();
