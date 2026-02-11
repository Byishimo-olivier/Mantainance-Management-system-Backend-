#!/usr/bin/env node
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
    const names = existing.map(c => c.name);
    const possible = ['internalTechnicians','internaltechnicians','internaltechnician','InternalTechnician','internalTechnicians'];
    const collName = possible.find(n => names.includes(n));
    if (!collName) {
      console.error('No internal technicians collection found. Collections:', names.join(', '));
      await client.close();
      process.exit(1);
    }
    const coll = db.collection(collName);
    const docs = await coll.find({}).limit(5).toArray();
    console.log('Found', docs.length, 'internal technicians:');
    docs.forEach(d => {
      console.log(JSON.stringify(d, null, 2));
      console.log('----');
    });
    await client.close();
    process.exit(0);
  } catch (err) {
    console.error('Error:', err);
    try { await client.close(); } catch(e) {}
    process.exit(1);
  }
}

run();
