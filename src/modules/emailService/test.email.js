// Test script for email service
const emailService = require('./email.service');

async function testEmailService() {
  console.log('Testing email service...');

  try {
    // Test basic email sending
    const result = await emailService.testEmail('byishimo034@gmail.com');
    console.log('Test email result:', result);

    // Test getting admin emails
    const adminEmails = await emailService.getAdminManagerEmails();
    console.log('Admin/Manager emails found:', adminEmails);

  } catch (error) {
    console.error('Email service test failed:', error);
  }
}

// Run test if called directly
if (require.main === module) {
  testEmailService();
}

module.exports = { testEmailService };