const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const mongoose = require('mongoose');

exports.create = async (data) => {
  return await prisma.property.create({ data });
};

exports.findAll = async (filter = {}) => {
  try {
    return await prisma.property.findMany({ where: filter });
  } catch (err) {
    if (err.message.includes('userId') && (err.message.includes('null') || err.message.includes('converting'))) {
      console.error('CRITICAL: Prisma conversion error detected for Property (Old Service). Falling back to raw MongoDB.');
      const db = mongoose.connection.db;
      if (!db) throw err;
      const props = await db.collection('Property').find(filter).toArray();
      return props.map(p => ({ ...p, id: p._id.toString() }));
    }
    throw err;
  }
};

const { ObjectId } = require('mongodb');

function toObjectId(id) {
  try {
    return new ObjectId(id);
  } catch (e) {
    throw new Error('Invalid ObjectId');
  }
}

exports.findById = async (id) => {
  return await prisma.property.findUnique({ where: { id: toObjectId(id) } });
};

exports.update = async (id, data) => {
  return await prisma.property.update({ where: { id: toObjectId(id) }, data });
};

exports.delete = async (id) => {
  return await prisma.property.delete({ where: { id: toObjectId(id) } });
};