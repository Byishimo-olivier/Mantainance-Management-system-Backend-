const { MongoClient } = require('mongodb');

const url = "mongodb+srv://oliverbyo34_db_user:e428Cy9Q9R0QCTnV@mantainancemanagementsy.nplvul0.mongodb.net/MantainanceManagementSystem?appName=MantainanceManagementSystem&retryWrites=true&w=majority";
const client = new MongoClient(url);

async function run() {
    try {
        await client.connect();
        const db = client.db('MantainanceManagementSystem');

        console.log('--- Users (first 10) ---');
        const users = await db.collection('User').find({}).limit(10).toArray();
        users.forEach(u => console.log(`ID: ${u._id} | Name: ${u.name} | Role: ${u.role}`));

        console.log('\n--- Internal Technicians (first 10) ---');
        const techs = await db.collection('InternalTechnician').find({}).limit(10).toArray();
        techs.forEach(t => console.log(`ID: ${t._id} | Name: ${t.name} | UserID: ${t.userId}`));

    } finally {
        await client.close();
    }
}

run().catch(console.dir);
