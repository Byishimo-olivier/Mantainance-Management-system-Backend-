
const User = require('./user.model.js');
const bcrypt = require('bcryptjs');

const createUser = async (userData, options = {}) => {
  if (!userData || !userData.password) throw new Error('Password is required');
  if (!userData.companyName) throw new Error('Company name is required');
  const allowExistingCompany = options.allowExistingCompany === true;

  const saltRounds = parseInt(process.env.BCRYPT_SALT_ROUNDS, 10) || 10;
  const hashedPassword = await bcrypt.hash(userData.password, saltRounds);

  // Normalize and validate role, default to 'client'
  let role = 'client';
  let accessLevel = String(userData.accessLevel || '').toLowerCase() === 'limited' ? 'limited' : 'full';
  if (userData.role) {
    const roleMap = {
      ADMIN: 'admin',
      MANAGER: 'manager',
      TECH: 'technician',
      TECHNICIAN: 'technician',
      CLIENT: 'client',
      REQUESTOR: 'requestor',
      STAFF: 'staff',
      // Legacy role variants: map to base role + accessLevel
      'LIMITED MANAGER': 'manager',
      'LIMITED TECHNICIAN': 'technician'
    };
    const normalizedRoleKey = String(userData.role).toUpperCase();
    role = roleMap[normalizedRoleKey] || String(userData.role).toLowerCase() || 'client';
    if (normalizedRoleKey.startsWith('LIMITED ')) accessLevel = 'limited';
  }

  const normalizedEmail = userData.email ? String(userData.email).toLowerCase().trim() : undefined;
  const normalizedCompany = String(userData.companyName || '').trim();

  // Block duplicate company names (public registration). Invites can create multiple users per company.
  if (!allowExistingCompany) {
    const existingCompany = await User.findOne({ companyName: normalizedCompany });
    if (existingCompany) {
      throw new Error('Company name already exists. Please choose another.');
    }
  }

  const user = new User({
    ...userData,
    email: normalizedEmail,
    companyName: normalizedCompany,
    password: hashedPassword,
    role,
    accessLevel
  });

  const saved = await user.save();
  const userObj = saved.toObject ? saved.toObject() : saved;
  if (userObj && userObj.password) delete userObj.password;
  return userObj;
};

const findUserByEmail = async (email) => {
  if (!email) return null;
  return await User.findOne({ email: String(email).toLowerCase().trim() });
};

const findUserById = async (id) => {
  return await User.findById(id);
};

const getAllUsers = async (filter = {}) => {
  return await User.find(filter).select('-password');
};

const getUsersByRoles = async (roles = [], filter = {}) => {
  if (!Array.isArray(roles) || roles.length === 0) {
    return [];
  }
  return await User.find({ role: { $in: roles }, ...filter }).select('-password');
};

module.exports = {
  createUser,
  findUserByEmail,
  findUserById,
  getAllUsers,
  getUsersByRoles,
};
