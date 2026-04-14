const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const TRIAL_DURATION_DAYS = 5; // 5-day free trial

/**
 * Initialize a free trial for a new company
 * Called when company registers
 */
exports.initializeFreeTrial = async (companyId) => {
  try {
    const now = new Date();
    const trialEndDate = new Date(now);
    trialEndDate.setDate(trialEndDate.getDate() + TRIAL_DURATION_DAYS);

    const updatedCompany = await prisma.company.update({
      where: { id: companyId },
      data: {
        onFreeTrial: true,
        trialStartDate: now,
        trialEndDate,
        trialDaysRemaining: TRIAL_DURATION_DAYS,
        trialExceeded: false,
        subscriptionStatus: 'trial',
      },
      include: { subscriptions: true, users: true },
    });

    // Also create a trial subscription record
    await prisma.subscription.create({
      data: {
        companyId,
        email: updatedCompany.email,
        plan: 'basic', // Default to basic plan
        billingCycle: 'monthly',
        amount: 0, // Free during trial
        status: 'trial',
        paymentStatus: 'pending',
        isTrialPeriod: true,
        trialStartDate: now,
        trialEndDate,
        trialDaysRemaining: TRIAL_DURATION_DAYS,
        features: getTrialFeatures(),
        startDate: now,
        nextBillingDate: trialEndDate,
      },
    });

    return updatedCompany;
  } catch (error) {
    throw new Error(`Failed to initialize free trial: ${error.message}`);
  }
};

/**
 * Get trial status for a company
 * Calculates remaining days and updates status if needed
 */
exports.getTrialStatus = async (companyId) => {
  try {
    if (!companyId) {
      return {
        isInTrial: false,
        daysRemaining: 0,
        trialExceeded: false,
        subscriptionStatus: 'inactive',
      };
    }

    const company = await prisma.company.findUnique({
      where: { id: companyId },
      include: {
        subscriptions: {
          where: { isTrialPeriod: true },
          orderBy: { trialStartDate: 'desc' },
          take: 1,
        },
      },
    });

    if (!company) {
      // Company doesn't exist in Prisma database
      // This might be a legacy company or not yet synced
      return {
        isInTrial: false,
        daysRemaining: 0,
        trialExceeded: false,
        subscriptionStatus: 'inactive',
      };
    }

    if (!company.onFreeTrial || !company.trialEndDate) {
      return {
        isInTrial: false,
        onFreeTrial: company.onFreeTrial,
        trialExceeded: company.trialExceeded,
        subscriptionStatus: company.subscriptionStatus,
      };
    }

    const now = new Date();
    const trialEnd = new Date(company.trialEndDate);
    const daysRemaining = Math.ceil((trialEnd - now) / (1000 * 60 * 60 * 24));

    // Check if trial has expired
    if (daysRemaining <= 0 && !company.trialExceeded) {
      // Trial has expired, mark company accordingly
      await exports.expireTrial(companyId);
      return {
        isInTrial: false,
        onFreeTrial: false,
        daysRemaining: 0,
        trialExceeded: true,
        subscriptionStatus: 'trial_expired',
      };
    }

    return {
      isInTrial: daysRemaining > 0,
      onFreeTrial: company.onFreeTrial,
      daysRemaining: Math.max(0, daysRemaining),
      trialExceeded: company.trialExceeded,
      trialEndDate: company.trialEndDate,
      trialStartDate: company.trialStartDate,
      subscriptionStatus: company.subscriptionStatus,
    };
  } catch (error) {
    throw new Error(`Failed to get trial status: ${error.message}`);
  }
};

/**
 * Expire trial and set company status to trial_expired
 * Called when trial period ends
 */
exports.expireTrial = async (companyId) => {
  try {
    const updatedCompany = await prisma.company.update({
      where: { id: companyId },
      data: {
        onFreeTrial: false,
        trialDaysRemaining: 0,
        trialExceeded: true,
        subscriptionStatus: 'trial_expired',
      },
      include: { subscriptions: true },
    });

    // Update trial subscription to expired
    await prisma.subscription.updateMany({
      where: {
        companyId,
        isTrialPeriod: true,
      },
      data: {
        status: 'trial_expired',
      },
    });

    return updatedCompany;
  } catch (error) {
    throw new Error(`Failed to expire trial: ${error.message}`);
  }
};

/**
 * Upgrade trial to paid subscription
 * Called when company makes a payment
 */
exports.upgradeToPaid = async (companyId, plan, billingCycle) => {
  try {
    const now = new Date();

    // Calculate next billing date based on cycle
    const nextBillingDate = calculateNextBillingDate(billingCycle);

    const updatedCompany = await prisma.company.update({
      where: { id: companyId },
      data: {
        onFreeTrial: false,
        trialExceeded: false,
        trialDaysRemaining: 0,
        subscriptionStatus: 'active',
        subscriptionPlan: plan,
        subscriptionStartDate: now,
        subscriptionEndDate: nextBillingDate,
      },
      include: { subscriptions: true },
    });

    // Close trial subscriptions
    await prisma.subscription.updateMany({
      where: {
        companyId,
        isTrialPeriod: true,
      },
      data: {
        status: 'cancelled',
      },
    });

    // Create new paid subscription
    const paidAmount = calculateAmount(plan, billingCycle);
    await prisma.subscription.create({
      data: {
        companyId,
        email: updatedCompany.email,
        plan,
        billingCycle,
        amount: paidAmount,
        status: 'active',
        paymentStatus: 'paid',
        isTrialPeriod: false,
        features: getFeaturesByPlan(plan),
        startDate: now,
        endDate: nextBillingDate,
        nextBillingDate: nextBillingDate,
      },
    });

    return updatedCompany;
  } catch (error) {
    throw new Error(`Failed to upgrade to paid subscription: ${error.message}`);
  }
};

/**
 * Check if user's company is in active trial
 */
exports.isUserInActiveTrial = async (userId) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { company: true },
    });

    if (!user?.company) {
      return false;
    }

    const trialStatus = await exports.getTrialStatus(user.company.id);
    return trialStatus?.isInTrial === true;
  } catch (error) {
    console.error('Error checking if user in trial:', error);
    return false;
  }
};

/**
 * Check if user's company trial has expired
 */
exports.hasTrialExpired = async (userId) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { company: true },
    });

    if (!user?.company) {
      return false;
    }

    const trialStatus = await exports.getTrialStatus(user.company.id);
    return trialStatus?.trialExceeded === true;
  } catch (error) {
    console.error('Error checking if trial expired:', error);
    return false;
  }
};

/**
 * Check if user can access restricted features
 * Can access if:
 * 1. In active trial, OR
 * 2. Has active paid subscription
 */
exports.canAccessFeatures = async (userId) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { company: true },
    });

    if (!user?.company) {
      return false;
    }

    // Check if in active trial
    const inActiveTrial = await exports.isUserInActiveTrial(userId);
    if (inActiveTrial) {
      return true;
    }

    // Check if has active paid subscription
    const company = user.company;
    const now = new Date();
    const hasValidEndDate = !company.subscriptionEndDate || new Date(company.subscriptionEndDate) > now;
    const isActive = company.subscriptionStatus === 'active' && hasValidEndDate;

    return isActive;
  } catch (error) {
    console.error('Error checking feature access:', error);
    return false;
  }
};

/**
 * Get features available during trial
 */
function getTrialFeatures() {
  return [
    'basic_reporting',
    'user_management',
    'asset_tracking',
    'maintenance_scheduling',
    'issue_tracking',
    'dashboard',
    'mobile_access',
  ];
}

/**
 * Get features by plan
 */
function getFeaturesByPlan(plan) {
  const features = {
    basic: [
      'basic_reporting',
      'user_management',
      'asset_tracking',
      'maintenance_scheduling',
      'issue_tracking',
      'dashboard',
    ],
    premium: [
      'basic_reporting',
      'advanced_reporting',
      'user_management',
      'asset_tracking',
      'maintenance_scheduling',
      'preventive_maintenance',
      'issue_tracking',
      'dashboard',
      'mobile_access',
      'email_alerts',
    ],
    professional: [
      'basic_reporting',
      'advanced_reporting',
      'predictive_analytics',
      'user_management',
      'asset_tracking',
      'maintenance_scheduling',
      'preventive_maintenance',
      'issue_tracking',
      'dashboard',
      'mobile_access',
      'email_alerts',
      'api_access',
    ],
    enterprise: [
      'basic_reporting',
      'advanced_reporting',
      'predictive_analytics',
      'user_management',
      'asset_tracking',
      'maintenance_scheduling',
      'preventive_maintenance',
      'issue_tracking',
      'dashboard',
      'mobile_access',
      'email_alerts',
      'api_access',
      'custom_branding',
      'dedicated_support',
    ],
  };

  return features[plan] || features.basic;
}

/**
 * Calculate billing amount for plan and cycle
 */
function calculateAmount(plan, billingCycle) {
  const pricing = {
    basic: { weekly: 9.99, monthly: 29.99, yearly: 299.99 },
    premium: { weekly: 15.99, monthly: 49.99, yearly: 499.99 },
    professional: { weekly: 24.99, monthly: 79.99, yearly: 799.99 },
    enterprise: { weekly: 49.99, monthly: 199.99, yearly: 1999.99 },
  };

  return pricing[plan]?.[billingCycle] || 0;
}

/**
 * Calculate next billing date based on cycle
 */
function calculateNextBillingDate(billingCycle) {
  const now = new Date();
  const nextDate = new Date(now);

  if (billingCycle === 'weekly') {
    nextDate.setDate(nextDate.getDate() + 7);
  } else if (billingCycle === 'monthly') {
    nextDate.setMonth(nextDate.getMonth() + 1);
  } else if (billingCycle === 'yearly') {
    nextDate.setFullYear(nextDate.getFullYear() + 1);
  }

  return nextDate;
}

module.exports = exports;
