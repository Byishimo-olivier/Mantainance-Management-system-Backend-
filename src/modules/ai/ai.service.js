
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
    this.claudeClient = null;
    this.initialized = false;
  }

  async init() {
    if (this.initialized) return;
    try {
      // Try Claude first
      const Anthropic = require("@anthropic-ai/sdk");
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (apiKey) {
        this.claudeClient = new Anthropic({ apiKey });
        console.log("✓ Claude AI Client initialized");
      }
      
      // Fallback to Gemini
      if (!this.claudeClient) {
        const { GoogleGenerativeAI } = require("@google/generative-ai");
        const gApiKey = process.env.GEMINI_API_KEY;
        if (gApiKey) {
          const genAI = new GoogleGenerativeAI(gApiKey);
          this.model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
        }
      }
    } catch (err) {
      console.warn("AI Service: Failed to initialize Claude or Gemini. Falling back to rule-based.", err.message);
    } finally {
      this.initialized = true;
    }
  }

  /**
   * Fetch live MongoDB data for context injection
   * This pulls real-time data from the maintenance database
   */
  async getMaintenanceContext(companyId = null, includeStatuses = null) {
    try {
      const { PrismaClient } = require("@prisma/client");
      const prisma = new PrismaClient();

      // Default statuses if not specified - includes all statuses for comprehensive data
      const statusFilter = includeStatuses || ['OPEN', 'IN_PROGRESS', 'PENDING', 'COMPLETED', 'ON_HOLD', 'open', 'in progress', 'in_progress', 'pending', 'completed', 'on hold', 'on_hold'];
      console.log('📡 [DB Query] Fetching with:', { statusFilter, companyId });

      // Fetch work orders with flexible status filtering - try uppercase and lowercase variations
      const workOrders = await prisma.issue.findMany({
        where: {
          ...(companyId && { companyId })
          // Note: Removed status filter temporarily to debug
        },
        select: {
          _id: true,
          title: true,
          assetName: true,
          priority: true,
          status: true,
          assignedTo: true,
          createdAt: true,
          dueDate: true,
          completedDate: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 50  // Fetch more to see what we have
      });

      console.log('✅ [DB Query] ALL Work Orders Found:', workOrders.length, 'records');
      
      // Get distinct statuses to see what values exist
      const distinctStatuses = [...new Set(workOrders.map(w => w.status))];
      console.log('📊 [DB Query] Distinct statuses in DB:', distinctStatuses);
      
      // Now filter if needed
      let filteredOrders = workOrders;
      if (includeStatuses && includeStatuses.length > 0) {
        filteredOrders = workOrders.filter(wo => {
          const woStatus = String(wo.status || '').trim().toLowerCase();
          return includeStatuses.some(s => {
            const filterStatus = String(s || '').trim().toLowerCase();
            return woStatus === filterStatus || filterStatus.includes(woStatus) || woStatus.includes(filterStatus);
          });
        });
        console.log('🔍 [DB Query] After filtering:', filteredOrders.length, 'records');
      }

      // Fetch active assets
      const assets = await prisma.asset.findMany({
        where: {
          status: { $ne: 'DECOMMISSIONED' },
          ...(companyId && { companyId })
        },
        select: {
          _id: true,
          name: true,
          type: true,
          location: true,
          condition: true,
          lastMaintenanceDate: true,
        },
        take: 20
      });

      // Fetch low stock spare parts
      const spareParts = await prisma.sparePart.findMany({
        where: {
          quantity: { lt: 10 }, // Assuming 10 as a threshold if not specified
          ...(companyId && { companyId })
        },
        select: {
          id: true,
          name: true,
          quantity: true,
          lowStockThreshold: true,
          unitCost: true,
        },
        take: 10
      });

      // Fetch high-priority unresolved issues
      const highPriorityIssues = await prisma.issue.findMany({
        where: {
          priority: 'HIGH',
          status: { $ne: 'COMPLETED' },
          ...(companyId && { companyId })
        },
        select: {
          _id: true,
          title: true,
          status: true,
          createdAt: true,
        },
        take: 5
      });

      // Fetch technician availability
      const technicians = await prisma.internalTechnician.findMany({
        where: {
          status: 'ACTIVE',
          ...(companyId && { companyId })
        },
        select: {
          _id: true,
          firstName: true,
          lastName: true,
          specializations: true,
          currentWorkload: true,
        },
        take: 10
      });

      await prisma.$disconnect();

      return {
        workOrders: filteredOrders || [],
        assets: assets || [],
        spareParts: spareParts || [],
        highPriorityIssues: highPriorityIssues || [],
        technicians: technicians || [],
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error("Error fetching maintenance context:", error.message);
      return {
        workOrders: [],
        assets: [],
        spareParts: [],
        highPriorityIssues: [],
        technicians: [],
        timestamp: new Date().toISOString(),
        error: error.message
      };
    }
  }

  /**
   * Build system prompt with injected live data
   */
  buildSystemPromptWithContext(userRole = 'technician', liveData = {}) {
    const rolePrompts = {
      technician: `You are KAT, an intelligent maintenance assistant helping a field technician.
Your role is to provide practical guidance on maintenance tasks, troubleshooting, and safety.
Only answer questions about maintenance operations, equipment faults, work orders, spare parts, and safety.`,

      manager: `You are KAT, an intelligent maintenance assistant helping a facility manager.
Your role is to provide strategic guidance on scheduling, resource allocation, and performance optimization.
Answer questions about work order management, scheduling, inventory, team performance, and KPIs.`,

      coordinator: `You are KAT, an intelligent maintenance assistant helping a maintenance coordinator.
Your role is to help with dispatch, scheduling, and coordination tasks.`
    };

    const basePrompt = rolePrompts[userRole] || rolePrompts.technician;

    const contextString = `

=== LIVE MAINTENANCE DATABASE CONTEXT (as of ${liveData.timestamp || new Date().toISOString()}) ===

OPEN WORK ORDERS (${liveData.workOrders?.length || 0}):
${(liveData.workOrders || []).map(w => 
  `- [${w.priority}] ${w.title} | Asset: ${w.assetName} | Status: ${w.status} | Assigned: ${w.assignedTo || 'Unassigned'} | Due: ${w.dueDate ? new Date(w.dueDate).toLocaleDateString() : 'N/A'}`
).join('\n') || '- None'}

ACTIVE ASSETS (${liveData.assets?.length || 0}):
${(liveData.assets || []).slice(0, 10).map(a =>
  `- ${a.name} (${a.type}) | Location: ${a.location} | Condition: ${a.condition} | Last Maintenance: ${a.lastMaintenanceDate ? new Date(a.lastMaintenanceDate).toLocaleDateString() : 'Never'}`
).join('\n') || '- None'}

LOW STOCK SPARE PARTS (${liveData.spareParts?.length || 0}):
${(liveData.spareParts || []).map(p =>
  `- ${p.name} | In Stock: ${p.quantity}/${p.minimumQuantity} | Unit Cost: $${p.unitCost || 0}`
).join('\n') || '- None'}

HIGH-PRIORITY UNRESOLVED ISSUES (${liveData.highPriorityIssues?.length || 0}):
${(liveData.highPriorityIssues || []).map(i =>
  `- ${i.title} | Status: ${i.status} | Created: ${new Date(i.createdAt).toLocaleDateString()}`
).join('\n') || '- None'}

AVAILABLE TECHNICIANS (${liveData.technicians?.length || 0}):
${(liveData.technicians || []).map(t =>
  `- ${t.firstName} ${t.lastName} | Skills: ${(t.specializations || []).join(', ') || 'General'} | Workload: ${t.currentWorkload || 0} tasks`
).join('\n') || '- None'}

=== END OF LIVE DATA ===

INSTRUCTIONS:
1. Use the live data above to provide accurate, context-aware answers
2. When asked "what to fix first", prioritize HIGH-priority issues
3. When assigning work, consider technician skills and current workload
4. Always mention if spare parts are low in stock
5. Be conversational but precise
6. If data is empty or unclear, acknowledge the limitation
7. Keep responses concise and actionable`;

    return basePrompt + contextString;
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
    
    // How-to intents
    if (/\bhow.*add|how.*create|where.*add|where.*create|how do i\b/.test(q)) {
      if (/\bmeter\b/.test(q)) return "how_to_add_meter";
      if (/\bwork\s?order\b/.test(q)) return "how_to_add_work_order";
      if (/\brequest\b/.test(q)) return "how_to_add_request";
      if (/\bpreventive|pm\b/.test(q)) return "how_to_add_pm";
      if (/\basset|equipment|device\b/.test(q)) return "how_to_add_asset";
      return "how_to_general";
    }
    
    // Priority/Action intents
    if (/\b(fix first|priority|urgent|critical|what.*fix|next.*do|should.*do)\b/.test(q)) return "get_priority";
    if (/\b(sla|breach|overdue|late)\b/.test(q)) return "get_sla_breaches";
    if (/\b(trend|pattern|recurring|repeated|common)\b/.test(q)) return "get_trends";
    if (/\b(performance|fastest|best|efficiency)\b/.test(q)) return "get_performance";
    
    // Data lookup intents
    if (/\b(issue|work\s?order|request|ticket|incident|task|job)\b/.test(q)) return "get_issues";
    if (/\b(property|location|building|site|facility|asset)\b/.test(q)) return "get_properties";
    if (/\b(technician|tech|worker|team|staff|person|people)\b/.test(q)) return "get_technicians";
    if (/\b(equipment|machine|device|meter)\b/.test(q)) return "get_assets";
    if (/\b(report|stats|analytics|metric|summary|status)\b/.test(q)) return "get_reports";
    
    // Counting/Summary intents
    if (/\b(how many|count|total|number|quantity)\b/.test(q)) return "count_items";
    if (/\b(status|progress|update|current|what.*happening)\b/.test(q)) return "get_status";
    
    return "general_question";
  }

  /**
   * Fuzzy match function - handles typos and variations
   * Returns true if the keyword is similar enough to any status
   */
  fuzzyMatch(text, matchAgainst) {
    const t = normalizeText(text);
    const m = normalizeText(matchAgainst);
    
    // Exact match
    if (t === m) return true;
    
    // Contains match
    if (m.includes(t) || t.includes(m)) return true;
    
    // Levenshtein-like: check if 80% of characters match
    const maxLen = Math.max(t.length, m.length);
    const minLen = Math.min(t.length, m.length);
    if (minLen / maxLen >= 0.8) return true;
    
    return false;
  }

  extractEntities(query) {
    const q = normalizeText(query);
    
    // Status mappings with semantic variations
    const statusMappings = {
      'COMPLETED': ['completed', 'finished', 'done', 'closed', 'resolved', 'finish', 'complete', 'finish up'],
      'OPEN': ['pending', 'waiting', 'new', 'open', 'unassigned', 'openned'],
      'PENDING': ['pending', 'waiting', 'upcoming', 'pend'],
      'IN_PROGRESS': ['in progress', 'inprogress', 'in-progress', 'ongoing', 'working', 'active', 'progress', 'in work', 'inwork'],
      'ON_HOLD': ['hold', 'on hold', 'suspended', 'paused', 'pause', 'hold up'],
      'CANCELLED': ['cancelled', 'canceled', 'rejected', 'denied', 'cancel', 'reject'],
    };
    
    // Extract status keywords - returns an array of applicable statuses
    const statuses = [];
    
    // Check each status mapping
    for (const [status, keywords] of Object.entries(statusMappings)) {
      for (const keyword of keywords) {
        if (this.fuzzyMatch(q, keyword)) {
          statuses.push(status);
          break; // Found this status, move to next status
        }
      }
    }
    
    // Check for priority-based statuses (urgent = OPEN + IN_PROGRESS)
    if (this.fuzzyMatch(q, 'urgent') || this.fuzzyMatch(q, 'high priority')) {
      if (!statuses.includes('OPEN')) statuses.push('OPEN');
      if (!statuses.includes('IN_PROGRESS')) statuses.push('IN_PROGRESS');
    }
    
    return {
      statuses: statuses.length > 0 ? [...new Set(statuses)] : null,  // Return unique statuses or null for all
      propertyName: q.match(/\bin\s+([a-zA-Z0-9\s]+)\b/)?.[1] || null,
      priority: (this.fuzzyMatch(q, 'high priority') || this.fuzzyMatch(q, 'urgent')) ? 'HIGH' 
                : this.fuzzyMatch(q, 'low priority') ? 'LOW' : null
    };
  }

  async chat(question = '', history = [], analyticsSummary = null, userRole = 'technician', companyId = null) {
    await this.init();
    const q = normalizeText(question);

    // Fallback to rule-based if neither Claude nor Gemini is available
    const fallback = () => this.ruleBasedChat(question, analyticsSummary);

    try {
      // Extract entities to determine data filtering (especially status)
      const entities = this.extractEntities(q);
      console.log('🔍 [AI] Extracted Entities:', { question, entities });
      
      // Fetch live data from MongoDB with smart status filtering
      const liveData = await this.getMaintenanceContext(companyId, entities.statuses);
      console.log('📊 [AI] Live Data Fetched:', {
        workOrdersCount: liveData.workOrders?.length || 0,
        assetsCount: liveData.assets?.length || 0,
        techniciansCount: liveData.technicians?.length || 0,
        spareParts: liveData.spareParts?.length || 0,
        statuses: entities.statuses,
        sample: liveData.workOrders?.[0] // Log first work order as sample
      });

      // If Claude is available, use it with injected context
      if (this.claudeClient) {
        const systemPrompt = this.buildSystemPromptWithContext(userRole, liveData);

        const messages = [
          ...history.map(m => ({
            role: m.role === 'user' ? 'user' : 'assistant',
            content: m.content
          })),
          { role: 'user', content: question }
        ];

        try {
          console.log('🤖 [Claude] Sending request with', liveData.workOrders?.length || 0, 'work orders');
          const response = await this.claudeClient.messages.create({
            model: 'claude-3-5-sonnet-20241022',
            max_tokens: 1024,
            system: systemPrompt,
            messages: messages
          });

          const result = response.content[0].type === 'text' ? response.content[0].text : 'Unable to generate response';
          console.log('✅ [Claude] Response generated successfully');
          return result;
        } catch (error) {
          console.error("❌ [Claude] API Error:", error.message);
          // Fall through to Gemini or rule-based
        }
      }

      // Fall back to Gemini if Claude is not available but Gemini is
      if (this.model) {
        const intent = this.detectIntent(q);

        const prompt = `
You are KAT, an intelligent maintenance AI assistant for the FixNest platform.
Your goal is to provide clear, data-driven answers to maintenance queries.

User Question: "${question}"
Detected Intent: ${intent}
Extracted Entities: ${JSON.stringify(entities)}

LIVE MAINTENANCE DATA:
${JSON.stringify(liveData, null, 2)}

HISTORICAL ANALYTICS:
${JSON.stringify(analyticsSummary, null, 2)}

INSTRUCTIONS:
1. Use both live and historical data to answer the question specifically.
2. Be professional, direct, and helpful.
3. If the user asks for "what to fix first", prioritize HIGH-priority issues from live data.
4. If you don't have enough data to answer specifically, explain what is missing.
5. Keep your response concise (max 3-4 paragraphs).

CONVERSATION HISTORY:
${history.map(m => `${m.role === 'user' ? 'User' : 'KAT'}: ${m.content}`).join('\n')}

Response:`;

        const result = await this.model.generateContent(prompt);
        const response = await result.response;
        return response.text().trim();
      }

      // Fall back to rule-based
      return fallback();
    } catch (error) {
      console.error("Chat Error:", error.message);
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

    // Greetings
    if (isGreeting(q) && !isMaintenanceQuestion(q)) return 'Hello! I can help with maintenance trends, risky properties, technician performance, SLA breaches, what to prioritize first, and how to use the system (add meters, create work orders, etc.).';
    if (isWellbeingQuestion(q) && !isMaintenanceQuestion(q)) return 'I am doing well and ready to help. Ask me about trends, recurring failures, or what to prioritize.';

    // ========================
    // HOW-TO / GUIDE QUESTIONS
    // ========================
    
    // Pattern matchers for "how to" questions
    const asksHowToAdd = (text) => /how.*add|how.*create|how.*submit|where.*add|where.*create|where to|how do i|can i/.test(text);
    const mentionsMeters = (text) => /meter|meters/.test(text);
    const mentionsRequests = (text) => /request|issue|complaint|report/.test(text);
    const mentionsWorkOrder = (text) => /work\s?order|task|job/.test(text);
    const mentionsPM = (text) => /preventive\s?maintenance|preventive|pm|scheduled|scheduled maintenance/.test(text);
    const mentionsAsset = (text) => /asset|equipment|property|device|edge device|meter/.test(text);
    const mentionsTechnician = (text) => /technician|tech|worker|staff|assign/.test(text);

    // How-to responses
    if (asksHowToAdd(q)) {
      if (mentionsMeters(q)) {
        return JSON.stringify({
          kind: 'action',
          content: `📊 How to Add a Meter:\n\n1. Go to the "Meters" tab in your dashboard\n2. Click "Add Meter" button\n3. Fill in meter details (name, location, type)\n4. Configure meter readings & alerts\n5. Save\n\nMeters help track consumption and identify anomalies. Click the button below to get started!`,
          action: { label: 'Open Meters', type: 'openMetersTab' }
        });
      }
      if (mentionsRequests(q)) {
        return JSON.stringify({
          kind: 'action',
          content: `📝 How to Create a Request:\n\n1. Go to "Requests" section\n2. Click "Create New Request"\n3. Select property & description\n4. Add priority level & due date\n5. Assign to technician (optional)\n6. Submit\n\nYour request will be queued for assignment. Ready to create one? Click below!`,
          action: { label: 'Open Request Form', type: 'openRequestForm' }
        });
      }
      if (mentionsWorkOrder(q)) {
        return JSON.stringify({
          kind: 'action',
          content: `📋 How to Create a Work Order:\n\n1. Go to "Work Orders" tab\n2. Click "Create Work Order"\n3. Select asset/location\n4. Enter issue description & priority\n5. Set due date\n6. Assign technician\n7. Save & track status\n\nWork orders are tracked in real-time. Let's create one!`,
          action: { label: 'Create Work Order', type: 'openWorkOrderDetailsForm' }
        });
      }
      if (mentionsPM(q)) {
        return JSON.stringify({
          kind: 'action',
          content: `🔄 How to Create Preventive Maintenance:\n\n1. Go to "Maintenance" → "Preventive"\n2. Click "Create PM Schedule"\n3. Select asset/property\n4. Set frequency (weekly, monthly, quarterly, etc.)\n5. Choose maintenance tasks\n6. Assign technician\n7. Save\n\nPMs help prevent breakdowns. Create one now!`,
          action: { label: 'Create Preventive', type: 'openCreatePm' }
        });
      }
      if (mentionsAsset(q)) {
        return JSON.stringify({
          kind: 'action',
          content: `🏢 How to Add an Asset:\n\n1. Go to "Assets" section\n2. Click "Add New Asset"\n3. Enter asset name, type, location\n4. Set condition & warranty info\n5. Attach documents (optional)\n6. Save\n\nAssets help track equipment. Ready to add one?`,
          action: { label: 'Add Asset', type: 'openAddAsset' }
        });
      }
      if (mentionsTechnician(q)) {
        return JSON.stringify({
          kind: 'action',
          content: `👥 How to Assign a Technician:\n\n1. Open work order/request\n2. Click "Assign Technician"\n3. Filter by skill/availability\n4. Select technician from list\n5. Confirm assignment\n6. Technician gets notification\n\nConsider workload when assigning. Manage your team!`,
          action: { label: 'Manage Team', type: 'openAddTechnician' }
        });
      }
      // Generic how-to fallback
      return JSON.stringify({
        kind: 'action',
        content: `📚 I can help you with:\n\n✓ How to add a meter\n✓ How to create a request\n✓ How to create a work order\n✓ How to set up preventive maintenance\n✓ How to add an asset\n✓ How to assign a technician\n\nWhich task would you like help with?`,
        action: null
      });
    }

    if (!summary || !summary.metrics) {
      return 'I am FixNest AI. I can answer general maintenance questions, but I need you to log in to access your specific company data and analytics.';
    }

    // ========================
    // IMPROVED QUESTION PATTERNS
    // ========================
    
    // Helper functions for better pattern matching
    const mentionsWorkOrders = (text) => /work\s?order|issue|ticket|request|task|job|maintenance\s?job/.test(text);
    const asksHowMany = (text) => /how many|number of|count|total|how much|how much \w+|quantity/.test(text);
    const asksAboutPriority = (text) => /priority|urgent|critical|important|first|next|should we fix|what to do/.test(text);
    const asksAboutProperty = (text) => /property|asset|location|facility|building|unit|area/.test(text);
    const asksAboutTechnician = (text) => /technician|tech|worker|team|staff|performance|fastest|best/.test(text);
    const asksAboutTrends = (text) => /trend|pattern|recurring|repeated|common|frequent|most|rise|increase|decrease/.test(text);
    const asksAboutStatus = (text) => /status|progress|update|done|completed|pending|open|ongoing|progress/.test(text);
    const asksAboutSLA = (text) => /sla|breach|overdue|late|timeline/.test(text);

    // Priority/What to fix first
    if (asksAboutPriority(q)) {
      if (highestPriority) {
        return `🚨 FIX FIRST: ${highestPriority.title}\n\nPriority: ${highestPriority.priority}\nLocation: ${highestPriority.assetName || 'Not specified'}\nDescription: ${highestPriority.description || 'No details'}\n\nRecommendation: Assign this immediately.`;
      }
      if (recommendations.length > 0) {
        return `Based on current data, I recommend:\n\n${recommendations.slice(0, 3).map((r, i) => `${i+1}. ${r}`).join('\n')}`;
      }
      return `Critical issues to address: ${metrics.slaBreaches || 0} SLA breaches detected. Open work orders: ${metrics.openIssues || 0}. Start with high-priority items.`;
    }

    // How many open/pending/unfinished
    if (asksHowMany(q) && mentionsWorkOrders(q)) {
      const openCount = metrics.openIssues || 0;
      const totalCount = metrics.totalIssues || 0;
      return `📊 Work Order Summary:\n\n✅ Open Work Orders: ${openCount}\n📋 Total Work Orders: ${totalCount}\n✔️ Completed: ${metrics.completedIssues || 0}\n⏱️ SLA Breaches: ${metrics.slaBreaches || 0}\n\nAction: Review and prioritize open items.`;
    }

    // Status overview
    if (asksAboutStatus(q)) {
      return `📈 Current Status:\n\n✅ Completed: ${metrics.completedIssues || 0}\n⏳ Open: ${metrics.openIssues || 0}\n📍 Total: ${metrics.totalIssues || 0}\n⚠️ SLA Breaches: ${metrics.slaBreaches || 0}\n\nNext Step: Focus on ${metrics.slaBreaches > 0 ? 'SLA breaches' : 'open work orders'}.`;
    }

    // Which property has most incidents
    if (asksAboutProperty(q) && (asksAboutTrends(q) || q.includes('most'))) {
      if (topProperty) {
        return `🏢 Top Property by Incidents:\n\n${topProperty.property}: ${topProperty.count || 'Multiple'} incidents\n\nThis property needs attention. Check recurring failure patterns there.`;
      }
      return `I cannot identify a top property from the current summary. Check your property maintenance records.`;
    }

    // Recurring issues/Trends
    if (asksAboutTrends(q) || q.includes('pattern')) {
      if (topRecurring) {
        return `🔄 Top Recurring Issue:\n\n${topRecurring.issue}: Occurs ${topRecurring.frequency || 'frequently'}\n\nRecommendation: Implement preventive maintenance for this issue type.\n\nAll recurring issues: ${recommendations.join(', ') || 'See dashboard'}`;
      }
      return `Trend Analysis: Review your frequent issues in the Trends section of the dashboard.`;
    }

    // Technician performance
    if (asksAboutTechnician(q)) {
      if (fastestTech) {
        return `⚡ Top Technician Performance:\n\nAverage Resolution Time: ${formatHours(fastestTech.averageResolutionHours)}\n\nThis technician is your fastest. Consider using them for urgent issues.`;
      }
      return `📊 Technician Performance: Review individual technician metrics in the Team Performance section.`;
    }

    // SLA breaches
    if (asksAboutSLA(q)) {
      const breachCount = metrics.slaBreaches || 0;
      if (breachCount > 0) {
        return `⚠️ SLA ALERT!\n\n🔴 Current Breaches: ${breachCount}\n\nImmediate Action: Review breached items and reassign to fastest technicians.\nPreventive: Implement better scheduling to avoid future breaches.`;
      }
      return `✅ Great news! No SLA breaches detected. Keep up the good work!`;
    }

    // Generic improvements - better fallback
    if (asksHowMany(q)) {
      return `📊 Summary:\n\n📋 Total Issues: ${metrics.totalIssues || 0}\n⏳ Open: ${metrics.openIssues || 0}\n✅ Completed: ${metrics.completedIssues || 0}\n⚠️ SLA Breaches: ${metrics.slaBreaches || 0}\n\nWould you like details about a specific category?`;
    }

    // Smart fallback - provide useful info instead of generic message
    return `📊 Dashboard Summary:\n\nTotal Issues: ${metrics.totalIssues || 0} | Open: ${metrics.openIssues || 0} | Completed: ${metrics.completedIssues || 0}\nSLA Breaches: ${metrics.slaBreaches || 0}\n\nI can help with:\n✉️ What to fix first?\n🏢 Which property has most incidents?\n⚡ Technician performance?\n🔄 Recurring issues?\n⚠️ SLA breaches?\n\nTry asking one of these questions!`;
  }
}

module.exports = new AIService();
