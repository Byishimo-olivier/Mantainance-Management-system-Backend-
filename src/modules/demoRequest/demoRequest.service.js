const nodemailer = require('nodemailer');
const DemoRequest = require('./demoRequest.model');
const User = require('../user/user.model');

const escapeHtml = (value = '') => String(value)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#039;');

const cleanHeader = (value = '') => String(value).replace(/[\r\n]+/g, ' ').trim();

const parseEmailList = (value = '') => String(value)
  .split(',')
  .map((email) => email.trim().toLowerCase())
  .filter(Boolean);

const getSenderAddress = () => {
  const emailUser = String(process.env.EMAIL_USER || '').trim();
  const senderName = cleanHeader(process.env.EMAIL_FROM_NAME || 'Fixnest');
  return senderName && emailUser ? `"${senderName}" <${emailUser}>` : emailUser;
};

const getReplyToAddress = () => {
  const recipients = parseEmailList(process.env.TEAM_EMAIL || process.env.DEMO_REQUEST_RECIPIENTS);
  return recipients[0] || process.env.EMAIL_USER;
};

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'whm-market05.aos.rw',
  port: process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT, 10) : 465,
  secure: process.env.SMTP_SECURE ? process.env.SMTP_SECURE === 'true' : true,
  auth: {
    user: process.env.SMTP_AUTH_USER || process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS || process.env.EMAIL_PASSWORD
  },
  tls: {
    rejectUnauthorized: false,
    minVersion: 'TLSv1.2'
  },
  connectionTimeout: 15000,
  greetingTimeout: 15000,
  socketTimeout: 15000
});

const getDemoAdminRecipients = async () => {
  const configuredRecipients = [
    ...parseEmailList(process.env.DEMO_REQUEST_RECIPIENTS),
    ...parseEmailList(process.env.TEAM_EMAIL),
  ];

  const superadmins = await User.find({
    role: { $in: ['superadmin', 'super-admin'] },
    status: 'active',
    isActive: { $ne: false }
  })
    .select('email')
    .lean();

  const superadminEmails = superadmins
    .map((user) => String(user.email || '').trim().toLowerCase())
    .filter(Boolean);

  const fallbackEmail = String(process.env.EMAIL_USER || '').trim().toLowerCase();
  return [...new Set([...configuredRecipients, ...superadminEmails, fallbackEmail].filter(Boolean))];
};

const sendWithResult = async (label, mailOptions) => {
  try {
    if (!process.env.EMAIL_USER || !(process.env.EMAIL_PASS || process.env.EMAIL_PASSWORD)) {
      throw new Error('EMAIL_USER and EMAIL_PASS/EMAIL_PASSWORD must be configured');
    }

    const info = await transporter.sendMail(mailOptions);
    const accepted = info.accepted || [];
    const rejected = info.rejected || [];
    const success = accepted.length > 0 && rejected.length === 0;
    console.log(`[Demo Request Email] ${label} sent`, {
      to: mailOptions.to,
      messageId: info.messageId,
      accepted,
      rejected,
      response: info.response
    });
    return {
      success,
      to: mailOptions.to,
      messageId: info.messageId,
      accepted,
      rejected,
      response: info.response
    };
  } catch (error) {
    console.error(`[Demo Request Email] ${label} failed:`, error.message);
    return { success: false, to: mailOptions.to, error: error.message };
  }
};

exports.createDemoRequest = async (data, ipAddress, userAgent) => {
  try {
    const {
      firstName,
      lastName,
      email,
      companyName,
      phone,
      jobTitle,
      industry,
      companySize,
      maintenanceChallenge
    } = data;

    const demoRequest = new DemoRequest({
      firstName,
      lastName,
      email,
      companyName,
      phone,
      jobTitle: jobTitle || undefined,
      industry: industry || undefined,
      companySize: companySize || undefined,
      maintenanceChallenge: maintenanceChallenge || undefined,
      status: 'pending',
      ipAddress,
      userAgent
    });

    await demoRequest.save();

    const emailDelivery = {
      requester: await this.sendConfirmationEmailToRequestor(demoRequest),
      superadmin: await this.sendNotificationEmailToTeam(demoRequest)
    };
    demoRequest.emailDelivery = emailDelivery;
    await demoRequest.save();

    return { demoRequest, emailDelivery };
  } catch (error) {
    console.error('Error creating demo request:', error);
    throw error;
  }
};

exports.sendConfirmationEmailToRequestor = async (demoRequest) => {
  try {
    const firstName = escapeHtml(demoRequest.firstName);
    const rescheduleUrl = `${process.env.FRONTEND_URL || 'https://fixnest.com'}/request-demo?email=${encodeURIComponent(demoRequest.email)}`;

    const mailOptions = {
      from: getSenderAddress(),
      sender: process.env.EMAIL_USER,
      to: demoRequest.email,
      replyTo: getReplyToAddress(),
      subject: 'Thanks for requesting a live demo of Fixnest',
      text: `Hi ${demoRequest.firstName},

Thanks for your interest in a demo of our platforms. I'm excited to meet with you!

So that you know what to expect, in this call we'll have a short discussion about your needs and problems you are looking to solve. I'll also provide a background on Fixnest and our various solutions.

From there, the next step is to connect you with one of our team members for a more in-depth look at your systems and workflows. We'll then schedule a personalized demo tailored specifically to your needs.

I look forward to talking with you soon!

Location not specified

If you need to reschedule please use the link below:
${rescheduleUrl}

What happens next:
- We'll contact you to learn about your needs and industry before scheduling a demo.
- We'll schedule a 30-60 minute live demo tailored to your organization's size and workflow.
- The demo will highlight key features based on your specific needs.
- We'll focus on tools and use cases relevant to your industry.
- Afterward, we'll share a follow-up that includes a summary, pricing, and suggested next steps.`,
      html: `
        <div style="font-family: Arial, sans-serif; color: #2b2f36; line-height: 1.6; max-width: 760px; margin: 0 auto; padding: 24px;">
          <p>Hi ${firstName},</p>

          <p>Thanks for your interest in a demo of our platforms. I'm excited to meet with you!</p>

          <p>
            So that you know what to expect, in this call we'll have a short discussion about your needs and
            problems you are looking to solve. I'll also provide a background on Fixnest and our various solutions.
          </p>

          <p>
            From there, the next step is to connect you with one of our team members for a more in-depth look at your
            systems and workflows. We'll then schedule a personalized demo tailored specifically to your needs.
          </p>

          <p>I look forward to talking with you soon!</p>

          <p>Location not specified</p>

          <p>
            If you need to reschedule please use the link below:<br>
            <a href="${rescheduleUrl}" style="color: #1d4ed8;">${rescheduleUrl}</a>
          </p>

          <p style="margin: 42px 0 28px;">__________________________________________________________________</p>

          <h2 style="font-size: 24px; margin: 0 0 14px; color: #2b2f36;">What happens next</h2>
          <div style="background: #f5f7fb; border: 1px solid #dfe7f3; border-radius: 8px; padding: 18px 22px;">
            <p style="margin-top: 0;"><strong>Here's what you can expect from the demo process:</strong></p>
            <ul style="margin-bottom: 0; padding-left: 20px;">
              <li>We'll contact you to learn about your needs and industry before scheduling a demo.</li>
              <li>We'll schedule a 30-60 minute live demo tailored to your organization's size and workflow.</li>
              <li>The demo will highlight key features based on your specific needs.</li>
              <li>We'll focus on tools and use cases relevant to your industry.</li>
              <li>Afterward, we'll share a follow-up that includes a summary, pricing, and suggested next steps.</li>
            </ul>
          </div>
        </div>
      `
    };

    return sendWithResult('requester confirmation', mailOptions);
  } catch (error) {
    console.error('Error building confirmation email:', error);
    return { success: false, to: demoRequest.email, error: error.message };
  }
};

exports.sendNotificationEmailToTeam = async (demoRequest) => {
  try {
    const recipients = await getDemoAdminRecipients();
    const fullName = `${escapeHtml(demoRequest.firstName)} ${escapeHtml(demoRequest.lastName)}`;
    const subjectName = cleanHeader(`${demoRequest.firstName} ${demoRequest.lastName}`) || 'a visitor';

    if (!recipients.length) {
      const message = 'No superadmin or demo recipient email found';
      console.warn(`[Demo Request Email] ${message}`);
      return { success: false, to: '', error: message };
    }

    const mailOptions = {
      from: getSenderAddress(),
      sender: process.env.EMAIL_USER,
      to: recipients.join(','),
      replyTo: demoRequest.email,
      subject: `New Demo Request from ${subjectName}`,
      text: `New Demo Request

Name: ${demoRequest.firstName} ${demoRequest.lastName}
Email: ${demoRequest.email}
Phone: ${demoRequest.phone}
Company: ${demoRequest.companyName}
Job Title: ${demoRequest.jobTitle || 'Not provided'}
Industry: ${demoRequest.industry || 'Not provided'}
Company Size: ${demoRequest.companySize || 'Not provided'}
Challenge: ${demoRequest.maintenanceChallenge || 'Not provided'}
Requested at: ${new Date(demoRequest.createdAt).toLocaleString()}
Request ID: ${demoRequest._id}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 700px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #07152d 0%, #12336b 100%); padding: 30px; text-align: center; border-radius: 8px 8px 0 0;">
            <h1 style="color: white; margin: 0; font-size: 24px;">New Demo Request</h1>
          </div>

          <div style="background-color: #f8f9fa; padding: 30px; border-radius: 0 0 8px 8px;">
            <h2 style="color: #333; margin-top: 0;">Request Details:</h2>

            <table style="width: 100%; border-collapse: collapse;">
              <tr style="border-bottom: 1px solid #e0e0e0;">
                <td style="padding: 10px; font-weight: bold; color: #333; width: 30%;">Name:</td>
                <td style="padding: 10px; color: #666;">${fullName}</td>
              </tr>
              <tr style="border-bottom: 1px solid #e0e0e0;">
                <td style="padding: 10px; font-weight: bold; color: #333;">Email:</td>
                <td style="padding: 10px; color: #666;">${escapeHtml(demoRequest.email)}</td>
              </tr>
              <tr style="border-bottom: 1px solid #e0e0e0;">
                <td style="padding: 10px; font-weight: bold; color: #333;">Phone:</td>
                <td style="padding: 10px; color: #666;">${escapeHtml(demoRequest.phone)}</td>
              </tr>
              <tr style="border-bottom: 1px solid #e0e0e0;">
                <td style="padding: 10px; font-weight: bold; color: #333;">Company:</td>
                <td style="padding: 10px; color: #666;">${escapeHtml(demoRequest.companyName)}</td>
              </tr>
              <tr style="border-bottom: 1px solid #e0e0e0;">
                <td style="padding: 10px; font-weight: bold; color: #333;">Job Title:</td>
                <td style="padding: 10px; color: #666;">${escapeHtml(demoRequest.jobTitle || 'Not provided')}</td>
              </tr>
              <tr style="border-bottom: 1px solid #e0e0e0;">
                <td style="padding: 10px; font-weight: bold; color: #333;">Industry:</td>
                <td style="padding: 10px; color: #666;">${escapeHtml(demoRequest.industry || 'Not provided')}</td>
              </tr>
              <tr style="border-bottom: 1px solid #e0e0e0;">
                <td style="padding: 10px; font-weight: bold; color: #333;">Company Size:</td>
                <td style="padding: 10px; color: #666;">${escapeHtml(demoRequest.companySize || 'Not provided')}</td>
              </tr>
              <tr>
                <td style="padding: 10px; font-weight: bold; color: #333; vertical-align: top;">Challenge:</td>
                <td style="padding: 10px; color: #666;">${escapeHtml(demoRequest.maintenanceChallenge || 'Not provided')}</td>
              </tr>
            </table>

            <div style="margin-top: 30px; padding: 15px; background-color: white; border-radius: 6px;">
              <p style="color: #666; font-size: 14px; margin: 0;">
                <strong>Requested at:</strong> ${new Date(demoRequest.createdAt).toLocaleString()}<br>
                <strong>Request ID:</strong> ${demoRequest._id}
              </p>
            </div>
          </div>
        </div>
      `
    };

    return sendWithResult('superadmin notification', mailOptions);
  } catch (error) {
    console.error('Error sending notification email to superadmins:', error);
    return { success: false, to: '', error: error.message };
  }
};

exports.getDemoRequests = async (filters = {}) => {
  try {
    const query = {};
    if (filters.status) query.status = filters.status;
    if (filters.email) query.email = new RegExp(filters.email, 'i');

    const requests = await DemoRequest.find(query)
      .sort({ createdAt: -1 })
      .lean();

    return requests;
  } catch (error) {
    console.error('Error fetching demo requests:', error);
    throw error;
  }
};

exports.updateDemoRequestStatus = async (demoRequestId, newStatus, notes = '') => {
  try {
    const demoRequest = await DemoRequest.findByIdAndUpdate(
      demoRequestId,
      {
        status: newStatus,
        notes: notes || undefined
      },
      { new: true }
    );

    return demoRequest;
  } catch (error) {
    console.error('Error updating demo request:', error);
    throw error;
  }
};
