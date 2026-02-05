require('dotenv').config();
const { MongoClient } = require('mongodb');

const uri = process.env.DATABASE_URL;
const dbName = uri.match(/\/([\w-]+)\?/)[1];

async function fixNullDate() {
  const client = new MongoClient(uri);
  try {
    await client.connect();
    const db = client.db(dbName);
    const collection = db.collection('MaintenanceSchedule');
    const result = await collection.updateMany(
      { date: null },
      { $set: { date: '' } }
    );
    console.log(`Fixed ${result.modifiedCount} documents in MaintenanceSchedule (date)`);
  } catch (err) {
    console.error('Error fixing MaintenanceSchedule date:', err);
  } finally {
    await client.close();
  }
}

fixNullDate();
