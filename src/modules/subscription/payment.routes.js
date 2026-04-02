const express = require('express');
const ctrl = require('./payment.controller');
const { authenticate, authorizeRoles } = require('../../middleware/auth.js');
const router = express.Router();

// Get pricing (public)
router.get('/public/pricing', ctrl.getPricing);

// Calculate amount (public)
router.get('/public/calculate', ctrl.calculateAmount);

// Get supported mobile money providers (public)
router.get('/public/mobile-money-providers', ctrl.getSupportedMobileMoneyProviders);

// Check PesaPal payment status (public - for Step 5 of integration)
router.get('/pesapal-status', ctrl.getPesaPalPaymentStatus);

// ============================================
// PesaPal Testing & Debugging Routes (public)
// ============================================
router.get('/public/test-pesapal', ctrl.testPesaPalConnectivity);
router.get('/public/config', ctrl.getPesaPalConfig);
router.get('/public/endpoints', ctrl.getPesaPalEndpoints);

// PayPack callback (webhook - no authentication required)
router.post('/callback', ctrl.paypackCallback);

// PesaPal callback (webhook/redirect - no authentication required)
router.all('/pesapal-callback', ctrl.pesapalCallback);

// Mobile money callback (webhook - no authentication required)
router.post('/mobile-money-callback', ctrl.mobileMoneyCallback);

// All other payment routes require authentication
router.use(authenticate);

// Create payment
router.post('/', ctrl.createPayment);

// Process payment
router.post('/process', ctrl.processPayment);

// Initiate PayPack payment
router.post('/initiate-paypack', ctrl.initiatePayPackPayment);

// Initiate PesaPal payment
router.post('/initiate-pesapal', ctrl.initiatePesaPalPayment);

// Initiate mobile money payment
router.post('/initiate-mobile-money', ctrl.initiateMobileMoneyPayment);

// Get payment by ID
router.get('/:id', ctrl.getPaymentById);

// Get all payments for a subscription
router.get('/subscription/:subscriptionId', ctrl.getSubscriptionPayments);

// Refund payment
router.post('/:id/refund', ctrl.refundPayment);

// Get all payments (admin/manager only)
router.get('/', authorizeRoles('admin', 'manager'), ctrl.getAllPayments);

module.exports = router;
