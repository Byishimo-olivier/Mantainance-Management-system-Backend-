const mongoose = require('mongoose');

const collectionName = 'Meter';

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
  }
};
