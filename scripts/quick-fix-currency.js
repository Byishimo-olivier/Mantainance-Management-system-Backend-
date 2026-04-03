/**
 * QUICK FIX: Update Currency from RWF to USD
 * 
 * Run this to fix the currency issue immediately
 * Usage: node scripts/quick-fix-currency.js
 */

require('dotenv').config();
const mongoose = require('mongoose');

async function quickFix() {
  try {
    console.log('🔄 Connecting to database...\n');
    const mongoUri = process.env.DATABASE_URL || process.env.MONGODB_URI;
    if (!mongoUri) {
      throw new Error('DATABASE_URL or MONGODB_URI not found in .env file');
    }
    await mongoose.connect(mongoUri);

    // Direct update to systemsettings collection
    const result = await mongoose.connection.db.collection('systemsettings').updateOne(
      { key: 'global' },
      {
        $set: {
          'platform.subscriptionCurrency': 'USD',
          'pricing.basic': { weekly: 9.99, monthly: 29.99, yearly: 299.99 },
          'pricing.professional': { weekly: 24.99, monthly: 79.99, yearly: 799.99 },
          'pricing.enterprise': { weekly: 49.99, monthly: 199.99, yearly: 1999.99 }
        }
      },
      { upsert: true }
    );

    console.log('✅ Database Updated Successfully!\n');
    console.log('📊 Changes:');
    console.log('  ✅ Currency: RWF → USD');
    console.log('  ✅ Basic: $29.99/month');
    console.log('  ✅ Professional: $79.99/month');
    console.log('  ✅ Enterprise: $199.99/month\n');
    console.log('Matched:', result.matchedCount);
    console.log('Modified:', result.modifiedCount);
    
    await mongoose.disconnect();
    console.log('\n✅ Complete! Restart your server now.');
    process.exit(0);
  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }
}

quickFix();
