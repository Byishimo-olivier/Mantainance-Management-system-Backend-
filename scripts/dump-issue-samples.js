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
    const existingNames = existing.map(c => c.name);
    const possible = ['issues','Issues','Issue','issue'];
    const collName = possible.find(n => existingNames.includes(n));
    if (!collName) {
      console.error('No issues collection found. Collections:', existingNames.join(', '));
      process.exit(1);
    }
    const coll = db.collection(collName);
    console.log('Using collection', collName);
    const docs = await coll.find({}).limit(8).toArray();
    docs.forEach(d => {
      console.log('----');
      console.log('id:', d._id.toString());
      console.log('title:', d.title);
      console.log('issueType/type/category:', d.issueType || d.type || d.category);
      console.log('tags (raw):', JSON.stringify(d.tags));
      if (d.tags && Array.isArray(d.tags)) {
        console.log('tags (mapped):', d.tags.map(t => {
          if (!t) return null;
          if (typeof t === 'string') return t;
          if (typeof t === 'object' && t.label) return t.label;
          return t;
        }));
      }
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
