// /**
//  * Script to activate already-registered users
//  * Usage: node scripts/activate-users.js
//  * Run this from the backend directory: cd Mantainance-Management-system-backend- && node scripts/activate-users.js
//  */

// const mongoose = require('mongoose');
// const User = require('../src/modules/user/user.model.js');
// require('dotenv').config();

// const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/mms';

// async function activateUsers() {
//   try {
//     // Connect to MongoDB
//     await mongoose.connect(MONGODB_URI);
//     console.log('✅ Connected to MongoDB');

//     // List of emails to activate
//     const emailsToActivate = [
//       'byishimoolivier39@gmail.com',
//       // Add more emails as needed
//     ];

//     // Activate each user
//     const results = [];
//     for (const email of emailsToActivate) {
//       const normalizedEmail = String(email || '').trim().toLowerCase();
      
//       const user = await User.findOne({ email: normalizedEmail });
      
//       if (!user) {
//         results.push({ email, status: 'NOT_FOUND', message: 'User not found' });
//         continue;
//       }

//       if (user.isActive) {
//         results.push({ email, status: 'ALREADY_ACTIVE', message: 'Account already activated' });
//         continue;
//       }

//       // Activate the user
//       await User.findByIdAndUpdate(user._id, {
//         isActive: true,
//         paymentPendingActivation: false,
//         activationToken: null,
//         activationTokenExpires: null
//       });

//       results.push({ 
//         email, 
//         status: 'ACTIVATED', 
//         message: `${user.companyName} account activated successfully`,
//         userId: user._id
//       });
//     }

//     // Print results
//     console.log('\n' + '='.repeat(60));
//     console.log('ACTIVATION RESULTS');
//     console.log('='.repeat(60));
//     results.forEach((result) => {
//       const icon = result.status === 'ACTIVATED' ? '✅' : result.status === 'ALREADY_ACTIVE' ? '⚠️' : '❌';
//       console.log(`${icon} ${result.email}`);
//       console.log(`   Status: ${result.status}`);
//       console.log(`   Message: ${result.message}\n`);
//     });

//     const activatedCount = results.filter(r => r.status === 'ACTIVATED').length;
//     console.log(`\n📊 Total: ${results.length} | Activated: ${activatedCount}`);

//   } catch (error) {
//     console.error('❌ Error:', error.message);
//   } finally {
//     await mongoose.disconnect();
//     console.log('\n✅ Disconnected from MongoDB');
//   }
// }

// // Run the script
// activateUsers();
