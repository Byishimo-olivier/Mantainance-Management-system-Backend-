require('dotenv').config();
const { MongoClient } = require('mongodb');

const uri = process.env.DATABASE_URL;
const dbName = uri.match(/\/([\w-]+)\?/)[1];

async function fixNullTime() {
  const client = new MongoClient(uri);
  try {
    await client.connect();
    const db = client.db(dbName);
    const collection = db.collection('MaintenanceSchedule');
    const result = await collection.updateMany(
      { time: null },
      { $set: { time: '' } }
    );
    console.log(`Fixed ${result.modifiedCount} documents in MaintenanceSchedule (time)`);
  } catch (err) {
    console.error('Error fixing MaintenanceSchedule time:', err);
  } finally {
    await client.close();
  }
}

fixNullTime();
