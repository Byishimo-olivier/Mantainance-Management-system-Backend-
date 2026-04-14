const trialService = require('../modules/subscription/trial.service');

/**
 * Middleware to check trial status on protected routes
 * Can be used selectively on routes that need trial/payment enforcement
 */
const checkTrialAccess = async (req, res, next) => {
  try {
    if (!req.user || !req.user.id) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    // Get user's company and check trial status
    const canAccess = await trialService.canAccessFeatures(req.user.id);

    if (!canAccess) {
      // Check if trial has expired vs no company
      const hasExpiredTrial = await trialService.hasTrialExpired(req.user.id);
      
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
    req.trialStatus = await trialService.getTrialStatus(req.user.company?.id);
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
    if (!req.user || !req.user.id) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const isInTrial = await trialService.isUserInActiveTrial(req.user.id);
    
    if (!isInTrial) {
      const hasExpiredTrial = await trialService.hasTrialExpired(req.user.id);
      
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
    if (req.user?.id) {
      const trialStatus = await trialService.getTrialStatus(req.user?.company?.id);
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
  attachTrialStatus,
};
