const mongoose = require('mongoose');
const dotenv = require('dotenv');

dotenv.config();

async function repairData() {
    const uri = process.env.DATABASE_URL;
    if (!uri) {
        console.error('❌ DATABASE_URL is not defined in environment');
        return;
    }

    try {
        console.log('🚀 Connecting to MongoDB via Mongoose...');
        await mongoose.connect(uri);
        console.log('✅ Connected!');

        const db = mongoose.connection.db;

        // Define collections to check
        const collections = ['Property', 'Asset', 'InternalTechnician', 'MaintenanceSchedule'];

        for (const colName of collections) {
            console.log(`🔍 Checking collection: ${colName}...`);
            const collection = db.collection(colName);

            // Find records with null or missing userId
            const badRecords = await collection.find({
                $or: [
                    { userId: null },
                    { userId: { $exists: false } }
                ]
            }).toArray();

            if (badRecords.length > 0) {
                console.log(`⚠️  Found ${badRecords.length} records with null/missing userId in ${colName}.`);
                badRecords.forEach(r => console.log(`   - Corrupt Record ID: ${r._id} (Name: ${r.name || 'N/A'})`));

                console.log(`🧹 Deleting these ${badRecords.length} records to unblock the app...`);
                const result = await collection.deleteMany({
                    _id: { $in: badRecords.map(r => r._id) }
                });
                console.log(`✅ Successfully deleted ${result.deletedCount} records from ${colName}.`);
            } else {
                console.log(`✨ Collection ${colName} is clean.`);
            }
        }

        console.log('\n🎉 Data repair finished successfully! Your app should now load without crashes.');
    } catch (err) {
        console.error('❌ Repair failed:', err);
    } finally {
        await mongoose.disconnect();
    }
}

repairData();
