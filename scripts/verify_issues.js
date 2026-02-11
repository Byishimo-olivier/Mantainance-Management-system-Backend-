const axios = require('axios');

async function testClientIssues() {
    try {
        // 1. Simulating a logged-in client.
        // In a real scenario, we'd need to login first to get a token.
        // For this test, we assume we have a valid token or can mock the request if running locally against a dev server.
        // Replace 'YOUR_ADMIN_TOKEN' with a valid token if testing against a secured endpoint.
        const token = 'YOUR_VALID_TOKEN';

        if (token === 'YOUR_VALID_TOKEN') {
            console.log('Please replace YOUR_VALID_TOKEN in the script with a real token to run this verification.');
            return;
        }

        const backendUrl = 'http://localhost:5000';

        console.log('Fetching issues for client...');
        const res = await axios.get(`${backendUrl}/api/issues`, {
            headers: { Authorization: `Bearer ${token}` }
        });

        console.log(`Status: ${res.status}`);
        console.log(`Issues found: ${res.data.length}`);

        if (res.data.length > 0) {
            console.log('Sample issue:', res.data[0]);
        } else {
            console.log('No issues found for this client.');
        }

    } catch (error) {
        console.error('Error fetching issues:', error.response ? error.response.data : error.message);
    }
}

testClientIssues();
