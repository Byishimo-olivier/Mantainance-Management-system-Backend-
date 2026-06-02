require('dotenv').config();

console.log('🔍 cPanel Email Configuration Debug\n');
console.log('SMTP_HOST:', process.env.SMTP_HOST);
console.log('SMTP_PORT:', process.env.SMTP_PORT);
console.log('SMTP_SECURE:', process.env.SMTP_SECURE);
console.log('EMAIL_USER:', process.env.EMAIL_USER);
console.log('EMAIL_PASS (first 5 chars):', process.env.EMAIL_PASS.substring(0, 5) + '...');
console.log('EMAIL_PASS (length):', process.env.EMAIL_PASS.length);
console.log('\n⚠️  Please verify these settings match your cPanel configuration:');
console.log('- SMTP Host should be: whm-market05.aos.rw');
console.log('- SMTP Port should be: 465 or 587');
console.log('- Email should be: info@fixnest.rw');
console.log('- Password should contain exactly: Fixnest@@^!');
