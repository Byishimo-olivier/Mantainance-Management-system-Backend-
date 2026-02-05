require('dotenv').config();
const { MongoClient } = require('mongodb');

const uri = process.env.DATABASE_URL;
const dbName = uri.match(/\/([\w-]+)\?/)[1];

async function fixNullDescription() {
  const client = new MongoClient(uri);
  try {
    await client.connect();
    const db = client.db(dbName);
    const collection = db.collection('MaintenanceSchedule');
    const result = await collection.updateMany(
      { description: null },
      { $set: { description: '' } }
    );
    console.log(`Fixed ${result.modifiedCount} documents in MaintenanceSchedule (description)`);
  } catch (err) {
    console.error('Error fixing MaintenanceSchedule description:', err);
  } finally {
    await client.close();
  }
}

fixNullDescription();
