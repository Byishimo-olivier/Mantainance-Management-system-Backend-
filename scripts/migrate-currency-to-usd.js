// /**
//  * Migration Script: Update System Settings Currency to USD
//  * 
//  * This script updates all system settings documents where subscriptionCurrency is RWF
//  * to USD. This is used to fix the default currency globally.
//  * 
//  * Usage: node scripts/migrate-currency-to-usd.js
//  */

// require('dotenv').config();
// const mongoose = require('mongoose');

// const SystemSettings = require('../src/modules/systemSettings/systemSettings.model');

// async function migrate() {
//   try {
//     console.log('🔄 Connecting to MongoDB...');
//     await mongoose.connect(process.env.MONGODB_URI);
//     console.log('✅ Connected to MongoDB');

//     console.log('\n🔍 Fetching system settings...');
//     const settings = await SystemSettings.find({});
    
//     if (settings.length === 0) {
//       console.log('❌ No system settings found. Please ensure system settings are initialized.');
//       await mongoose.disconnect();
//       return;
//     }

//     console.log(`📋 Found ${settings.length} system settings document(s)\n`);

//     let updated = 0;
//     for (const setting of settings) {
//       const currentCurrency = setting.platform?.subscriptionCurrency;
      
//       console.log(`Processing: ${setting.key || 'global'}`);
//       console.log(`  Current Currency: ${currentCurrency}`);

//       if (currentCurrency === 'RWF') {
//         setting.platform.subscriptionCurrency = 'USD';
//         await setting.save();
//         console.log(`  ✅ Updated to: USD\n`);
//         updated++;
//       } else {
//         console.log(`  ⏭️  Already set to: ${currentCurrency}\n`);
//       }
//     }

//     console.log(`\n✨ Migration Complete!`);
//     console.log(`📊 Summary: ${updated} document(s) updated to USD`);
//     console.log(`\nAll system settings now use USD as the default subscription currency.`);

//     await mongoose.disconnect();
//     console.log('\n✅ Disconnected from MongoDB');
//   } catch (err) {
//     console.error('❌ Migration Error:', err.message);
//     process.exit(1);
//   }
// }

// migrate();
