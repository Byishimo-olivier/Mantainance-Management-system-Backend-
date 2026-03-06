const { MongoClient } = require('mongodb');

const url = "mongodb+srv://oliverbyo34_db_user:e428Cy9Q9R0QCTnV@mantainancemanagementsy.nplvul0.mongodb.net/MantainanceManagementSystem?appName=MantainanceManagementSystem&retryWrites=true&w=majority";
const client = new MongoClient(url);

async function run() {
    try {
        await client.connect();
        const db = client.db('MantainanceManagementSystem');

        console.log('--- External Technicians (first 10) ---');
        const techs = await db.collection('Technician').find({}).limit(10).toArray();
        techs.forEach(t => console.log(`ID: ${t._id} | Name: ${t.name || t.fullName}`));

    } finally {
        await client.close();
    }
}

run().catch(console.dir);
