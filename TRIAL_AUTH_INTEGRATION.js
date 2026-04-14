/**
 * INTEGRATION STEPS FOR AUTH/REGISTRATION
 * 
 * This file shows how to integrate trial initialization into the registration flow
 */

// ============================================================================
// STEP 1: MODIFY user.controller.js - registerUser function
// ============================================================================

// Find the registerUser function (around line 47) and add trial initialization:

/*
ORIGINAL CODE:
```javascript
exports.registerUser = async (req, res) => {
  try {
    // ... existing code ...
    const user = await createUser(payload, { requirePaymentBeforeActivation: false });
    
    // Send welcome email...
    
    res.status(201).json({
      // ... response ...
    });
  }
};
```

UPDATED CODE (ADD THESE LINES):
*/

// At the top of user.controller.js, add require:
// const trialService = require('../subscription/trial.service');

// Then modify registerUser like this:

/*
exports.registerUser = async (req, res) => {
  try {
    const payload = { ...(req.body || {}) };

    // ... file uploads ...

    // Auto-activate user on signup
    const user = await createUser(payload, { requirePaymentBeforeActivation: false });
    
    // ⭐ NEW: Initialize 5-day free trial for the user's company
    try {
      if (user.company?.id) {
        await trialService.initializeFreeTrial(user.company.id);
        console.log(`[TRIAL] Initialized 5-day free trial for company: ${user.company.id}`);
      } else if (user.companyId) {
        await trialService.initializeFreeTrial(user.companyId);
        console.log(`[TRIAL] Initialized 5-day free trial for company: ${user.companyId}`);
      }
    } catch (trialErr) {
      console.error('Failed to initialize trial:', trialErr.message);
      // Don't fail registration if trial initialization fails
    }
    
    // Send welcome email to new user
    if (user.email) {
      try {
        const trialStatus = await trialService.getTrialStatus(user.company?.id || user.companyId);
        
        // Optional: Include trial info in welcome email
        await emailService.sendAccountWelcomeEmail({
          to: user.email,
          name: user.name || user.companyName,
          email: user.email,
          companyName: user.companyName,
          role: user.role,
          // Add trial info if available
          trialDaysRemaining: trialStatus?.daysRemaining || 5,
          trialEndDate: trialStatus?.trialEndDate
        });
      } catch (err) {
        console.error('Failed to send welcome email:', err.message);
      }
    }

    // Return success with trial info
    res.status(201).json({
      message: 'Account created successfully! Your 5-day free trial is active. Check your email for details.',
      email: user.email,
      status: 'account_created',
      user: {
        _id: user._id,
        id: String(user._id),
        name: user.name,
        email: user.email,
        companyName: user.companyName,
        role: user.role,
        isActive: user.isActive
      }
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};
*/

// ============================================================================
// STEP 2: IF USING PRISMA - Modify createUser in user.service.js
// ============================================================================

// If your createUser service uses Prisma and creates companies, add:

/*
const trialService = require('../subscription/trial.service');

async function createUser(userData, options = {}) {
  // ... existing code to create user ...
  
  // After company is created:
  if (newCompany?.id) {
    try {
      await trialService.initializeFreeTrial(newCompany.id);
    } catch (err) {
      console.error('Trial initialization failed:', err);
    }
  }
  
  return user;
}
*/

// ============================================================================
// STEP 3: UPDATE EMAIL SERVICE - Include trial info in welcome email
// ============================================================================

// In src/modules/emailService/email.service.js, update sendAccountWelcomeEmail:

/*
sendAccountWelcomeEmail: async ({ to, name, email, companyName, role, trialDaysRemaining, trialEndDate }) => {
  // ... existing code ...
  
  const trialInfo = trialDaysRemaining ? `
    <p>
      <strong>🎉 Your 5-Day Free Trial is Active!</strong><br>
      You have ${trialDaysRemaining} days to explore all features at no cost.<br>
      Trial ends: ${new Date(trialEndDate).toLocaleDateString()}
    </p>
  ` : '';
  
  const htmlContent = `
    <h1>Welcome to ${companyName || 'MMS'}!</h1>
    <p>Hello ${name},</p>
    <p>Your account has been created successfully.</p>
    
    ${trialInfo}
    
    <p>You can now log in and start managing your properties and assets.</p>
    
    <a href="${FRONTEND_URL}/login">Login to Your Dashboard</a>
    
    <p>Questions? Contact us at support@mms.app</p>
  `;
  
  // ... send email ...
}
*/

// ============================================================================
// STEP 4: (OPTIONAL) Middleware - Add trial check to protected routes
// ============================================================================

// In your main Express app (index.js or bootstrap):

/*
const { attachTrialStatus } = require('./middleware/trial');

// Add after authentication middleware
app.use(authenticate);
app.use(attachTrialStatus); // Attach trial info to all requests

// This will add req.trialStatus to all API responses
// so frontend always knows current trial status
*/

// ============================================================================
// STEP 5: RUN PRISMA MIGRATION
// ============================================================================

// Execute in terminal:
// cd Mantainance-Management-system-Backend-
// npx prisma migrate dev --name add_trial_fields
// npx prisma generate

// ============================================================================
// STEP 6: TEST TRIAL INITIALIZATION
// ============================================================================

// Run the test script:
// node test-trial-system.js

// Or manually test:
// 1. Register a new user:
//    POST /api/users/register with user data
// 2. Check trial was initialized:
//    curl http://localhost:3000/api/subscriptions/trial/status
//    (with authentication header)
// 3. Verify database:
//    db.companies.findOne() - should have onFreeTrial: true, trialDaysRemaining: 5
//    db.subscriptions.findOne() - should have isTrialPeriod: true

// ============================================================================
// FINAL CHECKLIST
// ============================================================================

/*
- [ ] Add require for trialService in user.controller.js
- [ ] Add trial initialization call in registerUser function
- [ ] Update welcome email template with trial info
- [ ] Run Prisma migration successfully
- [ ] Test registration creates trial
- [ ] Test trial countdown works
- [ ] Test trial expiration blocks access
- [ ] Test upgrade to paid removes trial
- [ ] Monitor logs for trial events
*/

module.exports = {
  integrationNotes: 'See comments in this file for step-by-step integration instructions'
};
