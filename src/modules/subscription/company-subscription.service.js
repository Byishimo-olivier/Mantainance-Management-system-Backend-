const { PrismaClient } = require('@prisma/client');
const User = require('../user/user.model.js');
const prisma = new PrismaClient();

const normalizeCompanyString = (value) => String(value || '').trim().toLowerCase();

/**
 * Get company subscription status for a user
 * Returns the company's subscription if user is part of a company with active subscription
 */
exports.getCompanySubscription = async (userId) => {
  try {
    const mongoUser = await User.findById(userId).select('companyName email').lean().catch(() => null);
    const normalizedCompanyName = String(mongoUser?.companyName || '').trim();
    const normalizedEmail = String(mongoUser?.email || '').trim().toLowerCase();

    if (normalizedCompanyName) {
      const subscriptionCandidates = await prisma.subscription.findMany({
        where: {
          OR: [
            { company: { name: normalizedCompanyName } },
            ...(normalizedEmail ? [{ email: normalizedEmail }] : []),
          ],
        },
        orderBy: { createdAt: 'desc' },
        include: { company: true },
      });

      const companyNameSubscription = subscriptionCandidates.find((subscription) => {
        const companyNameMatch = normalizeCompanyString(subscription?.company?.name) === normalizeCompanyString(normalizedCompanyName);
        const metadataCompanyMatch = normalizeCompanyString(subscription?.metadata?.companyName) === normalizeCompanyString(normalizedCompanyName);
        const emailMatch = normalizedEmail && String(subscription?.email || '').trim().toLowerCase() === normalizedEmail;
        return companyNameMatch || metadataCompanyMatch || emailMatch;
      });

      if (companyNameSubscription) {
        return companyNameSubscription;
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

    const subscriptions = Array.isArray(user.company.subscriptions) ? user.company.subscriptions : [];
    if (!subscriptions.length) return null;

    const now = new Date();
    const activeSubscription = subscriptions.find((subscription) => {
      const status = String(subscription?.status || '').toLowerCase();
      if (status !== 'active') return false;
      if (!subscription?.endDate) return true;
      const endDate = new Date(subscription.endDate);
      return !Number.isNaN(endDate.getTime()) && endDate > now;
    });

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
    const mongoUser = await User.findById(userId).select('companyName').lean().catch(() => null);
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
exports.ensureCompanyExists = async (companyName, userId) => {
  try {
    // Check if company already exists
    let company = await prisma.company.findUnique({
      where: { name: companyName }
    });

    if (!company) {
      // Create new company
      company = await prisma.company.create({
        data: {
          name: companyName,
          adminId: userId,
          totalUsers: 1
        }
      });
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
    const hasActive = await exports.hasActiveSubscription(userId);
    const subscription = await exports.getCompanySubscription(userId);
    const teamMembers = await exports.getCompanyTeamMembers(userId);
    const mongoUser = await User.findById(userId).select('companyName').lean().catch(() => null);
    
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { company: true }
    });

    return {
      hasActiveSubscription: hasActive,
      subscription: subscription ? {
        id: subscription.id,
        plan: subscription.plan,
        billingCycle: subscription.billingCycle,
        status: subscription.status,
        startDate: subscription.startDate,
        endDate: subscription.endDate,
        nextBillingDate: subscription.nextBillingDate
      } : null,
      company: user?.company ? {
        id: user.company.id,
        name: user.company.name,
        totalUsers: user.company.totalUsers,
        maxUsers: user.company.maxUsers,
        subscriptionStatus: user.company.subscriptionStatus,
        subscriptionPlan: user.company.subscriptionPlan
      } : (mongoUser?.companyName ? {
        id: null,
        name: mongoUser.companyName,
        totalUsers: teamMembers.length,
        maxUsers: null,
        subscriptionStatus: subscription?.status || 'inactive',
        subscriptionPlan: subscription?.plan || null,
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
