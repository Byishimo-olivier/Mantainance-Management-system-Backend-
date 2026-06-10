require('dotenv').config();
const nodemailer = require('nodemailer');
const host = process.env.SMTP_HOST || 'smtp.gmail.com';
const port = process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT, 10) : 465;
const secure = process.env.SMTP_SECURE ? process.env.SMTP_SECURE === 'true' : port === 465;
const authUser = process.env.SMTP_AUTH_USER || process.env.EMAIL_USER;
const authPass = process.env.EMAIL_PASS || process.env.EMAIL_PASSWORD;
console.log('SMTP_HOST=', host);
console.log('SMTP_PORT=', port);
console.log('SMTP_SECURE=', secure);
console.log('AUTH_USER=', authUser ? '[set]' : '[missing]');
console.log('AUTH_PASS=', authPass ? '[set]' : '[missing]');
const transporter = nodemailer.createTransport({
  host,
  port,
  secure,
  auth: { user: authUser, pass: authPass },
  tls: { rejectUnauthorized: false, minVersion: 'TLSv1.2' }
});
transporter.verify((err, success) => {
  if (err) {
    console.error('verify error:', err && err.message ? err.message : err);
    process.exit(1);
  } else {
    console.log('verify success:', success);
    process.exit(0);
  }
});
