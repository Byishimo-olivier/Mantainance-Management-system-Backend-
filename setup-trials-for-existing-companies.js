#!/usr/bin/env node
/**
 * Initialize Trials for Existing Companies
 * 
 * This script initializes trials for companies in Prisma
 * Run this after running: npx prisma db push
 * 
 * Usage: node setup-trials-for-existing-companies.js
 */

const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function setupTrials() {
  console.log('\n🚀 INITIALIZING TRIALS FOR EXISTING COMPANIES\n');

  try {
    // Get all companies that don't already have trials initialized
    const companies = await prisma.company.findMany({
      where: {
        onFreeTrial: false, // Only companies without trials
      },
      select: { id: true, name: true, email: true, onFreeTrial: true },
    });

    if (!companies || companies.length === 0) {
      console.log('✓ All companies already have trials or no companies found.');
      return;
    }

    console.log(`Found ${companies.length} companies to process...\n`);

    let created = 0;
    let errors = 0;

    for (const company of companies) {
      try {
        const now = new Date();
        const trialEndDate = new Date(now);
        trialEndDate.setDate(trialEndDate.getDate() + 5); // 5-day trial

        // Update company with trial info
        await prisma.company.update({
          where: { id: company.id },
          data: {
            onFreeTrial: true,
            trialStartDate: now,
            trialEndDate,
            trialDaysRemaining: 5,
            trialExceeded: false,
            subscriptionStatus: 'trial',
          },
        });

        // Create trial subscription
        await prisma.subscription.create({
          data: {
            companyId: company.id,
            email: company.email || 'noreply@mms.app',
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

        console.log(`✓ Trial initialized for: ${company.name}`);
        created++;
      } catch (err) {
        console.error(`✗ Error processing ${company.name}: ${err.message}`);
        errors++;
      }
    }

    console.log('\n' + '='.repeat(60));
    console.log(`✅ SETUP COMPLETE`);
    console.log('='.repeat(60));
    console.log(`Initialized: ${created}`);
    console.log(`Errors:      ${errors}`);
    console.log('='.repeat(60) + '\n');

  } catch (error) {
    console.error('❌ Setup failed:', error.message);
  } finally {
    await prisma.$disconnect();
    process.exit(0);
  }
}

// Run setup
setupTrials();
