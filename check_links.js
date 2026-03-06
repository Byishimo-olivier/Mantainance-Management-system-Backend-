const { MongoClient } = require('mongodb');

const url = "mongodb+srv://oliverbyo34_db_user:e428Cy9Q9R0QCTnV@mantainancemanagementsy.nplvul0.mongodb.net/MantainanceManagementSystem?appName=MantainanceManagementSystem&retryWrites=true&w=majority";
const client = new MongoClient(url);

async function run() {
    try {
        await client.connect();
        const db = client.db('MantainanceManagementSystem');
        const reqCol = db.collection('MaterialRequest');
        const itemCol = db.collection('MaterialRequestItem');

        const reqs = await reqCol.find({}).toArray();
        const items = await itemCol.find({}).toArray();

        console.log(`Requests: ${reqs.length}`);
        console.log(`Items: ${items.length}`);

        if (reqs.length > 0) {
            const firstReq = reqs[0];
            const linkedItems = items.filter(it => it.materialRequestId === firstReq._id.toString() || it.materialRequestId === firstReq.id);
            console.log(`First Request ID: ${firstReq._id}`);
            console.log(`Linked items for first request: ${linkedItems.length}`);
        }

    } finally {
        await client.close();
    }
}

run().catch(console.dir);
