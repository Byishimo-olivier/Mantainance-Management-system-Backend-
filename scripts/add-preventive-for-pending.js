#!/usr/bin/env node
/**
 * Script: add-preventive-for-pending.js
 * Adds the tag 'preventive' and sets `issueType`/`category` to 'preventive'
 * for issues that have the tag 'PENDING' (case-insensitive).
 *
 * Usage:
 *   DATABASE_URL="..." node scripts/add-preventive-for-pending.js
 */

const { MongoClient } = require('mongodb');
const dotenv = require('dotenv');
dotenv.config();

const url = process.env.DATABASE_URL || process.env.MONGODB_URL;
if (!url) {
  console.error('No DATABASE_URL or MONGODB_URL found in environment. Aborting.');
  process.exit(1);
}

async function run() {
  const client = new MongoClient(url);
  try {
    await client.connect();
    const db = client.db();

    const existing = await db.listCollections().toArray();
    const existingNames = existing.map(c => c.name);
    const possible = ['issues','Issues','Issue','issue'];
    const collName = possible.find(n => existingNames.includes(n));
    if (!collName) {
      console.error('No issues collection found. Collections:', existingNames.join(', '));
      process.exit(1);
    }
    const coll = db.collection(collName);
    console.log('Using collection', collName);

    const filter = { tags: { $elemMatch: { $regex: '^PENDING$', $options: 'i' } } };
    const update = {
      $addToSet: { tags: 'preventive' },
      $set: { issueType: 'preventive', category: 'preventive' }
    };

    const res = await coll.updateMany(filter, update);
    console.log(`Matched: ${res.matchedCount}, Modified: ${res.modifiedCount}`);

    if (res.matchedCount > 0) {
      const sample = await coll.find(filter).limit(5).toArray();
      console.log('Sample updated docs (showing id, tags):');
      sample.forEach(d => console.log(d._id.toString(), JSON.stringify(d.tags)));
    }

    await client.close();
    process.exit(0);
  } catch (err) {
    console.error('Error:', err);
    try { await client.close(); } catch (e) {}
    process.exit(1);
  }
}

run();
