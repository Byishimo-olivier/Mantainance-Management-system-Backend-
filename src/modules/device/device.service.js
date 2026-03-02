const mongoose = require('mongoose');

const collectionName = 'EdgeDevice';

module.exports = {
  findAll: async () => {
    const db = mongoose.connection.db;
    const docs = await db.collection(collectionName).find({}).toArray();
    return docs.map(d => ({ ...d, id: d._id.toString() }));
  },
  findById: async (id) => {
    const db = mongoose.connection.db;
    const { ObjectId } = require('mongodb');
    const doc = await db.collection(collectionName).findOne({ _id: new ObjectId(id) });
    return doc ? { ...doc, id: doc._id.toString() } : null;
  },
  create: async (data) => {
    const db = mongoose.connection.db;
    const now = new Date();
    const doc = { ...data, createdAt: now, updatedAt: now };
    const res = await db.collection(collectionName).insertOne(doc);
    return { ...doc, id: res.insertedId.toString() };
  },
  update: async (id, data) => {
    const db = mongoose.connection.db;
    const { ObjectId } = require('mongodb');
    data.updatedAt = new Date();
    await db.collection(collectionName).updateOne({ _id: new ObjectId(id) }, { $set: data });
    const doc = await db.collection(collectionName).findOne({ _id: new ObjectId(id) });
    return doc ? { ...doc, id: doc._id.toString() } : null;
  },
  delete: async (id) => {
    const db = mongoose.connection.db;
    const { ObjectId } = require('mongodb');
    await db.collection(collectionName).deleteOne({ _id: new ObjectId(id) });
    return { success: true };
  },
  performAction: async (id, action) => {
    // Basic simulated actions: reboot, firmwareUpdate
    const db = mongoose.connection.db;
    const { ObjectId } = require('mongodb');
    const doc = await db.collection(collectionName).findOne({ _id: new ObjectId(id) });
    if (!doc) return null;
    const now = new Date();
    if (action === 'reboot') {
      await db.collection(collectionName).updateOne({ _id: new ObjectId(id) }, { $set: { status: 'Rebooting', lastActionAt: now } });
      // simulate immediate back-online for simplicity
      await db.collection(collectionName).updateOne({ _id: new ObjectId(id) }, { $set: { status: 'Online', lastActionAt: new Date() } });
    } else if (action === 'firmwareUpdate') {
      const newFw = (doc.firmware || 'v0.0.0').split('v')[1] || '0.0.0';
      const parts = newFw.split('.').map(n => Number(n) || 0);
      parts[2] = (parts[2] || 0) + 1;
      const updatedFw = 'v' + parts.join('.');
      await db.collection(collectionName).updateOne({ _id: new ObjectId(id) }, { $set: { firmware: updatedFw, lastActionAt: now } });
    }
    const updated = await db.collection(collectionName).findOne({ _id: new ObjectId(id) });
    return updated ? { ...updated, id: updated._id.toString() } : null;
  }
};
