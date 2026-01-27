const User = require('../user/user.model');

module.exports = {
  getAll: () => User.find({ role: 'technician' }),
  getById: (id) => User.findById(id),
  // The following create/update/delete methods are not relevant for TECH users here,
  // but kept for compatibility. You may want to remove or adapt them as needed.
  create: async (data) => { 
    // Optionally, create a TECH user
    data.role = 'TECH';
    if (!data.password) {
      throw new Error('Password is required for TECH user creation');
    }
    const bcrypt = require('bcryptjs');
    const hashedPassword = await bcrypt.hash(data.password, 10);
    const user = new User({ ...data, password: hashedPassword });
    try {
      return await user.save();
    } catch (err) {
      if (err.code === 11000) {
        // Duplicate key error (phone or email)
        const field = Object.keys(err.keyPattern)[0];
        throw new Error(`A user with this ${field} already exists.`);
      }
      throw err;
    }
  },
  update: (id, data) => User.findByIdAndUpdate(id, data, { new: true }),
  delete: (id) => User.findByIdAndDelete(id),
};
