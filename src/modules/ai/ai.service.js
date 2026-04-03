
const ALLOWED_CHECKLIST_TYPES = ['Status', 'Text', 'Number', 'Inspection', 'Multiple Choice', 'Meter', 'Signature', 'Checkbox', 'Warning', 'Multiselect'];

const normalizeText = (value) => String(value || '').trim().toLowerCase();

const formatHours = (value) => {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return 'not enough data';
  return `${Number(value).toFixed(2)} hours`;
};

const isGreeting = (text) => /^(hi|hello|hey|yo|good morning|good afternoon|good evening)\b/.test(text);
const isWellbeingQuestion = (text) => /how are you|how r u|how're you|how do you do/.test(text);
const isThanks = (text) => /^(thanks|thank you|ok thanks|nice|great thanks)\b/.test(text);
const isMaintenanceQuestion = (text) => /issue|incident|property|technician|tech|worker|team|staff|people|sla|resolution|priority|fix|trend|maintenance|asset|failure|breach|recurring|recommend/.test(text);

class AIService {
  constructor() {
    this.model = null;
    this.initialized = false;
  }

  async init() {
    if (this.initialized) return;
    try {
      const { GoogleGenerativeAI } = require("@google/generative-ai");
      const apiKey = process.env.GEMINI_API_KEY;
      if (apiKey) {
        const genAI = new GoogleGenerativeAI(apiKey);
        this.model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
      }
    } catch (err) {
      console.warn("AI Service: Failed to initialize Gemini model. Falling back to rule-based.", err.message);
    } finally {
      this.initialized = true;
    }
  }

  predictMaintenance(assetData = {}) {
    const issues = Array.isArray(assetData?.issues) ? assetData.issues : Array.isArray(assetData?.recentIssues) ? assetData.recentIssues : [];
    const riskSignals = [
      normalizeText(assetData.status).includes('fault'),
      normalizeText(assetData.status).includes('repair'),
      issues.length >= 5,
      issues.some((issue) => normalizeText(issue?.status).includes('open')),
    ].filter(Boolean).length;

    const riskLevel = riskSignals >= 3 ? 'High' : riskSignals === 2 ? 'Medium' : 'Low';
    const daysAhead = riskLevel === 'High' ? 7 : riskLevel === 'Medium' ? 21 : 45;
    const predictedDate = new Date(Date.now() + daysAhead * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    return {
      predictedDate,
      reasoning: riskLevel === 'High'
        ? 'This asset has several recent risk signals or repeated issues, so a near-term inspection is recommended.'
        : riskLevel === 'Medium'
          ? 'This asset shows moderate maintenance signals. Plan preventive maintenance soon to avoid escalation.'
          : 'This asset looks relatively stable. Keep routine preventive maintenance on schedule.',
      riskLevel
    };
  }

  triageIssue(issueDescription = '', technicians = []) {
    const text = normalizeText(issueDescription);
    const priority = /outage|fire|shock|urgent|leak|flood|security|broken main|not working/.test(text)
      ? 'High'
      : /damage|failure|noise|alarm|fault/.test(text)
        ? 'Medium'
        : 'Low';

    let category = 'General Maintenance';
    if (/electrical|power|voltage|socket|light/.test(text)) category = 'Electrical';
    else if (/water|pipe|leak|plumb|drain/.test(text)) category = 'Plumbing';
    else if (/door|window|lock|glass/.test(text)) category = 'Fixtures';
    else if (/paint|wall|ceiling|floor|tile/.test(text)) category = 'Building Fabric';
    else if (/hvac|air|cooling|heating|temperature/.test(text)) category = 'HVAC';

    const suggestedTechnician = (Array.isArray(technicians) ? technicians : []).find((tech) => {
      const skills = `${tech?.specialization || ''} ${Array.isArray(tech?.specializations) ? tech.specializations.join(' ') : ''}`.toLowerCase();
      return skills.includes(category.toLowerCase()) || (category === 'Electrical' && skills.includes('power'));
    }) || technicians[0];

    return {
      suggestedTechnicianId: suggestedTechnician?.id || suggestedTechnician?._id || 'unassigned',
      priority,
      category,
      confidence: priority === 'High' ? 0.9 : 0.78
    };
  }

  analyzeSentiment(feedbackList = [], isFallbackData = false) {
    const entries = Array.isArray(feedbackList) ? feedbackList : [];
    const joined = entries.map((entry) => normalizeText(entry?.message)).join(' ');
    const negativeSignals = ['late', 'delay', 'broken', 'bad', 'poor', 'not fixed', 'failed', 'angry'];
    const positiveSignals = ['good', 'great', 'fast', 'fixed', 'resolved', 'excellent', 'thanks'];

    const negativeScore = negativeSignals.reduce((sum, token) => sum + (joined.includes(token) ? 1 : 0), 0);
    const positiveScore = positiveSignals.reduce((sum, token) => sum + (joined.includes(token) ? 1 : 0), 0);

    const overallSentiment = positiveScore > negativeScore ? 'Positive' : negativeScore > positiveScore ? 'Negative' : 'Neutral';
    const urgentFeedbackIds = entries
      .filter((entry) => /urgent|asap|danger|unsafe|serious/.test(normalizeText(entry?.message)))
      .map((entry) => entry.id)
      .filter(Boolean);

    return {
      overallSentiment: isFallbackData && overallSentiment === 'Neutral' ? 'Mixed' : overallSentiment,
      urgentFeedbackIds,
      summary: overallSentiment === 'Negative'
        ? 'Recent feedback shows service frustration or unresolved issues. Review delayed or repeated work orders first.'
        : overallSentiment === 'Positive'
          ? 'Recent feedback is generally positive, with signs of timely or effective issue resolution.'
          : 'Feedback looks balanced overall. Keep watching repeated problems and overdue tasks.'
    };
  }

  getDashboardRecommendations(systemSummary = {}) {
    const recurringIssues = Array.isArray(systemSummary?.recurringIssues) ? systemSummary.recurringIssues : [];
    const topProperties = Array.isArray(systemSummary?.topProperties) ? systemSummary.topProperties : [];
    const highPriorityOpenIssues = Array.isArray(systemSummary?.highPriorityOpenIssues) ? systemSummary.highPriorityOpenIssues : [];
    const metrics = systemSummary?.metrics || {};

    const recommendations = [];

    if ((metrics.slaBreaches || 0) > 0) {
      recommendations.push({
        type: 'SLA',
        title: 'Reduce breached deadlines',
        content: `There are ${metrics.slaBreaches} SLA breaches. Review overdue jobs and rebalance technician workload today.`
      });
    }

    if (recurringIssues.length > 0) {
      const topPattern = recurringIssues[0];
      recommendations.push({
        type: 'PREVENTIVE MAINTENANCE',
        title: `Inspect ${topPattern.property}`,
        content: `${topPattern.category} issues keep repeating there. A preventive inspection should be scheduled before more failures occur.`
      });
    }

    if (topProperties.length > 0) {
      recommendations.push({
        type: 'RISK',
        title: `Prioritize ${topProperties[0].property}`,
        content: `${topProperties[0].property} currently has the highest incident load and should be reviewed first.`
      });
    }

    if (highPriorityOpenIssues.length > 0) {
      recommendations.push({
        type: 'DISPATCH',
        title: 'Handle high-priority open work first',
        content: `${highPriorityOpenIssues.length} high-priority work orders are still open. Push these to the top of the dispatch queue.`
      });
    }

    if (recommendations.length === 0) {
      recommendations.push({
        type: 'STABILITY',
        title: 'Keep preventive routines active',
        content: 'Current maintenance indicators look stable. Continue routine inspections and monitor issue recurrence.'
      });
    }

    return { recommendations };
  }

  generateChecklist(assetSummary = {}, options = {}) {
    const assetName = assetSummary?.name || assetSummary?.title || assetSummary?.assetName || 'Asset';
    const assetType = assetSummary?.type || 'equipment';
    const focus = normalizeText(options?.focus || 'preventive maintenance');

    const items = [
      { text: `Inspect the ${assetType} for visible wear, corrosion, or damage`, type: 'Inspection', meter: '', required: true },
      { text: 'Check guards, covers, and safety devices', type: 'Status', meter: '', required: true },
      { text: 'Record current operating reading', type: 'Meter', meter: 'Operating Reading', required: false },
      { text: 'Listen for abnormal vibration, heat, or noise', type: 'Warning', meter: '', required: true },
      { text: 'Clean accessible surfaces and remove dust or debris', type: 'Status', meter: '', required: false },
      { text: `Add ${focus || 'maintenance'} notes and follow-up actions`, type: 'Text', meter: '', required: false },
    ].filter((item) => ALLOWED_CHECKLIST_TYPES.includes(item.type));

    return {
      name: `${assetName} Checklist`,
      title: `${assetName} Checklist`,
      description: `Preventive maintenance checklist for ${assetName}.`,
      items
    };
  }

  detectIntent(query) {
    const q = normalizeText(query);
    if (/\b(issue|work ?order|request|incident)\b/.test(q)) return "get_issues";
    if (/\b(property|location|building|site)\b/.test(q)) return "get_properties";
    if (/\b(technician|tech|worker|team)\b/.test(q)) return "get_technicians";
    if (/\b(asset|equipment|machine)\b/.test(q)) return "get_assets";
    if (/\b(report|stats|analytics|metric)\b/.test(q)) return "get_reports";
    return "general_question";
  }

  extractEntities(query) {
    const q = normalizeText(query);
    return {
      status: /\bpending\b/.test(q) ? 'OPEN' : /\bcompleted\b/.test(q) ? 'COMPLETED' : /\burgent\b|\bhigh priority\b/.test(q) ? 'URGENT' : null,
      propertyName: q.match(/\bin\s+([a-zA-Z0-9\s]+)\b/)?.[1] || null
    };
  }

  async chat(question = '', history = [], analyticsSummary = null) {
    await this.init();
    const q = normalizeText(question);

    // Fallback logic if Gemini is not configured
    const fallback = () => this.ruleBasedChat(question, analyticsSummary);

    if (!this.model) return fallback();

    try {
      const intent = this.detectIntent(q);
      const entities = this.extractEntities(q);

      const prompt = `
You are KAT, an intelligent maintenance AI assistant for the FixNest platform.
Your goal is to provide clear, data-driven answers to maintenance queries.

User Question: "${question}"
Detected Intent: ${intent}
Extracted Entities: ${JSON.stringify(entities)}

SYSTEM DATA CONTEXT (Current Company Analytics):
${JSON.stringify(analyticsSummary, null, 2)}

INSTRUCTIONS:
1. Use the system data to answer the question specifically.
2. Be professional, direct, and helpful.
3. If the user asks for "what to fix first", prioritize SLA breaches and High Priority issues mentioned in the data.
4. If you don't have enough data to answer specifically, explain what is missing.
5. Keep your response concise (max 3-4 paragraphs).

CONVERSATION HISTORY:
${history.map(m => `${m.role === 'user' ? 'User' : 'KAT'}: ${m.content}`).join('\n')}

Response:`;

      const result = await this.model.generateContent(prompt);
      const response = await result.response;
      return response.text().trim();
    } catch (error) {
      console.error("Gemini Chat Error:", error);
      return fallback();
    }
  }

  ruleBasedChat(question = '', analyticsSummary = null) {
    const q = normalizeText(question);
    const summary = analyticsSummary || {};
    const metrics = summary.metrics || {};
    const topProperty = summary.topProperties?.[0];
    const topRecurring = summary.recurringIssues?.[0];
    const fastestTech = (summary.technicianPerformance || []).find((entry) => entry.averageResolutionHours !== null);
    const highestPriority = summary.highPriorityOpenIssues?.[0];
    const recommendations = Array.isArray(summary.recommendations) ? summary.recommendations : [];

    if (isGreeting(q) && !isMaintenanceQuestion(q)) return 'Hello! I can help with maintenance trends, risky properties, technician performance, SLA breaches, and what to prioritize first.';
    if (isWellbeingQuestion(q) && !isMaintenanceQuestion(q)) return 'I am doing well and ready to help. Ask me about trends, recurring failures, or what to prioritize.';

    if (!summary || !summary.metrics) {
      return 'I am FixNest AI. I can answer general maintenance questions, but I need you to log in to access your specific company data and analytics.';
    }

    const mentionsWorkOrders = (text) => /work ?order|issue|ticket|job/.test(text);
    const asksHowMany = (text) => /how many|number of|count of|how much/.test(text);
    const asksNotDone = (text) => /not done|not completed|unfinished|pending|open|remaining/.test(text);

    if (asksHowMany(q) && mentionsWorkOrders(q) && asksNotDone(q)) {
      return `Direct answer: ${metrics.openIssues || 0} work orders are not done yet.\n\nKey evidence: ${metrics.totalIssues || 0} total issues, ${metrics.completedIssues || 0} completed.\n\nRecommended actions: ${recommendations[0] || 'Review high-priority work orders.'}`;
    }

    if (q.includes('which property') || q.includes('most incidents')) {
      return `Direct answer: ${topProperty ? `${topProperty.property} has the most incidents.` : 'I cannot identify a top property from the current summary.'}`;
    }

    return `Here is your current status: ${metrics.totalIssues || 0} total issues, ${metrics.openIssues || 0} open, ${metrics.slaBreaches || 0} SLA breaches. What else would you like to know?`;
  }
}

module.exports = new AIService();
