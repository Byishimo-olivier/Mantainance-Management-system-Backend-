const { MongoClient } = require('mongodb');

const url = "mongodb+srv://oliverbyo34_db_user:e428Cy9Q9R0QCTnV@mantainancemanagementsy.nplvul0.mongodb.net/MantainanceManagementSystem?appName=MantainanceManagementSystem&retryWrites=true&w=majority";
const client = new MongoClient(url);

async function run() {
    try {
        await client.connect();
        const db = client.db('MantainanceManagementSystem');
        const collection = db.collection('MaterialRequest');

        const requests = await collection.find({}).toArray();
        console.log(`Found ${requests.length} requests.`);

        const missingCreatedAt = requests.filter(r => !r.createdAt);
        console.log(`${missingCreatedAt.length} requests are missing createdAt.`);

        if (missingCreatedAt.length > 0) {
            console.log('Updating requests missing createdAt...');
            const result = await collection.updateMany(
                { createdAt: { $exists: false } },
                { $set: { createdAt: new Date() } }
            );
            console.log(`${result.modifiedCount} documents were updated.`);
        }

        // Also check status
        const statuses = requests.reduce((acc, r) => {
            acc[r.status] = (acc[r.status] || 0) + 1;
            return acc;
        }, {});
        console.log('Statuses:', statuses);

    } finally {
        await client.close();
    }
}

run().catch(console.dir);
