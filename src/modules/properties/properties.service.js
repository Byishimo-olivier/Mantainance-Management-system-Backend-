const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

exports.create = async (data) => {
  return await prisma.property.create({ data });
};

exports.findAll = async () => {
  return await prisma.property.findMany();
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