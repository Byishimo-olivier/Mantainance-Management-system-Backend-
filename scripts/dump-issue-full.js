#!/usr/bin/env node
const { MongoClient, ObjectId } = require('mongodb');
const dotenv = require('dotenv');
dotenv.config();

const url = process.env.DATABASE_URL || process.env.MONGODB_URL;
if (!url) {
  console.error('No DATABASE_URL or MONGODB_URL found in environment. Aborting.');
  process.exit(1);
}

async function run() {
  const id = process.argv[2];
  if (!id) {
    console.error('Usage: node dump-issue-full.js <issueId>');
    process.exit(1);
  }
  const client = new MongoClient(url);
  try {
    await client.connect();
    const db = client.db();
    const possible = ['issues','Issues','Issue','issue'];
    const existing = await db.listCollections().toArray();
    const names = existing.map(c => c.name);
    const collName = possible.find(n => names.includes(n));
    if (!collName) {
      console.error('No issues collection found. Collections:', names.join(', '));
      await client.close();
      process.exit(1);
    }
    const coll = db.collection(collName);
    const doc = await coll.findOne({ _id: new ObjectId(id) });
    if (!doc) {
      console.error('No issue found with id', id);
      await client.close();
      process.exit(1);
    }
    console.log(JSON.stringify(doc, null, 2));
    await client.close();
    process.exit(0);
  } catch (err) {
    console.error('Error:', err);
    try { await client.close(); } catch(e) {}
    process.exit(1);
  }
}

run();
