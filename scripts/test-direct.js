const axios = require("axios");
const dotenv = require("dotenv");
const path = require("path");

dotenv.config({ path: path.join(__dirname, "../.env") });

async function testDirect() {
    const apiKey = process.env.GEMINI_API_KEY;
    console.log("🚀 Testing Direct API Call...");

    const url = `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

    try {
        const response = await axios.post(url, {
            contents: [{ parts: [{ text: "Respond with 'Hello' in JSON: {\"message\": \"Hello\"}" }] }]
        });

        console.log("Response:", JSON.stringify(response.data, null, 2));
        console.log("\n✅ Direct API call successful!");
    } catch (error) {
        console.error("\n❌ Direct API call failed:");
        if (error.response) {
            console.error("Status:", error.response.status);
            console.error("Data:", JSON.stringify(error.response.data, null, 2));
        } else {
            console.error(error.message);
        }
        process.exit(1);
    }
}

testDirect();
