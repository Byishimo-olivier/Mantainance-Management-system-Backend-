const mongoose = require('mongoose');
const dotenv = require('dotenv');
const User = require('../modules/user/user.model.js');

// Load environment variables
dotenv.config();

const migrateUserRoles = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.DATABASE_URL);
    console.log('Connected to MongoDB');

    // Update existing uppercase roles to lowercase
    const adminResult = await User.updateMany(
      { role: 'ADMIN' },
      { $set: { role: 'admin' } }
    );

    const techResult = await User.updateMany(
      { role: 'TECH' },
      { $set: { role: 'technician' } }
    );

    const clientResult = await User.updateMany(
      { role: 'CLIENT' },
      { $set: { role: 'client' } }
    );

    const totalUpdated = adminResult.modifiedCount + techResult.modifiedCount + clientResult.modifiedCount;
    console.log(`Updated ${totalUpdated} user records`);
    console.log(`- ADMIN -> admin: ${adminResult.modifiedCount}`);
    console.log(`- TECH -> technician: ${techResult.modifiedCount}`);
    console.log(`- CLIENT -> client: ${clientResult.modifiedCount}`);

    // Verify the updates
    const adminCount = await User.countDocuments({ role: 'admin' });
    const techCount = await User.countDocuments({ role: 'technician' });
    const clientCount = await User.countDocuments({ role: 'client' });
    const managerCount = await User.countDocuments({ role: 'manager' });

    console.log('Role distribution after migration:');
    console.log(`Admin: ${adminCount}`);
    console.log(`Technician: ${techCount}`);
    console.log(`Manager: ${managerCount}`);
    console.log(`Client: ${clientCount}`);

    console.log('Migration completed successfully!');
  } catch (error) {
    console.error('Migration failed:', error);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  }
};

// Run the migration
migrateUserRoles();
