const bcrypt = require('bcryptjs');
const User = require('../modules/user/user.model');

async function ensureSuperadmin() {
  const email = String(process.env.SUPERADMIN_EMAIL || '').trim().toLowerCase();
  const password = String(process.env.SUPERADMIN_PASSWORD || '');

  if (!email || !password) {
    return;
  }

  const existing = await User.findOne({ email });
  const saltRounds = parseInt(process.env.BCRYPT_SALT_ROUNDS, 10) || 10;
  const hashedPassword = await bcrypt.hash(password, saltRounds);

  if (!existing) {
    await User.create({
      name: process.env.SUPERADMIN_NAME || 'System Super Admin',
      phone: process.env.SUPERADMIN_PHONE || `superadmin-${Date.now()}`,
      email,
      password: hashedPassword,
      role: 'superadmin',
      companyName: process.env.SUPERADMIN_COMPANY || 'SYSTEM',
      companyType: 'main',
      status: 'active',
      accessLevel: 'full'
    });
    console.log(`[bootstrap] Superadmin created for ${email}`);
    return;
  }

  const needsUpdate =
    existing.role !== 'superadmin' ||
    String(existing.companyName || '').trim() !== String(process.env.SUPERADMIN_COMPANY || 'SYSTEM').trim();

  if (needsUpdate) {
    existing.role = 'superadmin';
    existing.companyName = process.env.SUPERADMIN_COMPANY || 'SYSTEM';
    existing.accessLevel = 'full';
    existing.status = 'active';
  }

  if (process.env.SUPERADMIN_ROTATE_PASSWORD === '1') {
    existing.password = hashedPassword;
  }

  if (needsUpdate || process.env.SUPERADMIN_ROTATE_PASSWORD === '1') {
    await existing.save();
    console.log(`[bootstrap] Superadmin updated for ${email}`);
  }
}

module.exports = { ensureSuperadmin };
