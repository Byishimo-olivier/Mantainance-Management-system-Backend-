const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

exports.create = async (data) => {
  return await prisma.property.create({ data });
};

exports.findAll = async () => {
  return await prisma.property.findMany();
};

exports.findById = async (id) => {
  return await prisma.property.findUnique({ where: { id } });
};

exports.update = async (id, data) => {
  return await prisma.property.update({ where: { id }, data });
};

exports.delete = async (id) => {
  return await prisma.property.delete({ where: { id } });
};