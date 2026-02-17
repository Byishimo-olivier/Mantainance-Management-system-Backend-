const axios = require("axios");
const dotenv = require("dotenv");
const path = require("path");

dotenv.config({ path: path.join(__dirname, "../.env") });

async function listModels() {
    const apiKey = process.env.GEMINI_API_KEY;
    console.log("🚀 Listing Models...");

    try {
        const response = await axios.get(`https://generativelanguage.googleapis.com/v1/models?key=${apiKey}`);
        console.log("Models (v1):", response.data.models.map(m => m.name));

        try {
            const responseBeta = await axios.get(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
            console.log("Models (v1beta):", responseBeta.data.models.map(m => m.name));
        } catch (e) {
            console.log("Failed to list v1beta models");
        }

    } catch (error) {
        console.error("\n❌ Failed to list models:");
        if (error.response) {
            console.error("Status:", error.response.status);
            console.error("Data:", JSON.stringify(error.response.data, null, 2));
        } else {
            console.error(error.message);
        }
        process.exit(1);
    }
}

listModels();
