const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function ensureSuperadmin() {
  const email = String(process.env.SUPERADMIN_EMAIL || '').trim().toLowerCase();
  const password = String(process.env.SUPERADMIN_PASSWORD || '');

  if (!email || !password) {
    console.log('[bootstrap] SUPERADMIN_EMAIL or SUPERADMIN_PASSWORD not set, skipping superadmin creation');
    return;
  }

  try {
    const saltRounds = parseInt(process.env.BCRYPT_SALT_ROUNDS, 10) || 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    const existing = await prisma.user.findFirst({ 
      where: { email } 
    });

    if (!existing) {
      await prisma.user.create({
        data: {
          name: process.env.SUPERADMIN_NAME || 'System Super Admin',
          phone: `superadmin-${Date.now()}`,
          email,
          password: hashedPassword,
          role: 'superadmin',
          status: 'active',
          // Superadmin is NOT company-scoped - no companyId or companyName
          companyName: null,
          companyId: null,
          isCompanyAdmin: false
        }
      });
      console.log(`[bootstrap] Superadmin created for ${email}`);
      return;
    }

    // Update existing user to be superadmin if needed
    const needsUpdate = existing.role !== 'superadmin';

    if (needsUpdate || process.env.SUPERADMIN_ROTATE_PASSWORD === '1') {
      await prisma.user.update({
        where: { id: existing.id },
        data: {
          role: 'superadmin',
          status: 'active',
          companyName: null,
          companyId: null,
          isCompanyAdmin: false,
          ...(process.env.SUPERADMIN_ROTATE_PASSWORD === '1' && { password: hashedPassword })
        }
      });
      console.log(`[bootstrap] Superadmin updated for ${email}`);
    }
  } catch (err) {
    console.error('[bootstrap] Error ensuring superadmin:', err.message);
  }
}

module.exports = { ensureSuperadmin };
