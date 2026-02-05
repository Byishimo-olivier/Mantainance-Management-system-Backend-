#!/usr/bin/env node
/**
 * Script: mark-preventive-issues.js
 * Scans the `issues` collection and adds the tag 'preventive' and sets
 * `issueType`/`category` to 'preventive' for documents that match the
 * heuristic used in the frontend.
 *
 * Usage: set `DATABASE_URL` in environment (or MONGODB_URL) and run:
 *   node scripts/mark-preventive-issues.js
 */

const { MongoClient, ObjectId } = require('mongodb');
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
    const db = client.db(); // uses DB from connection string or default

    // Try common collection names
    const possibleCollections = ['issues', 'Issues', 'Issue', 'issue'];
    let collName = null;
    const existing = await db.listCollections().toArray();
    const existingNames = existing.map(c => c.name);
    for (const name of possibleCollections) {
      if (existingNames.includes(name)) { collName = name; break; }
    }
    if (!collName) {
      console.error('Could not find an issues collection. Existing collections:', existingNames.join(', '));
      process.exit(1);
    }

    const coll = db.collection(collName);
    console.log('Scanning collection', collName);

    const cursor = coll.find({});
    let total = 0, matched = 0, updated = 0;

    while (await cursor.hasNext()) {
      const doc = await cursor.next();
      total++;
      const title = (doc.title || '').toString().toLowerCase();
      const issueType = (doc.issueType || doc.type || doc.category || '').toString().toLowerCase();
      const rawTags = Array.isArray(doc.tags) ? doc.tags : [];
      const tags = rawTags.map(t => {
        if (!t) return '';
        if (typeof t === 'string') return t.toLowerCase();
        if (typeof t === 'object' && t.label) return String(t.label).toLowerCase();
        return String(t).toLowerCase();
      });

      const isPreventive = tags.includes('preventive') || issueType === 'preventive' || title.includes('preventive');
      if (isPreventive) {
        matched++;
        // Build update
        const update = {};
        // Ensure tags include 'preventive'
        if (!tags.includes('preventive')) {
          update.$addToSet = { ...(update.$addToSet || {}), tags: 'preventive' };
        }
        // Ensure issueType/category set
        if (issueType !== 'preventive') {
          update.$set = { ...(update.$set || {}), issueType: 'preventive', category: 'preventive' };
        }
        if (Object.keys(update).length > 0) {
          const res = await coll.updateOne({ _id: doc._id }, update);
          if (res.modifiedCount && res.modifiedCount > 0) updated++;
          console.log(`Updated ${doc._id} -> matched=true, modified:${res.modifiedCount}`);
        }
      }
    }

    console.log(`Scan complete. Total: ${total}, Matched heuristic: ${matched}, Updated: ${updated}`);
    await client.close();
    process.exit(0);
  } catch (err) {
    console.error('Error during scan:', err);
    try { await client.close(); } catch (e) {}
    process.exit(1);
  }
}

run();
