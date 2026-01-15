
const User = require('./user.model.js');
const bcrypt = require('bcryptjs');

const createUser = async (userData) => {
  const hashedPassword = await bcrypt.hash(userData.password, 10);
  const user = new User({ ...userData, password: hashedPassword });
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
