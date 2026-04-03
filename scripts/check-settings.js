// /**
//  * Diagnostic Script: Check Current System Settings
//  * 
//  * Shows what's currently stored in the database for pricing and currency
//  * Usage: node scripts/check-settings.js
//  */

// require('dotenv').config();
// const mongoose = require('mongoose');

// async function checkSettings() {
//   try {
//     console.log('🔄 Connecting to database...\n');
//     const mongoUri = process.env.DATABASE_URL || process.env.MONGODB_URI;
//     await mongoose.connect(mongoUri);

//     // Fetch from database directly
//     const settings = await mongoose.connection.db.collection('systemsettings').findOne({ key: 'global' });

//     if (!settings) {
//       console.log('❌ No system settings found\n');
//       await mongoose.disconnect();
//       return;
//     }

//     console.log('📊 Current System Settings in Database:\n');
//     console.log('Currency:', settings.platform?.subscriptionCurrency || 'NOT SET');
//     console.log('\nPricing Amounts:');
//     console.log('  Basic:', settings.pricing?.basic || 'NOT SET');
//     console.log('  Professional:', settings.pricing?.professional || 'NOT SET');
//     console.log('  Enterprise:', settings.pricing?.enterprise || 'NOT SET');
//     console.log('  Premium:', settings.pricing?.premium || 'NOT SET');

//     await mongoose.disconnect();
//   } catch (err) {
//     console.error('❌ Error:', err.message);
//     process.exit(1);
//   }
// }

// checkSettings();
