#!/usr/bin/env node

/**
 * Migrate Parts to Correct Company
 * 
 * This script allows you to migrate parts with empty company names to a specific company.
 * Run with: node migrate-parts-to-company.js
 */

const mongoose = require('mongoose');
const readline = require('readline');
require('dotenv').config();

const Part = require('./src/modules/part/part.model');
const User = require('./src/modules/user/user.model');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(prompt) {
  return new Promise((resolve) => {
    rl.question(prompt, resolve);
  });
}

async function migratePartsToCompany() {
  try {
    console.log('🔍 Connecting to MongoDB...');
    const mongoUri = process.env.DATABASE_URL || process.env.MONGODB_URI || 'mongodb://localhost:27017/maintenance-system';
    console.log(`📍 Using connection: ${mongoUri.split('@')[1] ? 'MongoDB Atlas' : 'Local MongoDB'}\n`);
    
    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB\n');

    // Get list of unique companies
    console.log('📋 Fetching unique company names...');
    const companies = await Part.distinct('companyName', { companyName: { $ne: '', $exists: true } });
    console.log(`Found ${companies.length} companies:\n`);
    companies.forEach((company, idx) => {
      console.log(`   ${idx + 1}. ${company}`);
    });

    // Find parts with empty company
    const emptyParts = await Part.find({
      $or: [
        { companyName: null },
        { companyName: '' },
        { companyName: { $exists: false } }
      ]
    });

    console.log(`\n📊 Found ${emptyParts.length} parts with empty company names\n`);

    if (emptyParts.length === 0) {
      console.log('✅ No parts with empty company names found!\n');
      rl.close();
      await mongoose.connection.close();
      return;
    }

    // Show sample parts
    console.log('Sample parts with empty company:\n');
    emptyParts.slice(0, 5).forEach((part, idx) => {
      console.log(`   ${idx + 1}. ID: ${part._id}`);
      console.log(`      Name: ${part.name}`);
      console.log(`      Location: ${part.location || 'N/A'}`);
      console.log('');
    });

    if (emptyParts.length > 5) {
      console.log(`   ... and ${emptyParts.length - 5} more\n`);
    }

    // Ask which company to migrate to
    console.log('Which company should these parts be migrated to?');
    const selectedCompany = await question('Enter company name (or 0 to cancel): ');

    if (selectedCompany === '0') {
      console.log('❌ Migration cancelled\n');
      rl.close();
      await mongoose.connection.close();
      return;
    }

    if (!selectedCompany.trim()) {
      console.log('❌ Invalid company name\n');
      rl.close();
      await mongoose.connection.close();
      return;
    }

    const companyToMigrateTo = selectedCompany.trim();

    // Confirm
    const confirm = await question(`\n⚠️  Migrate ${emptyParts.length} parts to company "${companyToMigrateTo}"? (yes/no): `);

    if (confirm.toLowerCase() !== 'yes') {
      console.log('❌ Migration cancelled\n');
      rl.close();
      await mongoose.connection.close();
      return;
    }

    // Perform migration
    console.log(`\n⏳ Migrating ${emptyParts.length} parts...\n`);
    const result = await Part.updateMany(
      {
        $or: [
          { companyName: null },
          { companyName: '' },
          { companyName: { $exists: false } }
        ]
      },
      { $set: { companyName: companyToMigrateTo } }
    );

    console.log('✅ Migration complete!\n');
    console.log(`   Modified: ${result.modifiedCount} records`);
    console.log(`   Matched: ${result.matchedCount} records\n`);

    rl.close();
    await mongoose.connection.close();
    console.log('✅ Disconnected from MongoDB');

  } catch (error) {
    console.error('❌ Error:', error.message);
    rl.close();
    process.exit(1);
  }
}

migratePartsToCompany();
