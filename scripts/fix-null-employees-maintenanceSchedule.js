require('dotenv').config();
const { MongoClient } = require('mongodb');

const uri = process.env.DATABASE_URL;
const dbName = uri.match(/\/([\w-]+)\?/)[1];

async function fixNullEmployees() {
  const client = new MongoClient(uri);
  try {
    await client.connect();
    const db = client.db(dbName);
    const collection = db.collection('MaintenanceSchedule');
    const result = await collection.updateMany(
      { employees: null },
      { $set: { employees: '' } }
    );
    console.log(`Fixed ${result.modifiedCount} documents in MaintenanceSchedule (employees)`);
  } catch (err) {
    console.error('Error fixing MaintenanceSchedule employees:', err);
  } finally {
    await client.close();
  }
}

fixNullEmployees();
