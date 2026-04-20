#!/usr/bin/env node

/**
 * Fix Parts with Empty Company Names
 * 
 * This script finds parts with empty or missing companyName and helps fix them.
 * Run with: node fix-empty-company-names.js
 */

const mongoose = require('mongoose');
require('dotenv').config();

const Part = require('./src/modules/part/part.model');
const InventorySet = require('./src/modules/inventorySet/inventorySet.model');
const CycleCount = require('./src/modules/cycleCount/cycleCount.model');

async function fixEmptyCompanyNames() {
  try {
    console.log('🔍 Connecting to MongoDB...');
    const mongoUri = process.env.DATABASE_URL || process.env.MONGODB_URI || 'mongodb://localhost:27017/maintenance-system';
    console.log(`📍 Using connection: ${mongoUri.split('@')[1] ? 'MongoDB Atlas' : 'Local MongoDB'}\n`);
    
    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB\n');

    // Find parts with empty company names
    console.log('📋 Finding Parts with empty company names...');
    const emptyPartsCount = await Part.countDocuments({
      $or: [
        { companyName: null },
        { companyName: '' },
        { companyName: { $exists: false } }
      ]
    });
    console.log(`Found ${emptyPartsCount} parts with empty company names\n`);

    if (emptyPartsCount > 0) {
      const emptyParts = await Part.find({
        $or: [
          { companyName: null },
          { companyName: '' },
          { companyName: { $exists: false } }
        ]
      }).limit(10);

      console.log('Sample empty parts:');
      emptyParts.forEach((part, idx) => {
        console.log(`  ${idx + 1}. ID: ${part._id}, Name: ${part.name}, Location: ${part.location || 'N/A'}`);
      });
      console.log('\n⚠️  These parts need to be assigned to a company.\n');
    }

    // Find inventory sets with empty company names
    console.log('📋 Finding Inventory Sets with empty company names...');
    const emptySetsCount = await InventorySet.countDocuments({
      $or: [
        { companyName: null },
        { companyName: '' },
        { companyName: { $exists: false } }
      ]
    });
    console.log(`Found ${emptySetsCount} inventory sets with empty company names\n`);

    // Find cycle counts with empty company names
    console.log('📋 Finding Cycle Counts with empty company names...');
    const emptyCycleCountsCount = await CycleCount.countDocuments({
      $or: [
        { companyName: null },
        { companyName: '' },
        { companyName: { $exists: false } }
      ]
    });
    console.log(`Found ${emptyCycleCountsCount} cycle counts with empty company names\n`);

    // Summary
    console.log('📊 SUMMARY:');
    console.log(`   Parts: ${emptyPartsCount}`);
    console.log(`   Inventory Sets: ${emptySetsCount}`);
    console.log(`   Cycle Counts: ${emptyCycleCountsCount}`);
    console.log(`   Total: ${emptyPartsCount + emptySetsCount + emptyCycleCountsCount}\n`);

    if (emptyPartsCount + emptySetsCount + emptyCycleCountsCount > 0) {
      console.log('❌ ACTION REQUIRED:');
      console.log('   1. Update parts with a valid companyName');
      console.log('   2. Contact support if you need help assigning these to the correct company');
      console.log('   3. To prevent this, ensure all records have a companyName when created\n');
    } else {
      console.log('✅ All records have proper company names assigned!\n');
    }

    await mongoose.connection.close();
    console.log('✅ Disconnected from MongoDB');

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

fixEmptyCompanyNames();
