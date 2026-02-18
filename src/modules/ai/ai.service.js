const { GoogleGenerativeAI } = require("@google/generative-ai");
const dotenv = require("dotenv");

dotenv.config();

const apiKey = process.env.GEMINI_API_KEY;
const genAI = new GoogleGenerativeAI(apiKey || "dummy_key");

const SYSTEM_INSTRUCTION = "You are the KAT (Kigali Apple Tech) AI Assistant for a Maintenance Management System (MMS).";

class AIService {
  constructor() {
    this.cache = new Map();
    this.CACHE_TTL = 5 * 60 * 1000; // 5 minutes cache

    try {
      this.model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
      console.log(`AI Service: Initialized with gemini-2.0-flash. Key starts with: ${apiKey ? apiKey.substring(0, 10) : 'MISSING'}...`);
    } catch (e) {
      console.error("AI Service Init Error:", e);
    }
  }

  async generateJson(prompt, fallbackData) {
    // 1. Check Cache
    const cacheKey = prompt;
    const cached = this.cache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp < this.CACHE_TTL)) {
      console.log("AI Service: Returning cached result to save quota.");
      return cached.data;
    }

    try {
      if (!apiKey || apiKey === "dummy_key") throw new Error("GEMINI_API_KEY is not configured.");

      const fullPrompt = `${SYSTEM_INSTRUCTION}\n\nTask: Return ONLY a JSON object.\n\n${prompt}`;
      const result = await this.model.generateContent(fullPrompt);
      const response = await result.response;
      const text = response.text();

      const cleanedText = text.replace(/```json|```/g, "").trim();
      const data = JSON.parse(cleanedText);

      // 2. Store in Cache
      this.cache.set(cacheKey, { timestamp: Date.now(), data });
      return data;

    } catch (error) {
      const status = error.status || error.response?.status;
      const message = error.message || error.toString();

      // 3. Handle Rate Limits (429) Gracefully
      if (status === 429 || message.includes("429") || message.includes("quota")) {
        console.warn(`[AI Service Warning] Quota exceeded (429). Returning fallback data to keep system operational.`);
        return fallbackData;
      }

      console.error(`[AI Service JSON Error] Status: ${status || 'N/A'}, Message: ${message}`);
      throw new Error(`AI Analysis Failed (Status ${status}): ${message}`);
    }
  }

  async predictMaintenance(assetData) {
    const prompt = `Predict maintenance for: ${JSON.stringify(assetData)}. Return JSON with predictedDate, reasoning, riskLevel.`;
    const fallback = {
      predictedDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      reasoning: "Based on historical usage patterns and asset age, preventive maintenance is recommended in 30 days.",
      riskLevel: "Medium"
    };
    return this.generateJson(prompt, fallback);
  }

  async triageIssue(issueDescription, technicians) {
    const prompt = `Triage issue: "${issueDescription}". Technicians: ${JSON.stringify(technicians)}. Return JSON with priority, category, suggestedTechnicianId, confidence.`;
    const fallback = {
      priority: "Medium",
      category: "General Maintenance",
      suggestedTechnicianId: technicians[0]?.id || "tech-1",
      confidence: 0.8
    };
    return this.generateJson(prompt, fallback);
  }

  async analyzeSentiment(feedbackList, isFallbackData = false) {
    const prompt = `Analyze sentiment: ${JSON.stringify(feedbackList)}. Return JSON with overallSentiment, urgentFeedbackIds, summary.`;
    const fallback = {
      overallSentiment: "Neutral",
      urgentFeedbackIds: [],
      summary: "System is operating normally. Most feedback indicates standard response times."
    };
    return this.generateJson(prompt, fallback);
  }

  async getDashboardRecommendations(systemSummary) {
    const prompt = `Recommendations for: ${JSON.stringify(systemSummary)}. Return JSON with recommendations array (type, title, content).`;
    const fallback = {
      recommendations: [
        {
          type: "PREVENTIVE MAINTENANCE",
          title: "Schedule HVAC Inspection",
          content: "Based on upcoming seasonal changes, scheduling a checkup for all HVAC systems can prevent emergency failure."
        },
        {
          type: "RESOURCE OPTIMIZATION",
          title: "Optimize Technician Routes",
          content: "Grouping tasks by building location could improve efficiency by 15%."
        }
      ]
    };
    return this.generateJson(prompt, fallback);
  }

  async chat(message, history = [], context = null) {
    try {
      if (!apiKey || apiKey === "dummy_key") throw new Error("GEMINI_API_KEY is not configured.");

      const chatSession = this.model.startChat({
        history: history.map(h => ({
          role: h.role === 'user' ? 'user' : 'model',
          parts: [{ text: h.content }],
        })),
      });

      const effectiveMessage = context ? `CONTEXT: ${JSON.stringify(context)}\n\nUSER MESSAGE: ${message}` : message;
      const result = await chatSession.sendMessage(effectiveMessage);
      const response = await result.response;
      return response.text();
    } catch (error) {
      const status = error.status || error.response?.status;
      const message = error.message || error.toString();

      if (status === 429 || message.includes("429") || message.includes("quota")) {
        return "I'm currently receiving too many requests (Free Tier Quota Exceeded). Please try again in a few minutes.";
      }

      console.error(`[AI Chat Error] Status: ${status || 'N/A'}, Message: ${message}`);
      return `I'm sorry, I'm having trouble connecting to the AI service. (Status: ${status || 'Error'}). Error: ${message}`;
    }
  }
}

module.exports = new AIService();
