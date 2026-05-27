# Email Notifications Setup Guide

## Overview

Your Maintenance Management System now includes comprehensive email notifications at every stage of the maintenance request lifecycle.

## Email Notification Types

### 1. 📬 New Request Notification
**When:** A client submits a new maintenance request  
**Sent To:** All active admins and managers  
**Content:** Request details, location, category, priority, and submitter information

**Example Subject:** "New Maintenance Request: Broken Water Pump"

---

### 2. ✅ Work Order Created Notification (NEW)
**When:** A request is approved and becomes a work order  
**Sent To:** All active admins and managers  
**Content:** 
- Work Order ID
- Title, description, and location
- Category, priority, and estimated time
- Target completion deadline
- Assignment status
- Direct link to view in dashboard

**Example Subject:** "🔧 Work Order Created: Broken Water Pump"

---

### 3. 👤 Request Approved Notification
**When:** A manager approves a client's maintenance request  
**Sent To:** The client who submitted the request  
**Content:** Approval confirmation with request details

**Example Subject:** "Maintenance Request Approved: Broken Water Pump"

---

### 4. ❌ Request Declined Notification
**When:** A manager declines a client's maintenance request  
**Sent To:** The client who submitted the request  
**Content:** Decline notification with reason

**Example Subject:** "Maintenance Request Declined: Broken Water Pump"

---

### 5. 🚀 Work in Progress Notification
**When:** A technician starts working on an issue  
**Sent To:** Admins and managers  
**Content:** Issue details, before photos, estimated fix time, deadline

**Example Subject:** "Maintenance Work Started: Broken Water Pump"

---

### 6. ✔️ Issue Completed Notification
**When:** A technician completes and submits work  
**Sent To:** Admins, managers, and the client  
**Content:** Before/after photos, technician feedback, completion confirmation

**Example Subject:** "Maintenance Issue Completed: Broken Water Pump"

---

## Current Email Configuration

### Email Service Provider
**Provider:** Gmail SMTP

### Configuration Details
```env
EMAIL_USER=byishimo034@gmail.com
EMAIL_PASS=uhdo tdwg athi lsnw  # Gmail App Password
EMAIL_SERVICE=gmail
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
FRONTEND_URL=https://www.fixnest.rw
BACKEND_URL=http://localhost:7000
```

### Important Notes
- The EMAIL_PASS is a **Gmail App Password**, NOT your regular Gmail password
- SMTP_SECURE is `false` because we're using TLS on port 587
- Gmail requires 2-Factor Authentication to generate App Passwords

---

## How to Test Email Notifications

### Step 1: Create a Test Request
1. Log in as a client
2. Go to "Submit Maintenance Request"
3. Fill in the form with test details:
   - Title: "Test Request"
   - Description: "This is a test"
   - Location: "Building A"
   - Category: "Plumbing"
   - Priority: "High"
4. Submit the request

✅ **Expected:** Admins/managers should receive "New Maintenance Request" email

---

### Step 2: Approve the Request
1. Log in as an admin/manager
2. Go to "Manage Issues"
3. Find your test request
4. Click "Approve"
5. Submit the approval

✅ **Expected Results:**
- Client receives "Maintenance Request Approved" email
- All admins/managers receive "Work Order Created" email

---

### Step 3: Monitor Inbox
Check these email addresses:
- **Admin/Manager inbox:** byishimo034@gmail.com (for request and work order notifications)
- **Client inbox:** Whatever email the client used to submit the request

---

## Email Template Features

All emails include:
- ✨ Professional HTML design with company branding
- 🎨 Color-coded status indicators
- 🔗 Direct links to view items in the dashboard
- 📱 Responsive design (works on mobile/desktop)
- 🏢 Company information and request ID

---

## Troubleshooting

### Emails Not Sending?

#### Check 1: Email Configuration
Verify all email variables are set in `.env`:
```bash
# Should show values, not empty
echo $EMAIL_USER
echo $EMAIL_PASS
echo $EMAIL_SERVICE
```

#### Check 2: Gmail App Password
1. Go to [Google Account Security](https://myaccount.google.com/security)
2. Ensure 2-Factor Authentication is enabled
3. Create/regenerate App Password for "Mail" and "Windows Mail"
4. Copy the 16-character password and update `EMAIL_PASS` in `.env`

#### Check 3: Server Logs
Look for email service logs:
```bash
# In your server console, look for messages like:
# ✅ Email transporter is ready to send messages
# 📧 Sending new request notification to admins/managers
# ✅ New request notification sent to admins/managers
```

#### Check 4: Admin/Manager Users
- Verify admins/managers exist in the system with status: `active`
- Verify their email addresses are valid
- Check that they have role: `admin` or `manager`

#### Check 5: Company Assignment
- Request and users must have the same company name
- Email system filters by company to determine recipients

---

## Email Recipients by Role

| Notification | Admin | Manager | Client | Technician |
|--------------|-------|---------|--------|------------|
| New Request | ✅ | ✅ | ❌ | ❌ |
| Work Order Created | ✅ | ✅ | ❌ | ❌ |
| Request Approved | ❌ | ❌ | ✅ | ❌ |
| Request Declined | ❌ | ❌ | ✅ | ❌ |
| Work in Progress | ✅ | ✅ | ❌ | ❌ |
| Issue Completed | ✅ | ✅ | ✅ | ❌ |

---

## Email Service Methods

### For Developers

If you need to send custom emails or integrate with other parts of the system:

#### Send New Request Notification
```javascript
const emailService = require('./modules/emailService/email.service');

await emailService.sendNewRequestNotification({
  title: 'Water Pump Repair',
  description: 'Pump is not working',
  location: 'Building A',
  category: 'Plumbing',
  priority: 'HIGH',
  id: '507f1f77bcf86cd799439011'
}, clientData, companyName);
```

#### Send Work Order Created Notification (NEW)
```javascript
await emailService.sendWorkOrderCreatedNotification({
  id: '507f1f77bcf86cd799439011',
  title: 'Water Pump Repair',
  description: 'Pump is not working',
  location: 'Building A',
  category: 'Plumbing',
  priority: 'HIGH',
  estimatedTime: 2,
  fixDeadline: new Date('2025-05-30'),
  companyName: 'Fixnest',
  assignedTo: 'John Doe'
}, companyName);
```

#### Send Generic Email
```javascript
await emailService.sendEmail({
  to: 'admin@example.com',
  subject: 'Custom Subject',
  html: '<h1>Hello</h1><p>Custom email content</p>'
});
```

---

## Next Steps

1. ✅ Verify `.env` email configuration
2. ✅ Create a test request to trigger notifications
3. ✅ Check email inbox for incoming emails
4. ✅ If emails don't arrive, check troubleshooting section
5. ✅ Update recipient email addresses if needed

---

## Support

If emails still aren't working after checking the troubleshooting section:

1. Check server logs for specific error messages
2. Verify Gmail App Password is correct (16 characters, no spaces at start/end)
3. Ensure 2-Factor Authentication is enabled on Gmail
4. Try resetting the Gmail App Password and updating `.env`
5. Check that admin/manager users have `status: 'active'`

---

## Summary of Changes

### What's New
✨ **Work Order Created Email**: When a request is approved, admins/managers now receive a "Work Order Created" email with full work order details and a direct link to the dashboard.

### Technical Details
- **File Modified:** `src/modules/emailService/email.service.js`
  - Added `workOrderCreated` email template
  - Added `sendWorkOrderCreatedNotification()` function
  
- **File Modified:** `src/modules/issue/issue.controller.js`
  - Updated `update()` method to call `sendWorkOrderCreatedNotification()` when status changes to APPROVED

### Testing
All changes have been integrated with existing email infrastructure. The system will automatically send emails when:
1. A new request is created
2. A request is approved (triggers both client approval email + new work order email)
3. Work progresses through the system

---

**Last Updated:** May 27, 2025  
**System:** Fixnes Maintenance Management System
