
const User = require('./user.model.js');
const bcrypt = require('bcryptjs');

const createUser = async (userData) => {
  const hashedPassword = await bcrypt.hash(userData.password, 10);
  
  // Convert role to lowercase if provided, default to 'client'
  let role = 'client';
  if (userData.role) {
    const roleMap = {
      'ADMIN': 'admin',
      'MANAGER': 'manager', 
      'TECH': 'technician',
      'TECHNICIAN': 'technician',
      'CLIENT': 'client'
    };
    role = roleMap[userData.role.toUpperCase()] || userData.role.toLowerCase() || 'client';
  }
  
  const user = new User({ 
    ...userData, 
    password: hashedPassword,
    role: role
  });
  return await user.save();
};

const findUserByEmail = async (email) => {
  return await User.findOne({ email });
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
