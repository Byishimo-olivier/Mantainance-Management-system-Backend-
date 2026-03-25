const nodemailer = require('nodemailer');

// Load environment variables
require('dotenv').config();

// Debug: Check if email credentials are loaded
console.log('🔍 Email credentials check:');
console.log('EMAIL_USER:', process.env.EMAIL_USER ? 'Set' : 'NOT SET');
console.log('EMAIL_PASS:', process.env.EMAIL_PASS ? 'Set (length: ' + process.env.EMAIL_PASS.length + ')' : 'NOT SET');
console.log('EMAIL_SERVICE:', process.env.EMAIL_SERVICE || 'gmail');

// Create transporter with service-specific configuration
let transporter;

const emailService = process.env.EMAIL_SERVICE || 'gmail';

if (emailService === 'gmail') {
  // Gmail configuration
  const host = process.env.SMTP_HOST || 'smtp.gmail.com';
  // Use port 465 and secure: true as default for production/cloud environments
  const port = process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT) : 465;
  const secure = process.env.SMTP_SECURE ? process.env.SMTP_SECURE === 'true' : port === 465;

  console.log(`[EMAIL] Configuring SMTP: ${host}:${port} (secure: ${secure})`);

  transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS
    },
    tls: {
      rejectUnauthorized: false,
      minVersion: 'TLSv1.2'
    },
    debug: true,
    logger: true,
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 15000
  });
} else if (emailService === 'outlook' || emailService === 'hotmail') {
  // Outlook/Hotmail configuration
  transporter = nodemailer.createTransport({
    service: 'outlook',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS
    },
    secure: false,
    tls: {
      ciphers: 'SSLv3'
    }
  });
} else if (emailService === 'sendgrid') {
  // SendGrid configuration
  transporter = nodemailer.createTransport({
    host: 'smtp.sendgrid.net',
    port: 587,
    secure: false,
    auth: {
      user: 'apikey', // SendGrid requires 'apikey' as username
      pass: process.env.EMAIL_PASS // Your SendGrid API key
    },
    tls: {
      ciphers: 'SSLv3'
    }
  });
} else if (emailService === 'ethereal') {
  // Ethereal Email (fake SMTP for testing - emails are captured in web interface)
  transporter = nodemailer.createTransport({
    host: 'smtp.ethereal.email',
    port: 587,
    secure: false,
    auth: {
      user: process.env.ETHEREAL_USER || 'your-ethereal-user',
      pass: process.env.ETHEREAL_PASS || 'your-ethereal-pass'
    }
  });
} else {
}

// Verify transporter configuration (async, non-blocking)
setTimeout(() => {
  // Allow disabling verification in environments where outbound SMTP is blocked
  const skipVerify = (process.env.SKIP_MAIL_VERIFY === '1' || process.env.SKIP_MAIL_VERIFY === 'true');
  if (skipVerify) {
    console.log('⚠️ SKIP_MAIL_VERIFY is set — skipping SMTP transporter verification');
    return;
  }

  if (!transporter) {
    console.error('❌ No transporter configured; skipping verify');
    return;
  }

  transporter.verify((error, success) => {
    if (error) {
      console.error('❌ Email transporter verification failed:', error.message);
      console.error('This may be due to SMTP credentials or network restrictions. Please check:');
      console.error(' - EMAIL_USER and EMAIL_PASS are set in the environment');
      console.error(' - If using Gmail, enable 2FA and create an App Password for EMAIL_PASS');
      console.error(' - Hosting provider may block outbound SMTP; consider SendGrid/Sendinblue as alternative');
    } else {
      console.log('✅ Email transporter is ready to send messages');
    }
  });
}, 1000); // Delay verification to ensure env vars are loaded

// Email templates
const templates = {
  issueAssigned: (data) => ({
    subject: `New Issue Assigned: ${data.title}`,
    html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #2563eb;">New Maintenance Issue Assigned</h2>
          <div style="background: #f8fafc; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3>${data.title}</h3>
            <p><strong>Description:</strong> ${data.description}</p>
            <p><strong>Location:</strong> ${data.location}</p>
            <p><strong>Priority:</strong> ${data.priority || 'Normal'}</p>
            <p><strong>Assigned by:</strong> ${data.assignedBy}</p>
            <p><strong>Assigned on:</strong> ${new Date().toLocaleString()}</p>
          </div>
          <p>You have been assigned a new maintenance issue. Please review and take action.</p>
          <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}/technician-dashboard?tab=assigned-issues" style="background: #2563eb; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">View Assigned Issues</a>
        </div>
      `
  }),
  newRequest: (data) => ({
    subject: `New Maintenance Request: ${data.title}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #2563eb;">New Maintenance Request Submitted</h2>
        <div style="background: #f8fafc; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <h3>${data.title}</h3>
          <p><strong>Description:</strong> ${data.description}</p>
          <p><strong>Location:</strong> ${data.location}</p>
          <p><strong>Category:</strong> ${data.category}</p>
          <p><strong>Priority:</strong> ${data.priority || 'Normal'}</p>
          <p><strong>Submitted by:</strong> ${data.clientName} (${data.clientEmail})</p>
          <p><strong>Submitted on:</strong> ${new Date().toLocaleString()}</p>
        </div>
        <p>Please review and assign this request to an appropriate technician.</p>
        <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}/manager-dashboard?tab=manage-issue" style="background: #2563eb; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">View Request</a>
      </div>
    `
  }),

  requestApproved: (data) => ({
    subject: `Maintenance Request Approved: ${data.title}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #059669;">Maintenance Request Approved</h2>
        <div style="background: #f0fdf4; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <h3>${data.title}</h3>
          <p><strong>Description:</strong> ${data.description}</p>
          <p><strong>Location:</strong> ${data.location}</p>
          <p><strong>Status:</strong> Approved</p>
          <p><strong>Approved by:</strong> ${data.managerName}</p>
          <p><strong>Approved on:</strong> ${new Date().toLocaleString()}</p>
        </div>
        <p>Your maintenance request has been approved and will be assigned to a technician shortly.</p>
      </div>
    `
  }),

  requestDeclined: (data) => ({
    subject: `Maintenance Request Declined: ${data.title}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #dc2626;">Maintenance Request Declined</h2>
        <div style="background: #fef2f2; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <h3>${data.title}</h3>
          <p><strong>Description:</strong> ${data.description}</p>
          <p><strong>Location:</strong> ${data.location}</p>
          <p><strong>Status:</strong> Declined</p>
          <p><strong>Declined by:</strong> ${data.managerName}</p>
          <p><strong>Reason:</strong> ${data.reason || 'No reason provided'}</p>
          <p><strong>Declined on:</strong> ${new Date().toLocaleString()}</p>
        </div>
        <p>Please contact the maintenance team if you need further assistance.</p>
      </div>
    `
  }),

  issueInProgress: (data) => ({
    subject: `Maintenance Work Started: ${data.title}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #2563eb;">Work in Progress</h2>
        <div style="background: #eff6ff; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <h3>${data.title}</h3>
          <p><strong>Description:</strong> ${data.description}</p>
          <p><strong>Location:</strong> ${data.location}</p>
          <p><strong>Status:</strong> <span style="color: #2563eb; font-weight: bold;">IN PROGRESS</span></p>
          ${data.beforeImage ? `<p><strong>Before Photo:</strong> <br/><img src="${process.env.BACKEND_URL || 'http://localhost:5000'}${data.beforeImage}" style="max-width: 100%; border-radius: 4px; margin-top: 10px;"/></p>` : ''}
          <p><strong>Estimated Fix Time:</strong> ${data.fixTime} minutes</p>
          <p><strong>Deadline:</strong> ${new Date(data.fixDeadline).toLocaleString()}</p>
        </div>
        <p>The technician has started working on this issue.</p>
        <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}/manager-dashboard?tab=manage-issue" style="background: #2563eb; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">View Status</a>
      </div>
    `
  }),
  issueCompleted: (data) => ({
    subject: `Maintenance Issue Completed: ${data.title}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #059669;">Issue Resolved</h2>
        <div style="background: #f0fdf4; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <h3>${data.title}</h3>
          <p><strong>Location:</strong> ${data.location}</p>
          <div style="display: flex; gap: 10px; margin: 20px 0;">
            ${data.beforeImage ? `
              <div style="flex: 1;">
                <p style="font-size: 12px; font-weight: bold; margin-bottom: 5px;">BEFORE</p>
                <img src="${process.env.BACKEND_URL || 'http://localhost:5000'}${data.beforeImage}" style="width: 100%; border-radius: 4px; border: 1px solid #e1e1e1;"/>
              </div>
            ` : ''}
            ${data.afterImage ? `
              <div style="flex: 1;">
                <p style="font-size: 12px; font-weight: bold; margin-bottom: 5px;">AFTER</p>
                <img src="${process.env.BACKEND_URL || 'http://localhost:5000'}${data.afterImage}" style="width: 100%; border-radius: 4px; border: 1px solid #e1e1e1;"/>
              </div>
            ` : ''}
          </div>
          <p><strong>Technician Feedback:</strong> ${data.feedback || 'No additional comments provided.'}</p>
          <p><strong>Completed by:</strong> ${data.technicianName}</p>
        </div>
        <p>This maintenance request has been successfully closed.</p>
        <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}/manager-dashboard?tab=manage-issue" style="background: #059669; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Verify Work</a>
      </div>
    `
  }),
  technicianWelcome: (data) => ({
    subject: `Welcome to MMS: Your Technician Account is Ready`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #2563eb;">Welcome to the Maintenance Management System</h2>
        <div style="background: #f8fafc; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <p>Hi ${data.name || 'there'},</p>
          <p>An account has been created for you as a technician in our system.</p>
          <p>You can now log in and manage your assigned maintenance tasks.</p>
          <p><strong>Your Email:</strong> ${data.email}</p>
          <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}/login" style="background: #2563eb; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block; margin-top: 15px;">Login to Dashboard</a>
        </div>
        <p>If you don't know your password, please contact the administrator or use the "Forgot Password" option on the login page.</p>
      </div>
    `
  })
};

// Send technician invite email
templates.technicianInvite = (data) => ({
  subject: `You're invited to join MMS as a Technician`,
  html: `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #2563eb;">Technician Invitation</h2>
      <div style="background: #f8fafc; padding: 20px; border-radius: 8px; margin: 20px 0;">
        <p>Hi ${data.name || 'there'},</p>
        <p>You have been invited to join the MMS system as a technician.</p>
        <p>Please follow the link below to complete your registration:</p>
        <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}/technician-invite?token=${data.token}" style="background: #2563eb; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Accept Invitation</a>
        <p style="margin-top:12px; color: #6b7280;">This invitation will expire on ${data.expiresAt ? new Date(data.expiresAt).toLocaleString() : 'the invite expiry date'}.</p>
      </div>
      <p>If you did not expect this invite, please ignore this email.</p>
    </div>
  `
});

// Send user invite email (manager/technician, etc.)
templates.userInvite = (data) => ({
  subject: `You're invited to join MMS`,
  html: `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #2563eb;">You're Invited</h2>
      <div style="background: #f8fafc; padding: 20px; border-radius: 8px; margin: 20px 0;">
        <p>Hi there,</p>
        <p>You have been invited to join the MMS system${data.companyName ? ` for <strong>${data.companyName}</strong>` : ''}.</p>
        ${data.roleLabel ? `<p><strong>Role:</strong> ${data.roleLabel}</p>` : ''}
        <p>Please follow the link below to complete your registration:</p>
        <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}/accept-invite?token=${data.token}" style="background: #2563eb; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Accept Invitation</a>
        <p style="margin-top:12px; color: #6b7280;">This invitation will expire on ${data.expiresAt ? new Date(data.expiresAt).toLocaleString() : 'the invite expiry date'}.</p>
      </div>
      <p>If you did not expect this invite, please ignore this email.</p>
    </div>
  `
});

templates.monthlyReport = (data) => ({
  subject: `Monthly MMS Report - ${data.companyName}`,
  html: `
    <div style="font-family: Arial, sans-serif; max-width: 680px; margin: 0 auto; color: #111827;">
      <h2 style="color: #2563eb;">Monthly Maintenance Report</h2>
      <p>Hi ${data.name || 'there'},</p>
      <p>Here is your report for <strong>${data.companyName}</strong>.</p>

      <div style="background: #f8fafc; border-radius: 8px; padding: 20px; margin: 20px 0;">
        <p><strong>Reporting period:</strong> ${new Date(data.periodStart).toLocaleDateString()} - ${new Date(data.periodEnd).toLocaleDateString()}</p>
        <p><strong>Active users:</strong> ${data.summary.totalActiveUsers}</p>
        <p><strong>New users this period:</strong> ${data.summary.usersJoined}</p>
        <p><strong>Properties added:</strong> ${data.summary.propertiesCreated}</p>
        <p><strong>Assets added:</strong> ${data.summary.assetsCreated}</p>
        <p><strong>Active subscriptions:</strong> ${data.summary.activeSubscriptions}</p>
      </div>

      <div style="background: #eff6ff; border-radius: 8px; padding: 20px; margin: 20px 0;">
        <h3 style="margin-top: 0; color: #1d4ed8;">Issue Summary</h3>
        <p><strong>Created:</strong> ${data.summary.issueSummary.totalCreated}</p>
        <p><strong>Open:</strong> ${data.summary.issueSummary.open}</p>
        <p><strong>Resolved:</strong> ${data.summary.issueSummary.resolved}</p>
        <p><strong>High priority:</strong> ${data.summary.issueSummary.highPriority}</p>
        <p><strong>Top category:</strong> ${data.summary.issueSummary.topCategory}</p>
      </div>

      <p>You can review more details in your dashboard any time.</p>
      <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}/login" style="background: #2563eb; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block;">Open MMS</a>
    </div>
  `
});

templates.operationalSummaryReport = (data) => {
  const reportLabel = `${String(data.reportType || 'daily').charAt(0).toUpperCase()}${String(data.reportType || 'daily').slice(1)} Summary`;
  return {
    subject: `${reportLabel} - ${data.companyName}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 680px; margin: 0 auto; color: #111827;">
        <h2 style="color: #2563eb;">${reportLabel}</h2>
        <p>Hi ${data.name || 'there'},</p>
        <p>Here is the latest operations summary for <strong>${data.companyName}</strong>.</p>

        <div style="background: #f8fafc; border-radius: 8px; padding: 20px; margin: 20px 0;">
          <p><strong>Reporting period:</strong> ${new Date(data.periodStart).toLocaleDateString()} - ${new Date(data.periodEnd).toLocaleDateString()}</p>
          <p><strong>Requests submitted:</strong> ${data.summary.operationalSummary.requestsSubmitted}</p>
          <p><strong>Work orders completed:</strong> ${data.summary.operationalSummary.workOrdersCompleted}</p>
          <p><strong>Work orders in progress:</strong> ${data.summary.operationalSummary.workOrdersInProgress}</p>
        </div>

        <div style="background: #eff6ff; border-radius: 8px; padding: 20px; margin: 20px 0;">
          <h3 style="margin-top: 0; color: #1d4ed8;">Company Snapshot</h3>
          <p><strong>Active users:</strong> ${data.summary.totalActiveUsers}</p>
          <p><strong>Open issues:</strong> ${data.summary.issueSummary.open}</p>
          <p><strong>Resolved issues:</strong> ${data.summary.issueSummary.resolved}</p>
          <p><strong>High priority issues:</strong> ${data.summary.issueSummary.highPriority}</p>
        </div>

        <p>You can review the same company counts on your dashboard overview any time.</p>
        <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}/login" style="background: #2563eb; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block;">Open MMS</a>
      </div>
    `
  };
};

// Email service methods will be exported below via module.exports = { ... }

module.exports = {
  // Send invitation to user (manager/technician, etc.)
  async sendUserInvite(inviteData) {
    try {
      const template = templates.userInvite(inviteData);
      await transporter.sendMail({
        from: process.env.EMAIL_USER,
        to: inviteData.email,
        subject: template.subject,
        html: template.html
      });
      console.log('User invite sent to', inviteData.email);
    } catch (err) {
      console.error('Error sending user invite email:', err);
      throw err;
    }
  },

  // Send invitation to technician
  async sendTechnicianInvite(inviteData, technician) {
    try {
      const template = templates.technicianInvite({ token: inviteData.token, name: technician.name || inviteData.name, expiresAt: inviteData.expiresAt });
      await transporter.sendMail({
        from: process.env.EMAIL_USER,
        to: inviteData.email,
        subject: template.subject,
        html: template.html
      });
      console.log('Technician invite sent to', inviteData.email);
    } catch (err) {
      console.error('Error sending technician invite email:', err);
      throw err;
    }
  },

  // Send welcome email to technician
  async sendTechnicianWelcome(data) {
    try {
      const template = templates.technicianWelcome(data);
      await transporter.sendMail({
        from: process.env.EMAIL_USER,
        to: data.email,
        subject: template.subject,
        html: template.html
      });
      console.log('Technician welcome email sent to', data.email);
    } catch (err) {
      console.error('Error sending technician welcome email:', err);
      throw err;
    }
  },

  // Send progress notification
  async sendIssueInProgressNotification(issueData, technicianData, ownerData) {
    try {
      const template = templates.issueInProgress(issueData);

      // Notify Owner
      if (ownerData && ownerData.email) {
        await transporter.sendMail({
          from: process.env.EMAIL_USER,
          to: ownerData.email,
          subject: template.subject,
          html: template.html
        });
      }

      // Notify Admins
      const managerEmails = await this.getAdminManagerEmails();
      if (managerEmails.length > 0) {
        await transporter.sendMail({
          from: process.env.EMAIL_USER,
          to: managerEmails.join(','),
          subject: template.subject,
          html: template.html
        });
      }

      console.log('Work started notification sent for', issueData.title);
    } catch (err) {
      console.error('Error sending progress notification email:', err);
    }
  },

  // Send email to technician when issue is assigned
  async sendIssueAssignedNotification(issueData, technicianData, assignerData) {
    try {
      const template = templates.issueAssigned({
        ...issueData,
        assignedBy: assignerData.name
      });
      console.log('[EMAIL DEBUG] Preparing to send ASSIGN notification to technician.');
      console.log('[EMAIL DEBUG] technicianData:', technicianData);
      console.log('[EMAIL DEBUG] Sending from:', process.env.EMAIL_USER);
      console.log('[EMAIL DEBUG] Sending to:', technicianData.email);
      console.log('[EMAIL DEBUG] Subject:', template.subject);
      console.log('[EMAIL DEBUG] HTML:', template.html);
      await transporter.sendMail({
        from: process.env.EMAIL_USER,
        to: technicianData.email,
        subject: template.subject,
        html: template.html
      });
      console.log('Issue assigned notification sent to technician');
    } catch (error) {
      console.error('Error sending issue assigned notification:', error);
    }
  },
  // Send email to admin/manager when new request is created
  async sendNewRequestNotification(requestData, clientData, companyName = null) {
    try {
      console.log('📧 Sending new request notification to admins/managers');
      console.log('Request data:', requestData);
      console.log('Client data:', clientData);

      const template = templates.newRequest({
        ...requestData,
        clientName: clientData.name,
        clientEmail: clientData.email
      });

      // Get all admin and manager emails
      const adminEmails = await this.getAdminManagerEmails(companyName);
      console.log('Admin/Manager emails found:', adminEmails);

      if (adminEmails.length === 0) {
        console.log('❌ No admin/manager emails found for notification');
        return;
      }

      const mailOptions = {
        from: process.env.EMAIL_USER,
        to: adminEmails.join(','),
        subject: template.subject,
        html: template.html
      };

      console.log('📧 Sending email with options:', {
        from: mailOptions.from,
        to: mailOptions.to,
        subject: mailOptions.subject
      });

      await transporter.sendMail(mailOptions);

      console.log('✅ New request notification sent to admins/managers');
    } catch (error) {
      console.error('❌ Error sending new request notification:', error);
    }
  },

  // Send email to client when request is approved
  async sendRequestApprovedNotification(requestData, clientData, managerData) {
    try {
      const template = templates.requestApproved({
        ...requestData,
        managerName: managerData.name
      });

      console.log('[EMAIL DEBUG] Preparing to send APPROVED notification to client.');
      console.log('[EMAIL DEBUG] clientData:', clientData);
      console.log('[EMAIL DEBUG] Sending from:', process.env.EMAIL_USER);
      console.log('[EMAIL DEBUG] Sending to:', clientData.email);
      console.log('[EMAIL DEBUG] Subject:', template.subject);
      console.log('[EMAIL DEBUG] HTML:', template.html);

      await transporter.sendMail({
        from: process.env.EMAIL_USER,
        to: clientData.email,
        subject: template.subject,
        html: template.html
      });

      console.log('Request approved notification sent to client');
    } catch (error) {
      console.error('Error sending request approved notification:', error);
    }
  },

  // Send email to client when request is declined
  async sendRequestDeclinedNotification(requestData, clientData, managerData, reason) {
    try {
      const template = templates.requestDeclined({
        ...requestData,
        managerName: managerData.name,
        reason: reason
      });

      await transporter.sendMail({
        from: process.env.EMAIL_USER,
        to: clientData.email,
        subject: template.subject,
        html: template.html
      });

      console.log('Request declined notification sent to client');
    } catch (error) {
      console.error('Error sending request declined notification:', error);
    }
  },

  // Send email to manager and client when issue is completed
  async sendIssueCompletedNotification(issueData, technicianData, clientData) {
    try {
      const template = templates.issueCompleted({
        ...issueData,
        technicianName: technicianData.name,
        feedback: issueData.feedback || null,
        beforeImage: issueData.beforeImage || null, // Added for side-by-side
        afterImage: issueData.afterImage || null // Added for side-by-side
      });

      // Get manager emails
      const managerEmails = await this.getAdminManagerEmails();

      const recipients = [...managerEmails];
      if (clientData && clientData.email) {
        recipients.push(clientData.email);
      }

      await transporter.sendMail({
        from: process.env.EMAIL_USER,
        to: recipients.join(','),
        subject: template.subject,
        html: template.html
      });

      console.log('Issue completed notification sent to managers and client');
    } catch (error) {
      console.error('Error sending issue completed notification:', error);
    }
  },

  // Helper function to get admin and manager emails
 async getAdminManagerEmails(companyName = null) {
   try {
     const User = require('../user/user.model.js');
     const filter = {
       role: { $in: ['admin', 'manager'] },
       status: 'active'
     };
     if (companyName) {
       filter.companyName = String(companyName).trim();
     }
     const admins = await User.find(filter, { email: 1 });

     return admins.map(admin => admin.email);
    } catch (error) {
      console.error('Error fetching admin/manager emails:', error);
      return [];
    }
  },

  // Test email functionality
  async testEmail(email) {
    try {
      await transporter.sendMail({
        from: process.env.EMAIL_USER,
        to: email,
        subject: 'Email Service Test',
        html: '<h1>Email service is working!</h1><p>This is a test email from your MMS system.</p>'
      });
      return { success: true, message: 'Test email sent successfully' };
    } catch (error) {
      console.error('Error sending test email:', error);
      return { success: false, message: error.message };
    }
  },

  // Test admin/manager email functionality
  async testAdminEmails() {
    try {
      const adminEmails = await this.getAdminManagerEmails();
      if (adminEmails.length === 0) {
        return { success: false, message: 'No admin/manager emails found in database' };
      }

      await transporter.sendMail({
        from: process.env.EMAIL_USER,
        to: adminEmails.join(','),
        subject: 'MMS System - Admin Email Test',
        html: `<h1>Admin Email Test</h1><p>This is a test to verify admin/manager email notifications are working.</p><p>Found ${adminEmails.length} admin/manager email(s): ${adminEmails.join(', ')}</p>`
      });
      return { success: true, message: `Test email sent to ${adminEmails.length} admin/manager(s)` };
    } catch (error) {
      console.error('Error sending admin test email:', error);
      return { success: false, message: error.message };
    }
  }
  ,

  // Send 'new request' notification to arbitrary recipient emails (e.g., property staff)
  async sendNewRequestToRecipients(requestData, clientData, recipientEmails = []) {
    try {
      if (!Array.isArray(recipientEmails) || recipientEmails.length === 0) {
        console.log('No recipient emails provided for property staff notification');
        return;
      }
      const template = templates.newRequest({
        ...requestData,
        clientName: clientData.name || 'Anonymous',
        clientEmail: clientData.email || ''
      });
      await transporter.sendMail({
        from: process.env.EMAIL_USER,
        to: recipientEmails.join(','),
        subject: template.subject,
        html: template.html
      });
      console.log('✅ New request notification sent to recipients:', recipientEmails);
    } catch (error) {
      console.error('Error sending new request to recipients:', error);
    }
  },

  // Send reminder emails for routine maintenance
  async sendMaintenanceReminder(schedule, recipients) {
    try {
      const subject = `Maintenance Reminder: ${schedule.name}`;
      const html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #2563eb;">Maintenance Reminder</h2>
          <div style="background: #f8fafc; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3>${schedule.name}</h3>
            <p>${schedule.description || ''}</p>
            <p><strong>Next scheduled:</strong> ${schedule.nextDate ? new Date(schedule.nextDate).toLocaleString() : 'TBD'}</p>
            <p><strong>Frequency:</strong> ${schedule.frequency || 'N/A'} ${schedule.interval ? `every ${schedule.interval}` : ''}</p>
          </div>
          <p>Please ensure the routine maintenance task is performed on time.</p>
        </div>
      `;

      if (!recipients || recipients.length === 0) {
        console.log('No recipients provided for maintenance reminder, skipping.');
        return;
      }

      await transporter.sendMail({
        from: process.env.EMAIL_USER,
        to: recipients.join(', '),
        subject,
        html
      });
      console.log('Maintenance reminder sent to:', recipients);
    } catch (error) {
      console.error('Error sending maintenance reminder:', error);
    }
  },

  async sendMonthlyReport(data) {
    try {
      const template = templates.monthlyReport(data);
      await transporter.sendMail({
        from: process.env.EMAIL_USER,
        to: data.email,
        subject: template.subject,
        html: template.html
      });
      console.log('Monthly report sent to', data.email);
    } catch (error) {
      console.error('Error sending monthly report email:', error);
      throw error;
    }
  },

  async sendOperationalSummary(data) {
    try {
      const template = templates.operationalSummaryReport(data);
      await transporter.sendMail({
        from: process.env.EMAIL_USER,
        to: data.email,
        subject: template.subject,
        html: template.html
      });
      console.log(`${data.reportType || 'summary'} operational report sent to`, data.email);
    } catch (error) {
      console.error(`Error sending ${data.reportType || 'summary'} operational report email:`, error);
      throw error;
    }
  },

  async getAllSystemUsers() {
    try {
      const User = require('../user/user.model.js');
      const { PrismaClient } = require('@prisma/client');
      const prisma = new PrismaClient();

      const [users, technicians] = await Promise.all([
        User.find({ status: 'active' }, { email: 1, name: 1, role: 1 }).lean(),
        prisma.technician.findMany({
          where: { email: { not: null } },
          select: { email: true, name: true }
        }).catch(() => []),
      ]);

      const seen = new Set();
      return [...users, ...technicians]
        .filter((entry) => entry?.email)
        .filter((entry) => {
          const key = String(entry.email).trim().toLowerCase();
          if (!key || seen.has(key)) return false;
          seen.add(key);
          return true;
        })
        .map((entry) => ({
          email: String(entry.email).trim().toLowerCase(),
          name: entry.name || 'there',
          role: entry.role || 'technician',
        }));
    } catch (error) {
      console.error('Error fetching all system users:', error);
      return [];
    }
  },

  async sendMaintenanceModeNotice({ email, name, appName, supportEmail }) {
    try {
      if (!email) return;
      const subject = `${appName || 'MMS'} is currently in maintenance mode`;
      const html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #b45309;">System Maintenance Notice</h2>
          <div style="background: #fff7ed; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <p>Hi ${name || 'there'},</p>
            <p><strong>${appName || 'The system'}</strong> is currently in maintenance mode.</p>
            <p>During this period, login and normal activity may be temporarily unavailable while the platform is being secured or updated.</p>
            ${supportEmail ? `<p><strong>Support contact:</strong> ${supportEmail}</p>` : ''}
          </div>
          <p>Please try again later. If you were not expecting this notice, contact support immediately.</p>
        </div>
      `;

      await transporter.sendMail({
        from: process.env.EMAIL_USER,
        to: email,
        subject,
        html,
      });
    } catch (error) {
      console.error('Error sending maintenance mode notice:', error);
    }
  },

  async broadcastMaintenanceModeNotice({ appName, supportEmail }) {
    try {
      const recipients = await this.getAllSystemUsers();
      await Promise.all(
        recipients.map((recipient) => this.sendMaintenanceModeNotice({
          email: recipient.email,
          name: recipient.name,
          appName,
          supportEmail,
        }))
      );
      console.log(`Maintenance mode notice sent to ${recipients.length} user(s)`);
    } catch (error) {
      console.error('Error broadcasting maintenance mode notice:', error);
    }
  },

  async sendSecurityAlert({ recipients = [], attemptedEmail, ipAddress, userAgent, threshold, dashboardUrl }) {
    try {
      const emails = recipients.map((recipient) => recipient?.email).filter(Boolean);
      if (!emails.length) return;

      const subject = `Security Alert: ${threshold} failed login attempts detected`;
      const html = `
        <div style="font-family: Arial, sans-serif; max-width: 640px; margin: 0 auto;">
          <h2 style="color: #dc2626;">Suspicious Login Activity Detected</h2>
          <div style="background: #fef2f2; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <p><strong>Attempted account:</strong> ${attemptedEmail || 'Unknown'}</p>
            <p><strong>Consecutive failed attempts:</strong> ${threshold}</p>
            <p><strong>Source IP:</strong> ${ipAddress || 'Unknown'}</p>
            <p><strong>User agent:</strong> ${userAgent || 'Unknown'}</p>
          </div>
          <p>Recommended next steps:</p>
          <ul>
            <li>Review the audit trail immediately.</li>
            <li>Confirm whether the user recognizes the attempts.</li>
            <li>Enable maintenance mode if the pattern continues or looks hostile.</li>
          </ul>
          ${dashboardUrl ? `<a href="${dashboardUrl}" style="background: #dc2626; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block;">Open Security Settings</a>` : ''}
        </div>
      `;

      await transporter.sendMail({
        from: process.env.EMAIL_USER,
        to: emails.join(','),
        subject,
        html,
      });
    } catch (error) {
      console.error('Error sending security alert email:', error);
    }
  },

  async sendAccountLockedNotice({ email, name, appName, supportEmail }) {
    try {
      if (!email) return;
      const subject = `${appName || 'MMS'} account security notice`;
      const html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #dc2626;">Account Temporarily Locked</h2>
          <div style="background: #fef2f2; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <p>Hi ${name || 'there'},</p>
            <p>Your account has been temporarily locked because the system detected suspicious login activity.</p>
            <p>Please contact support before trying again.</p>
            ${supportEmail ? `<p><strong>Support contact:</strong> ${supportEmail}</p>` : ''}
          </div>
        </div>
      `;

      await transporter.sendMail({
        from: process.env.EMAIL_USER,
        to: email,
        subject,
        html,
      });
    } catch (error) {
      console.error('Error sending account locked notice:', error);
    }
  }
}
