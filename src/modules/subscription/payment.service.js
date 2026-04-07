const { PrismaClient } = require('@prisma/client');
const axios = require('axios');
const crypto = require('crypto');
const systemSettingsService = require('../systemSettings/systemSettings.service');
const prisma = new PrismaClient();

// ============================================
// PesaPal V3 Configuration & Setup
// ============================================

// Environment detection
const PESAPAL_ENV = process.env.PESAPAL_ENV || 'live'; // 'sandbox' or 'live'
const IS_SANDBOX = PESAPAL_ENV === 'sandbox';

// PesaPal API Credentials
const PESAPAL_CONSUMER_KEY = process.env.PesaPal_Consumer_Key || 'ANezelD5QCTIxfJaeIEgnULuowGIPHdS';
const PESAPAL_CONSUMER_SECRET = process.env.PesaPal_Consumer_Secret || 'EY29xLa9ChKbMjCpaASt59+3YfM=';

// PesaPal API Base URLs (V3)
// Sandbox: https://cybqa.pesapal.com/pesapalv3/api
// Live:    https://pay.pesapal.com/v3/api
const PESAPAL_API_URL = IS_SANDBOX 
  ? 'https://cybqa.pesapal.com/pesapalv3/api'
  : 'https://pay.pesapal.com/v3/api';

// Callback URL for IPN notifications
const PESAPAL_CALLBACK_URL =
  process.env.PESAPAL_CALLBACK_URL ||
  'https://mantainance-management-system-backend.onrender.com/api/subscriptions/payments/pesapal-callback';

const MTN_COLLECTION_BASE_URL =
  process.env.MTN_COLLECTION_BASE_URL ||
  'https://sandbox.momodeveloper.mtn.co.rw/collection/v1_0';
const MTN_COLLECTION_TOKEN = process.env.MTN_COLLECTION_TOKEN || '';
const MTN_API_USER = process.env.MTN_API_USER || '';
const MTN_API_KEY =
  process.env.MTN_API_KEY ||
  process.env['MTN-Secret-Key'] ||
  process.env['Secrete-Key'] ||
  '';
const MTN_SUBSCRIPTION_KEY =
  process.env.MTN_SUBSCRIPTION_KEY ||
  process.env['MTN-Primary-key'] ||
  process.env['Primary-key'] ||
  '';
const MTN_TARGET_ENVIRONMENT = process.env.MTN_TARGET_ENVIRONMENT || 'sandbox';
const MTN_CALLBACK_URL =
  process.env.MTN_CALLBACK_URL ||
  'https://mantainance-management-system-backend.onrender.com/api/subscriptions/payments/mobile-money-callback';

// PesaPal V3 API Endpoints (relative to base URL)
const PESAPAL_ENDPOINTS = {
  AUTH: '/Auth/RequestToken',
  REGISTER_IPN: '/URLSetup/RegisterIPN',
  SUBMIT_ORDER: '/Transactions/SubmitOrderRequest',
  GET_STATUS: '/Transactions/GetTransactionStatus',
};

// Log configuration to assist debugging
console.log('[PesaPal Configuration]');
console.log(`├─ Environment: ${PESAPAL_ENV.toUpperCase()} (set PESAPAL_ENV=sandbox to switch)`);
console.log(`├─ API URL: ${PESAPAL_API_URL}`);
console.log(`├─ Callback URL: ${PESAPAL_CALLBACK_URL}`);
if (IS_SANDBOX) {
  console.log(`├─ ⚠️  SANDBOX MODE - Use test credentials for testing`);
} else {
  console.log(`├─ ✅ LIVE MODE - Using production credentials`);
}
if (PESAPAL_CALLBACK_URL.startsWith('http://localhost')) {
  console.warn(
    `├─ ⚠️  WARNING: Callback URL is localhost; PesaPal will REJECT this in ${PESAPAL_ENV === 'sandbox' ? 'production sandbox' : 'sandbox/live'}`
  );
}
console.log('└─ [PesaPal] Configuration loaded\n');

// ============================================
// PesaPal Error Handling (Matches V3 API Format)
// ============================================

/**
 * Parse PesaPal error response to match official error format:
 * {
 *   "error": {
 *     "type": "error_type",
 *     "code": "response_code",
 *     "message": "Detailed error message"
 *   }
 * }
 */
function parsePesaPalError(error) {
  const errorObj = {
    type: 'unknown_error',
    code: 'UNKNOWN',
    message: error.message || 'An unknown error occurred',
    timestamp: new Date().toISOString(),
    environment: PESAPAL_ENV,
  };

  // Handle axios error responses
  if (error.response?.data?.error) {
    const pesapalError = error.response.data.error;
    return {
      type: pesapalError.type || 'api_error',
      code: pesapalError.code || error.response.status,
      message: pesapalError.message || 'PesaPal API error',
      statusCode: error.response.status,
      timestamp: errorObj.timestamp,
      environment: errorObj.environment,
    };
  }

  // Handle other axios errors
  if (error.response?.status) {
    const statusMap = {
      400: { type: 'bad_request', code: 'INVALID_REQUEST' },
      401: { type: 'authentication_error', code: 'UNAUTHORIZED' },
      403: { type: 'permission_error', code: 'FORBIDDEN' },
      404: { type: 'not_found_error', code: 'NOT_FOUND' },
      409: { type: 'conflict_error', code: 'CONFLICT' },
      429: { type: 'rate_limit_error', code: 'RATE_LIMITED' },
      500: { type: 'server_error', code: 'INTERNAL_SERVER_ERROR' },
      503: { type: 'service_unavailable', code: 'SERVICE_UNAVAILABLE' },
    };

    const mapped = statusMap[error.response.status] || { 
      type: 'http_error', 
      code: `HTTP_${error.response.status}` 
    };

    return {
      type: mapped.type,
      code: mapped.code,
      message: error.response.data?.message || error.message,
      statusCode: error.response.status,
      timestamp: errorObj.timestamp,
      environment: errorObj.environment,
    };
  }

  // Handle network/timeout errors
  if (error.code === 'ECONNREFUSED') {
    return {
      type: 'network_error',
      code: 'CONNECTION_REFUSED',
      message: `Cannot connect to PesaPal API at ${PESAPAL_API_URL}`,
      timestamp: errorObj.timestamp,
      environment: errorObj.environment,
    };
  }

  if (error.code === 'ECONNABORTED' || error.message?.includes('timeout')) {
    return {
      type: 'timeout_error',
      code: 'REQUEST_TIMEOUT',
      message: 'Request to PesaPal API timed out',
      timestamp: errorObj.timestamp,
      environment: errorObj.environment,
    };
  }

  return errorObj;
}

/**
 * Create a standardized error response
 */
function createPesaPalErrorResponse(error, context = '') {
  const parsed = parsePesaPalError(error);
  const message = context ? `${context}: ${parsed.message}` : parsed.message;

  console.error('[PesaPal Error]', {
    context,
    type: parsed.type,
    code: parsed.code,
    message: parsed.message,
    statusCode: parsed.statusCode,
    environment: parsed.environment,
  });

  return {
    success: false,
    error: {
      type: parsed.type,
      code: parsed.code,
      message,
      timestamp: parsed.timestamp,
    }
  };
}

// Pricing configuration for different plans and billing cycles
const DEFAULT_PRICING = {
  basic: {
    weekly: 9.99,
    monthly: 29.99,
    yearly: 299.99,
  },
  premium: {
    weekly: 15.99,
    monthly: 49.99,
    yearly: 499.99,
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
let PRICING = JSON.parse(JSON.stringify(DEFAULT_PRICING));

const normalizePricing = (pricing = {}) => {
  const next = JSON.parse(JSON.stringify(DEFAULT_PRICING));
  for (const plan of Object.keys(next)) {
    for (const cycle of Object.keys(next[plan])) {
      const value = Number(pricing?.[plan]?.[cycle]);
      if (Number.isFinite(value) && value >= 0) {
        next[plan][cycle] = value;
      }
    }
  }
  return next;
};

// Initialize PesaPal payment
exports.initiatePesaPalPayment = async (paymentData) => {
  try {
    const { subscriptionId, amount, phoneNumber, email, userId } = paymentData;

    // Validate required fields
    if (!subscriptionId || !amount) {
      throw new Error('Missing required payment fields');
    }

    // Get subscription to verify
    const subscription = await prisma.subscription.findUnique({
      where: { id: subscriptionId },
    });

    if (!subscription) {
      throw new Error('Subscription not found');
    }

    // Get system settings for currency
    const settings = await systemSettingsService.getSettings();
    const currency = paymentData.currency || settings?.platform?.subscriptionCurrency || 'RWF';

    // Create payment record in pending state
    const payment = await prisma.payment.create({
      data: {
        subscriptionId,
        amount,
        currency, // Use dynamic currency
        paymentMethod: 'pesapal',
        status: 'pending',
        description: `Payment for ${subscription.plan} subscription`,
        transactionId: generateTransactionId(),
        metadata: {
          phoneNumber,
          email: email || subscription.email,
          userId,
          pesapalInitiated: new Date().toISOString(),
        },
      },
    });

    // Call PesaPal API to initiate payment
    const pesapalResponse = await initiatePesaPalRequest({
      amount,
      currency,
      phoneNumber,
      email: email || subscription.email,
      description: `Subscription - ${subscription.plan} plan`,
      transactionId: payment.id,
      callbackUrl: PESAPAL_CALLBACK_URL,
    });

    // Update payment with PesaPal transaction details
    const updatedPayment = await prisma.payment.update({
      where: { id: payment.id },
      data: {
        metadata: {
          ...payment.metadata,
          pesapalOrderTrackingId: pesapalResponse.order_tracking_id,
          pesapalRedirectUrl: pesapalResponse.redirect_url,
          paymentGateway: 'pesapal',
        },
      },
    });

    return updatedPayment;
  } catch (error) {
    throw new Error(`Failed to initiate PesaPal payment: ${error.message}`);
  }
};

// Process payment after PesaPal callback
exports.processPesaPalCallback = async (callbackData) => {
  try {
    const orderTrackingId = callbackData.OrderTrackingId || callbackData.order_tracking_id;
    let status = callbackData.status;

    if (!orderTrackingId) {
      throw new Error('OrderTrackingId is required');
    }

    // If status is missing (common in GET redirection), verify it via API
    if (!status) {
      const verificationResponse = await verifyPesaPalPaymentStatus(orderTrackingId);
      status = verificationResponse.status_code || verificationResponse.status;
    }

    // Find payment by PesaPal order tracking ID (stored in metadata)
    let payment = await prisma.payment.findFirst({
      where: {
        OR: [
          { id: orderTrackingId }, // Old style or fallback
          { metadata: { path: ['pesapalOrderTrackingId'], equals: orderTrackingId } }
        ]
      },
    });

    if (!payment) {
      // Try finding by merchant reference (id) if provided
      const merchantRef = callbackData.OrderMerchantReference || callbackData.merchant_reference;
      if (merchantRef) {
        payment = await prisma.payment.findUnique({
          where: { id: merchantRef }
        });
      }
    }

    if (!payment) {
      throw new Error(`Payment not found for OrderTrackingId: ${orderTrackingId}`);
    }

    // Update payment status based on PesaPal response
    // V3 status_code: 1 = COMPLETED, 2 = FAILED, 0 = INVALID, etc.
    const paymentStatus = (status === 'COMPLETED' || status === 1 || status === '1') ? 'completed' : 
                         (status === 'FAILED' || status === 2 || status === '2') ? 'failed' : 'pending';
    
    const updatedPayment = await prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: paymentStatus,
        paidAt: paymentStatus === 'completed' ? new Date() : null,
        failureReason: paymentStatus === 'failed' ? callbackData.error_message || 'Payment failed' : null,
        metadata: {
          ...payment.metadata,
          pesapalStatus: status,
          callbackReceivedAt: new Date().toISOString(),
        },
      },
    });

    // If payment successful, update subscription and create invoice
    if (paymentStatus === 'completed') {
      await updateSubscriptionAfterPayment(payment.subscriptionId);

      // ACTIVATE USER ACCOUNT if payment is for account activation
      const User = require('../user/user.model.js');
      const subscription = await prisma.subscription.findUnique({
        where: { id: payment.subscriptionId },
      });

      if (subscription && subscription.companyId) {
        try {
          // Find user with this company ID who is pending activation
          const userToActivate = await User.findOne({
            $or: [
              { companyName: subscription.companyId },
              { _id: subscription.companyId }
            ],
            paymentPendingActivation: true,
            isActive: false
          });

          if (userToActivate) {
            await User.findByIdAndUpdate(
              userToActivate._id,
              {
                isActive: true,
                paymentPendingActivation: false,
                activationToken: null,
                activationTokenExpires: null
              },
              { new: true }
            );
            console.log(`✅ User account activated for company: ${userToActivate.companyName}`);
          }
        } catch (err) {
          console.error('Failed to activate user account after payment:', err.message);
          // Don't fail the payment processing if activation fails
        }
      }
    }

    return updatedPayment;
  } catch (error) {
    throw new Error(`Failed to process PesaPal callback: ${error.message}`);
  }
};

// Step 5: Get PesaPal payment status (for post-payment verification)
exports.getPesaPalPaymentStatus = async (orderTrackingIdOrTransactionId) => {
  try {
    let payment;
    
    // First try to find by payment ID (transactionId)
    payment = await prisma.payment.findUnique({
      where: { id: orderTrackingIdOrTransactionId }
    });

    // If not found and looks like a UUID, it might be the orderTrackingId
    // Try to find by querying all payments and checking metadata
    if (!payment) {
      const allPayments = await prisma.payment.findMany({
        where: {
          paymentMethod: 'pesapal'
        },
        take: 10,
        orderBy: { createdAt: 'desc' }
      });
      
      payment = allPayments.find(p => 
        p.metadata?.pesapalOrderTrackingId === orderTrackingIdOrTransactionId
      );
    }

    if (!payment) {
      throw new Error('Payment not found');
    }

    // Query PesaPal to get current status
    const pesapalStatus = await verifyPesaPalPaymentStatus(
      payment.metadata?.pesapalOrderTrackingId || orderTrackingIdOrTransactionId
    );

    // Update our database based on PesaPal status
    const paymentStatus = (pesapalStatus.status_code === 1 || pesapalStatus.status === 'COMPLETED') ? 'completed' :
                         (pesapalStatus.status_code === 2 || pesapalStatus.status === 'FAILED') ? 'failed' : 'pending';

    if (paymentStatus !== payment.status) {
      await prisma.payment.update({
        where: { id: payment.id },
        data: {
          status: paymentStatus,
          paidAt: paymentStatus === 'completed' ? new Date() : payment.paidAt,
          metadata: {
            ...payment.metadata,
            lastStatusCheck: new Date().toISOString(),
            pesapalStatusCode: pesapalStatus.status_code,
          }
        }
      });

      // If payment just completed, update subscription
      if (paymentStatus === 'completed' && payment.status !== 'completed') {
        await updateSubscriptionAfterPayment(payment.subscriptionId);
      }
    }

    return {
      status: paymentStatus,
      statusCode: pesapalStatus.status_code,
      statusDescription: pesapalStatus.status,
    };
  } catch (error) {
    throw new Error(`Failed to get PesaPal payment status: ${error.message}`);
  }
};

// Process payment (supports PesaPal and simulated payments)
exports.processPayment = async (paymentData) => {
  try {
    const { subscriptionId, amount, paymentMethod, currency = 'KES' } = paymentData;

    // Validate payment data
    if (!subscriptionId || !amount) {
      throw new Error('Missing required payment fields');
    }

    // Get subscription to verify
    const subscription = await prisma.subscription.findUnique({
      where: { id: subscriptionId },
    });

    if (!subscription) {
      throw new Error('Subscription not found');
    }

    // Use PesaPal for real payments
    if (paymentMethod === 'pesapal') {
      return await exports.initiatePesaPalPayment(paymentData);
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

// Helper function to get PesaPal Access Token (V3)
// Step 1 of PesaPal Integration: Authenticate
async function getPesaPalAccessToken() {
  try {
    if (!PESAPAL_CONSUMER_KEY || !PESAPAL_CONSUMER_SECRET) {
      throw new Error('PesaPal API credentials not configured (set PesaPal_Consumer_Key and PesaPal_Consumer_Secret)');
    }

    console.log('[PesaPal] Step 1: Authenticating to obtain access token...');

    const response = await axios.post(
      `${PESAPAL_API_URL}${PESAPAL_ENDPOINTS.AUTH}`,
      {
        consumer_key: PESAPAL_CONSUMER_KEY,
        consumer_secret: PESAPAL_CONSUMER_SECRET
      },
      {
        timeout: 10000,
        headers: {
          'Content-Type': 'application/json'
        }
      }
    );

    if (!response.data?.token) {
      throw new Error('No access token in PesaPal response');
    }

    console.log('[PesaPal] ✅ Authentication successful - Token obtained');
    return response.data.token;
  } catch (error) {
    const errorRes = createPesaPalErrorResponse(error, 'Authentication failed');
    throw Object.assign(new Error(errorRes.error.message), errorRes.error);
  }
}

// Helper function to register/get IPN ID (V3)
// Step 0: Setup IPN for receiving payment notifications
async function getPesaPalIPNId(token) {
  try {
    console.log('[PesaPal] Registering IPN callback URL...');
    console.log(`[PesaPal] IPN URL: ${PESAPAL_CALLBACK_URL}`);

    const response = await axios.post(
      `${PESAPAL_API_URL}${PESAPAL_ENDPOINTS.REGISTER_IPN}`,
      {
        url: PESAPAL_CALLBACK_URL,
        ipn_notification_type: 'GET'
      },
      {
        timeout: 10000,
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      }
    );

    if (!response.data?.ipn_id) {
      throw new Error('No IPN ID in PesaPal response');
    }

    console.log('[PesaPal] ✅ IPN registered successfully - IPN ID obtained');
    return response.data.ipn_id;
  } catch (error) {
    // IPN might already be registered, attempt to continue
    if (error.response?.status === 409) {
      console.warn('[PesaPal] ⚠️  IPN already registered - attempting to continue...');
      // Return a generic IPN ID or extract from error response
      return error.response?.data?.ipn_id || 'CACHED_IPN_ID';
    }

    const errorRes = createPesaPalErrorResponse(error, 'IPN registration failed');
    throw Object.assign(new Error(errorRes.error.message), errorRes.error);
  }
}

// Helper function to call PesaPal API (V3)
// Step 2-3: Initiate payment order request
async function initiatePesaPalRequest(paymentDetails) {
  try {
    if (!PESAPAL_CONSUMER_KEY || !PESAPAL_CONSUMER_SECRET) {
      throw new Error('PesaPal API credentials not configured');
    }

    console.log('[PesaPal] Step 2-3: Initiating payment order request...');

    const token = await getPesaPalAccessToken();
    const ipnId = await getPesaPalIPNId(token);

    const currency = paymentDetails.currency || 'RWF';
    const countryCode = currency === 'KES' ? 'KE' : currency === 'RWF' ? 'RW' : currency === 'UGX' ? 'UG' : currency === 'TZS' ? 'TZ' : 'RW';
    
    // RWF usually doesn't have decimals, PesaPal might reject 49.99 RWF
    const finalizedAmount = currency === 'RWF' ? Math.round(paymentDetails.amount) : paymentDetails.amount;

    // Validate amount
    if (finalizedAmount <= 0) {
      throw new Error(`Invalid amount: ${finalizedAmount}. Amount must be greater than 0.`);
    }

    const payload = {
      id: paymentDetails.transactionId,
      currency,
      amount: finalizedAmount,
      description: paymentDetails.description,
      callback_url: paymentDetails.callbackUrl,
      notification_id: ipnId,
      billing_address: {
        email_address: paymentDetails.email,
        phone_number: paymentDetails.phoneNumber || '',
        country_code: countryCode,
        first_name: 'Customer',
        last_name: 'User'
      }
    };

    console.log('[PesaPal] Order Request Payload:', {
      id: payload.id,
      amount: `${payload.currency} ${payload.amount}`,
      email: payload.billing_address.email_address,
      description: payload.description
    });

    const response = await axios.post(
      `${PESAPAL_API_URL}${PESAPAL_ENDPOINTS.SUBMIT_ORDER}`,
      payload,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        timeout: 15000,
      }
    );

    console.log('[PesaPal] Order Request Response:', {
      tracking_id: response.data?.order_tracking_id,
      status: response.data?.status,
      has_redirect: !!response.data?.redirect_url
    });

    if (!response.data?.order_tracking_id || !response.data?.redirect_url) {
      console.error('Invalid PesaPal response:', response.data);
      throw new Error(
        response.data?.error?.message || 
        response.data?.message || 
        'Invalid response from PesaPal - missing order_tracking_id or redirect_url'
      );
    }

    // Append parameter to show mobile money by default
    const redirectUrl = `${response.data.redirect_url}&type=mobile`;

    console.log('[PesaPal] ✅ Order request successful');

    return {
      order_tracking_id: response.data.order_tracking_id,
      redirect_url: redirectUrl,
      status: response.data.status || 'PENDING',
    };
  } catch (error) {
    const errorRes = createPesaPalErrorResponse(error, 'Order request failed');
    throw Object.assign(new Error(errorRes.error.message), errorRes.error);
  }
}

// Helper function to verify PesaPal payment status (V3)
// Step 4-5: Query payment status and verify completion
async function verifyPesaPalPaymentStatus(orderTrackingId) {
  try {
    if (!PESAPAL_CONSUMER_KEY || !PESAPAL_CONSUMER_SECRET) {
      throw new Error('PesaPal API credentials not configured');
    }

    if (!orderTrackingId) {
      throw new Error('orderTrackingId is required for status verification');
    }

    console.log('[PesaPal] Step 4-5: Querying payment status...');
    console.log(`[PesaPal] Order Tracking ID: ${orderTrackingId}`);

    const token = await getPesaPalAccessToken();

    const response = await axios.get(
      `${PESAPAL_API_URL}${PESAPAL_ENDPOINTS.GET_STATUS}?orderTrackingId=${orderTrackingId}`,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        timeout: 10000,
      }
    );

    console.log('[PesaPal] Status Query Response:', {
      tracking_id: orderTrackingId,
      status: response.data?.payment_status_description,
      amount: response.data?.amount,
      currency: response.data?.currency,
      status_code: response.data?.status_code
    });

    // Validate response structure
    if (!response.data) {
      throw new Error('No data in status response from PesaPal');
    }

    const statusDescription = response.data.payment_status_description || response.data.status || 'UNKNOWN';
    const statusCode = response.data.status_code;

    console.log(`[PesaPal] ✅ Status retrieved: ${statusDescription} (Code: ${statusCode})`);

    return {
      order_tracking_id: orderTrackingId,
      status: statusDescription,
      status_code: statusCode,
      payment_status_description: statusDescription,
      amount: response.data.amount,
      currency: response.data.currency,
      created_date: response.data.created_date,
      confirmation_code: response.data.confirmation_code,
    };
  } catch (error) {
    const errorRes = createPesaPalErrorResponse(error, 'Status verification failed');
    throw Object.assign(new Error(errorRes.error.message), errorRes.error);
  }
}

// Helper function to generate transaction ID
function generateTransactionId() {
  return `TXN-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
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
  return JSON.parse(JSON.stringify(PRICING));
};

exports.setPricing = (pricing = {}) => {
  PRICING = normalizePricing(pricing);
  return exports.getPricing();
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

// Initiate mobile money payment (M-Pesa, Airtel Money, MTN Money, etc.)
exports.initiateMobileMoneyPayment = async (paymentData) => {
  try {
    const { subscriptionId, amount, phoneNumber, provider, currency, email, userId } = paymentData;

    // Validate required fields
    if (!subscriptionId || !amount || !phoneNumber || !provider) {
      throw new Error('Missing required fields: subscriptionId, amount, phoneNumber, provider');
    }

    // Supported mobile money providers
    const supportedProviders = ['mpesa', 'airtel', 'mtn', 'orange', 'vodacom', 'tigo'];
    if (!supportedProviders.includes(provider.toLowerCase())) {
      throw new Error(`Unsupported provider: ${provider}. Supported: ${supportedProviders.join(', ')}`);
    }

    // Get subscription to verify
    const subscription = await prisma.subscription.findUnique({
      where: { id: subscriptionId },
    });

    if (!subscription) {
      throw new Error('Subscription not found');
    }

    // Get system settings for currency
    const settings = await systemSettingsService.getSettings();
    const paymentCurrency = currency || settings?.platform?.subscriptionCurrency || 'RWF';

    // Create payment record in pending state
    const payment = await prisma.payment.create({
      data: {
        subscriptionId,
        amount,
        currency: paymentCurrency,
        paymentMethod: `mobile_${provider.toLowerCase()}`,
        status: 'pending',
        description: `${provider} payment for ${subscription.plan} subscription`,
        transactionId: generateTransactionId(),
        metadata: {
          phoneNumber,
          email: email || subscription.email,
          userId,
          provider: provider.toLowerCase(),
          mobileMoneyInitiated: new Date().toISOString(),
        },
      },
    });

    // Route to appropriate mobile money provider
    let mobilemoneyResponse;
    switch (provider.toLowerCase()) {
      case 'mpesa':
        mobilemoneyResponse = await initiateMPesaPayment({
          amount,
          phoneNumber,
          paymentId: payment.id,
          currency: paymentCurrency,
        });
        break;
      case 'airtel':
        mobilemoneyResponse = await initiateAirtelMoneyPayment({
          amount,
          phoneNumber,
          paymentId: payment.id,
          currency: paymentCurrency,
        });
        break;
      case 'mtn':
        mobilemoneyResponse = await initiateMTNMoneyPayment({
          amount,
          phoneNumber,
          paymentId: payment.id,
          currency: paymentCurrency,
        });
        break;
      case 'orange':
        mobilemoneyResponse = await initiateOrangeMoneyPayment({
          amount,
          phoneNumber,
          paymentId: payment.id,
          currency: paymentCurrency,
        });
        break;
      default:
        // Generic USSD fallback
        mobilemoneyResponse = await initiateUSSDPayment({
          amount,
          phoneNumber,
          paymentId: payment.id,
          provider: provider.toLowerCase(),
          currency: paymentCurrency,
        });
    }

    // Update payment with mobile money transaction details
    const updatedPayment = await prisma.payment.update({
      where: { id: payment.id },
      data: {
        metadata: {
          ...payment.metadata,
          ...mobilemoneyResponse,
          paymentGateway: 'mobile_money',
        },
      },
    });

    return updatedPayment;
  } catch (error) {
    throw new Error(`Failed to initiate mobile money payment: ${error.message}`);
  }
};

// M-Pesa payment initiation
async function initiateMPesaPayment(paymentData) {
  try {
    const { amount, phoneNumber, paymentId, currency } = paymentData;

    // Format phone number - M-Pesa expects international format
    const formattedPhone = formatPhoneNumber(phoneNumber, 'KE');

    // For now, return a pending instruction
    // In production, integrate with XYZ Pay or M-Pesa API
    return {
      mobileProvider: 'M-Pesa',
      phoneNumber: formattedPhone,
      amount,
      currency,
      ussdCode: '*150*50#', // Example USSD code for M-Pesa balance
      instructionMessage: `Send ${amount} ${currency} to {shortcode}`,
      referenceCode: paymentId,
      status: 'awaiting_payment',
      initiatedAt: new Date().toISOString(),
    };
  } catch (error) {
    throw new Error(`M-Pesa payment initiation failed: ${error.message}`);
  }
}

// Airtel Money payment initiation
async function initiateAirtelMoneyPayment(paymentData) {
  try {
    const { amount, phoneNumber, paymentId, currency } = paymentData;

    const formattedPhone = formatPhoneNumber(phoneNumber, 'KE');

    return {
      mobileProvider: 'Airtel Money',
      phoneNumber: formattedPhone,
      amount,
      currency,
      ussdCode: '*144#',
      instructionMessage: `Send ${amount} ${currency} to {shortcode}`,
      referenceCode: paymentId,
      status: 'awaiting_payment',
      initiatedAt: new Date().toISOString(),
    };
  } catch (error) {
    throw new Error(`Airtel Money payment initiation failed: ${error.message}`);
  }
}

// MTN Money payment initiation
async function initiateMTNMoneyPayment(paymentData) {
  try {
    const { amount, phoneNumber, paymentId, currency } = paymentData;
    const accessToken = await getMtnCollectionAccessToken();

    const formattedPhone = formatPhoneNumber(phoneNumber, 'RW').replace(/^\+/, '');
    const referenceId = crypto.randomUUID();
    const externalId = String(paymentId);
    const payload = {
      amount: String(amount),
      currency: String(currency || 'RWF').toUpperCase(),
      externalId,
      payer: {
        partyIdType: 'MSISDN',
        partyId: formattedPhone,
      },
      payerMessage: `Payment for subscription ${externalId}`,
      payeeNote: `Subscription payment ${externalId}`,
    };

    console.log('[MTN requesttopay] Sending request', {
      baseUrl: MTN_COLLECTION_BASE_URL,
      targetEnvironment: MTN_TARGET_ENVIRONMENT,
      callbackUrl: MTN_CALLBACK_URL,
      referenceId,
      externalId,
      payload,
    });

    const response = await axios.post(
      `${MTN_COLLECTION_BASE_URL}/requesttopay`,
      payload,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'X-Callback-Url': MTN_CALLBACK_URL,
          'X-Reference-Id': referenceId,
          'X-Target-Environment': MTN_TARGET_ENVIRONMENT,
          ...(MTN_SUBSCRIPTION_KEY ? { 'Ocp-Apim-Subscription-Key': MTN_SUBSCRIPTION_KEY } : {}),
          'Content-Type': 'application/json',
        },
        timeout: 30000,
      }
    );

    return {
      mobileProvider: 'MTN Money',
      phoneNumber: formattedPhone,
      amount,
      currency: payload.currency,
      referenceCode: paymentId,
      requestToPayReferenceId: referenceId,
      externalId,
      status: response.status === 202 ? 'pending' : 'awaiting_payment',
      instructionMessage: 'Approve the payment prompt on the customer phone to complete the transaction.',
      callbackUrl: MTN_CALLBACK_URL,
      targetEnvironment: MTN_TARGET_ENVIRONMENT,
      initiatedAt: new Date().toISOString(),
    };
  } catch (error) {
    const status = error?.response?.status;
    const responseBody = error?.response?.data;
    const details = responseBody ? ` | MTN response: ${JSON.stringify(responseBody)}` : '';
    if (status === 401) {
      throw new Error(
        `MTN Money payment initiation failed (401): Invalid Rwanda MTN subscription credentials for ${MTN_COLLECTION_BASE_URL}. ` +
        `You need .co.rw Collection credentials (subscription key, API user, API key).${details}`
      );
    }
    throw new Error(`MTN Money payment initiation failed${status ? ` (${status})` : ''}: ${error.message}${details}`);
  }
}

async function getMtnCollectionAccessToken() {
  if (MTN_COLLECTION_TOKEN) {
    return MTN_COLLECTION_TOKEN;
  }

  if (!MTN_API_USER || !MTN_API_KEY || !MTN_SUBSCRIPTION_KEY) {
    throw new Error(
      'MTN configuration missing. Set MTN_COLLECTION_TOKEN or configure MTN_API_USER, MTN_API_KEY, and MTN_SUBSCRIPTION_KEY.'
    );
  }

  const auth = Buffer.from(`${MTN_API_USER}:${MTN_API_KEY}`).toString('base64');
  const tokenUrl = MTN_COLLECTION_BASE_URL.replace(/\/v1_0$/, '') + '/token/';
  const response = await axios.post(
    tokenUrl,
    {},
    {
      headers: {
        Authorization: `Basic ${auth}`,
        'Ocp-Apim-Subscription-Key': MTN_SUBSCRIPTION_KEY,
      },
      timeout: 30000,
    }
  );

  const accessToken = response?.data?.access_token;
  if (!accessToken) {
    throw new Error('MTN token response did not include access_token');
  }

  return accessToken;
}

// Orange Money payment initiation
async function initiateOrangeMoneyPayment(paymentData) {
  try {
    const { amount, phoneNumber, paymentId, currency } = paymentData;

    const formattedPhone = formatPhoneNumber(phoneNumber, 'RW');

    return {
      mobileProvider: 'Orange Money',
      phoneNumber: formattedPhone,
      amount,
      currency,
      ussdCode: '*120#',
      instructionMessage: `Send ${amount} ${currency} to {shortcode}`,
      referenceCode: paymentId,
      status: 'awaiting_payment',
      initiatedAt: new Date().toISOString(),
    };
  } catch (error) {
    throw new Error(`Orange Money payment initiation failed: ${error.message}`);
  }
}

// Generic USSD payment initiation
async function initiateUSSDPayment(paymentData) {
  try {
    const { amount, phoneNumber, paymentId, provider, currency } = paymentData;

    const formattedPhone = formatPhoneNumber(phoneNumber, 'AUTO');

    const ussdCodes = {
      vodacom: '*150#',
      tigo: '*150#',
      generic: '*123#',
    };

    return {
      mobileProvider: provider.charAt(0).toUpperCase() + provider.slice(1),
      phoneNumber: formattedPhone,
      amount,
      currency,
      ussdCode: ussdCodes[provider] || ussdCodes.generic,
      instructionMessage: `Send ${amount} ${currency} via USSD`,
      referenceCode: paymentId,
      status: 'awaiting_payment',
      initiatedAt: new Date().toISOString(),
    };
  } catch (error) {
    throw new Error(`USSD payment initiation failed: ${error.message}`);
  }
}

// Helper function to format phone numbers
function formatPhoneNumber(phoneNumber, country) {
  // Remove all non-digit characters except leading +
  let cleaned = phoneNumber.replace(/\D/g, '');

  // Add country prefix if needed
  const countryPrefixes = {
    KE: '254', // Kenya
    UG: '256', // Uganda
    TZ: '255', // Tanzania
    RW: '250', // Rwanda
    ZA: '27',  // South Africa
  };

  if (country && country !== 'AUTO') {
    const prefix = countryPrefixes[country];
    if (prefix && !cleaned.startsWith(prefix)) {
      // Remove leading 0 if present
      if (cleaned.startsWith('0')) {
        cleaned = cleaned.slice(1);
      }
      cleaned = prefix + cleaned;
    }
  }

  return '+' + cleaned;
}

// Process mobile money callback/verification
exports.processMobileMoneyCallback = async (callbackData) => {
  try {
    const { transactionId, status, provider } = callbackData;

    if (!transactionId) {
      throw new Error('Transaction ID is required');
    }

    // Find payment by transaction ID
    const payment = await prisma.payment.findUnique({
      where: { transactionId },
    });

    if (!payment) {
      throw new Error(`Payment not found for transaction: ${transactionId}`);
    }

    // Verify payment status with provider
    let paymentStatus = status;
    if (!paymentStatus && provider) {
      const verificationResult = await verifyMobileMoneyPayment({
        transactionId,
        provider,
      });
      paymentStatus = verificationResult.status;
    }

    // Update payment status
    const updatedPayment = await prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: paymentStatus === 'completed' ? 'completed' : paymentStatus === 'failed' ? 'failed' : 'pending',
        paidAt: paymentStatus === 'completed' ? new Date() : null,
        failureReason: paymentStatus === 'failed' ? callbackData.failureReason : null,
        metadata: {
          ...payment.metadata,
          mobileMoneyStatus: paymentStatus,
          callbackReceivedAt: new Date().toISOString(),
          ...callbackData,
        },
      },
    });

    // If payment successful, update subscription
    if (paymentStatus === 'completed') {
      await updateSubscriptionAfterPayment(payment.subscriptionId);
    }

    return updatedPayment;
  } catch (error) {
    throw new Error(`Failed to process mobile money callback: ${error.message}`);
  }
};

// Verify mobile money payment status
async function verifyMobileMoneyPayment(verificationData) {
  try {
    const { transactionId, provider } = verificationData;

    // This is a placeholder for actual API calls to mobile money providers
    // In production, you would make actual API requests to verify payment status

    console.log(`Verifying ${provider} payment for transaction: ${transactionId}`);

    // For now, return pending status - in production this would check actual provider APIs
    return {
      status: 'pending',
      transactionId,
      provider,
      verifiedAt: new Date().toISOString(),
    };
  } catch (error) {
    throw new Error(`Payment verification failed: ${error.message}`);
  }
}

// ============================================
// PesaPal API Testing & Documentation
// ============================================

/**
 * PESAPAL V3 API INTEGRATION GUIDE & TESTING
 * 
 * Environment Setup:
 * 1. Sandbox Testing:
 *    - Set PESAPAL_ENV=sandbox in .env
 *    - Use Sandbox API URL: https://cybqa.pesapal.com/pesapalv3/api
 *    - Postman Collection: https://documenter.getpostman.com/view/6715320/UyxepTv1
 * 
 * 2. Production:
 *    - Set PESAPAL_ENV=live in .env
 *    - Use Live API URL: https://pay.pesapal.com/v3/api
 * 
 * Environment Variables Required:
 *    - PesaPal_Consumer_Key: API Consumer Key
 *    - PesaPal_Consumer_Secret: API Consumer Secret
 *    - PESAPAL_ENV: 'sandbox' or 'live'
 *    - PESAPAL_CALLBACK_URL: Webhook URL for IPN notifications
 * 
 * 5-Step Integration Flow:
 *    Step 1: authenticate() → Get JWT token
 *    Step 2-3: initiatePesaPalRequest() → Create order and get redirect URL
 *    Step 4: Customer redirected to PesaPal checkout
 *    Step 5: verifyPesaPalPaymentStatus() → Query payment and update subscription
 * 
 * API Error Handling:
 *    All errors follow PesaPal V3 format:
 *    {
 *      "error": {
 *        "type": "error_type",
 *        "code": "response_code",
 *        "message": "Detailed message"
 *      }
 *    }
 * 
 * Status Codes:
 *    - 1: COMPLETED (Payment successful)
 *    - 2: FAILED (Payment failed)
 *    - 0: INVALID
 *    - Other: PENDING
 */

/**
 * Test endpoint: Verify PesaPal connectivity
 * Usage: Call manually to test if PesaPal API is accessible
 */
exports.testPesaPalConnectivity = async () => {
  try {
    console.log('\n[PesaPal Test] Starting connectivity test...');
    console.log(`[PesaPal Test] Environment: ${PESAPAL_ENV.toUpperCase()}`);
    console.log(`[PesaPal Test] API URL: ${PESAPAL_API_URL}`);
    console.log(`[PesaPal Test] Callback URL: ${PESAPAL_CALLBACK_URL}`);

    // Test 1: Validate credentials
    if (!PESAPAL_CONSUMER_KEY || !PESAPAL_CONSUMER_SECRET) {
      return {
        success: false,
        test: 'Credentials validation',
        error: 'PesaPal credentials not configured'
      };
    }
    console.log('[PesaPal Test] ✅ Credentials validated');

    // Test 2: Test authentication
    const token = await getPesaPalAccessToken();
    console.log('[PesaPal Test] ✅ Authentication successful');

    // Test 3: Test IPN registration
    const ipnId = await getPesaPalIPNId(token);
    console.log('[PesaPal Test] ✅ IPN registration successful');

    return {
      success: true,
      environment: PESAPAL_ENV,
      apiUrl: PESAPAL_API_URL,
      callbackUrl: PESAPAL_CALLBACK_URL,
      authentication: 'OK',
      ipnRegistration: 'OK',
      message: 'All PesaPal connectivity tests passed!'
    };
  } catch (error) {
    return createPesaPalErrorResponse(error, 'Connectivity test failed');
  }
};

/**
 * Get current PesaPal configuration
 */
exports.getPesaPalConfig = () => {
  return {
    environment: PESAPAL_ENV,
    apiUrl: PESAPAL_API_URL,
    callbackUrl: PESAPAL_CALLBACK_URL,
    hasCredentials: !!(PESAPAL_CONSUMER_KEY && PESAPAL_CONSUMER_SECRET),
    isSandbox: IS_SANDBOX,
    postmanUrl: 'https://documenter.getpostman.com/view/6715320/UyxepTv1',
    supportedCurrencies: ['RWF', 'KES', 'UGX', 'TZS', 'USD'],
    supportedPaymentMethods: ['mobile_money', 'card'],
  };
};

/**
 * List PesaPal API endpoints
 */
exports.getPesaPalEndpoints = () => {
  return {
    authentication: `${PESAPAL_API_URL}${PESAPAL_ENDPOINTS.AUTH}`,
    registerIpn: `${PESAPAL_API_URL}${PESAPAL_ENDPOINTS.REGISTER_IPN}`,
    submitOrder: `${PESAPAL_API_URL}${PESAPAL_ENDPOINTS.SUBMIT_ORDER}`,
    getStatus: `${PESAPAL_API_URL}${PESAPAL_ENDPOINTS.GET_STATUS}`,
  };
};

/**
 * Format error for API responses
 */
exports.formatErrorResponse = (error, context) => {
  return createPesaPalErrorResponse(error, context);
};
