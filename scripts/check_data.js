const mongoose = require('mongoose');
require('dotenv').config();

async function checkData() {
  await mongoose.connect(process.env.DATABASE_URL);
  console.log('✅ Connected to MongoDB');
  
  const User = require('../src/modules/user/user.model');
  const userCount = await User.countDocuments();
  console.log(`Users total: ${userCount}`);
  
  const companyNames = await User.distinct('companyName');
  console.log(`Unique company names in Users:`, companyNames);
  
  if (companyNames.length === 0 && userCount > 0) {
     const firstUser = await User.findOne();
     console.log('Sample user data:', JSON.stringify(firstUser, null, 2));
  }

  await mongoose.disconnect();
}

checkData().catch(console.error);
