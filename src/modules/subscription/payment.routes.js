const express = require('express');
const ctrl = require('./payment.controller');
const { authenticate, authorizeRoles } = require('../../middleware/auth.js');
const router = express.Router();

// Get pricing (public)
router.get('/public/pricing', ctrl.getPricing);

// Calculate amount (public)
router.get('/public/calculate', ctrl.calculateAmount);

// PayPack callback (webhook - no authentication required)
router.post('/callback', ctrl.paypackCallback);

// All other payment routes require authentication
router.use(authenticate);

// Create payment
router.post('/', ctrl.createPayment);

// Process payment
router.post('/process', ctrl.processPayment);

// Initiate PayPack payment
router.post('/initiate-paypack', ctrl.initiatePayPackPayment);

// Get payment by ID
router.get('/:id', ctrl.getPaymentById);

// Get all payments for a subscription
router.get('/subscription/:subscriptionId', ctrl.getSubscriptionPayments);

// Refund payment
router.post('/:id/refund', ctrl.refundPayment);

// Get all payments (admin/manager only)
router.get('/', authorizeRoles('admin', 'manager'), ctrl.getAllPayments);

module.exports = router;
