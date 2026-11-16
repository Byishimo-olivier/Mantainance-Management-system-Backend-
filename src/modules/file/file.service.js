const mongoose = require('mongoose');

const collectionName = 'File';

const scopeFilter = (filter, companyName) => (companyName ? { ...filter, companyName: String(companyName).trim() } : filter);

module.exports = {
  // companyName: '' = every company (superadmin / internal callers).
  findAll: async (companyName = '') => {
    const db = mongoose.connection.db;
    const docs = await db.collection(collectionName).find(scopeFilter({}, companyName)).toArray();
    return docs.map(d => ({ ...d, id: d._id.toString() }));
  },
  findById: async (id, companyName = '') => {
    const db = mongoose.connection.db;
    const { ObjectId } = require('mongodb');
    if (!ObjectId.isValid(id)) return null;
    const doc = await db.collection(collectionName).findOne(scopeFilter({ _id: new ObjectId(id) }, companyName));
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
    if (!ObjectId.isValid(id)) return null;
    const filter = scopeFilter({ _id: new ObjectId(id) }, companyName);
    data.updatedAt = new Date();
    await db.collection(collectionName).updateOne(filter, { $set: data });
    const doc = await db.collection(collectionName).findOne(filter);
    return doc ? { ...doc, id: doc._id.toString() } : null;
  },
  delete: async (id, companyName = '') => {
    const db = mongoose.connection.db;
    const { ObjectId } = require('mongodb');
    if (!ObjectId.isValid(id)) return { success: false };
    const result = await db.collection(collectionName).deleteOne(scopeFilter({ _id: new ObjectId(id) }, companyName));
    return { success: result.deletedCount > 0 };
  }
};
