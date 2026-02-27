
const User = require('./user.model.js');
const bcrypt = require('bcryptjs');

const createUser = async (userData) => {
  if (!userData || !userData.password) throw new Error('Password is required');

  const saltRounds = parseInt(process.env.BCRYPT_SALT_ROUNDS, 10) || 10;
  const hashedPassword = await bcrypt.hash(userData.password, saltRounds);

  // Normalize and validate role, default to 'client'
  let role = 'client';
  if (userData.role) {
    const roleMap = {
      ADMIN: 'admin',
      MANAGER: 'manager',
      TECH: 'technician',
      TECHNICIAN: 'technician',
      CLIENT: 'client',
    };
    role = roleMap[String(userData.role).toUpperCase()] || String(userData.role).toLowerCase() || 'client';
  }

  const normalizedEmail = userData.email ? String(userData.email).toLowerCase().trim() : undefined;

  const user = new User({
    ...userData,
    email: normalizedEmail,
    password: hashedPassword,
    role,
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

const getAllUsers = async () => {
  return await User.find();
};

module.exports = {
  createUser,
  findUserByEmail,
  findUserById,
  getAllUsers,
};
