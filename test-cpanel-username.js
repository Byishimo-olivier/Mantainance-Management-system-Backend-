const nodemailer = require('nodemailer');
require('dotenv').config();

async function testCpanelEmail() {
  console.log('🧪 Testing cPanel Email Configuration (Username only)...\n');
  
  // Create transporter with cPanel settings - using just username
  const transporter = nodemailer.createTransport({
    host: 'whm-market05.aos.rw',
    port: 465,
    secure: true,
    auth: {
      user: 'info', // Try just the username
      pass: '2Xw77K*HzqF;j3'
    }
  });

  // Email configuration
  const mailOptions = {
    from: 'info@fixnest.rw',
    to: 'info@fixnest.rw',
    subject: '✅ cPanel Email Configuration Test',
    html: `
      <h2>Email Configuration Test</h2>
      <p>If you received this email, your cPanel email configuration is working correctly!</p>
      <hr>
      <p><strong>Configuration Details:</strong></p>
      <ul>
        <li><strong>Email:</strong> info@fixnest.rw</li>
        <li><strong>SMTP Host:</strong> whm-market05.aos.rw</li>
        <li><strong>SMTP Port:</strong> 465 (SSL)</li>
        <li><strong>Auth Username:</strong> info</li>
      </ul>
      <p><em>Test sent at: ${new Date().toLocaleString()}</em></p>
    `
  };

  try {
    console.log(`📧 Attempting connection with username "info"...`);
    const info = await transporter.sendMail(mailOptions);
    console.log('✅ Test email sent successfully!\n');
    console.log('📬 Message ID:', info.messageId);
    console.log('📊 Response:', info.response);
    return true;
  } catch (error) {
    console.error('❌ Error:', error.message);
    return false;
  }
}

testCpanelEmail().then(success => {
  process.exit(success ? 0 : 1);
});
