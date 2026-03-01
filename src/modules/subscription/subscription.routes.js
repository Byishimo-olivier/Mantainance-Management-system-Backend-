const express = require('express');
const ctrl = require('./subscription.controller');
const { authenticate, authorizeRoles } = require('../../middleware/auth.js');
const router = express.Router();

// Payment routes - nested under subscription
const paymentRoutes = require('./payment.routes');

// Public endpoint for creating subscription (with credential validation)
router.post('/', ctrl.createSubscription);

// Get pricing (public)
router.get('/public/pricing', ctrl.getPricing);

// Payment routes
router.use('/payments', paymentRoutes);

// Protected routes - require authentication
router.use(authenticate);

// Get all subscriptions (admin/manager only)
router.get('/', authorizeRoles('admin', 'manager'), ctrl.getAllSubscriptions);

// Get analytics (admin/manager only)
router.get('/analytics/summary', authorizeRoles('admin', 'manager'), ctrl.getAnalytics);

// Get subscription by client ID
router.get('/client/:clientId', ctrl.getSubscriptionByClientId);

// Verify subscription is active
router.get('/:id/verify', ctrl.verifyActive);

// Change billing cycle
router.post('/:id/billing-cycle', ctrl.changeBillingCycle);

// Get subscription by ID
router.get('/:id', ctrl.getSubscriptionById);

// Update subscription
// allow owners or privileged roles to edit their own subscription
router.put('/:id', ctrl.updateSubscription);

// Upgrade subscription
router.post('/:id/upgrade', authorizeRoles('admin', 'manager'), ctrl.upgradeSubscription);

// Cancel subscription
router.post('/:id/cancel', ctrl.cancelSubscription);

// Get subscription property
router.get('/:id/property', ctrl.getSubscriptionProperty);

// Delete subscription (admin only)
router.delete('/:id', authorizeRoles('admin'), ctrl.deleteSubscription);

module.exports = router;
