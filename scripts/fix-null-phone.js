require('dotenv').config();
const { MongoClient } = require('mongodb');

const uri = process.env.DATABASE_URL;
const dbName = uri.match(/\/(\w+)\?/)[1];

async function fixNullPhone(collectionName) {
  const client = new MongoClient(uri);
  try {
    await client.connect();
    const db = client.db(dbName);
    const collection = db.collection(collectionName);
    const result = await collection.updateMany(
      { phone: null },
      { $set: { phone: '' } }
    );
    console.log(`Fixed ${result.modifiedCount} documents in ${collectionName}`);
  } catch (err) {
    console.error(`Error fixing ${collectionName}:`, err);
  } finally {
    await client.close();
  }
}

(async () => {
  await fixNullPhone('InternalTechnician');
  await fixNullPhone('MaintenanceSchedule');
})();
