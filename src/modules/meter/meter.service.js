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
    const reading = Number(data?.reading ?? data?.currentReading ?? 0) || 0;
    const doc = {
      ...data,
      reading,
      currentReading: Number(data?.currentReading ?? reading) || 0,
      readings: Array.isArray(data?.readings) ? data.readings : [],
      createdAt: now,
      updatedAt: now
    };
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
  addReading: async (id, readingData, companyName = '') => {
    const db = mongoose.connection.db;
    const { ObjectId } = require('mongodb');
    const filter = { _id: new ObjectId(id) };
    if (companyName) filter.companyName = String(companyName).trim();

    const existing = await db.collection(collectionName).findOne(filter);
    if (!existing) return null;

    const now = new Date();
    const previousReadings = Array.isArray(existing.readings) ? existing.readings : [];
    const previousReading = previousReadings.length
      ? Number(previousReadings[previousReadings.length - 1]?.reading ?? previousReadings[previousReadings.length - 1]?.value ?? existing.reading ?? existing.currentReading ?? 0) || 0
      : Number(existing.reading ?? existing.currentReading ?? 0) || 0;
    const nextReading = Number(readingData?.reading ?? readingData?.value ?? 0) || 0;
    const consumed = readingData?.consumed !== undefined
      ? Number(readingData.consumed) || 0
      : Math.max(0, nextReading - previousReading);
    const recordedAt = readingData?.recordedAt ? new Date(readingData.recordedAt) : now;
    const entry = {
      id: `reading-${Date.now()}`,
      reading: nextReading,
      value: nextReading,
      consumed,
      efficiency: readingData?.efficiency !== undefined ? Number(readingData.efficiency) || 0 : Math.max(0, Math.min(100, Math.round(100 - (consumed / Math.max(nextReading, 1)) * 100))),
      recordedAt,
      createdAt: now,
      note: String(readingData?.note || '').trim()
    };

    await db.collection(collectionName).updateOne(filter, {
      $set: {
        reading: nextReading,
        currentReading: nextReading,
        lastReadingAt: recordedAt,
        updatedAt: now
      },
      $push: { readings: entry }
    });

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
