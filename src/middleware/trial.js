const trialService = require('../modules/subscription/trial.service');

const getAuthUserId = (req) => req.user?.userId || req.user?.id || req.user?._id;
const isSuperAdmin = (req) => ['superadmin', 'super-admin'].includes(String(req.user?.role || '').toLowerCase());

const denyFeatureAccess = (res, feature) => res.status(403).json({
  error: 'FEATURE_NOT_AVAILABLE',
  message: 'This service is not included in your current subscription plan. Please review your subscribed plan and upgrade to a plan that includes the service you need.',
  feature,
  requiresUpgrade: true,
});

/**
 * Require plan access to a specific feature.
 * Use after authenticate/optionalAuthenticate. Anonymous requests can pass only
 * when allowAnonymous is true, which preserves explicit public endpoints.
 */
const requireFeature = (feature, options = {}) => async (req, res, next) => {
  try {
    const userId = getAuthUserId(req);

    if (!userId) {
      if (options.allowAnonymous) return next();
      return res.status(401).json({ message: 'Unauthorized' });
    }

    if (isSuperAdmin(req)) return next();

    const hasAccess = await trialService.hasFeatureAccess(userId, feature);
    if (!hasAccess) {
      return denyFeatureAccess(res, feature);
    }

    next();
  } catch (error) {
    console.error('Feature access check failed:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

const requireFeatureWrite = (feature, options = {}) => async (req, res, next) => {
  try {
    const userId = getAuthUserId(req);

    if (!userId) {
      if (options.allowAnonymous) return next();
      return res.status(401).json({ message: 'Unauthorized' });
    }

    if (isSuperAdmin(req)) return next();

    const hasAccess = await trialService.hasWriteAccess(userId, feature);
    if (!hasAccess) {
      return denyFeatureAccess(res, feature);
    }

    next();
  } catch (error) {
    console.error('Feature write access check failed:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

/**
 * Middleware to check trial status on protected routes
 * Can be used selectively on routes that need trial/payment enforcement
 */
const checkTrialAccess = async (req, res, next) => {
  try {
    const userId = getAuthUserId(req);
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    // Get user's company and check trial status
    const canAccess = await trialService.canAccessFeatures(userId);

    if (!canAccess) {
      // Check if trial has expired vs no company
      const hasExpiredTrial = await trialService.hasTrialExpired(userId);
      
      if (hasExpiredTrial) {
        return res.status(403).json({
          error: 'TRIAL_EXPIRED',
          message: 'Your free trial period has ended. Please upgrade to a paid plan to continue.',
          requiresPayment: true,
        });
      }

      return res.status(403).json({
        error: 'NO_ACCESS',
        message: 'Your account does not have access to this feature.',
      });
    }

    // Attach trial info to request
    req.trialStatus = req.user.company?.id
      ? await trialService.getTrialStatus(req.user.company.id)
      : null;
    next();
  } catch (error) {
    console.error('Trial access check failed:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

/**
 * Middleware to check if in active trial
 * Only allows access during trial or with active paid subscription
 */
const requireTrialOrPaid = async (req, res, next) => {
  try {
    const userId = getAuthUserId(req);
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const hasPlanOrTrial = await trialService.canAccessFeatures(userId);
    
    if (!hasPlanOrTrial) {
      const hasExpiredTrial = await trialService.hasTrialExpired(userId);
      
      if (hasExpiredTrial) {
        return res.status(403).json({
          error: 'TRIAL_EXPIRED',
          message: 'Your free trial period has ended. Upgrade to paid plan.',
          requiresPayment: true,
        });
      }
    }

    next();
  } catch (error) {
    console.error('Trial/Paid check failed:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

/**
 * Attach trial status to response for all API calls
 * Useful for frontend to show trial countdown
 */
const attachTrialStatus = async (req, res, next) => {
  try {
    const userId = getAuthUserId(req);
    if (userId && req.user?.company?.id) {
      const trialStatus = await trialService.getTrialStatus(req.user.company.id);
      req.trialStatus = trialStatus;
    }
    next();
  } catch (error) {
    console.error('Attach trial status failed:', error);
    next(); // Continue even if this fails
  }
};

module.exports = {
  checkTrialAccess,
  requireTrialOrPaid,
  requireFeature,
  requireFeatureWrite,
  attachTrialStatus,
};
