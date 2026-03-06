const { MongoClient, ObjectId } = require('mongodb');

const url = "mongodb+srv://oliverbyo34_db_user:e428Cy9Q9R0QCTnV@mantainancemanagementsy.nplvul0.mongodb.net/MantainanceManagementSystem?appName=MantainanceManagementSystem&retryWrites=true&w=majority";
const client = new MongoClient(url);

const targetIds = [
    '69889358bfff028751e6d831',
    '6968b2d3f786b06f616789e9',
    '696e45ae48d0b6763a6f405c',
    '6999755ecc4cc1cc77dd4345'
];

async function run() {
    try {
        await client.connect();
        const db = client.db('MantainanceManagementSystem');
        const collections = await db.listCollections().toArray();

        for (const id of targetIds) {
            console.log(`\nSearching for ID: ${id}`);
            let found = false;
            for (const colInfo of collections) {
                const col = db.collection(colInfo.name);
                try {
                    const match = await col.findOne({ _id: new ObjectId(id) });
                    if (match) {
                        console.log(`Found in [${colInfo.name}]:`, JSON.stringify(match, null, 2));
                        found = true;
                    }
                } catch (e) {
                    // Maybe it's not an ObjectId
                }

                // Also check as string
                const matchStr = await col.findOne({ id: id });
                if (matchStr) {
                    console.log(`Found as string in [${colInfo.name}]:`, JSON.stringify(matchStr, null, 2));
                    found = true;
                }
            }
            if (!found) console.log('Not found in any collection.');
        }

    } finally {
        await client.close();
    }
}

run().catch(console.dir);
