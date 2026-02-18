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
  const port = process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT) : 587;
  const secure = process.env.SMTP_SECURE === 'true' || port === 465;

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
    connectionTimeout: 10000,
    greetingTimeout: 10000
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
  transporter.verify((error, success) => {
    if (error) {
      console.error('❌ Email transporter verification failed:', error.message);
      console.error('This may be due to Gmail security settings. Please check:');
      console.error('1. App Password is correct and not expired');
      console.error('2. 2FA is enabled on Gmail account');
      console.error('3. Gmail account allows less secure apps OR App Password is used');
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

  issueCompleted: (data) => ({
    subject: `Maintenance Issue Completed: ${data.title}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #059669;">Maintenance Issue Completed</h2>
        <div style="background: #f0fdf4; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <h3>${data.title}</h3>
          <p><strong>Description:</strong> ${data.description}</p>
          <p><strong>Location:</strong> ${data.location}</p>
          <p><strong>Technician:</strong> ${data.technicianName}</p>
          <p><strong>Completed on:</strong> ${new Date().toLocaleString()}</p>
          ${data.feedback ? `<p><strong>Technician Feedback:</strong> ${data.feedback}</p>` : ''}
          ${data.afterImage ? `<p><strong>After Photo:</strong> <a href="${process.env.BACKEND_URL || 'http://localhost:5000'}${data.afterImage}">View Photo</a></p>` : ''}
        </div>
        <p>The maintenance issue has been successfully resolved.</p>
        <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}/manager-dashboard?tab=manage-issue" style="background: #059669; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">View Details</a>
      </div>
    `
  })
};

module.exports = {
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
  async sendNewRequestNotification(requestData, clientData) {
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
      const adminEmails = await this.getAdminManagerEmails();
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
        afterImage: issueData.afterImage || null
      });

      // Get manager emails
      const managerEmails = await this.getAdminManagerEmails();

      const recipients = [...managerEmails, clientData.email];

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
  async getAdminManagerEmails() {
    try {
      const User = require('../user/user.model.js');
      const admins = await User.find({
        role: { $in: ['admin'] },
        status: 'active'
      }, { email: 1 });

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
  }
}