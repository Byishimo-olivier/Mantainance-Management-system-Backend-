const express = require('express');
const ctrl = require('./subscription.controller');
const { authenticate, authorizeRoles } = require('../../middleware/auth.js');
const { requireSubscriptionAccess } = require('./subscription.access');
const router = express.Router();

// Payment routes - nested under subscription
const paymentRoutes = require('./payment.routes');

// Public endpoint for creating subscription (with credential validation)
router.post('/', ctrl.createSubscription);

// Get pricing (public)
router.get('/public/pricing', ctrl.getPricing);

// Payment routes
router.use('/payments', paymentRoutes);

// ============================================
// TRIAL-RELATED ROUTES (MUST BE BEFORE /:id)
// ============================================
router.get('/trial/status', authenticate, ctrl.getTrialStatus);
router.post('/trial/initialize', authenticate, ctrl.initializeFreeTrial);
router.post('/trial/upgrade-to-paid', authenticate, ctrl.upgradeToPaid);
router.get('/trial/can-access', authenticate, ctrl.canAccessFeatures);
router.get('/trial/companies', authenticate, authorizeRoles('superadmin'), ctrl.getTrialCompanies);
router.post('/trial/companies/:companyId/extend', authenticate, authorizeRoles('superadmin'), ctrl.extendFreeTrial);
router.patch('/company/:companyId/free-staff-invites', authenticate, authorizeRoles('superadmin'), ctrl.updateCompanyFreeStaffInvites);

// ============================================
// FEATURE ACCESS ROUTES
// ============================================
router.get('/features/subscription-info', authenticate, ctrl.getUserSubscriptionInfo);
router.get('/features/accessible', authenticate, ctrl.getAccessibleFeatures);
router.get('/features/has-access', authenticate, ctrl.hasFeatureAccess);

// Protected routes - require authentication
router.use(authenticate);

// Get company subscription status for authenticated user
router.get('/status', ctrl.getCompanySubscriptionStatus);

// Get all subscriptions (admin/manager only)
router.get('/', authorizeRoles('superadmin'), ctrl.getAllSubscriptions);

// Get analytics (admin/manager only)
router.get('/analytics/summary', authorizeRoles('superadmin'), ctrl.getAnalytics);

// Get subscription by client ID
router.get('/client/:clientId', ctrl.getSubscriptionByClientId);

// Verify subscription is active
router.get('/:id/verify', requireSubscriptionAccess, ctrl.verifyActive);

// Change billing cycle
router.post('/:id/billing-cycle', requireSubscriptionAccess, ctrl.changeBillingCycle);

// Get subscription by ID
router.get('/:id', requireSubscriptionAccess, ctrl.getSubscriptionById);

// Update subscription
// allow owners or privileged roles to edit their own subscription
router.put('/:id', requireSubscriptionAccess, ctrl.updateSubscription);

// Upgrade subscription
router.post('/:id/upgrade', authorizeRoles('admin', 'manager'), requireSubscriptionAccess, ctrl.upgradeSubscription);

// Cancel subscription
router.post('/:id/cancel', requireSubscriptionAccess, ctrl.cancelSubscription);

// Get subscription property
router.get('/:id/property', requireSubscriptionAccess, ctrl.getSubscriptionProperty);

// Delete subscription (admin only)
router.delete('/:id', authorizeRoles('superadmin'), ctrl.deleteSubscription);

module.exports = router;
