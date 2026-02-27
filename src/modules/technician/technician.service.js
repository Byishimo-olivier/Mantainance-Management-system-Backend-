const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Service now manages external technicians via Prisma `Technician` model.
module.exports = {
  getAll: async () => {
    return await prisma.technician.findMany();
  },
  getById: async (id) => {
    return await prisma.technician.findUnique({ where: { id } });
  },
  // Create an external technician record (admin-created)
  create: async (data) => {
    const payload = {
      name: data.name || 'Unnamed Technician',
      email: data.email || null,
      phone: data.phone || null,
      specialization: Array.isArray(data.specialization) ? data.specialization : (data.specialization ? [data.specialization] : []),
      status: data.status || 'Active'
    };
    try {
      const created = await prisma.technician.create({ data: payload });
      return created;
    } catch (err) {
      // Convert Prisma unique constraint errors into friendlier messages
      if (err && err.code === 'P2002' && err.meta && err.meta.target) {
        throw new Error(`A technician with that ${err.meta.target.join(', ')} already exists.`);
      }
      throw err;
    }
  },
  update: async (id, data) => {
    return await prisma.technician.update({ where: { id }, data });
  },
  delete: async (id) => {
    return await prisma.technician.delete({ where: { id } });
  }
};
