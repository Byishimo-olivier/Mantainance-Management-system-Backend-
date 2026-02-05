# Email Service Documentation

## Overview
The MMS (Maintenance Management System) includes an automated email notification system that sends notifications to admins, managers, and clients at key points in the maintenance request lifecycle.

## Features

### 1. New Request Notifications
- **Trigger**: When a client submits a new maintenance request
- **Recipients**: All active admin and manager users
- **Content**: Request details including title, description, location, category, and client information

### 2. Request Approval Notifications
- **Trigger**: When a manager approves a maintenance request
- **Recipients**: The client who submitted the request
- **Content**: Approval confirmation with request details and manager information

### 3. Request Decline Notifications
- **Trigger**: When a manager declines a maintenance request
- **Recipients**: The client who submitted the request
- **Content**: Decline notification with reason and manager information

### 4. Issue Completion Notifications
- **Trigger**: When a technician completes an issue and submits after-evidence
- **Recipients**: All active admin/manager users and the client
- **Content**: Completion details including technician feedback, after photos, and completion status

## Email Configuration

The email service uses Gmail SMTP. Configure the following environment variables in your `.env` file:

```env
EMAIL_USER=your-email@gmail.com
EMAIL_PASS=your-app-password
FRONTEND_URL=http://localhost:5173
BACKEND_URL=http://localhost:5000
```

### Gmail App Password Setup
1. Enable 2-factor authentication on your Gmail account
2. Generate an App Password: https://support.google.com/accounts/answer/185833
3. Use the App Password (not your regular password) for EMAIL_PASS

**Important**: If you're using Gmail, make sure to:
- Enable "Less secure app access" OR use an App Password
- Allow access from less secure apps in your Google account settings
- If you get authentication errors, try using an App Password instead of your regular password

### Alternative Email Providers
You can also use other SMTP providers by modifying the transporter configuration in `email.service.js`:

```javascript
// For Outlook/Hotmail
const transporter = nodemailer.createTransport({
  service: 'outlook',
  auth: {
    user: 'your-email@outlook.com',
    pass: 'your-password'
  }
});

// For custom SMTP
const transporter = nodemailer.createTransport({
  host: 'smtp.your-provider.com',
  port: 587,
  secure: false,
  auth: {
    user: 'your-email@your-provider.com',
    pass: 'your-password'
  }
});
```

## API Endpoints

### Test Email
```
POST /api/email/test
Authorization: Bearer <token>
Content-Type: application/json

{
  "email": "test@example.com"
}
```
**Required Role**: Admin

## Email Templates

The system includes professional HTML email templates with:
- Responsive design
- Company branding (Fixnest)
- Clear call-to-action buttons
- Structured information layout

## Integration Points

### Issue Controller
- `create()`: Sends new request notifications
- `update()`: Sends approval/decline notifications
- `uploadAfterEvidence()`: Sends completion notifications

### Database Requirements
The system automatically fetches admin/manager emails from the User table where:
- `role` is 'admin' or 'manager'
- `status` is 'active'

## Error Handling
- Email failures don't break the main application flow
- Errors are logged to console for debugging
- Graceful degradation ensures core functionality works even if emails fail

## Security Considerations
- Emails are sent only to verified users in the system
- No sensitive information is included in emails
- Rate limiting should be considered for production deployment

## Testing
Use the `/api/email/test` endpoint to verify email configuration before deploying to production.