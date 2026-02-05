// Script to fix specialty fields in MongoDB for InternalTechnician and MaintenanceSchedule
// Run with: node scripts/fix-specialty-array.js

const { MongoClient } = require('mongodb');


require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const uri = process.env.DATABASE_URL;
// Extract db name from connection string or set manually if needed
let dbName = 'MantainanceManagementSystem';
try {
  const match = uri.match(/mongodb(?:\+srv)?:\/\/[^/]+\/(\w+)/);
  if (match && match[1]) dbName = match[1];
} catch {}

async function fixSpecialtyArray(collectionName) {
  const client = new MongoClient(uri);
  try {
    await client.connect();
    const db = client.db(dbName);
    const collection = db.collection(collectionName);
    // Find docs where specialty is a string
    const cursor = collection.find({ specialty: { $type: 'string' } });
    let count = 0;
    while (await cursor.hasNext()) {
      const doc = await cursor.next();
      await collection.updateOne(
        { _id: doc._id },
        { $set: { specialty: [doc.specialty] } }
      );
      count++;
      console.log(`Fixed specialty for _id: ${doc._id}`);
    }
    console.log(`Fixed ${count} documents in ${collectionName}`);
  } finally {
    await client.close();
  }
}

(async () => {
  await fixSpecialtyArray('InternalTechnician');
  await fixSpecialtyArray('MaintenanceSchedule');
  console.log('Done!');
})();
