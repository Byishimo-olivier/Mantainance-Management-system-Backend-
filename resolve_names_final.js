const { MongoClient, ObjectId } = require('mongodb');

const url = "mongodb+srv://oliverbyo34_db_user:e428Cy9Q9R0QCTnV@mantainancemanagementsy.nplvul0.mongodb.net/MantainanceManagementSystem?appName=MantainanceManagementSystem&retryWrites=true&w=majority";
const client = new MongoClient(url);

async function run() {
    try {
        await client.connect();
        const db = client.db('MantainanceManagementSystem');
        const reqCol = db.collection('MaterialRequest');
        const userCol = db.collection('users'); // Fixed collection name
        const techCol = db.collection('Technician');

        const reqs = await reqCol.find({}).toArray();
        console.log(`Found ${reqs.length} requests.`);

        for (const r of reqs) {
            if (!r.technicianName && r.technicianId) {
                let techName = null;
                try {
                    const objId = new ObjectId(r.technicianId);
                    // Try User (lowercase 'users' collection)
                    const user = await userCol.findOne({ _id: objId });
                    if (user) {
                        techName = user.name;
                    } else {
                        // Try External Technician
                        const exTech = await techCol.findOne({ _id: objId });
                        if (exTech) techName = exTech.name || exTech.fullName;
                    }
                } catch (e) {
                    // Fallback
                }

                if (techName) {
                    await reqCol.updateOne({ _id: r._id }, { $set: { technicianName: techName } });
                    console.log(`Updated MR ${r.requestId} with name: ${techName}`);
                } else {
                    console.log(`Could not resolve name for MR ${r.requestId} (ID: ${r.technicianId})`);
                }
            }
        }

    } finally {
        await client.close();
    }
}

run().catch(console.dir);
