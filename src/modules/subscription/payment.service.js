const { PrismaClient } = require('@prisma/client');
const axios = require('axios');
const crypto = require('crypto');
const prisma = new PrismaClient();

// PayPack Configuration
// default endpoint uses the base paypack.rw domain; the previous
// `api.paypack.rw` hostname did not resolve, causing ENOTFOUND errors.
// We allow either PAYPACK_API_URL or (confusingly-named) PAYPACK_BASE_URL
// so that deployment platforms like Render can use whichever name you set.
// The value **must** include the scheme (https://) and not have a trailing
// slash – otherwise axios will complain about an "Invalid URL".
const PAYPACK_API_URL =
  process.env.PAYPACK_API_URL ||
  process.env.PAYPACK_BASE_URL ||
  'https://payments.paypack.rw/api';
const PAYPACK_API_KEY = process.env.PAYPACK_API_KEY;
const PAYPACK_SECRET_KEY = process.env.PAYPACK_SECRET_KEY;
const PAYPACK_CLIENT_ID = process.env.PAYPACK_CLIENT_ID;
const PAYPACK_CALLBACK_URL =
  process.env.PAYPACK_CALLBACK_URL ||
  'https://mantainance-management-system-backend.onrender.com/api/subscriptions/payments/callback';

// log configuration to assist debugging (do not log secrets)
console.log('[PayPack] API URL used for requests:', PAYPACK_API_URL);
console.log('[PayPack] (alias PAYPACK_BASE_URL) value:', process.env.PAYPACK_BASE_URL);
console.log('[PayPack] Callback URL:', PAYPACK_CALLBACK_URL);
if (PAYPACK_CALLBACK_URL.startsWith('http://localhost')) {
  console.warn(
    '[PayPack] WARNING: callback URL is localhost; PayPack may reject this in production.'
  );
}

// Pricing configuration for different plans and billing cycles
const PRICING = {
  basic: {
    weekly: 9.99,
    monthly: 29.99,
    yearly: 299.99,
  },
  professional: {
    weekly: 24.99,
    monthly: 79.99,
    yearly: 799.99,
  },
  enterprise: {
    weekly: 49.99,
    monthly: 199.99,
    yearly: 1999.99,
  },
};

// Initialize PayPack payment (mobile money or card)
exports.initiatePayPackPayment = async (paymentData) => {
  try {
    const { subscriptionId, amount, phoneNumber, paymentMethod, email, userId } = paymentData;

    // Validate required fields
    if (!subscriptionId || !amount || !paymentMethod) {
      throw new Error('Missing required payment fields');
    }

    // Validate payment method supports the data provided
    if (paymentMethod === 'mobile_money' && !phoneNumber) {
      throw new Error('Phone number required for mobile money payments');
    }

    // Get subscription to verify
    const subscription = await prisma.subscription.findUnique({
      where: { id: subscriptionId },
    });

    if (!subscription) {
      throw new Error('Subscription not found');
    }

    // Create payment record in pending state
    const payment = await prisma.payment.create({
      data: {
        subscriptionId,
        amount,
        currency: 'RWF', // PayPack default currency
        paymentMethod,
        status: 'pending',
        description: `Payment for ${subscription.plan} subscription`,
        transactionId: generateTransactionId(),
        metadata: {
          phoneNumber,
          email: email || subscription.email,
          userId,
          paypackInitiated: new Date().toISOString(),
        },
      },
    });

    // Call PayPack API to initiate payment
    // ensure callback URL is valid for PayPack
    if (!PAYPACK_CALLBACK_URL || PAYPACK_CALLBACK_URL.startsWith('http://localhost')) {
      throw new Error('PayPack callback URL is not configured or is using localhost');
    }

    const paypackResponse = await initiatePayPackRequest({
      amount,
      phoneNumber,
      email: email || subscription.email,
      description: `Subscription - ${subscription.plan} plan`,
      transactionId: payment.id,
      callbackUrl: PAYPACK_CALLBACK_URL,
      paymentMethod,
    });

    // Update payment with PayPack transaction details
    const updatedPayment = await prisma.payment.update({
      where: { id: payment.id },
      data: {
        metadata: {
          ...payment.metadata,
          paypackTransactionId: paypackResponse.transaction_id,
          paypackRedirectUrl: paypackResponse.redirect_url,
          paymentGateway: 'paypack',
        },
      },
    });

    return updatedPayment;
  } catch (error) {
    throw new Error(`Failed to initiate PayPack payment: ${error.message}`);
  }
};

// Process payment after PayPack callback
exports.processPayPackCallback = async (callbackData) => {
  try {
    const { transaction_id, status, reference } = callbackData;

    // Verify callback signature if provided
    if (callbackData.signature) {
      verifyPayPackSignature(callbackData);
    }

    // Find payment by transaction ID (which is our payment ID)
    const payment = await prisma.payment.findUnique({
      where: { id: transaction_id },
    });

    if (!payment) {
      throw new Error('Payment not found');
    }

    // Update payment status based on PayPack response
    const paymentStatus = status === 'success' || status === 'completed' ? 'completed' : 'failed';
    
    const updatedPayment = await prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: paymentStatus,
        paidAt: paymentStatus === 'completed' ? new Date() : null,
        failureReason: paymentStatus === 'failed' ? callbackData.error_message || 'Payment failed' : null,
        metadata: {
          ...payment.metadata,
          paypackReference: reference,
          paypackStatus: status,
          callbackReceivedAt: new Date().toISOString(),
        },
      },
    });

    // If payment successful, update subscription and create invoice
    if (paymentStatus === 'completed') {
      await updateSubscriptionAfterPayment(payment.subscriptionId);
    }

    return updatedPayment;
  } catch (error) {
    throw new Error(`Failed to process PayPack callback: ${error.message}`);
  }
};

// Process payment (supports both PayPack real and simulated payments)
exports.processPayment = async (paymentData) => {
  try {
    const { subscriptionId, amount, paymentMethod, currency = 'USD' } = paymentData;

    // Validate payment data
    if (!subscriptionId || !amount || !paymentMethod) {
      throw new Error('Missing required payment fields');
    }

    // Get subscription to verify
    const subscription = await prisma.subscription.findUnique({
      where: { id: subscriptionId },
    });

    if (!subscription) {
      throw new Error('Subscription not found');
    }

    // If it's a PayPack payment (mobile money or card), use real PayPack integration
    if (paymentMethod === 'mobile_money' || paymentMethod === 'card') {
      return await exports.initiatePayPackPayment(paymentData);
    }

    // Otherwise fallback to simulation for testing
    return await simulatePaymentGateway({ subscriptionId, amount, paymentMethod, currency });
  } catch (error) {
    throw new Error(`Payment processing failed: ${error.message}`);
  }
};

// Create payment for a subscription
exports.createPayment = async (paymentData) => {
  try {
    const payment = await prisma.payment.create({
      data: {
        subscriptionId: paymentData.subscriptionId,
        amount: paymentData.amount,
        currency: paymentData.currency || 'USD',
        paymentMethod: paymentData.paymentMethod,
        status: 'pending',
        description: paymentData.description,
      },
    });
    return payment;
  } catch (error) {
    throw new Error(`Failed to create payment: ${error.message}`);
  }
};

// Get payment by ID
exports.getPaymentById = async (paymentId) => {
  try {
    const payment = await prisma.payment.findUnique({
      where: { id: paymentId },
      include: { subscription: true },
    });
    return payment;
  } catch (error) {
    throw new Error(`Failed to get payment: ${error.message}`);
  }
};

// Get all payments for a subscription
exports.getSubscriptionPayments = async (subscriptionId) => {
  try {
    const payments = await prisma.payment.findMany({
      where: { subscriptionId },
      orderBy: { createdAt: 'desc' },
    });
    return payments;
  } catch (error) {
    throw new Error(`Failed to get payments: ${error.message}`);
  }
};

// Get all payments with filters
exports.getAllPayments = async (filters = {}) => {
  try {
    const payments = await prisma.payment.findMany({
      where: {
        ...(filters.status && { status: filters.status }),
        ...(filters.paymentMethod && { paymentMethod: filters.paymentMethod }),
      },
      include: { subscription: true },
      orderBy: { createdAt: 'desc' },
    });
    return payments;
  } catch (error) {
    throw new Error(`Failed to get payments: ${error.message}`);
  }
};

// Refund payment
exports.refundPayment = async (paymentId, reason = '') => {
  try {
    const payment = await prisma.payment.findUnique({
      where: { id: paymentId },
    });

    if (!payment) {
      throw new Error('Payment not found');
    }

    if (payment.status !== 'completed') {
      throw new Error('Only completed payments can be refunded');
    }

    const refundedPayment = await prisma.payment.update({
      where: { id: paymentId },
      data: {
        status: 'refunded',
        metadata: {
          ...payment.metadata,
          refundReason: reason,
          refundedAt: new Date().toISOString(),
        },
      },
    });

    return refundedPayment;
  } catch (error) {
    throw new Error(`Failed to refund payment: ${error.message}`);
  }
};

// Helper function to generate transaction ID
function generateTransactionId() {
  return `TXN-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
}

// Helper function to call PayPack API
async function initiatePayPackRequest(paymentDetails) {
  if (!PAYPACK_API_KEY || !PAYPACK_SECRET_KEY) {
    throw new Error('PayPack API credentials not configured');
  }

  try {
    console.log('Initiating PayPack request:', {
      amount: paymentDetails.amount,
      paymentMethod: paymentDetails.paymentMethod,
      phoneNumber: paymentDetails.phoneNumber || 'card',
      callbackUrl: paymentDetails.callbackUrl,
    });

    const payload = {
      amount: Math.round(paymentDetails.amount), // PayPack expects integer amounts
      phone: paymentDetails.phoneNumber || undefined,
      email: paymentDetails.email,
      description: paymentDetails.description,
      merchant_id: PAYPACK_CLIENT_ID,
      callback_url: paymentDetails.callbackUrl,
      reference: paymentDetails.transactionId,
    };

    // Remove undefined fields
    Object.keys(payload).forEach(key => payload[key] === undefined && delete payload[key]);

    console.log('PayPack payload:', payload);
    const response = await axios.post(`${PAYPACK_API_URL}/transactions`, payload, {
      headers: {
        Authorization: `Bearer ${PAYPACK_API_KEY}`,
        'Content-Type': 'application/json',
      },
      timeout: 10000,
    });

    console.log('PayPack response:', response.data);

    return {
      transaction_id: response.data.transaction_id || response.data.id || paymentDetails.transactionId,
      redirect_url: response.data.redirect_url || response.data.authorization_url || '',
      status: response.data.status || 'pending',
    };
  } catch (error) {
    console.error('PayPack API Error full response:', error.response?.data);
    console.error('PayPack API Error message:', error.message);
    throw new Error(`PayPack API Error: ${error.response?.data?.message || error.message}`);
  }
}

// Helper function to verify PayPack callback signature
function verifyPayPackSignature(callbackData) {
  const { signature, ...data } = callbackData;
  const sortedData = Object.keys(data)
    .sort()
    .map(key => `${key}=${data[key]}`)
    .join('&');

  const expectedSignature = crypto
    .createHmac('sha256', PAYPACK_SECRET_KEY)
    .update(sortedData)
    .digest('hex');

  if (signature !== expectedSignature) {
    throw new Error('Invalid PayPack signature');
  }
}

// Helper function to simulate payment gateway (for testing without real PayPack credentials)
async function simulatePaymentGateway(paymentData) {
  try {
    const { subscriptionId, amount, paymentMethod, currency } = paymentData;

    // Create payment record
    const payment = await prisma.payment.create({
      data: {
        subscriptionId,
        amount,
        currency,
        paymentMethod,
        status: 'pending',
        description: `Payment for subscription`,
        transactionId: generateTransactionId(),
      },
    });

    // Simulate 95% success rate
    const isSuccessful = Math.random() < 0.95;

    if (isSuccessful) {
      const updatedPayment = await prisma.payment.update({
        where: { id: payment.id },
        data: {
          status: 'completed',
          paidAt: new Date(),
          metadata: {
            gateway: 'simulated',
            timestamp: new Date().toISOString(),
          },
        },
      });

      // Update subscription after successful payment
      await updateSubscriptionAfterPayment(subscriptionId);
      return updatedPayment;
    } else {
      return await prisma.payment.update({
        where: { id: payment.id },
        data: {
          status: 'failed',
          failureReason: 'Insufficient funds (simulated)',
        },
      });
    }
  } catch (error) {
    console.error('Payment simulation error:', error);
    throw new Error(`Payment simulation failed: ${error.message}`);
  }
}

// Helper function to update subscription after payment
async function updateSubscriptionAfterPayment(subscriptionId) {
  try {
    const subscription = await prisma.subscription.findUnique({
      where: { id: subscriptionId },
    });

    if (!subscription) {
      throw new Error('Subscription not found');
    }

    // Calculate next billing date
    const nextBillingDate = calculateNextBillingDate(subscription.billingCycle);

    // Update subscription
    const updatedSubscription = await prisma.subscription.update({
      where: { id: subscriptionId },
      data: {
        paymentStatus: 'paid',
        nextBillingDate,
      },
    });

    // Create invoice
    await createInvoice(subscriptionId, subscription);

    return updatedSubscription;
  } catch (error) {
    console.error('Error updating subscription after payment:', error);
  }
}

// Create invoice for a subscription
async function createInvoice(subscriptionId, subscription) {
  try {
    const invoiceNumber = generateInvoiceNumber();
    const period = generateBillingPeriod(subscription.billingCycle);

    const invoice = await prisma.invoice.create({
      data: {
        subscriptionId,
        invoiceNumber,
        amount: subscription.amount,
        billingCycle: subscription.billingCycle,
        period,
        status: 'paid',
        dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
        paidAt: new Date(),
      },
    });

    return invoice;
  } catch (error) {
    console.error('Error creating invoice:', error);
  }
}

// Generate invoice number
function generateInvoiceNumber() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const random = Math.random().toString(36).substr(2, 9).toUpperCase();
  return `INV-${year}${month}-${random}`;
}

// Generate billing period string
function generateBillingPeriod(billingCycle) {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();

  if (billingCycle === 'weekly') {
    const nextWeek = new Date(now);
    nextWeek.setDate(nextWeek.getDate() + 7);
    return `${now.toLocaleDateString()} - ${nextWeek.toLocaleDateString()}`;
  } else if (billingCycle === 'monthly') {
    const nextMonth = new Date(year, month + 1, 1);
    return `${now.toLocaleDateString('en-US', {
      month: 'short',
      year: 'numeric',
    })} - ${nextMonth.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}`;
  } else if (billingCycle === 'yearly') {
    const nextYear = new Date(year + 1, month, 1);
    return `${year} - ${nextYear.getFullYear()}`;
  }
  return '';
}

// Calculate next billing date
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

// Get pricing
exports.getPricing = () => {
  return PRICING;
};

// Calculate amount for plan and billing cycle
exports.calculateAmount = (plan, billingCycle) => {
  if (!PRICING[plan]) {
    throw new Error('Invalid plan');
  }
  if (!PRICING[plan][billingCycle]) {
    throw new Error('Invalid billing cycle');
  }
  return PRICING[plan][billingCycle];
};
