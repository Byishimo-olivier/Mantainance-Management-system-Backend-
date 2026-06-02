const { PrismaClient } = require('@prisma/client');
const User = require('../user/user.model.js');
const paymentService = require('./payment.service');
const prisma = new PrismaClient();

const normalizeCompanyString = (value) => String(value || '').trim().toLowerCase();
const normalizeRole = (value) => String(value || '').trim().toLowerCase();
const isSuperAdminRole = (value) => normalizeRole(value) === 'superadmin';
const slugifyCompanyName = (value) => normalizeCompanyString(value)
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '');
const pickBestSubscription = (subscriptions = []) => {
  const candidates = Array.isArray(subscriptions) ? subscriptions : [];
  if (!candidates.length) return null;

  const now = new Date();
  const activeCandidate = candidates.find((subscription) => isCurrentlyActiveSubscription(subscription, now));
  if (activeCandidate) return activeCandidate;

  return candidates.find(
    (subscription) => String(subscription?.status || '').toLowerCase() !== 'cancelled'
  ) || candidates[0] || null;
};

const reconcilePendingPaymentsInBackground = (subscriptionIds = []) => {
  const ids = [...new Set((subscriptionIds || []).filter(Boolean).map(String))];
  if (!ids.length) {
    return;
  }

  paymentService
    .reconcilePendingMobileMoneyPayments(ids)
    .catch((error) => console.warn(`Background company payment reconciliation failed: ${error.message}`));
};

const isCurrentlyActiveSubscription = (subscription, now = new Date()) => {
  const status = String(subscription?.status || '').toLowerCase();
  if (status !== 'active') return false;
  if (!subscription?.endDate) return true;
  const endDate = new Date(subscription.endDate);
  return !Number.isNaN(endDate.getTime()) && endDate > now;
};

/**
 * Get company subscription status for a user
 * Returns the company's subscription if user is part of a company with active subscription
 */
exports.getCompanySubscription = async (userId) => {
  try {
    const mongoUser = await User.findById(userId).select('companyName email role').lean().catch(() => null);
    if (isSuperAdminRole(mongoUser?.role)) {
      return null;
    }

    const normalizedCompanyName = String(mongoUser?.companyName || '').trim();
    const normalizedEmail = String(mongoUser?.email || '').trim().toLowerCase();

    if (normalizedCompanyName) {
      let subscriptionCandidates = await prisma.subscription.findMany({
        where: {
          company: { name: normalizedCompanyName },
        },
        orderBy: { createdAt: 'desc' },
        include: { company: true },
      });

      reconcilePendingPaymentsInBackground(subscriptionCandidates.map((subscription) => subscription.id));

      const matchingCandidates = subscriptionCandidates.filter((subscription) => {
        const companyNameMatch = normalizeCompanyString(subscription?.company?.name) === normalizeCompanyString(normalizedCompanyName);
        const metadataCompanyMatch = normalizeCompanyString(subscription?.metadata?.companyName) === normalizeCompanyString(normalizedCompanyName);
        return companyNameMatch || metadataCompanyMatch;
      });

      const bestLinkedCandidate = pickBestSubscription(matchingCandidates);
      if (bestLinkedCandidate) {
        return bestLinkedCandidate;
      }

      const recentSubscriptions = await prisma.subscription.findMany({
        orderBy: { createdAt: 'desc' },
        include: { company: true },
        take: 300,
      });

      reconcilePendingPaymentsInBackground(recentSubscriptions.map((subscription) => subscription.id));

      const metadataMatches = recentSubscriptions.filter((subscription) => (
        normalizeCompanyString(subscription?.company?.name) === normalizeCompanyString(normalizedCompanyName) ||
        normalizeCompanyString(subscription?.metadata?.companyName) === normalizeCompanyString(normalizedCompanyName)
      ));

      const bestMetadataCandidate = pickBestSubscription(metadataMatches);
      if (bestMetadataCandidate) {
        return bestMetadataCandidate;
      }
    }

    if (normalizedEmail) {
      const emailCandidates = await prisma.subscription.findMany({
        where: { email: normalizedEmail },
        orderBy: { createdAt: 'desc' },
        include: { company: true },
        take: 20,
      });

      const bestEmailCandidate = pickBestSubscription(emailCandidates);
      if (bestEmailCandidate) {
        return bestEmailCandidate;
      }
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        company: {
          include: {
            subscriptions: {
              orderBy: { createdAt: 'desc' }
            }
          }
        }
      }
    });

    if (!user?.company) {
      return null; // User not part of any company
    }

    let subscriptions = Array.isArray(user.company.subscriptions) ? user.company.subscriptions : [];
    reconcilePendingPaymentsInBackground(subscriptions.map((subscription) => subscription.id));
    if (!subscriptions.length) return null;

    const now = new Date();
    const activeSubscription = subscriptions.find((subscription) => isCurrentlyActiveSubscription(subscription, now));

    return activeSubscription || subscriptions[0] || null;
  } catch (error) {
    throw new Error(`Failed to get company subscription: ${error.message}`);
  }
};

/**
 * Check if a user's company has an active subscription
 */
exports.hasActiveSubscription = async (userId) => {
  try {
    const subscription = await exports.getCompanySubscription(userId);
    
    if (!subscription) return false;
    
    const now = new Date();
    const hasValidEndDate = !subscription.endDate || new Date(subscription.endDate) > now;
    const isActive =
      String(subscription.status || '').toLowerCase() === 'active' &&
      hasValidEndDate;
    
    return isActive;
  } catch (error) {
    console.error('Error checking active subscription:', error);
    return false;
  }
};

/**
 * Get all team members from same company
 */
exports.getCompanyTeamMembers = async (userId) => {
  try {
    const mongoUser = await User.findById(userId).select('companyName role').lean().catch(() => null);
    if (isSuperAdminRole(mongoUser?.role)) {
      return [];
    }

    const normalizedCompanyName = String(mongoUser?.companyName || '').trim();
    if (normalizedCompanyName) {
      const members = await User.find({ companyName: normalizedCompanyName })
        .select('_id name email phone role isCompanyAdmin createdAt companyName')
        .lean();

      return members.map((member) => ({
        id: String(member._id),
        name: member.name,
        email: member.email,
        phone: member.phone,
        role: member.role,
        isCompanyAdmin: !!member.isCompanyAdmin,
        createdAt: member.createdAt,
        companyName: member.companyName,
      }));
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        company: true
      }
    });

    if (!user?.company) {
      return []; // User not part of any company
    }

    const teamMembers = await prisma.user.findMany({
      where: {
        companyId: user.company.id
      },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        isCompanyAdmin: true,
        createdAt: true
      }
    });

    return teamMembers;
  } catch (error) {
    throw new Error(`Failed to get team members: ${error.message}`);
  }
};

/**
 * Create or get company for a user during registration
 */
exports.ensureCompanyExists = async (companyName, userId, email = '') => {
  try {
    const normalizedCompanyName = String(companyName || '').trim();
    if (!normalizedCompanyName) {
      throw new Error('Company name is required');
    }

    const mongoUser = userId
      ? await User.findById(userId).select('email').lean().catch(() => null)
      : null;
    const normalizedEmail = String(email || mongoUser?.email || '').trim().toLowerCase();

    // Check if company already exists. Name is unique, but older data may differ
    // by case/spacing, so fall back to email and then a case-insensitive scan.
    let company = await prisma.company.findUnique({
      where: { name: normalizedCompanyName }
    });

    if (!company && normalizedEmail) {
      company = await prisma.company.findUnique({
        where: { email: normalizedEmail }
      }).catch(() => null);
    }

    if (!company) {
      const recentCompanies = await prisma.company.findMany({
        take: 300,
        orderBy: { createdAt: 'desc' },
      });
      company = recentCompanies.find(
        (candidate) => normalizeCompanyString(candidate.name) === normalizeCompanyString(normalizedCompanyName)
      ) || null;
    }

    if (!company) {
      company = await prisma.company.create({
        data: {
          name: normalizedCompanyName,
          email: normalizedEmail || `${slugifyCompanyName(normalizedCompanyName) || 'company'}-${String(userId || Date.now())}@fixnest.local`,
          adminId: userId,
          totalUsers: 1
        }
      });
    } else {
      const updates = {};
      if (!company.email && normalizedEmail) updates.email = normalizedEmail;
      if (!company.adminId && userId) updates.adminId = userId;

      if (Object.keys(updates).length) {
        company = await prisma.company.update({
          where: { id: company.id },
          data: updates,
        }).catch(() => company);
      }
    }

    return company;
  } catch (error) {
    throw new Error(`Failed to ensure company exists: ${error.message}`);
  }
};

/**
 * Add user to company
 */
exports.addUserToCompany = async (userId, companyId, isAdmin = false) => {
  try {
    const user = await prisma.user.update({
      where: { id: userId },
      data: {
        companyId,
        isCompanyAdmin: isAdmin
      },
      include: {
        company: true
      }
    });

    // Increment company user count
    await prisma.company.update({
      where: { id: companyId },
      data: {
        totalUsers: {
          increment: 1
        }
      }
    });

    return user;
  } catch (error) {
    throw new Error(`Failed to add user to company: ${error.message}`);
  }
};

/**
 * Create company subscription
 */
exports.createCompanySubscription = async (companyId, subscriptionData) => {
  try {
    const subscription = await prisma.subscription.create({
      data: {
        companyId,
        email: subscriptionData.email,
        plan: subscriptionData.plan,
        billingCycle: subscriptionData.billingCycle,
        amount: subscriptionData.amount,
        currency: subscriptionData.currency,
        status: 'active',
        paymentStatus: 'paid',
        paymentMethod: subscriptionData.paymentMethod,
        paidAt: new Date(),
        metadata: subscriptionData.metadata || {}
      }
    });

    // Update company subscription status
    await prisma.company.update({
      where: { id: companyId },
      data: {
        subscriptionStatus: 'active',
        subscriptionPlan: subscriptionData.plan,
        subscriptionStartDate: new Date(),
        subscriptionEndDate: calculateNextBillingDate(subscriptionData.billingCycle)
      }
    });

    return subscription;
  } catch (error) {
    throw new Error(`Failed to create company subscription: ${error.message}`);
  }
};

/**
 * Get subscription status response for user
 */
exports.getUserSubscriptionStatus = async (userId) => {
  try {
    const mongoUser = await User.findById(userId)
      .select('companyName role isCompanyAdmin')
      .lean()
      .catch(() => null);

    if (isSuperAdminRole(mongoUser?.role)) {
      return {
        hasActiveSubscription: true,
        subscription: null,
        company: null,
        teamMembers: [],
        isCompanyAdmin: true,
      };
    }

    const hasActive = await exports.hasActiveSubscription(userId);
    const subscription = await exports.getCompanySubscription(userId);
    const teamMembers = await exports.getCompanyTeamMembers(userId);
    
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { company: true }
    });

    const companyMetadata = user?.company?.metadata && typeof user.company.metadata === 'object' ? user.company.metadata : {};
    const subscriptionMetadata = subscription?.metadata && typeof subscription.metadata === 'object' ? subscription.metadata : {};
    const allowFreeStaffInvites = Boolean(
      companyMetadata.allowFreeStaffInvites === true ||
      companyMetadata.freeStaffInvites === true ||
      companyMetadata.allowFreeInvite === true ||
      subscriptionMetadata.allowFreeStaffInvites === true ||
      subscriptionMetadata.freeStaffInvites === true ||
      subscriptionMetadata.allowFreeInvite === true
    );

    return {
      hasActiveSubscription: hasActive,
      subscription: subscription ? {
        id: subscription.id,
        plan: subscription.plan,
        billingCycle: subscription.billingCycle,
        amount: subscription.amount,
        status: subscription.status,
        paymentStatus: subscription.paymentStatus,
        startDate: subscription.startDate,
        endDate: subscription.endDate,
        nextBillingDate: subscription.nextBillingDate,
        metadata: {
          ...subscriptionMetadata,
          allowFreeStaffInvites,
          freeStaffInvites: allowFreeStaffInvites,
          allowFreeInvite: allowFreeStaffInvites,
        },
      } : null,
      company: user?.company ? {
        id: user.company.id,
        name: user.company.name,
        totalUsers: user.company.totalUsers,
        maxUsers: user.company.maxUsers,
        subscriptionStatus: user.company.subscriptionStatus,
        subscriptionPlan: user.company.subscriptionPlan,
        metadata: companyMetadata,
        allowFreeStaffInvites,
        freeStaffInvites: allowFreeStaffInvites,
        allowFreeInvite: allowFreeStaffInvites,
      } : (mongoUser?.companyName ? {
        id: null,
        name: mongoUser.companyName,
        totalUsers: teamMembers.length,
        maxUsers: null,
        subscriptionStatus: subscription?.status || 'inactive',
        subscriptionPlan: subscription?.plan || null,
        allowFreeStaffInvites,
        freeStaffInvites: allowFreeStaffInvites,
        allowFreeInvite: allowFreeStaffInvites,
      } : null),
      teamMembers: teamMembers,
      isCompanyAdmin: user?.isCompanyAdmin || false
    };
  } catch (error) {
    throw new Error(`Failed to get subscription status: ${error.message}`);
  }
};

/**
 * Helper: Calculate next billing date
 */
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
