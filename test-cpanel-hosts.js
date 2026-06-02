const nodemailer = require('nodemailer');
require('dotenv').config();

const hosts = [
  process.env.SMTP_HOST,
  '197.243.23.15', // server IP from hosting
  'mail.fixnest.rw',
  'smtp.fixnest.rw',
  'fixnest.rw',
];
const authUsers = [process.env.EMAIL_USER, process.env.EMAIL_USER.split('@')[0]];
const ports = [
  { port: 465, secure: true },
  { port: 587, secure: false }
];

async function tryConfig(host, user, portCfg) {
  console.log('\n========================================');
  console.log(`Trying host: ${host}, user: "${user}", port: ${portCfg.port}, secure: ${portCfg.secure}`);

  const transporter = nodemailer.createTransport({
    host,
    port: portCfg.port,
    secure: portCfg.secure,
    auth: { user, pass: process.env.EMAIL_PASS },
    tls: { rejectUnauthorized: false },
    connectionTimeout: 10000
  });

  try {
    await transporter.verify();
    console.log('✅ Connection/Authentication succeeded for this config');

    const info = await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: process.env.EMAIL_USER,
      subject: `cPanel Test (${host}:${portCfg.port})`,
      text: `Test email using ${user} on ${host}:${portCfg.port}`
    });

    console.log('📬 Sent, messageId:', info.messageId);
    return true;
  } catch (err) {
    console.error('❌ Failed:', err && err.message ? err.message : err);
    return false;
  }
}

(async () => {
  for (const host of hosts) {
    for (const u of authUsers) {
      for (const p of ports) {
        try {
          const ok = await tryConfig(host, u, p);
          if (ok) {
            console.log('\n*** SUCCESS: stopping further tests.');
            process.exit(0);
          }
        } catch (e) {
          console.error('Unexpected error:', e && e.message ? e.message : e);
        }
      }
    }
  }
  console.error('\nAll attempts failed.');
  process.exit(1);
})();
