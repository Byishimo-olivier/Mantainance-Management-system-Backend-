const nodemailer = require('nodemailer');
require('dotenv').config();

async function testCpanelEmail() {
  console.log('🧪 Testing cPanel Email Configuration (Port 587)...\n');
  
  // Create transporter with cPanel settings - trying port 587
  const transporter = nodemailer.createTransport({
    host: 'whm-market05.aos.rw',
    port: 587,
    secure: false, // TLS (not SSL)
    auth: {
      user: 'info@fixnest.rw',
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
        <li><strong>SMTP Port:</strong> 587</li>
        <li><strong>Security:</strong> TLS</li>
      </ul>
      <p><em>Test sent at: ${new Date().toLocaleString()}</em></p>
    `
  };

  try {
    console.log(`📧 Attempting connection to whm-market05.aos.rw:587...`);
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
