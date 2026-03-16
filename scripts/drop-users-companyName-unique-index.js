const mongoose = require('mongoose');
const dotenv = require('dotenv');

dotenv.config();

async function main() {
  const uri = process.env.DATABASE_URL;
  if (!uri) {
    console.error('❌ DATABASE_URL is not defined in environment');
    process.exit(1);
  }

  console.log('🚀 Connecting to MongoDB...');
  await mongoose.connect(uri);
  console.log('✅ Connected');

  const db = mongoose.connection.db;
  const collection = db.collection('users');

  const indexes = await collection.indexes();
  const companyIndex = indexes.find((i) => i.name === 'companyName_1');

  if (!companyIndex) {
    console.log('ℹ️  No companyName index found (nothing to do).');
    await mongoose.disconnect();
    return;
  }

  if (!companyIndex.unique) {
    console.log('ℹ️  companyName_1 exists but is not unique (nothing to do).');
    await mongoose.disconnect();
    return;
  }

  console.log('🧹 Dropping unique index companyName_1 from users collection...');
  await collection.dropIndex('companyName_1');
  console.log('✅ Dropped companyName_1');

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('❌ Failed:', err);
  process.exit(1);
});

