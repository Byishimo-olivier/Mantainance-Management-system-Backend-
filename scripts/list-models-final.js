const axios = require("axios");
const dotenv = require("dotenv");
const fs = require("fs");
const path = require("path");

dotenv.config({ path: path.join(__dirname, "../.env") });

async function listModels() {
    const apiKey = process.env.GEMINI_API_KEY;
    try {
        const response = await axios.get(`https://generativelanguage.googleapis.com/v1/models?key=${apiKey}`);
        const names = response.data.models.map(m => m.name);
        fs.writeFileSync(path.join(__dirname, "../models_list_clean.txt"), names.join("\n"), "utf8");
        console.log("✅ Models list saved to models_list_clean.txt");
    } catch (error) {
        console.error("Failed:", error.message);
    }
}

listModels();
