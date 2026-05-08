const { PrismaClient } = require('@prisma/client');
const User = require('../user/user.model');
const companySubscriptionService = require('./company-subscription.service');
const prisma = new PrismaClient();

const TRIAL_DURATION_DAYS = 7; // 7-day free trial
const ACTIVE_SUBSCRIPTION_STATUSES = ['active'];

const normalizePlan = (plan) => String(plan || 'basic').trim().toLowerCase();
const normalizeFeature = (feature) => String(feature || '').trim().toLowerCase();
const isSuperAdminRole = (role) => ['superadmin', 'super-admin'].includes(String(role || '').trim().toLowerCase());

const isCurrentlyActiveSubscription = (subscription, now = new Date()) => {
  const status = String(subscription?.status || '').toLowerCase();
  if (!ACTIVE_SUBSCRIPTION_STATUSES.includes(status)) return false;
  if (!subscription?.endDate) return true;
  const endDate = new Date(subscription.endDate);
  return !Number.isNaN(endDate.getTime()) && endDate > now;
};

const getUserCompany = async (userId) => {
  if (!userId) return null;

  const prismaUser = await prisma.user.findUnique({
    where: { id: String(userId) },
    include: { company: true },
  }).catch(() => null);

  if (prismaUser?.company) {
    return prismaUser.company;
  }

  const mongoUser = await User.findById(userId)
    .select('companyName role email')
    .lean()
    .catch(() => null);

  if (!mongoUser?.companyName || isSuperAdminRole(mongoUser?.role)) {
    return null;
  }

  return companySubscriptionService
    .ensureCompanyExists(String(mongoUser.companyName).trim(), String(userId))
    .catch(() => null);
};

const getUserRole = async (userId) => {
  const mongoUser = await User.findById(userId).select('role').lean().catch(() => null);
  if (mongoUser?.role) return mongoUser.role;

  const prismaUser = await prisma.user.findUnique({
    where: { id: String(userId) },
    select: { role: true },
  }).catch(() => null);

  return prismaUser?.role || '';
};

const getActiveSubscriptionForUser = async (userId, companyId) => {
  const subscription = await companySubscriptionService.getCompanySubscription(userId).catch(() => null);
  if (isCurrentlyActiveSubscription(subscription)) {
    return subscription;
  }

  if (!companyId) return null;

  const directSubscription = await prisma.subscription.findFirst({
    where: {
      companyId,
      status: 'active',
    },
    orderBy: { createdAt: 'desc' },
  }).catch(() => null);

  return isCurrentlyActiveSubscription(directSubscription) ? directSubscription : null;
};

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

exports.extendFreeTrial = async (companyId, extensionDays, metadata = {}) => {
  try {
    const daysToAdd = Math.max(1, Math.min(730, Number(extensionDays) || 0));
    if (!companyId || !daysToAdd) {
      throw new Error('Company ID and extension days are required');
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
      throw new Error('Company not found');
    }

    const now = new Date();
    const currentEnd = company.trialEndDate ? new Date(company.trialEndDate) : now;
    const baseDate = currentEnd > now ? currentEnd : now;
    const trialEndDate = new Date(baseDate);
    trialEndDate.setDate(trialEndDate.getDate() + daysToAdd);
    const trialStartDate = company.trialStartDate || now;
    const trialDaysRemaining = Math.max(0, Math.ceil((trialEndDate - now) / (1000 * 60 * 60 * 24)));

    const updatedCompany = await prisma.company.update({
      where: { id: companyId },
      data: {
        onFreeTrial: true,
        trialStartDate,
        trialEndDate,
        trialDaysRemaining,
        trialExceeded: false,
        subscriptionStatus: 'trial',
        metadata: {
          ...(company.metadata && typeof company.metadata === 'object' ? company.metadata : {}),
          lastTrialExtension: {
            daysAdded: daysToAdd,
            extendedAt: now.toISOString(),
            extendedBy: metadata.extendedBy || null,
            reason: metadata.reason || '',
          },
        },
      },
      include: { subscriptions: true, users: true },
    });

    const existingTrialSubscription = company.subscriptions?.[0];
    if (existingTrialSubscription) {
      await prisma.subscription.update({
        where: { id: existingTrialSubscription.id },
        data: {
          status: 'trial',
          paymentStatus: 'pending',
          trialStartDate,
          trialEndDate,
          trialDaysRemaining,
          endDate: trialEndDate,
          nextBillingDate: trialEndDate,
          metadata: {
            ...(existingTrialSubscription.metadata && typeof existingTrialSubscription.metadata === 'object' ? existingTrialSubscription.metadata : {}),
            lastTrialExtension: {
              daysAdded: daysToAdd,
              extendedAt: now.toISOString(),
              extendedBy: metadata.extendedBy || null,
              reason: metadata.reason || '',
            },
          },
        },
      });
    } else {
      await prisma.subscription.create({
        data: {
          companyId,
          email: updatedCompany.email || `${updatedCompany.name.replace(/\s+/g, '').toLowerCase()}@trial.local`,
          plan: updatedCompany.subscriptionPlan || 'basic',
          billingCycle: 'monthly',
          amount: 0,
          status: 'trial',
          paymentStatus: 'pending',
          isTrialPeriod: true,
          trialStartDate,
          trialEndDate,
          trialDaysRemaining,
          features: getTrialFeatures(),
          startDate: trialStartDate,
          endDate: trialEndDate,
          nextBillingDate: trialEndDate,
          metadata: {
            createdByTrialExtension: true,
            lastTrialExtension: {
              daysAdded: daysToAdd,
              extendedAt: now.toISOString(),
              extendedBy: metadata.extendedBy || null,
              reason: metadata.reason || '',
            },
          },
        },
      });
    }

    return updatedCompany;
  } catch (error) {
    throw new Error(`Failed to extend free trial: ${error.message}`);
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

    // Create new PENDING_PAYMENT subscription (NOT active until payment is confirmed)
    const paidAmount = calculateAmount(plan, billingCycle);
    const company = await prisma.company.findUnique({ where: { id: companyId } });
    const newSubscription = await prisma.subscription.create({
      data: {
        companyId,
        email: company?.email,
        plan,
        billingCycle,
        amount: paidAmount,
        status: 'pending_payment', // ✓ FIX: Start as pending, not active
        paymentStatus: 'pending', // ✓ FIX: Payment is pending, not paid
        isTrialPeriod: false,
        features: getFeaturesByPlan(plan),
        startDate: now,
        endDate: nextBillingDate,
        nextBillingDate: nextBillingDate,
      },
    });

    // Update company to reflect trial ended (but subscription not yet active)
    const updatedCompany = await prisma.company.update({
      where: { id: companyId },
      data: {
        onFreeTrial: false,
        trialExceeded: false,
        trialDaysRemaining: 0,
        subscriptionPlan: plan,
      },
      include: { subscriptions: true },
    });

    return { ...updatedCompany, pendingSubscription: newSubscription };
  } catch (error) {
    throw new Error(`Failed to create pending paid subscription: ${error.message}`);
  }
};

/**
 * Check if user's company is in active trial
 */
exports.isUserInActiveTrial = async (userId) => {
  try {
    const company = await getUserCompany(userId);
    if (!company) {
      return false;
    }

    const trialStatus = await exports.getTrialStatus(company.id);
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
    const company = await getUserCompany(userId);
    if (!company) {
      return false;
    }

    const trialStatus = await exports.getTrialStatus(company.id);
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
    if (isSuperAdminRole(await getUserRole(userId))) {
      return true;
    }

    const company = await getUserCompany(userId);
    if (!company) {
      return false;
    }

    // Check if in active trial
    const inActiveTrial = await exports.isUserInActiveTrial(userId);
    if (inActiveTrial) {
      return true;
    }

    // Check if has active paid subscription
    const activeSubscription = await getActiveSubscriptionForUser(userId, company.id);
    return !!activeSubscription;
  } catch (error) {
    console.error('Error checking feature access:', error);
    return false;
  }
};

/**
 * Get ALL features available during trial
 * Trial users get access to ALL features
 */
function getTrialFeatures() {
  return [
    'unlimited_work_orders',
    'requests',
    'ai_assistance',
    'asset_tracking',
    'location_management',
    'preventive_maintenance',
    'advanced_ai',
    'analytics',
    'material_requests',
    'purchase_order',
  ];
}

/**
 * Get features by plan
 */
function getFeaturesByPlan(plan) {
  const normalizedPlan = normalizePlan(plan);
  const features = {
    basic: [
      'unlimited_work_orders',
      'requests',
      'ai_assistance',
    ],
    professional: [
      'unlimited_work_orders',
      'requests',
      'ai_assistance',
      'asset_tracking',
      'location_management',
      'preventive_maintenance',
      'advanced_ai',
    ],
    enterprise: [
      'unlimited_work_orders',
      'requests',
      'ai_assistance',
      'asset_tracking',
      'location_management',
      'preventive_maintenance',
      'advanced_ai',
      'analytics',
      'material_requests',
    ],
    premium: [
      'unlimited_work_orders',
      'requests',
      'ai_assistance',
      'asset_tracking',
      'location_management',
      'preventive_maintenance',
      'advanced_ai',
      'analytics',
      'material_requests',
      'purchase_order',
    ],
  };

  return features[normalizedPlan] || features.basic;
}

exports.getTrialFeatures = getTrialFeatures;
exports.getFeaturesByPlan = getFeaturesByPlan;

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

/**
 * Get all accessible features for a user based on trial or subscription plan
 * @param {string} userId - User ID
 * @returns {Promise<Array>} - Array of accessible features
 */
exports.getUserAccessibleFeatures = async (userId) => {
  try {
    if (isSuperAdminRole(await getUserRole(userId))) {
      return getTrialFeatures();
    }

    const company = await getUserCompany(userId);
    if (!company) {
      return [];
    }

    // Check if user is in active trial
    const isInTrial = await exports.isUserInActiveTrial(userId);
    if (isInTrial) {
      return getTrialFeatures(); // Return ALL features for trial users
    }

    // Get user's subscription plan
    const subscription = await getActiveSubscriptionForUser(userId, company.id);

    if (!subscription) {
      return [];
    }

    return getFeaturesByPlan(subscription.plan);
  } catch (error) {
    console.error('Error getting user accessible features:', error);
    return [];
  }
};

/**
 * Check if user has access to a specific feature
 * @param {string} userId - User ID
 * @param {string} feature - Feature name
 * @returns {Promise<boolean>} - True if user can access feature
 */
exports.hasFeatureAccess = async (userId, feature) => {
  try {
    const accessibleFeatures = await exports.getUserAccessibleFeatures(userId);
    const normalizedFeature = normalizeFeature(feature);

    if (normalizedFeature === 'ai_assistance' && accessibleFeatures.includes('advanced_ai')) {
      return true;
    }

    return accessibleFeatures.includes(normalizedFeature);
  } catch (error) {
    console.error('Error checking feature access:', error);
    return false;
  }
};

/**
 * Check if user has "Write" access (Create/Update/Delete) for a feature.
 * Trial users: Always true
 * Basic users: False for advanced modules
 */
exports.hasWriteAccess = async (userId, feature) => {
  try {
    const info = await exports.getUserSubscriptionInfo(userId);
    
    // 1. Trial users get full write access to everything
    if (info.isTrialPeriod || info.plan === 'trial') {
      return true;
    }

    // 2. Define features that are READ-ONLY for Basic plan
    const readOnlyForBasic = [
      'asset_tracking',
      'location_management',
      'preventive_maintenance'
    ];

    if (info.plan === 'basic' && readOnlyForBasic.includes(feature)) {
      return false;
    }

    // 3. For other plans/features, if they have the feature, they can write
    return info.features.includes(feature);
  } catch (error) {
    return false;
  }
};

/**
 * Get user's subscription plan (for trial or paid)
 * @param {string} userId - User ID
 * @returns {Promise<Object>} - { plan, isTrialPeriod, features }
 */
exports.getUserSubscriptionInfo = async (userId) => {
  try {
    if (isSuperAdminRole(await getUserRole(userId))) {
      return { plan: 'superadmin', isTrialPeriod: false, features: getTrialFeatures() };
    }

    const company = await getUserCompany(userId);
    if (!company) {
      return { plan: 'none', isTrialPeriod: false, features: [] };
    }

    // Check if user is in active trial
    const isInTrial = await exports.isUserInActiveTrial(userId);
    if (isInTrial) {
      return {
        plan: 'trial',
        isTrialPeriod: true,
        features: getTrialFeatures(),
      };
    }

    // Get user's subscription plan
    const subscription = await getActiveSubscriptionForUser(userId, company.id);

    if (!subscription) {
      return { plan: 'none', isTrialPeriod: false, features: [] };
    }

    return {
      plan: normalizePlan(subscription.plan),
      isTrialPeriod: false,
      features: getFeaturesByPlan(subscription.plan),
    };
  } catch (error) {
    console.error('Error getting user subscription info:', error);
    return { plan: 'none', isTrialPeriod: false, features: [] };
  }
};

module.exports = exports;
