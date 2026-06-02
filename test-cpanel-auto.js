const nodemailer = require('nodemailer');
require('dotenv').config();

const authUsers = [process.env.EMAIL_USER, process.env.EMAIL_USER.split('@')[0]];
const ports = [
  { port: 465, secure: true },
  { port: 587, secure: false }
];

async function tryConfig(user, portCfg) {
  console.log('\n========================================');
  console.log(`Trying user: "${user}", host: ${process.env.SMTP_HOST}, port: ${portCfg.port}, secure: ${portCfg.secure}`);

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: portCfg.port,
    secure: portCfg.secure,
    auth: { user, pass: process.env.EMAIL_PASS },
    logger: true,
    debug: true,
    tls: { rejectUnauthorized: false }
  });

  try {
    await transporter.verify();
    console.log('✅ Connection/Authentication succeeded for this config');

    const info = await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: process.env.EMAIL_USER,
      subject: `cPanel Test (${user}@${portCfg.port})`,
      text: `Test email using ${user} on port ${portCfg.port}`
    });

    console.log('📬 Sent, messageId:', info.messageId);
    return true;
  } catch (err) {
    console.error('❌ Failed:', err && err.message ? err.message : err);
    return false;
  }
}

(async () => {
  for (const u of authUsers) {
    for (const p of ports) {
      const ok = await tryConfig(u, p);
      if (ok) process.exit(0);
    }
  }
  console.error('\nAll attempts failed.');
  process.exit(1);
})();
