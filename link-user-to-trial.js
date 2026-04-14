#!/usr/bin/env node
/**
 * Link User to Trial Company
 * Run this to link your Mongoose user to a Prisma company
 */

const mongoose = require('mongoose');
require('dotenv').config();
const User = require('./src/modules/user/user.model');

async function linkUserToCompany() {
  console.log('\n🔗 LINKING USER TO TRIAL COMPANY\n');

  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.DATABASE_URL || process.env.MONGO_URI);
    console.log('✓ Connected to MongoDB\n');

    // Get the first admin/manager user (you can customize this)
    const user = await User.findOne({ role: { $in: ['admin', 'manager'] } }).lean();

    if (!user) {
      console.log('No admin/manager user found. Creating a manual instruction...\n');
      console.log('To link your user manually:');
      console.log('1. Find your user ID in MongoDB:\n');
      console.log('   db.users.findOne({email: "your-email@example.com"})\n');
      console.log('2. Update with the test company ID:\n');
      console.log('   db.users.updateOne(');
      console.log('     {_id: ObjectId("YOUR_USER_ID")},');
      console.log('     {$set: {companyId: "69dca9142bd8b765eeb2c581"}}');
      console.log('   )\n');
      await mongoose.disconnect();
      process.exit(0);
    }

    console.log(`Found user: ${user.name} (${user.email})`);
    console.log(`Current company: ${user.companyId || 'None'}\n`);

    // Update this user to use the trial company
    const result = await User.updateOne(
      { _id: user._id },
      { $set: { companyId: '69dca9142bd8b765eeb2c581' } }
    );

    console.log(`✓ User linked to trial company`);
    console.log(`  Company ID: 69dca9142bd8b765eeb2c581`);
    console.log(`  Trial Days: 5`);
    console.log(`  Trial Ends: 2026-04-18\n`);

    console.log('✅ READY TO TEST\n');
    console.log('Next steps:');
    console.log('1. Make sure your backend server is running');
    console.log('2. Log out and log back in');
    console.log('3. Go to dashboard');
    console.log('4. You should see the blue trial countdown in top-right corner!\n');

  } catch (error) {
    console.error('❌ Failed:', error.message);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
}

linkUserToCompany();
