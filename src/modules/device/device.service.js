const mongoose = require('mongoose');

const collectionName = 'EdgeDevice';

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
  },
  performAction: async (id, action, companyName = '') => {
    // Basic simulated actions: reboot, firmwareUpdate
    const db = mongoose.connection.db;
    const { ObjectId } = require('mongodb');
    const filter = { _id: new ObjectId(id) };
    if (companyName) filter.companyName = String(companyName).trim();
    const doc = await db.collection(collectionName).findOne(filter);
    if (!doc) return null;
    const now = new Date();
    if (action === 'reboot') {
      await db.collection(collectionName).updateOne(filter, { $set: { status: 'Rebooting', lastActionAt: now } });
      // simulate immediate back-online for simplicity
      await db.collection(collectionName).updateOne(filter, { $set: { status: 'Online', lastActionAt: new Date() } });
    } else if (action === 'firmwareUpdate') {
      const newFw = (doc.firmware || 'v0.0.0').split('v')[1] || '0.0.0';
      const parts = newFw.split('.').map(n => Number(n) || 0);
      parts[2] = (parts[2] || 0) + 1;
      const updatedFw = 'v' + parts.join('.');
      await db.collection(collectionName).updateOne(filter, { $set: { firmware: updatedFw, lastActionAt: now } });
    }
    const updated = await db.collection(collectionName).findOne(filter);
    return updated ? { ...updated, id: updated._id.toString() } : null;
  }
};
