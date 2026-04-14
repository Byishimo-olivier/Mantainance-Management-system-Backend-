/**
 * Trial System Testing Script
 * Run this to manually test free trial functionality
 * 
 * Usage: node test-trial-system.js
 */

const { PrismaClient } = require('@prisma/client');
const trialService = require('./src/modules/subscription/trial.service');

const prisma = new PrismaClient();

async function testTrialSystem() {
  console.log('\n=== TESTING FREE TRIAL SYSTEM ===\n');

  try {
    // Test 1: Initialize Trial
    console.log('TEST 1: Initialize Free Trial');
    console.log('________________________________');
    
    // Create test company
    const testCompany = await prisma.company.create({
      data: {
        name: `Test Company ${Date.now()}`,
        email: `test-${Date.now()}@example.com`,
        phone: '+1234567890',
      },
    });
    console.log(`✓ Test company created: ${testCompany.id}`);

    // Initialize trial
    const initializedCompany = await trialService.initializeFreeTrial(testCompany.id);
    console.log(`✓ Trial initialized`);
    console.log(`  - Status: ${initializedCompany.subscriptionStatus}`);
    console.log(`  - Trial Start: ${initializedCompany.trialStartDate}`);
    console.log(`  - Trial End: ${initializedCompany.trialEndDate}`);
    console.log(`  - Days Remaining: ${initializedCompany.trialDaysRemaining}`);

    // Test 2: Get Trial Status
    console.log('\n\nTEST 2: Get Trial Status');
    console.log('________________________________');

    const trialStatus = await trialService.getTrialStatus(testCompany.id);
    console.log(`✓ Trial status retrieved:`);
    console.log(`  - Is In Trial: ${trialStatus.isInTrial}`);
    console.log(`  - Days Remaining: ${trialStatus.daysRemaining}`);
    console.log(`  - Trial Exceeded: ${trialStatus.trialExceeded}`);
    console.log(`  - Status: ${trialStatus.subscriptionStatus}`);

    // Test 3: Check Subscription was created
    console.log('\n\nTEST 3: Verify Trial Subscription Created');
    console.log('________________________________');

    const subscription = await prisma.subscription.findFirst({
      where: {
        companyId: testCompany.id,
        isTrialPeriod: true,
      },
    });

    if (subscription) {
      console.log(`✓ Trial subscription created:`);
      console.log(`  - ID: ${subscription.id}`);
      console.log(`  - Plan: ${subscription.plan}`);
      console.log(`  - Status: ${subscription.status}`);
      console.log(`  - Amount: $${subscription.amount}`);
    } else {
      console.log(`✗ No trial subscription found!`);
    }

    // Test 4: Upgrade to Paid
    console.log('\n\nTEST 4: Upgrade Trial to Paid Subscription');
    console.log('________________________________');

    const upgradedCompany = await trialService.upgradeToPaid(
      testCompany.id,
      'premium',
      'monthly'
    );
    console.log(`✓ Upgraded to paid subscription:`);
    console.log(`  - Plan: ${upgradedCompany.subscriptionPlan}`);
    console.log(`  - Status: ${upgradedCompany.subscriptionStatus}`);
    console.log(`  - Trial Active: ${upgradedCompany.onFreeTrial}`);

    // Test 5: Verify new subscription created
    console.log('\n\nTEST 5: Verify Paid Subscription Created');
    console.log('________________________________');

    const paidSubscription = await prisma.subscription.findFirst({
      where: {
        companyId: testCompany.id,
        isTrialPeriod: false,
        status: 'active',
      },
    });

    if (paidSubscription) {
      console.log(`✓ Paid subscription created:`);
      console.log(`  - ID: ${paidSubscription.id}`);
      console.log(`  - Plan: ${paidSubscription.plan}`);
      console.log(`  - Amount: $${paidSubscription.amount}`);
      console.log(`  - Next Billing: ${paidSubscription.nextBillingDate}`);
    } else {
      console.log(`✗ No paid subscription found!`);
    }

    // Test 6: Test Trial Expiration
    console.log('\n\nTEST 6: Test Trial Expiration');
    console.log('________________________________');

    // Create another test company
    const expireTestCompany = await prisma.company.create({
      data: {
        name: `Expire Test Company ${Date.now()}`,
        email: `expire-${Date.now()}@example.com`,
        phone: '+9876543210',
      },
    });
    console.log(`✓ Test company created for expiration: ${expireTestCompany.id}`);

    // Initialize trial and immediately expire it
    await trialService.initializeFreeTrial(expireTestCompany.id);
    
    // Manually set trial to expired (simulating 5+ days passing)
    const expiredCompany = await trialService.expireTrial(expireTestCompany.id);
    console.log(`✓ Trial expired:`);
    console.log(`  - Trial Exceeded: ${expiredCompany.trialExceeded}`);
    console.log(`  - Status: ${expiredCompany.subscriptionStatus}`);
    console.log(`  - On Trial: ${expiredCompany.onFreeTrial}`);

    // Test 7: Verify trial subscription is marked as expired
    console.log('\n\nTEST 7: Verify Expired Trial Subscription');
    console.log('________________________________');

    const expiredSubscription = await prisma.subscription.findFirst({
      where: {
        companyId: expireTestCompany.id,
        isTrialPeriod: true,
      },
    });

    if (expiredSubscription) {
      console.log(`✓ Trial subscription status:`);
      console.log(`  - Status: ${expiredSubscription.status}`);
      console.log(`  - Is Trial Period: ${expiredSubscription.isTrialPeriod}`);
    }

    // Cleanup
    console.log('\n\nCLEANUP');
    console.log('________________________________');
    await prisma.subscription.deleteMany({
      where: { companyId: { in: [testCompany.id, expireTestCompany.id] } },
    });
    await prisma.company.deleteMany({
      where: { id: { in: [testCompany.id, expireTestCompany.id] } },
    });
    console.log('✓ Test data cleaned up');

    console.log('\n\n=== ALL TESTS COMPLETED SUCCESSFULLY ===\n');

  } catch (error) {
    console.error('\n✗ ERROR:', error.message);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run tests
testTrialSystem().catch((error) => {
  console.error('Test failed:', error);
  process.exit(1);
});
