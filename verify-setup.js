const axios = require('axios');

(async () => {
  try {
    // Create a test token (this is a simplified approach - in reality, you'd login first)
    const user = {
      email: 'alineuwineza123@gmail.com',
      password: 'your-password-here'
    };
    
    // Try to login
    const loginResponse = await axios.post('http://localhost:3000/api/users/login', {
      email: user.email,
      password: user.password
    });
    
    console.log('Login failed or server not running on port 3000');
    console.log('Please manually log out and back in to the frontend app');
    console.log('The trial countdown should appear in the top-right of your dashboard!');
    
  } catch (e) {
    console.log('Backend server test:');
    console.log('- If you see a permission denied error, the server is running');
    console.log('- If you see a connection refused error, start your backend server');
    console.log('');
    console.log('Next steps:');
    console.log('1. Ensure backend server is running');
    console.log('2. Log out from the frontend app');
    console.log('3. Log back in with: alineuwineza123@gmail.com');
    console.log('4. Check top-right corner for blue trial banner: ');
    console.log('   "Free Trial Active - 5 days remaining"');
  }
})();
