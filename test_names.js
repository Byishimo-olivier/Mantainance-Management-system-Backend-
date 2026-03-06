const { MongoClient, ObjectId } = require('mongodb');

const url = "mongodb+srv://oliverbyo34_db_user:e428Cy9Q9R0QCTnV@mantainancemanagementsy.nplvul0.mongodb.net/MantainanceManagementSystem?appName=MantainanceManagementSystem&retryWrites=true&w=majority";
const client = new MongoClient(url);

async function run() {
    try {
        await client.connect();
        const db = client.db('MantainanceManagementSystem');
        const reqCol = db.collection('MaterialRequest');
        const userCol = db.collection('User');

        const reqs = await reqCol.find({}).toArray();
        console.log(`Found ${reqs.length} requests.`);

        for (const r of reqs) {
            if (!r.technicianName && r.technicianId) {
                let techName = 'Unknown';
                try {
                    const user = await userCol.findOne({ _id: new ObjectId(r.technicianId) });
                    if (user) {
                        techName = user.name;
                    } else {
                        const internalTechCol = db.collection('InternalTechnician');
                        const tech = await internalTechCol.findOne({ _id: new ObjectId(r.technicianId) });
                        if (tech) techName = tech.name;
                    }
                } catch (e) {
                    // Maybe it's a string ID not ObjectId
                    const user = await userCol.findOne({ id: r.technicianId });
                    if (user) techName = user.name;
                }
                console.log(`Request ${r.requestId}: TechID ${r.technicianId} -> Resolved Name: ${techName}`);
            } else {
                console.log(`Request ${r.requestId}: Already has name: ${r.technicianName}`);
            }
        }

    } finally {
        await client.close();
    }
}

run().catch(console.dir);
