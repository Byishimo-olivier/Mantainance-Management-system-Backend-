const mongoose = require('mongoose');

const COLLECTION_NAME = 'private_notes';

function getCollection() {
  const db = mongoose.connection.db;
  if (!db) {
    throw new Error('MongoDB connection is not ready');
  }
  return db.collection(COLLECTION_NAME);
}

async function getMyNote(userId, scope) {
  const collection = getCollection();
  const note = await collection.findOne({ userId: String(userId), scope: String(scope) });
  return note || null;
}

async function upsertMyNote(userId, scope, content) {
  const collection = getCollection();
  const now = new Date();
  await collection.updateOne(
    { userId: String(userId), scope: String(scope) },
    {
      $set: {
        content: String(content || ''),
        updatedAt: now
      },
      $setOnInsert: {
        userId: String(userId),
        scope: String(scope),
        createdAt: now
      }
    },
    { upsert: true }
  );
  return getMyNote(userId, scope);
}

module.exports = {
  getMyNote,
  upsertMyNote
};
