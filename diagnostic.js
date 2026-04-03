require('dotenv').config();
const aiService = require('./src/modules/ai/ai.service');
const aiController = require('./src/modules/ai/ai.controller');

// Mock request and response
const req = {
    body: {
        message: "How many open issues?",
        history: []
    },
    user: {
        id: "mock-user-id",
        role: "MANAGER"
    }
};

const res = {
    status: function(s) { this.statusCode = s; return this; },
    json: function(j) { this.body = j; return this; }
};

// We need to mock the "resolveCompanyName" and "getCompanyScopedData" or just let them run if they work with mock user
// Since I can't easily mock the Prisma database state without a lot of work,
// I will just test the AIService.chat directly with real-looking data.

async function testService() {
    console.log("Testing AIService.chat directly...");
    const mockSummary = {
        metrics: { totalIssues: 10, openIssues: 2, completedIssues: 8, slaBreaches: 0 }
    };
    try {
        const response = await aiService.chat("Hello", [], mockSummary);
        console.log("Service Response:", response);
    } catch (err) {
        console.error("Service Failed:", err);
    }
}

testService();
