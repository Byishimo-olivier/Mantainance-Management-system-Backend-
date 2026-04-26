const paymentService = require('./payment.service');
const { normalizeExtendedJSON } = require('../../utils/normalize');
const systemSettingsService = require('../systemSettings/systemSettings.service');

exports.processPayment = async (req, res) => {
  try {
    const { subscriptionId, amount, paymentMethod, currency } = req.body;

    // Validate required fields
    if (!subscriptionId || !amount || !paymentMethod) {
      return res.status(400).json({
        error: 'Missing required fields: subscriptionId, amount, paymentMethod',
      });
    }

    const payment = await paymentService.processPayment({
      subscriptionId,
      amount,
      paymentMethod,
      currency,
    });

    res.status(201).json({
      message: 'Payment processed',
      data: normalizeExtendedJSON(payment),
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

exports.createPayment = async (req, res) => {
  try {
    const { subscriptionId, amount, paymentMethod, currency, description } = req.body;

    if (!subscriptionId || !amount || !paymentMethod) {
      return res.status(400).json({
        error: 'Missing required fields',
      });
    }

    const payment = await paymentService.createPayment({
      subscriptionId,
      amount,
      paymentMethod,
      currency,
      description,
    });

    res.status(201).json({
      message: 'Payment created',
      data: normalizeExtendedJSON(payment),
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

exports.getPaymentById = async (req, res) => {
  try {
    const { id } = req.params;

    const payment = await paymentService.getPaymentById(id);

    if (!payment) {
      return res.status(404).json({ error: 'Payment not found' });
    }

    res.json({
      message: 'Payment retrieved',
      data: normalizeExtendedJSON(payment),
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

exports.getSubscriptionPayments = async (req, res) => {
  try {
    const { subscriptionId } = req.params;

    const payments = await paymentService.getSubscriptionPayments(subscriptionId);

    res.json({
      message: 'Payments retrieved',
      count: payments.length,
      data: normalizeExtendedJSON(payments),
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

exports.getAllPayments = async (req, res) => {
  try {
    const { status, paymentMethod } = req.query;

    const payments = await paymentService.getAllPayments({ status, paymentMethod });

    res.json({
      message: 'Payments retrieved',
      count: payments.length,
      data: normalizeExtendedJSON(payments),
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

exports.refundPayment = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    const payment = await paymentService.refundPayment(id, reason);

    res.json({
      message: 'Payment refunded',
      data: normalizeExtendedJSON(payment),
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

exports.getPricing = async (req, res) => {
  try {
    const pricing = paymentService.getPricing();
    const settings = await systemSettingsService.getSettings();

    res.json({
      message: 'Pricing retrieved',
      data: {
        pricing,
        currency: settings?.platform?.subscriptionCurrency || 'RWF',
      },
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

exports.calculateAmount = async (req, res) => {
  try {
    const { plan, billingCycle } = req.query;

    if (!plan || !billingCycle) {
      return res.status(400).json({
        error: 'Missing required parameters: plan, billingCycle',
      });
    }

    const amount = paymentService.calculateAmount(plan, billingCycle);
    const settings = await systemSettingsService.getSettings();

    res.json({
      message: 'Amount calculated',
      plan,
      billingCycle,
      amount,
      currency: settings?.platform?.subscriptionCurrency || 'USD',
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

exports.initiatePayPackPayment = async (req, res) => {
  try {
    const { subscriptionId, amount, phoneNumber, paymentMethod, email, userId } = req.body;

    if (!subscriptionId || !amount || !paymentMethod) {
      return res.status(400).json({
        error: 'Missing required fields: subscriptionId, amount, paymentMethod',
      });
    }

    const payment = await paymentService.initiatePayPackPayment({
      subscriptionId,
      amount,
      phoneNumber,
      paymentMethod,
      email: email || req.user?.email,
      userId: userId || req.user?.id,
    });

    res.status(201).json({
      message: 'PayPack payment initiated',
      data: normalizeExtendedJSON(payment),
      redirectUrl: payment.metadata?.paypackRedirectUrl,
    });
  } catch (error) {
    console.error('PayPack initiation error:', error);
    res.status(400).json({ error: error.message });
  }
};

exports.paypackCallback = async (req, res) => {
  try {
    console.log('PayPack callback received:', req.body);

    const payment = await paymentService.processPayPackCallback(req.body);

    res.json({
      message: 'Payment processed',
      data: normalizeExtendedJSON(payment),
    });
  } catch (error) {
    console.error('PayPack callback error:', error);
    res.status(400).json({ error: error.message });
  }
};

exports.initiatePesaPalPayment = async (req, res) => {
  try {
    const { subscriptionId, amount, phoneNumber, email, userId } = req.body;

    if (!subscriptionId || !amount) {
      return res.status(400).json({
        error: 'Missing required fields: subscriptionId, amount',
      });
    }

    const payment = await paymentService.initiatePesaPalPayment({
      subscriptionId,
      amount,
      phoneNumber,
      email: email || req.user?.email,
      userId: userId || req.user?.id,
    });

    res.status(201).json({
      message: 'PesaPal payment initiated',
      data: normalizeExtendedJSON(payment),
      redirectUrl: payment.metadata?.pesapalRedirectUrl,
    });
  } catch (error) {
    console.error('PesaPal initiation error:', error);
    res.status(400).json({ error: error.message });
  }
};

exports.pesapalCallback = async (req, res) => {
  try {
    const callbackData = { ...req.body, ...req.query };
    console.log('PesaPal callback received:', callbackData);

    const result = await paymentService.processPesaPalCallback(callbackData);

    // If it's a GET request (browser redirect), redirect to frontend
    if (req.method === 'GET') {
      const frontendUrl = process.env.FRONTEND_URL || 'https://mms-frontend.vercel.app';
      const status = result.status === 'completed' ? 'success' : 'failed';
      return res.redirect(`${frontendUrl}/subscription?payment_status=${status}&transaction_id=${result.id}`);
    }

    // If it's a POST request (IPN), just return JSON success
    res.json({
      message: 'Payment processed',
      data: normalizeExtendedJSON(result),
    });
  } catch (error) {
    console.error('PesaPal callback error:', error);
    
    // Even if it fails, if it's a GET request, we should redirect to an error page
    if (req.method === 'GET') {
      const frontendUrl = process.env.FRONTEND_URL || 'https://mms-frontend.vercel.app';
      return res.redirect(`${frontendUrl}/subscription?payment_status=error&message=${encodeURIComponent(error.message)}`);
    }
    
    res.status(400).json({ error: error.message });
  }
};

// Step 5: Get payment status from PesaPal (for post-payment verification)
exports.getPesaPalPaymentStatus = async (req, res) => {
  try {
    const { orderTrackingId, transactionId } = req.query;

    if (!orderTrackingId && !transactionId) {
      return res.status(400).json({
        error: 'Missing required parameter: orderTrackingId or transactionId',
      });
    }

    const status = await paymentService.getPesaPalPaymentStatus(orderTrackingId || transactionId);

    res.json({
      message: 'Payment status retrieved',
      data: {
        status: status.status,
        statusCode: status.statusCode,
      },
    });
  } catch (error) {
    console.error('PesaPal status check error:', error);
    res.status(400).json({ error: error.message });
  }
};

// Initiate mobile money payment (M-Pesa, Airtel Money, MTN Money, Orange Money, etc.)
exports.initiateMobileMoneyPayment = async (req, res) => {
  try {
    const { subscriptionId, amount, phoneNumber, provider, currency, email, userId } = req.body;

    if (!subscriptionId || !amount || !phoneNumber || !provider) {
      return res.status(400).json({
        error: 'Missing required fields: subscriptionId, amount, phoneNumber, provider',
      });
    }

    const payment = await paymentService.initiateMobileMoneyPayment({
      subscriptionId,
      amount,
      phoneNumber,
      provider,
      currency,
      email: email || req.user?.email,
      userId: userId || req.user?.id,
    });

    res.status(201).json({
      message: 'Mobile money payment initiated',
      data: normalizeExtendedJSON(payment),
      // Include instructions for the user
      instructions: payment.metadata,
    });
  } catch (error) {
    console.error('Mobile money initiation error:', error);
    res.status(400).json({ error: error.message });
  }
};

exports.getMobileMoneyPaymentStatus = async (req, res) => {
  try {
    const { paymentId, requestTransactionId, transactionId } = req.query;

    if (!paymentId && !requestTransactionId && !transactionId) {
      return res.status(400).json({
        error: 'Missing required parameter: paymentId, requestTransactionId, or transactionId',
      });
    }

    const result = await paymentService.getMobileMoneyPaymentStatus({
      paymentId,
      requestTransactionId,
      transactionId,
    });

    res.json({
      message: 'Mobile money payment status retrieved',
      data: normalizeExtendedJSON(result),
    });
  } catch (error) {
    console.error('Mobile money status check error:', error);
    res.status(400).json({ error: error.message });
  }
};

// Get supported mobile money providers
exports.getSupportedMobileMoneyProviders = async (req, res) => {
  try {
    const providers = [
      {
        id: 'airtel',
        name: 'Airtel Money',
        countries: ['RW'],
        description: 'Processed through the InTouchPay Rwanda gateway',
        ussdCode: '*144#',
      },
      {
        id: 'mtn',
        name: 'MTN Money',
        countries: ['RW'],
        description: 'Processed through the InTouchPay Rwanda gateway',
        ussdCode: '*182#',
      },
    ];

    res.json({
      message: 'Supported mobile money providers',
      count: providers.length,
      data: providers,
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

// Process mobile money callback
exports.mobileMoneyCallback = async (req, res) => {
  try {
    const callbackData = req.body?.jsonpayload ? req.body : { ...req.body, ...req.query };
    console.log('Mobile money callback received:', callbackData);

    const result = await paymentService.processMobileMoneyCallback(callbackData);

    res.json({
      message: 'Mobile money payment processed',
      data: normalizeExtendedJSON(result),
    });
  } catch (error) {
    console.error('Mobile money callback error:', error);
    res.status(400).json({ error: error.message });
  }
};

// ============================================
// PesaPal Testing & Debugging Endpoints
// ============================================

/**
 * Test PesaPal connectivity and configuration
 * GET /subscriptions/payments/test-pesapal
 */
exports.testPesaPalConnectivity = async (req, res) => {
  try {
    const result = await paymentService.testPesaPalConnectivity();
    
    if (result.success) {
      return res.status(200).json({
        success: true,
        message: 'PesaPal connectivity test passed',
        data: result
      });
    } else {
      return res.status(503).json({
        success: false,
        error: result.error
      });
    }
  } catch (error) {
    const formatted = paymentService.formatErrorResponse(error, 'Connectivity test failed');
    res.status(503).json(formatted);
  }
};

/**
 * Get PesaPal configuration details
 * GET /subscriptions/payments/config
 */
exports.getPesaPalConfig = async (req, res) => {
  try {
    const config = paymentService.getPesaPalConfig();
    res.status(200).json({
      success: true,
      data: config
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

/**
 * Get PesaPal API endpoints
 * GET /subscriptions/payments/endpoints
 */
exports.getPesaPalEndpoints = async (req, res) => {
  try {
    const endpoints = paymentService.getPesaPalEndpoints();
    res.status(200).json({
      success: true,
      data: endpoints
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};
