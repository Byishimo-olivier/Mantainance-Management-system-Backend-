const { MongoClient } = require('mongodb');

const mongoUrl = process.env.MONGO_URL || 'mongodb://localhost:27017';
const dbName = 'MantainanceManagementSystem';

async function fixUserIndexes() {
  const client = new MongoClient(mongoUrl, { maxPoolSize: 1 });
  
  try {
    console.log('Connecting to MongoDB...');
    await client.connect();
    console.log('✓ Connected to MongoDB');
    
    const db = client.db(dbName);
    const collection = db.collection('users');
    
    // Get all indexes
    console.log('\n--- Current Indexes ---');
    const indexes = await collection.listIndexes().toArray();
    indexes.forEach(idx => console.log(`  - ${idx.name}:`, idx.key));
    
    // Drop old unique indexes
    console.log('\n--- Dropping old indexes ---');
    
    for (const idx of indexes) {
      if (idx.name === 'email_1') {
        console.log('  Dropping: email_1');
        await collection.dropIndex('email_1');
        console.log('  ✓ Dropped email_1');
      }
      if (idx.name === 'phone_1') {
        console.log('  Dropping: phone_1');
        await collection.dropIndex('phone_1');
        console.log('  ✓ Dropped phone_1');
      }
    }
    
    // Create new compound unique indexes
    console.log('\n--- Creating new compound indexes ---');
    
    // Compound unique index for [email, companyName]
    await collection.createIndex(
      { email: 1, companyName: 1 },
      { unique: true }
    );
    console.log('  ✓ Created: {email: 1, companyName: 1} [unique]');
    
    // Compound unique index for [phone, companyName]
    await collection.createIndex(
      { phone: 1, companyName: 1 },
      { unique: true }
    );
    console.log('  ✓ Created: {phone: 1, companyName: 1} [unique]');
    
    // Get updated indexes
    console.log('\n--- Updated Indexes ---');
    const newIndexes = await collection.listIndexes().toArray();
    newIndexes.forEach(idx => console.log(`  - ${idx.name}:`, idx.key));
    
    console.log('\n✓ Index migration completed successfully!');
    
  } catch (err) {
    console.error('\n✗ Error:', err.message);
    process.exit(1);
  } finally {
    await client.close();
    process.exit(0);
  }
}

fixUserIndexes();
