const nodemailer = require('nodemailer');
require('dotenv').config();

async function testCpanelEmail() {
  const recipient = process.argv[2] || process.env.TEST_EMAIL_TO || process.env.EMAIL_USER;
  console.log('🧪 Testing cPanel Email Configuration...\n');
  
  // Create transporter with cPanel settings
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT),
    secure: process.env.SMTP_SECURE === 'true', // true for 465, false for 587
    auth: {
      user: process.env.SMTP_AUTH_USER || process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS
    },
    tls: {
      rejectUnauthorized: false
    }
  });

  // Email configuration
  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: recipient,
    subject: '✅ cPanel Email Configuration Test',
    html: `
      <h2>Email Configuration Test</h2>
      <p>If you received this email, your cPanel email configuration is working correctly!</p>
      <hr>
      <p><strong>Configuration Details:</strong></p>
      <ul>
        <li><strong>Email:</strong> ${process.env.EMAIL_USER}</li>
        <li><strong>SMTP Host:</strong> ${process.env.SMTP_HOST}</li>
        <li><strong>SMTP Port:</strong> ${process.env.SMTP_PORT}</li>
        <li><strong>SSL/TLS:</strong> ${process.env.SMTP_SECURE}</li>
      </ul>
      <p><em>Test sent at: ${new Date().toLocaleString()}</em></p>
    `
  };

  try {
    console.log(`📧 Sending test email from ${process.env.EMAIL_USER}...`);
    const info = await transporter.sendMail(mailOptions);
    console.log('✅ Test email sent successfully!\n');
    console.log('📬 Message ID:', info.messageId);
    console.log('📊 Response:', info.response);
    return true;
  } catch (error) {
    console.error('❌ Error sending test email:\n', error.message);
    return false;
  }
}

testCpanelEmail().then(success => {
  process.exit(success ? 0 : 1);
});
