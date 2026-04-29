const bcrypt = require('bcryptjs');
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
    let hashedPassword = null;
    if (data.password) {
      const saltRounds = parseInt(process.env.BCRYPT_SALT_ROUNDS, 10) || 10;
      hashedPassword = await bcrypt.hash(data.password, saltRounds);
    }

    // Check if technician with same email already exists in this company
    if (data.email && data.companyName) {
      const existingEmail = await prisma.technician.findFirst({
        where: {
          email: data.email,
          companyName: data.companyName
        }
      });
      if (existingEmail) {
        throw new Error('A technician with this email already exists in this company.');
      }
    }

    // Check if technician with same phone already exists in this company
    if (data.phone && data.companyName) {
      const existingPhone = await prisma.technician.findFirst({
        where: {
          phone: data.phone,
          companyName: data.companyName
        }
      });
      if (existingPhone) {
        throw new Error('A technician with this phone already exists in this company.');
      }
    }

    const payload = {
      name: data.name || 'Unnamed Technician',
      email: data.email || null,
      phone: data.phone || null,
      specialization: Array.isArray(data.specialization) ? data.specialization : (data.specialization ? [data.specialization] : []),
      rating: data.rating !== undefined ? Number(data.rating) : 0,
      completed: data.completed !== undefined ? Number(data.completed) : 0,
      status: data.status || 'Active',
      type: 'EXTERNAL',
      password: hashedPassword,
      companyName: data.companyName || null
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
