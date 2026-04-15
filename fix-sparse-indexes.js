const { MongoClient } = require('mongodb');

const mongoUrl = process.env.MONGO_URL || 'mongodb://localhost:27017';
const dbName = 'MantainanceManagementSystem';

async function fixSparseIndexes() {
  const client = new MongoClient(mongoUrl, { maxPoolSize: 1 });
  
  try {
    console.log('🔧 Connecting to MongoDB...');
    await client.connect();
    console.log('✓ Connected to MongoDB');
    
    const db = client.db(dbName);
    const usersCollection = db.collection('users');
    
    console.log('\n--- Current Indexes ---');
    const indexes = await usersCollection.listIndexes().toArray();
    indexes.forEach(idx => {
      console.log(`  - ${idx.name}: sparse=${idx.sparse}, unique=${idx.unique}`);
    });
    
    console.log('\n--- Fixing Indexes ---');
    
    // Drop non-sparse compound indexes
    const indexesToDrop = ['users_email_companyId_key', 'users_phone_companyId_key'];
    
    for (const indexName of indexesToDrop) {
      const exists = indexes.find(idx => idx.name === indexName);
      if (exists && !exists.sparse) {
        console.log(`  Dropping: ${indexName} (non-sparse)`);
        try {
          await usersCollection.dropIndex(indexName);
          console.log(`  ✓ Dropped: ${indexName}`);
        } catch (err) {
          console.error(`  ✗ Failed to drop ${indexName}:`, err.message);
        }
      }
    }
    
    // Recreate with sparse: true
    console.log('\n--- Creating Sparse Indexes ---');
    
    try {
      console.log('  Creating: users_email_companyId_key (sparse)');
      await usersCollection.createIndex(
        { email: 1, companyId: 1 },
        { unique: true, sparse: true, name: 'users_email_companyId_key' }
      );
      console.log('  ✓ Created: users_email_companyId_key with sparse=true');
    } catch (err) {
      console.error('  ✗ Failed:', err.message);
    }
    
    try {
      console.log('  Creating: users_phone_companyId_key (sparse)');
      await usersCollection.createIndex(
        { phone: 1, companyId: 1 },
        { unique: true, sparse: true, name: 'users_phone_companyId_key' }
      );
      console.log('  ✓ Created: users_phone_companyId_key with sparse=true');
    } catch (err) {
      console.error('  ✗ Failed:', err.message);
    }
    
    console.log('\n--- Final Indexes ---');
    const newIndexes = await usersCollection.listIndexes().toArray();
    newIndexes.forEach(idx => {
      console.log(`  - ${idx.name}: sparse=${idx.sparse}, unique=${idx.unique}`);
    });
    
    console.log('\n✅ Sparse indexes fixed successfully!');
    
  } catch (err) {
    console.error('\n❌ Error:', err.message);
    process.exit(1);
  } finally {
    await client.close();
    process.exit(0);
  }
}

fixSparseIndexes();
