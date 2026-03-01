const { PrismaClient } = require('@prisma/client');
const crypto = require('crypto');
const paymentService = require('./payment.service');
const prisma = new PrismaClient();

// Credentials for authorization
const CLIENT_ID = process.env.SUBSCRIPTION_CLIENT_ID || 'ee00cab6-155a-11f1-a1f5-deadd43720af';
const SECRET_ID = process.env.SUBSCRIPTION_SECRET_ID || '630eecbbb285bd9d5760f299a7231c9eda39a3ee5e6b4b0d3255bfef95601890afd80709';

const verifyCredentials = (clientId, secretId) => {
  return clientId === CLIENT_ID && secretId === SECRET_ID;
};

const hashCredentials = (clientId, secretId) => {
  return crypto
    .createHash('sha256')
    .update(`${clientId}:${secretId}`)
    .digest('hex');
};

// Create subscription with billing cycle
exports.createSubscription = async (subscriptionData) => {
  try {
    if (!verifyCredentials(subscriptionData.clientId, subscriptionData.secretId)) {
      throw new Error('Invalid credentials');
    }

    const credentialHash = hashCredentials(subscriptionData.clientId, subscriptionData.secretId);
    const billingCycle = subscriptionData.billingCycle || 'monthly';
    const plan = subscriptionData.plan || 'basic';

    const amount = paymentService.calculateAmount(plan, billingCycle);
    const nextBillingDate = calculateNextBillingDate(billingCycle);

    const subscription = await prisma.subscription.create({
      data: {
        clientId: subscriptionData.userId,
        email: subscriptionData.email,
        plan,
        billingCycle,
        amount,
        status: 'active',
        paymentStatus: 'pending',
        startDate: new Date(),
        nextBillingDate,
        credentialHash,
        features: getFeaturesByPlan(plan),
        autoRenew: subscriptionData.autoRenew !== false,
        paymentMethod: subscriptionData.paymentMethod,
        metadata: subscriptionData.metadata || {},
      },
    });

    return subscription;
  } catch (error) {
    throw new Error(`Failed to create subscription: ${error.message}`);
  }
};

// Get subscription by client ID
exports.getSubscriptionByClientId = async (clientId) => {
  try {
    const subscription = await prisma.subscription.findFirst({
      where: { clientId },
      include: {
        payments: { orderBy: { createdAt: 'desc' } },
        invoices: { orderBy: { createdAt: 'desc' } },
      },
    });
    return subscription;
  } catch (error) {
    throw new Error(`Failed to get subscription: ${error.message}`);
  }
};

// Get subscription by ID
exports.getSubscriptionById = async (subscriptionId) => {
  try {
    const subscription = await prisma.subscription.findUnique({
      where: { id: subscriptionId },
      include: {
        payments: { orderBy: { createdAt: 'desc' } },
        invoices: { orderBy: { createdAt: 'desc' } },
      },
    });
    return subscription;
  } catch (error) {
    throw new Error(`Failed to get subscription: ${error.message}`);
  }
};

// Get all subscriptions with filters
exports.getAllSubscriptions = async (filters = {}) => {
  try {
    const subscriptions = await prisma.subscription.findMany({
      where: {
        ...(filters.status && { status: filters.status }),
        ...(filters.plan && { plan: filters.plan }),
        ...(filters.billingCycle && { billingCycle: filters.billingCycle }),
        ...(filters.paymentStatus && { paymentStatus: filters.paymentStatus }),
      },
      include: {
        payments: { orderBy: { createdAt: 'desc' }, take: 5 },
        invoices: { orderBy: { createdAt: 'desc' }, take: 5 },
      },
      orderBy: { createdAt: 'desc' },
    });
    return subscriptions;
  } catch (error) {
    throw new Error(`Failed to get subscriptions: ${error.message}`);
  }
};

// Cancel subscription
exports.cancelSubscription = async (subscriptionId) => {
  try {
    const subscription = await prisma.subscription.update({
      where: { id: subscriptionId },
      data: {
        status: 'cancelled',
        cancelledAt: new Date(),
      },
    });
    return subscription;
  } catch (error) {
    throw new Error(`Failed to cancel subscription: ${error.message}`);
  }
};

// Update subscription
exports.updateSubscription = async (subscriptionId, updateData) => {
  try {
    const subscription = await prisma.subscription.update({
      where: { id: subscriptionId },
      data: updateData,
      include: {
        payments: { orderBy: { createdAt: 'desc' }, take: 5 },
        invoices: { orderBy: { createdAt: 'desc' }, take: 5 },
      },
    });
    return subscription;
  } catch (error) {
    throw new Error(`Failed to update subscription: ${error.message}`);
  }
};

// Delete subscription
exports.deleteSubscription = async (subscriptionId) => {
  try {
    await prisma.subscription.delete({
      where: { id: subscriptionId },
    });
    return { message: 'Subscription deleted' };
  } catch (error) {
    throw new Error(`Failed to delete subscription: ${error.message}`);
  }
};

// Get analytics
exports.getAnalytics = async () => {
  try {
    const totalSubscriptions = await prisma.subscription.count();
    const activeSubscriptions = await prisma.subscription.count({
      where: { status: 'active' },
    });
    const cancelledSubscriptions = await prisma.subscription.count({
      where: { status: 'cancelled' },
    });
    const paidSubscriptions = await prisma.subscription.count({
      where: { paymentStatus: 'paid' },
    });

    const subscriptionsByPlan = await prisma.subscription.groupBy({
      by: ['plan'],
      _count: true,
      where: { status: 'active' },
    });

    const subscriptionsByBillingCycle = await prisma.subscription.groupBy({
      by: ['billingCycle'],
      _count: true,
    });

    const revenueByPlan = await prisma.subscription.groupBy({
      by: ['plan'],
      _sum: { amount: true },
      where: { paymentStatus: 'paid' },
    });

    return {
      totalSubscriptions,
      activeSubscriptions,
      cancelledSubscriptions,
      paidSubscriptions,
      subscriptionsByPlan,
      subscriptionsByBillingCycle,
      revenueByPlan,
    };
  } catch (error) {
    throw new Error(`Failed to get analytics: ${error.message}`);
  }
};

// Upgrade subscription
exports.upgradeSubscription = async (subscriptionId, newPlan) => {
  try {
    const subscription = await prisma.subscription.findUnique({
      where: { id: subscriptionId },
    });

    if (!subscription) {
      throw new Error('Subscription not found');
    }

    const newAmount = paymentService.calculateAmount(newPlan, subscription.billingCycle);

    const updated = await prisma.subscription.update({
      where: { id: subscriptionId },
      data: {
        plan: newPlan,
        amount: newAmount,
        features: getFeaturesByPlan(newPlan),
      },
      include: {
        payments: { orderBy: { createdAt: 'desc' }, take: 5 },
        invoices: { orderBy: { createdAt: 'desc' }, take: 5 },
      },
    });
    return updated;
  } catch (error) {
    throw new Error(`Failed to upgrade subscription: ${error.message}`);
  }
};

// Change billing cycle
exports.changeBillingCycle = async (subscriptionId, newBillingCycle) => {
  try {
    const subscription = await prisma.subscription.findUnique({
      where: { id: subscriptionId },
    });

    if (!subscription) {
      throw new Error('Subscription not found');
    }

    const newAmount = paymentService.calculateAmount(subscription.plan, newBillingCycle);
    const nextBillingDate = calculateNextBillingDate(newBillingCycle);

    const updated = await prisma.subscription.update({
      where: { id: subscriptionId },
      data: {
        billingCycle: newBillingCycle,
        amount: newAmount,
        nextBillingDate,
      },
      include: {
        payments: { orderBy: { createdAt: 'desc' }, take: 5 },
        invoices: { orderBy: { createdAt: 'desc' }, take: 5 },
      },
    });
    return updated;
  } catch (error) {
    throw new Error(`Failed to change billing cycle: ${error.message}`);
  }
};

// Verify subscription is active
exports.verifySubscriptionActive = async (subscriptionId) => {
  try {
    const subscription = await prisma.subscription.findUnique({
      where: { id: subscriptionId },
    });
    return subscription && subscription.status === 'active';
  } catch (error) {
    throw new Error(`Failed to verify subscription: ${error.message}`);
  }
};

// Get pricing
exports.getPricing = () => {
  return paymentService.getPricing();
};

function calculateNextBillingDate(billingCycle) {
  const date = new Date();
  if (billingCycle === 'weekly') {
    date.setDate(date.getDate() + 7);
  } else if (billingCycle === 'monthly') {
    date.setMonth(date.getMonth() + 1);
  } else if (billingCycle === 'yearly') {
    date.setFullYear(date.getFullYear() + 1);
  }
  return date;
}

function getFeaturesByPlan(plan) {
  const features = {
    basic: ['Dashboard', 'Basic Reporting', 'Email Support'],
    professional: ['Dashboard', 'Advanced Reporting', 'Priority Support', 'API Access', 'Custom Branding'],
    enterprise: ['All Professional Features', 'Dedicated Support', 'Custom Integration', 'Training', 'SLA'],
  };
  return features[plan] || features.basic;
}

module.exports = exports;
