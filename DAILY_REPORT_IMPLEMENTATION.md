# Daily Report System - Implementation Guide

## Overview

A comprehensive **daily email report system** has been implemented for the MMS platform. This system automatically generates and sends personalized reports to company administrators and technicians every day at **6 AM UTC**.

## Features

### 📊 For Administrators/Managers
- **Daily Work Summary**: Overview of completed, open, and overdue work orders
- **Team Performance**: Top-performing technicians for the day
- **Asset Health**: Assets needing maintenance
- **High-Priority Issues**: Critical tasks that need attention
- **KPI Metrics**: Total assets, active technicians, completion rates
- **Actionable Alerts**: Overdue items flagged in red

### 👷 For Technicians
- **Personal Work Summary**: Tasks completed today vs pending tasks
- **Work Order List**: All assigned tasks with status and due dates
- **Urgent Tasks Alert**: Highlighted high-priority items
- **Quick Stats**: Completion count and task breakdown

## Technical Architecture

### Components Created

1. **`src/modules/reports/dailyReport.service.js`**
   - Main service handling report generation and scheduling
   - Uses `node-cron` for daily scheduling at 6 AM UTC
   - Fetches company metrics from MongoDB
   - Generates HTML email content
   - Integrates with existing email service

2. **`src/modules/reports/dailyReport.controller.js`**
   - Exposes REST endpoints for manual report triggering
   - Provides status/debug information

3. **`src/modules/reports/dailyReport.routes.js`**
   - Routes for administrative operations
   - POST `/api/reports/daily/trigger` - Manually send reports
   - GET `/api/reports/daily/status` - Check scheduler status

4. **Integration in `src/index.js`**
   - Scheduler initialized on MongoDB connection
   - Routes registered in Express app
   - Service loads at server startup

## How It Works

### 1. Scheduling
```
Schedule: Every day at 6 AM UTC
Trigger: Automatic (via node-cron)
```

### 2. Data Collection
For each company:
- Fetch all users and separate by role (admin/manager vs technician)
- Calculate metrics:
  - Work orders completed in last 24 hours
  - Open/pending/in-progress work orders
  - Overdue work orders
  - Asset conditions
  - Technician workload

### 3. Report Generation
- **For each admin/manager**: Generate comprehensive dashboard-style report
- **For each technician**: Generate personalized task report
- HTML formatted with inline styles (email-compatible)
- Include metrics, alerts, task lists

### 4. Email Distribution
- Use existing email service (`emailService.sendEmail`)
- Send to individual user emails
- Subject line includes company name and date
- Professional HTML template

## API Endpoints

### Manually Trigger Reports (Admin Only)
```
POST /api/reports/daily/trigger
Authorization: Required
Response: {
  success: true,
  message: "Daily reports have been triggered successfully. Emails are being sent..."
}
```

### Check Scheduler Status
```
GET /api/reports/daily/status
Authorization: Required
Response: {
  success: true,
  status: "active",
  schedule: "6 AM UTC daily",
  lastUpdated: "2026-04-03T...",
  message: "Daily reports are scheduled and will be sent automatically"
}
```

## Data Included in Reports

### Admin Report Metrics
```
- Completed Work Orders (Today)
- Open Work Orders (Current)
- Overdue Tasks
- Assets Needing Maintenance
- Top Performing Technicians
- High Priority Issues (Top 10)
- Total Assets
- Total Work Orders
- Active Technicians
- Completion Rate %
```

### Technician Report Metrics
```
- Tasks Completed Today
- Tasks Pending
- Urgent/High-Priority Count
- Full Task List (up to 20 items)
  - Task Title
  - Asset Name
  - Status
  - Priority
  - Due Date
```

## Email Templates

### Visual Design
- **Gradient Headers**: Purple/indigo for admin, Pink/red for technician
- **Metric Cards**: Key numbers highlighted with color-coded boxes
- **Alert Boxes**: Yellow for warnings, Red for urgent
- **Responsive Design**: Mobile-friendly HTML layout
- **Professional Styling**: Inline CSS for email compatibility

### Sample Content Structure
```
Header (Company Name + Title)
  ↓
Key Metrics (Grid of stat boxes)
  ↓
Alerts (If applicable)
  ↓
High-Priority Issues (Table)
  ↓
Task List (With status badges)
  ↓
Summary Stats (Table)
  ↓
CTA Button (Link to Dashboard)
  ↓
Footer (Disclaimer + Company Info)
```

## Installation & Setup

### 1. Dependencies Added
```bash
npm install node-cron @anthropic-ai/sdk
```

### 2. Environment Variables
No new environment variables required - uses existing `ANTHROPIC_API_KEY` and email configuration

### 3. Database Requirements
Uses existing Prisma models:
- `Company`
- `User`
- `Issue` (work orders)
- `Asset`
- `InternalTechnician`

## Testing & Debugging

### Manual Testing
```bash
# Trigger reports immediately via API
curl -X POST http://localhost:5000/api/reports/daily/trigger \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json"
```

### Check Logs
Look for these log messages when reports are sent:
```
📅 [Daily Report] Starting scheduled daily reports...
📈 [Daily Report] Found X companies to process
✅ Sent reports for company: CompanyName
✅ Admin report sent to admin@example.com
✅ Technician report sent to tech@example.com
✅ [Daily Report] Daily reports sent successfully
```

### Debug Mode
The service includes detailed logging:
- Company processing status
- Individual user notifications
- Metric calculations
- Email sending confirmation

## Customization Options

### 1. Change Report Time
Edit the cron schedule in `dailyReport.service.js`:
```javascript
// Current: 6 AM UTC (0 6 * * *)
// Format: minute hour day month dayOfWeek
// Examples:
// 8 AM UTC: '0 8 * * *'
// 3 PM UTC: '0 15 * * *'
// 9 AM Monday-Friday: '0 9 * * 1-5'
nodeCron.schedule('0 6 * * *', async () => { ... });
```

### 2. Customize Metrics
Edit the `getCompanyMetrics()` method to include:
- Budget tracking
- Compliance metrics
- SLA performance
- Custom KPIs

### 3. Modify Report Templates
Edit `sendAdminReport()` or `sendTechnicianReport()` to:
- Change color schemes
- Add/remove sections
- Include additional data
- Modify alert thresholds

### 4. Add Report Formats
Create additional report types:
- Daily+Weekly summaries
- Monthly PDF reports
- Department-specific reports
- Custom user role reports

## Performance Considerations

- **Daily Execution**: Runs once per day, minimal server load
- **Database Queries**: Optimized with specific selects (no N+1)
- **Email Queue**: Sends asynchronously, doesn't block server
- **Scalability**: Supports unlimited companies (batch processing)
- **Error Handling**: Continues processing even if single company fails

## Security & Privacy

✅ **Authentication Required**: All endpoints require valid JWT token  
✅ **Role-Based**: Admin endpoint could be restricted to company admins only  
✅ **Data Isolation**: Each company only sees its own data  
✅ **Email Encryption**: Uses TLS for SMTP (existing email service)  
✅ **No Sensitive Data**: Passwords and keys never included in emails  

## Future Enhancements

1. **Frequency Options**: Allow companies to choose daily/weekly/monthly
2. **Email Preferences**: Let users disable specific reports
3. **Report Templates**: Custom branding per company
4. **Analytics**: Track report opens and clicks
5. **PDF Export**: Download reports as PDF attachment
6. **Trends**: Include week-over-week/month-over-month comparisons
7. **Webhooks**: Send reports to Slack/Teams channels
8. **Dashboard Widget**: Show "Last Report" summary on dashboard

## Troubleshooting

### Reports Not Sending
1. Check MongoDB connection: `GET /api/health`
2. Verify email service is working: Test with manual trigger
3. Check logs for errors
4. Verify user emails are set in the database

### Schedule Not Running
1. Check server logs for initialization message:
   `✅ [Daily Report] Scheduler initialized - Reports will be sent daily at 6 AM UTC`
2. Verify node-cron is installed: `npm list node-cron`
3. Check server timezone (uses UTC, not server local time)

### Emails Not Received
1. Check spam/junk folder
2. Verify email service credentials in `.env`
3. Test email service directly
4. Check user email addresses in database

### Wrong Data in Reports
1. Verify company data in MongoDB
2. Check if companyId is correctly set on issues/assets
3. Verify date calculations (uses 24-hour windows)
4. Check timezone settings

## Support & Questions

For issues or questions about the daily report system:
1. Check server logs for detailed error messages
2. Use manual trigger endpoint to test
3. Verify database has required data
4. Check email service configuration
5. Review this documentation for customization options

---

**Last Updated**: April 3, 2026  
**System Version**: 1.0  
**Status**: ✅ Production Ready
