const paymentService = require('./payment.service');
const { normalizeExtendedJSON } = require('../../utils/normalize');

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

    res.json({
      message: 'Pricing retrieved',
      data: pricing,
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

    res.json({
      message: 'Amount calculated',
      plan,
      billingCycle,
      amount,
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
