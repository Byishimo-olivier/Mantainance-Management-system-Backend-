const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');
const User = require('../user/user.model.js');
const prisma = new PrismaClient();

const login = async (req, res) => {
  const { email, password, companyName: requestedCompany } = req.body;

  // 1. Check User collection (Clients, Managers, Admins)
  let user = await User.findOne({ email });
  let isTechnician = false;
  let techData = null;

  if (!user) {
    // 2. Check Technician collection (External Technicians)
    techData = await prisma.technician.findUnique({ where: { email } });
    if (techData && techData.password) {
      user = techData;
      isTechnician = true;
    }
  }

  if (!user) return res.status(401).json({ error: 'Invalid credentials' });

  const storedPassword = isTechnician ? user.password : user.password;
  const valid = await bcrypt.compare(password, storedPassword);
  if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

  const userId = isTechnician ? user.id : user._id;
  const role = isTechnician ? 'technician' : user.role;
  const companyName = user.companyName || techData?.companyName || null;

  // Optional company gate: if client passes companyName, ensure it matches stored record
  if (requestedCompany && companyName && requestedCompany.trim().toLowerCase() !== companyName.trim().toLowerCase()) {
    return res.status(401).json({ error: 'Invalid company' });
  }

  const token = jwt.sign({ userId, role, companyName }, process.env.JWT_SECRET, { expiresIn: '24h' });

  res.json({
    token,
    user: {
      _id: userId,
      id: String(userId),
      name: user.name,
      email: user.email,
      role: role,
      companyName
    }
  });
};

module.exports = login;
