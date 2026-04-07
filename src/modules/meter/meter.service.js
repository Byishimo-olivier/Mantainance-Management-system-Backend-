const mongoose = require('mongoose');

const collectionName = 'Meter';

module.exports = {
  findAll: async (companyName = '') => {
    const db = mongoose.connection.db;
    const filter = companyName ? { companyName: String(companyName).trim() } : {};
    const docs = await db.collection(collectionName).find(filter).toArray();
    return docs.map(d => ({ ...d, id: d._id.toString() }));
  },
  findById: async (id, companyName = '') => {
    const db = mongoose.connection.db;
    const { ObjectId } = require('mongodb');
    const filter = { _id: new ObjectId(id) };
    if (companyName) filter.companyName = String(companyName).trim();
    const doc = await db.collection(collectionName).findOne(filter);
    return doc ? { ...doc, id: doc._id.toString() } : null;
  },
  create: async (data) => {
    const db = mongoose.connection.db;
    const now = new Date();
    const doc = { ...data, createdAt: now, updatedAt: now };
    const res = await db.collection(collectionName).insertOne(doc);
    return { ...doc, id: res.insertedId.toString() };
  },
  update: async (id, data, companyName = '') => {
    const db = mongoose.connection.db;
    const { ObjectId } = require('mongodb');
    const nextData = { ...(data || {}) };
    delete nextData._id;
    delete nextData.id;
    nextData.updatedAt = new Date();
    const filter = { _id: new ObjectId(id) };
    if (companyName) filter.companyName = String(companyName).trim();
    await db.collection(collectionName).updateOne(filter, { $set: nextData });
    const doc = await db.collection(collectionName).findOne(filter);
    return doc ? { ...doc, id: doc._id.toString() } : null;
  },
  delete: async (id, companyName = '') => {
    const db = mongoose.connection.db;
    const { ObjectId } = require('mongodb');
    const filter = { _id: new ObjectId(id) };
    if (companyName) filter.companyName = String(companyName).trim();
    await db.collection(collectionName).deleteOne(filter);
    return { success: true };
  }
};
