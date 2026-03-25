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
const mentionsWorkOrders = (text) => /work ?order|issue|ticket|job/.test(text);
const asksHowMany = (text) => /how many|number of|count of|how much|how\s+\w+\s+(do we have|are there|i have|we have)/.test(text);
const asksNotDone = (text) => /not done|not completed|unfinished|pending|open|remaining|left/.test(text);
const asksDone = (text) => /done|completed|finished|resolved|closed/.test(text);
const asksOverdue = (text) => /overdue|late|past due/.test(text);
const asksBreaches = (text) => /sla breach|breach|breached/.test(text);
const asksAverageResolution = (text) => /average resolution|avg resolution|resolution time|how long.*resolve|mean resolution/.test(text);
const asksTopProperty = (text) => /which property|top property|most incidents|highest incidents|risky property/.test(text);
const asksRecurring = (text) => /recurring|repeat|repeated|common issue|frequent issue/.test(text);
const asksTechnicianSpeed = (text) => /which technician|fastest technician|best technician|resolves fastest|technician performance/.test(text);
const asksTotalIssues = (text) => /total issues|total incidents|how many issues|how many incidents/.test(text);
const asksAssets = (text) => /how many assets|total assets/.test(text);
const asksProperties = (text) => /how many properties|total properties|locations do we have/.test(text);
const asksTechnicianCount = (text) => /how many technicians|active technicians|number of technicians|tech workers|technician workers|workers do we have|workers i have|team members|staff members|people.*tech|people.*worker|how many techs/.test(text);

class AIService {
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
      priority,
      category,
      suggestedTechnicianId: suggestedTechnician?.id || suggestedTechnician?._id || 'unassigned',
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

  chat(question = '', history = [], analyticsSummary = null) {
    const q = normalizeText(question);
    const summary = analyticsSummary || {};
    const metrics = summary.metrics || {};
    const topProperty = summary.topProperties?.[0];
    const topCategory = summary.topIssueCategories?.[0];
    const topRecurring = summary.recurringIssues?.[0];
    const fastestTech = (summary.technicianPerformance || []).find((entry) => entry.averageResolutionHours !== null && entry.averageResolutionHours !== undefined);
    const highestPriority = summary.highPriorityOpenIssues?.[0];
    const recommendations = Array.isArray(summary.recommendations) ? summary.recommendations : [];

    if (!summary || !summary.metrics) {
      return [
        'Direct answer: I do not have enough maintenance summary data yet.',
        'Key evidence: The analytics summary is missing.',
        'Recommended next actions: Load issue, property, technician, and SLA data first.',
        'Risks/prediction: Without current analytics, any recommendation would be a guess.'
      ].join('\n\n');
    }

    if (isGreeting(q) && !isMaintenanceQuestion(q)) {
      return 'Hello! I can help with maintenance trends, risky properties, technician performance, SLA breaches, and what to prioritize first.';
    }

    if (isWellbeingQuestion(q) && !isMaintenanceQuestion(q)) {
      return 'I am doing well and ready to help. You can ask me about incident trends, repeated failures, technician performance, or what your team should prioritize.';
    }

    if (isThanks(q) && !isMaintenanceQuestion(q)) {
      return 'You are welcome. If you want, ask me which property is riskiest, which issues repeat most, or what should be fixed first.';
    }

    if (!isMaintenanceQuestion(q) && q.length <= 25) {
      return 'I can help with maintenance insights. Try asking: which property has the most incidents, why issues are increasing, who resolves fastest, or what should be prioritized first.';
    }

    if (asksHowMany(q) && mentionsWorkOrders(q) && asksNotDone(q)) {
      return [
        `Direct answer: ${metrics.openIssues || 0} work orders are not done yet.`,
        `Key evidence: ${metrics.totalIssues || 0} total issues, ${metrics.completedIssues || 0} completed, leaving ${metrics.openIssues || 0} still open.`,
        `Recommended next actions: ${recommendations[0] || 'Review open high-priority and overdue work orders first.'}`,
        `Risks/prediction: ${metrics.slaBreaches ? `${metrics.slaBreaches} of the open or recent issues are already affecting SLA performance.` : 'If open work keeps growing, SLA pressure will increase.'}`
      ].join('\n\n');
    }

    if (asksHowMany(q) && mentionsWorkOrders(q) && asksDone(q)) {
      return [
        `Direct answer: ${metrics.completedIssues || 0} work orders are completed.`,
        `Key evidence: ${metrics.totalIssues || 0} total issues and ${metrics.completedIssues || 0} completed work orders in the current summary.`,
        'Recommended next actions: Compare completed volume against open and overdue work to balance the team.',
        'Risks/prediction: If completed work grows slower than new requests, the backlog will continue to rise.'
      ].join('\n\n');
    }

    if (asksOverdue(q) && mentionsWorkOrders(q)) {
      return [
        `Direct answer: ${metrics.slaBreaches || 0} work orders are overdue or beyond SLA.`,
        `Key evidence: Open issues ${metrics.openIssues || 0}, SLA breaches ${metrics.slaBreaches || 0}.`,
        `Recommended next actions: ${recommendations[0] || 'Dispatch overdue high-priority jobs first and rebalance technician assignments.'}`,
        'Risks/prediction: Overdue work orders are the clearest sign of rising service risk and customer dissatisfaction.'
      ].join('\n\n');
    }

    if (asksBreaches(q)) {
      return [
        `Direct answer: There are ${metrics.slaBreaches || 0} SLA breaches right now.`,
        `Key evidence: ${metrics.totalIssues || 0} total issues, ${metrics.openIssues || 0} open, with ${metrics.slaBreaches || 0} breaches.`,
        `Recommended next actions: ${recommendations[0] || 'Audit delayed work, review deadlines, and prioritize breached jobs.'}`,
        'Risks/prediction: More breaches usually lead to slower response confidence and a growing backlog.'
      ].join('\n\n');
    }

    if (asksAverageResolution(q)) {
      return [
        `Direct answer: The average resolution time is ${formatHours(metrics.avgResolutionHours)}.`,
        `Key evidence: ${metrics.completedIssues || 0} completed work orders were used to estimate the current average.`,
        'Recommended next actions: Review jobs with the longest completion cycles and check whether delay comes from dispatch, parts, or repeated rework.',
        'Risks/prediction: If average resolution stays high, SLA breaches and backlog growth become more likely.'
      ].join('\n\n');
    }

    if (asksTotalIssues(q)) {
      return [
        `Direct answer: There are ${metrics.totalIssues || 0} total issues in the current summary.`,
        `Key evidence: ${metrics.openIssues || 0} are open and ${metrics.completedIssues || 0} are completed.`,
        'Recommended next actions: Break the total down by property, category, and priority to decide where to focus first.',
        'Risks/prediction: Total volume matters less than recurrence and overdue concentration, so review those next.'
      ].join('\n\n');
    }

    if (asksAssets(q)) {
      return [
        `Direct answer: There are ${metrics.totalAssets || 0} assets in the current maintenance summary.`,
        `Key evidence: The analytics summary is currently tracking ${metrics.totalAssets || 0} assets.`,
        'Recommended next actions: Review which assets are linked to recurring incidents and schedule preventive checks for the riskiest ones.',
        'Risks/prediction: Assets with repeated failures are more likely to generate avoidable downtime if preventive work is delayed.'
      ].join('\n\n');
    }

    if (asksProperties(q)) {
      return [
        `Direct answer: There are ${metrics.totalProperties || 0} properties in the current summary.`,
        `Key evidence: The maintenance analytics summary is built across ${metrics.totalProperties || 0} properties.`,
        `Recommended next actions: ${topProperty ? `Start by reviewing ${topProperty.property}, which currently has the highest incident count.` : 'Compare incident counts across locations to spot the riskiest property.'}`,
        'Risks/prediction: A small number of properties often drive most incidents, so hotspot analysis matters more than raw property count.'
      ].join('\n\n');
    }

    if (asksTechnicianCount(q)) {
      return [
        `Direct answer: There are ${metrics.activeTechnicians || 0} company workers in your People and Team setup.`,
        `Key evidence: The maintenance analytics summary found ${metrics.totalCompanyWorkers || metrics.activeTechnicians || 0} worker accounts in your company and ${metrics.activeTechnicians || 0} are being used for workforce capacity.`,
        'Recommended next actions: Compare your worker count against open work orders and overdue jobs to see if workload is balanced.',
        'Risks/prediction: If open work rises much faster than available company workers, backlog and breaches will increase.'
      ].join('\n\n');
    }

    if (q.includes('why') && (q.includes('electrical') || q.includes('issue'))) {
      return [
        `Direct answer: ${topCategory ? `${topCategory.category} is currently the most frequent issue category.` : 'The current issue mix suggests repeated operational faults rather than isolated incidents.'}`,
        `Key evidence: Total issues ${metrics.totalIssues || 0}, open issues ${metrics.openIssues || 0}, top property ${topProperty?.property || 'not enough data'}, recurring pattern ${topRecurring ? `${topRecurring.category} at ${topRecurring.property} (${topRecurring.count} incidents)` : 'not enough data'}.`,
        `Recommended next actions: ${topRecurring ? `Schedule preventive maintenance at ${topRecurring.property} and inspect the root cause of repeated ${topRecurring.category.toLowerCase()} issues.` : 'Review recent issue logs by category and inspect the highest-risk property first.'}`,
        `Risks/prediction: ${topRecurring?.prediction || 'If repeated issues are not handled with preventive work, incident volume is likely to stay high.'}`
      ].join('\n\n');
    }

    if (q.includes('which property') || q.includes('most incidents') || q.includes('highest incidents')) {
      return [
        `Direct answer: ${topProperty ? `${topProperty.property} has the most incidents.` : 'I cannot identify a top property from the current summary.'}`,
        `Key evidence: ${topProperty ? `${topProperty.property} has ${topProperty.incidentCount} incidents.` : 'No property incident ranking is available.'}`,
        `Recommended next actions: ${topProperty ? `Inspect ${topProperty.property}, review its repeated issue categories, and assign preventive checks there first.` : 'Refresh property-linked issue data and compare incidents by location.'}`,
        'Risks/prediction: Properties with the highest repeat incident counts usually continue generating more work orders unless the underlying cause is fixed.'
      ].join('\n\n');
    }

    if (asksRecurring(q)) {
      return [
        `Direct answer: ${topRecurring ? `${topRecurring.category} at ${topRecurring.property} is the strongest recurring issue pattern.` : 'No strong recurring issue pattern is available right now.'}`,
        `Key evidence: ${topRecurring ? `${topRecurring.count} related incidents were detected for that pattern.` : 'No repeated issue cluster met the recurrence threshold.'}`,
        `Recommended next actions: ${topRecurring?.prediction || 'Inspect recent issues by category and property to identify a preventive-maintenance target.'}`,
        'Risks/prediction: Repeated issues usually continue until the underlying asset, location, or process problem is fixed.'
      ].join('\n\n');
    }

    if (q.includes('what should we fix first') || q.includes('prioritize') || q.includes('priority')) {
      return [
        `Direct answer: Start with high-priority open work orders and SLA-breached jobs${highestPriority ? `, beginning with ${highestPriority.title}` : ''}.`,
        `Key evidence: Open issues ${metrics.openIssues || 0}, SLA breaches ${metrics.slaBreaches || 0}, average resolution time ${formatHours(metrics.avgResolutionHours)}.`,
        `Recommended next actions: ${highestPriority ? `Dispatch ${highestPriority.title} at ${highestPriority.property} first, then address recurring hotspots.` : recommendations[0] || 'Review urgent open work and repeated-failure locations first.'}`,
        'Risks/prediction: Delaying breached or high-priority work increases customer dissatisfaction and raises the chance of repeat failures.'
      ].join('\n\n');
    }

    if (q.includes('technician') && (q.includes('fast') || q.includes('resolve') || q.includes('best'))) {
      return [
        `Direct answer: ${fastestTech ? `${fastestTech.technicianName} is currently the fastest based on average resolution time.` : 'I do not have enough technician performance data yet.'}`,
        `Key evidence: ${fastestTech ? `${fastestTech.technicianName} averages ${formatHours(fastestTech.averageResolutionHours)} across ${fastestTech.completedCount} completed jobs.` : 'No completed technician performance records were found.'}`,
        'Recommended next actions: Review the fastest technician’s workflow and reuse those dispatch or execution patterns across the team.',
        'Risks/prediction: If slow jobs continue clustering with the same bottlenecks, average cycle time and SLA breaches will increase.'
      ].join('\n\n');
    }

    if (q.includes('sla')) {
      return [
        `Direct answer: There are currently ${metrics.slaBreaches || 0} SLA breaches.`,
        `Key evidence: Total issues ${metrics.totalIssues || 0}, open issues ${metrics.openIssues || 0}, average resolution time ${formatHours(metrics.avgResolutionHours)}.`,
        `Recommended next actions: ${recommendations[0] || 'Audit overdue jobs, rebalance assignments, and review deadline-setting accuracy.'}`,
        'Risks/prediction: If breached work orders are not reduced, customer trust and operational response quality will decline.'
      ].join('\n\n');
    }

    return [
      `Direct answer: Here is the current maintenance picture based on your system data.`,
      `Key evidence: ${metrics.totalIssues || 0} total issues, ${metrics.openIssues || 0} open, ${metrics.completedIssues || 0} completed, ${metrics.slaBreaches || 0} SLA breaches, average resolution time ${formatHours(metrics.avgResolutionHours)}.`,
      `Recommended next actions: ${(recommendations || []).slice(0, 2).join(' ') || 'Focus on recurring issue hotspots and overdue high-priority work orders.'}`,
      `Risks/prediction: ${topRecurring?.prediction || 'Repeated issue categories and overdue jobs are the strongest signals of future maintenance pressure.'}`
    ].join('\n\n');
  }
}

module.exports = new AIService();
