# PesaPal V3 API Testing & Implementation Guide

## Overview
This guide covers comprehensive testing and implementation of PesaPal V3 integration with error handling, sandbox testing, and production deployment.

## Environment Configuration

### Sandbox Testing
```bash
# .env (Development)
PESAPAL_ENV=sandbox
PesaPal_Consumer_Key=YOUR_SANDBOX_KEY
PesaPal_Consumer_Secret=YOUR_SANDBOX_SECRET
PESAPAL_CALLBACK_URL=http://localhost:5000/api/subscriptions/payments/pesapal-callback
```

### Production
```bash
# .env (Production)
PESAPAL_ENV=live
PesaPal_Consumer_Key=YOUR_LIVE_KEY
PesaPal_Consumer_Secret=YOUR_LIVE_SECRET
PESAPAL_CALLBACK_URL=https://your-domain.com/api/subscriptions/payments/pesapal-callback
```

## Test Endpoints

### 1. Test PesaPal Connectivity
**Verify that your API credentials are correct and PesaPal is accessible:**

```bash
# Test connectivity
curl -X GET http://localhost:5000/api/subscriptions/payments/test-pesapal

# Expected Response (Success):
{
  "success": true,
  "environment": "sandbox",
  "apiUrl": "https://cybqa.pesapal.com/pesapalv3/api",
  "authentication": "OK",
  "ipnRegistration": "OK",
  "message": "All PesaPal connectivity tests passed!"
}

# Expected Response (Error):
{
  "success": false,
  "error": {
    "type": "authentication_error",
    "code": "UNAUTHORIZED",
    "message": "Failed to authenticate with PesaPal"
  }
}
```

### 2. Get PesaPal Configuration
**View current API configuration:**

```bash
curl -X GET http://localhost:5000/api/subscriptions/payments/config

# Response:
{
  "environment": "sandbox",
  "apiUrl": "https://cybqa.pesapal.com/pesapalv3/api",
  "callbackUrl": "http://localhost:5000/api/subscriptions/payments/pesapal-callback",
  "hasCredentials": true,
  "isSandbox": true,
  "postmanUrl": "https://documenter.getpostman.com/view/6715320/UyxepTv1",
  "supportedCurrencies": ["RWF", "KES", "UGX", "TZS", "USD"],
  "supportedPaymentMethods": ["mobile_money", "card"]
}
```

### 3. List API Endpoints
**View all PesaPal API endpoints being used:**

```bash
curl -X GET http://localhost:5000/api/subscriptions/payments/endpoints

# Response:
{
  "authentication": "https://cybqa.pesapal.com/pesapalv3/api/Auth/RequestToken",
  "registerIpn": "https://cybqa.pesapal.com/pesapalv3/api/URLSetup/RegisterIPN",
  "submitOrder": "https://cybqa.pesapal.com/pesapalv3/api/Transactions/SubmitOrderRequest",
  "getStatus": "https://cybqa.pesapal.com/pesapalv3/api/Transactions/GetTransactionStatus"
}
```

## 5-Step Integration Flow

### Step 1: Authentication
**Get JWT access token**
- Function: `getPesaPalAccessToken()`
- Endpoint: `POST /Auth/RequestToken`
- Returns: Bearer token for subsequent requests
- Error Handling: Validates credentials, catches auth errors

### Step 2-3: Submit Order Request
**Create payment order and get redirect URL**
- Function: `initiatePesaPalRequest()`
- Endpoint: `POST /Transactions/SubmitOrderRequest`
- Parameters:
  - `id`: Unique transaction ID
  - `amount`: Payment amount (RWF rounded to integer)
  - `currency`: Currency code (RWF, KES, UGX, TZS, USD)
  - `description`: Payment description
  - `billing_address`: Customer details
  - `notification_id`: IPN ID for callbacks
- Returns: `order_tracking_id`, `redirect_url`, `status`
- Error Handling: Validates amount > 0, catches API errors

### Step 4: Customer Checkout
**User is redirected to PesaPal checkout page**
- `&type=mobile` parameter hints mobile money preference
- User selects payment method (Mobile Money or Card)
- After payment, user redirected to `callback_url`

### Step 5: Verify Payment Status
**Query PesaPal for payment confirmation**
- Function: `verifyPesaPalPaymentStatus()`
- Endpoint: `GET /Transactions/GetTransactionStatus?orderTrackingId={id}`
- Returns: Payment status, amount, currency, confirmation code
- Polling: Frontend auto-checks every 5 seconds (up to 60 seconds)
- Database Update: Updates payment record and activates subscription

## API Error Format

All errors follow PesaPal V3 standard format:

```json
{
  "error": {
    "type": "error_type",
    "code": "response_code",
    "message": "Detailed error message"
  }
}
```

### Error Types & Codes

| Error Type | Code | Description |
|-----------|------|-------------|
| `bad_request` | INVALID_REQUEST | Invalid request parameters |
| `authentication_error` | UNAUTHORIZED | Invalid credentials or expired token |
| `permission_error` | FORBIDDEN | Insufficient permissions |
| `not_found_error` | NOT_FOUND | Payment/Order not found |
| `conflict_error` | CONFLICT | IPN already registered (409) |
| `rate_limit_error` | RATE_LIMITED | Too many requests (429) |
| `timeout_error` | REQUEST_TIMEOUT | Request timed out |
| `network_error` | CONNECTION_REFUSED | Cannot reach API |
| `server_error` | INTERNAL_SERVER_ERROR | PesaPal server error (500) |
| `service_unavailable` | SERVICE_UNAVAILABLE | PesaPal temporarily unavailable (503) |

### Error Handling in Code

```javascript
// Try-catch with error parsing
try {
  const payment = await initiatePesaPalPayment(data);
  return payment;
} catch (error) {
  const formatted = createPesaPalErrorResponse(error, 'Payment initiation failed');
  // Will log and format error to match PesaPal V3 format
  return formatted;
}
```

## Testing Workflow

### Complete Payment Flow Test

1. **Create Subscription & Payment**
```bash
POST /api/subscriptions/payments/initiate-pesapal
{
  "subscriptionId": "sub-123",
  "amount": 29.99,
  "currency": "RWF",
  "email": "customer@example.com",
  "phoneNumber": "+250123456789",
  "userId": "user-456"
}

# Response:
{
  "id": "payment-789",
  "order_tracking_id": "08ff8f20-2b6c...",
  "redirect_url": "https://pesapal-checkout-url&type=mobile"
}
```

2. **Simulate Customer Visiting Checkout**
   - Click redirect_url
   - Choose payment method (Mobile Money or Card)
   - Complete payment on PesaPal

3. **Verify Payment Status**
```bash
GET /api/subscriptions/payments/pesapal-status?orderTrackingId=08ff8f20-2b6c...

# Response (Polling every 5 seconds):
{
  "order_tracking_id": "08ff8f20-2b6c...",
  "status": "COMPLETED",
  "status_code": 1,
  "amount": 30000,
  "currency": "RWF"
}
```

4. **Confirm Subscription Activated**
```bash
GET /api/subscriptions/{subscriptionId}

# Should show:
{
  "paymentStatus": "paid",
  "nextBillingDate": "2026-05-02T..."
}
```

### Test Payment Statuses

| Status | Code | Behavior |
|--------|------|----------|
| COMPLETED | 1 | Payment successful → Subscription activates |
| FAILED | 2 | Payment failed → Show retry option |
| PENDING | 0 | Still processing → Auto-poll |

## Mobile Money Configuration

### For Mobile Money to Show on PesaPal Checkout:

1. **Contact PesaPal Support**
   - Request to enable mobile money providers
   - Specify: "Enable Mobile Money for Rwanda (MTN, Airtel, Orange)"

2. **Supported Providers by Country**
   - Rwanda: MTN Money, Airtel Money, Orange Money
   - Kenya: M-Pesa
   - Uganda: MTN Money, Airtel Money
   - Tanzania: TigoPesa, Airtel Money
   - Others: Vodacom (Tanzania)

3. **Test in Sandbox**
   - Request test credentials for each provider
   - Test payment notifications via webhook

## Logging & Debugging

### Enable Detailed Logs

```javascript
// Set environment variable for verbose logging
process.env.DEBUG = 'pesapal:*'

// Logs will show:
[PesaPal Configuration]
├─ Environment: SANDBOX
├─ API URL: https://cybqa.pesapal.com/pesapalv3/api
├─ IPN URL: http://localhost:5000/api/subscriptions/payments/pesapal-callback

[PesaPal] Step 1: Authenticating to obtain access token...
[PesaPal] ✅ Authentication successful - Token obtained

[PesaPal] Step 2-3: Initiating payment order request...
[PesaPal] Order Request Payload: { ... }
[PesaPal] ✅ Order request successful

[PesaPal] Step 4-5: Querying payment status...
[PesaPal] ✅ Status retrieved: COMPLETED (Code: 1)
```

## Postman Collection

Import the official PesaPal Postman Collection:
**https://documenter.getpostman.com/view/6715320/UyxepTv1**

This includes pre-configured requests for all endpoints:
- Authentication
- IPN Registration
- Submit Order
- Get Transaction Status
- Query Orders

## Common Issues & Solutions

### Issue: "TypeError: Right-hand side of 'instanceof' is not an object"
**Cause**: Invalid `payment_method` parameter sent to PesaPal
**Solution**: Removed in code - PesaPal V3 doesn't support this parameter

### Issue: Mobile Money Not Showing on Checkout
**Cause**: Merchant account doesn't have mobile money providers enabled
**Solution**: Contact PesaPal Support to enable providers for your region

### Issue: IPN Callback Returns 409 Conflict
**Cause**: IPN already registered for this callback URL
**Solution**: Code handles this gracefully - continues with cached IPN ID

### Issue: Localhost Callback URL Rejected
**Cause**: PesaPal won't accept localhost in production
**Solution**: Use public tunnel (ngrok) for sandbox testing, or test on staging server

### Issue: "Request timeout" or Connection Refused
**Cause**: Network issue or PesaPal service temporarily unavailable
**Solution**: Implement retry logic with exponential backoff

## Security Best Practices

1. **Store Credentials Securely**
   - Never commit keys to git
   - Use environment variables
   - Rotate keys periodically

2. **Validate Callbacks**
   - Verify IPN signatures (when PesaPal provides)
   - Confirm amount matches database record
   - Update database before confirming to user

3. **Handle Race Conditions**
   - Check if payment already processed
   - Use database transactions
   - Prevent duplicate activations

4. **Log Sensitive Data Carefully**
   - Don't log full payment amounts in production
   - Redact sensitive user info
   - Store audit logs for compliance

5. **Implement Idempotency**
   - Use unique order IDs
   - Handle duplicate requests gracefully
   - Verify state before updates

## Production Deployment Checklist

- [ ] Update .env with live credentials
- [ ] Set `PESAPAL_ENV=live`
- [ ] Test on staging environment first
- [ ] Verify callback URL is public and accessible
- [ ] Set up proper error logging/monitoring
- [ ] Configure webhook retry logic
- [ ] Enable audit logging
- [ ] Have PesaPal support contact info
- [ ] Plan for handling payment failures
- [ ] Document refund process
- [ ] Set up rate limiting
- [ ] Enable HTTPS on callback URL
