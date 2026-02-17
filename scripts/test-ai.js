const aiService = require("../src/modules/ai/ai.service");
const dotenv = require("dotenv");
const path = require("path");

// Load .env from backend root
dotenv.config({ path: path.join(__dirname, "../.env") });

async function testAI() {
    console.log("🚀 Testing AI Service...");

    try {
        // 1. Test Sentiment Analysis (JSON Output)
        console.log("\n--- Testing Sentiment Analysis ---");
        const feedback = [
            { id: "1", message: "The kitchen sink is leaking and it's a mess!" },
            { id: "2", message: "Great service, the technician was very helpful." }
        ];
        const sentiment = await aiService.analyzeSentiment(feedback);
        console.log("Sentiment Response:", JSON.stringify(sentiment, null, 2));

        // 2. Test Dashboard Recommendations (JSON Output)
        console.log("\n--- Testing Dashboard Recommendations ---");
        const summary = {
            recentIssues: [{ title: "Leaking Pipe", status: "PENDING", location: "Unit 10" }],
            assetTypes: ["Plumbing", "Electrical"],
            activeTechnicians: 3
        };
        const recommendations = await aiService.getDashboardRecommendations(summary);
        console.log("Recommendations Response:", JSON.stringify(recommendations, null, 2));

        // 3. Test Chat (Context-aware)
        console.log("\n--- Testing Chat ---");
        const chatResponse = await aiService.chat("What are the most recent issues in Unit 10?", [], {
            recentIssues: ["Leaking Pipe [Status: PENDING] at Unit 10"]
        });
        console.log("Chat Response:", chatResponse);

        console.log("\n✅ AI Service verification completed successfully!");
    } catch (error) {
        console.error("\n❌ AI Service verification failed:");
        console.error(error);
        process.exit(1);
    }
}

testAI();
