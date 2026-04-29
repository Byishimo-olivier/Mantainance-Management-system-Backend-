const mongoose = require('mongoose');
require('dotenv').config();

const cleanup = async () => {
  try {
    await mongoose.connect(process.env.DATABASE_URL);
    console.log('Connected to MongoDB');

    const db = mongoose.connection.db;
    const collection = db.collection('users');

    // Find duplicate emails with null companyName
    const duplicates = await collection.aggregate([
      { $match: { email: { $ne: null }, companyName: null } },
      { $group: { _id: '$email', count: { $sum: 1 }, ids: { $push: '$_id' } } },
      { $match: { count: { $gt: 1 } } }
    ]).toArray();

    if (duplicates.length === 0) {
      console.log('No duplicate emails found with null companyName!');
    } else {
      console.log(`Found ${duplicates.length} duplicate email groups:`);
      for (const dup of duplicates) {
        console.log(`  Email: ${dup._id}, Count: ${dup.count}, IDs: ${dup.ids.join(', ')}`);
        // Keep first, delete others
        const idsToDelete = dup.ids.slice(1);
        const result = await collection.deleteMany({ _id: { $in: idsToDelete } });
        console.log(`  Deleted ${result.deletedCount} duplicates`);
      }
    }

    // Also clean up phone duplicates
    const phoneDups = await collection.aggregate([
      { $match: { phone: { $ne: null }, companyName: null } },
      { $group: { _id: '$phone', count: { $sum: 1 }, ids: { $push: '$_id' } } },
      { $match: { count: { $gt: 1 } } }
    ]).toArray();

    if (phoneDups.length > 0) {
      console.log(`\nFound ${phoneDups.length} duplicate phone groups:`);
      for (const dup of phoneDups) {
        console.log(`  Phone: ${dup._id}, Count: ${dup.count}`);
        const idsToDelete = dup.ids.slice(1);
        const result = await collection.deleteMany({ _id: { $in: idsToDelete } });
        console.log(`  Deleted ${result.deletedCount} duplicates`);
      }
    }

    console.log('\n✓ Cleanup complete!');
    process.exit(0);
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
};

cleanup();
