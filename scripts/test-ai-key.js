const { GoogleGenerativeAI } = require("@google/generative-ai");
const dotenv = require("dotenv");
const path = require("path");

dotenv.config({ path: path.join(__dirname, "../.env") });

const apiKey = process.env.GEMINI_API_KEY;
console.log("Using API Key:", apiKey ? `${apiKey.substring(0, 5)}...` : "MISSING");

async function testAI() {
    if (!apiKey) {
        console.error("No API key found in .env");
        return;
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    try {
        console.log("Attempting to generate test content...");
        const result = await model.generateContent("Say 'AI is working' if you see this.");
        const response = await result.response;
        console.log("Response:", response.text());
    } catch (error) {
        console.error("AI Test Failed!");
        console.error("Status:", error.status);
        console.error("Message:", error.message);
        if (error.response) {
            console.error("Response Data:", JSON.stringify(error.response, null, 2));
        }
    }
}

testAI();
