// MIA's conversational voice: greetings and small talk that sound like a colleague, built from
// varied phrasings plus a live look at the company's work. No external model is involved.

// The name users see. Change it here (or set ASSISTANT_NAME in .env).
const ASSISTANT_NAME = process.env.ASSISTANT_NAME || "Over";

const pick = (options) => options[Math.floor(Math.random() * options.length)];
const DONE = new Set(["COMPLETED", "COMPLETE", "DONE", "RESOLVED", "CLOSED"]);
const statusOf = (i) => String(i?.status || "OPEN").trim().toUpperCase().replace(/[_-]+/g, " ");
const isDone = (i) => DONE.has(statusOf(i));
const deadlineOf = (i) => { const d = new Date(i?.fixDeadline || i?.dueDate || ""); return Number.isNaN(d.getTime()) ? null : d; };
const isHigh = (i) => ["HIGH", "URGENT", "CRITICAL", "EMERGENCY"].includes(String(i?.priority || "").trim().toUpperCase());

const EXAMPLES = [
  "Show overdue work orders",
  "Which requests are pending?",
  "Assign the oldest overdue work order to John",
  "Mark the first 5 overdue work orders as in progress",
  "How much did we spend this month?",
  "Which assets keep breaking down?",
  "Prepare a maintenance report for management",
  "How often should air filters be replaced?",
];

const firstName = (user) => {
  const name = String(user?.name || "").trim();
  if (!name || name.includes("@")) return "";
  const first = name.split(/\s+/)[0];
  return first.charAt(0).toUpperCase() + first.slice(1);
};

const partOfDay = (hour) => {
  const h = Number.isInteger(hour) && hour >= 0 && hour <= 23 ? hour : new Date().getHours();
  if (h < 12) return "morning";
  if (h < 17) return "afternoon";
  return "evening";
};

// What needs attention right now, plus the command to offer.
function snapshot(issues = []) {
  const now = new Date();
  const open = issues.filter((i) => !isDone(i));
  const overdue = open.filter((i) => i?.overdue === true || (deadlineOf(i) && deadlineOf(i) < now)).length;
  const high = open.filter(isHigh).length;
  const endOfDay = new Date(now); endOfDay.setHours(23, 59, 59, 999);
  const dueToday = open.filter((i) => { const d = deadlineOf(i); return d && d >= now && d <= endOfDay; }).length;
  return { open: open.length, overdue, high, dueToday };
}

function attention(issues, hasCompany) {
  if (!hasCompany) return { text: pick(["How can I help you today?", "What can I do for you today?"]), suggestion: null };
  const s = snapshot(issues);
  const wo = (n) => `${n} work order${n === 1 ? "" : "s"}`;
  if (s.overdue) {
    const extra = s.high ? ` ${s.high === 1 ? "One open work order is" : `${s.high} open work orders are`} high priority.` : "";
    return {
      text: pick([
        `Quick heads-up: ${wo(s.overdue)} ${s.overdue === 1 ? "is" : "are"} overdue.${extra} Want me to show ${s.overdue === 1 ? "it" : "them"}?`,
        `You have ${wo(s.overdue)} past ${s.overdue === 1 ? "its" : "their"} due date.${extra} Shall I list ${s.overdue === 1 ? "it" : "them"} for you?`,
        `Just so you know, ${wo(s.overdue)} ${s.overdue === 1 ? "needs" : "need"} attention because ${s.overdue === 1 ? "it's" : "they're"} overdue. Would you like to see ${s.overdue === 1 ? "it" : "them"}?`,
      ]),
      suggestion: "show overdue work orders",
    };
  }
  if (s.dueToday) {
    return { text: `Nothing is overdue, nice work! ${wo(s.dueToday)} ${s.dueToday === 1 ? "is" : "are"} due today. Want to see ${s.dueToday === 1 ? "it" : "them"}?`, suggestion: "show open work orders" };
  }
  if (s.high) {
    return { text: `Nothing is overdue. ${s.high} high-priority work ${s.high === 1 ? "order is" : "orders are"} still open. Shall I show ${s.high === 1 ? "it" : "them"}?`, suggestion: "show high priority work orders" };
  }
  if (s.open) {
    return { text: pick(["Everything's on track, nothing is overdue. What can I do for you?", "All looks good, no overdue work. How can I help?"]), suggestion: null };
  }
  return { text: "There's no open work right now. What would you like to do?", suggestion: null };
}

function greeting({ word, user, issues, hasCompany, hour }) {
  const name = firstName(user);
  const w = String(word || "").toLowerCase();
  let opener;
  if (/^(sala|assalam)/.test(w)) opener = `Wa alaikum salam${name ? `, ${name}` : ""}!`;
  else if (w === "habari" || w === "jambo") opener = `Habari${name ? ` ${name}` : ""}! Nzuri sana.`;
  else if (w === "muraho") opener = `Muraho${name ? ` ${name}` : ""}!`;
  else if (w === "bonjour") opener = `Bonjour${name ? ` ${name}` : ""}!`;
  else if (w === "good") opener = `Good ${partOfDay(hour)}${name ? `, ${name}` : ""}!`;
  else opener = pick([`Hi${name ? ` ${name}` : ""}!`, `Hello${name ? ` ${name}` : ""}!`, `Hey${name ? ` ${name}` : ""}!`, `Good ${partOfDay(hour)}${name ? `, ${name}` : ""}!`]);
  const next = attention(issues, hasCompany);
  return { text: `${opener} ${next.text}`, suggestion: next.suggestion };
}

function smallTalk({ kind, user, issues, hasCompany, hour }) {
  const name = firstName(user);
  switch (kind) {
    case "how_are_you": {
      const next = attention(issues, hasCompany);
      return { text: `${pick(["I'm doing well, thanks for asking!", "All good here, thank you!", "Doing great, thanks!"])} ${next.text}`, suggestion: next.suggestion };
    }
    case "who_are_you":
      return { text: `I'm ${ASSISTANT_NAME}, FixNest's own maintenance assistant. I'm an AI, not a person. I was built and trained in-house by the FixNest team and I only work with your company's data. I can find, update and assign work orders, check costs, spot equipment that keeps failing and answer maintenance questions. What would you like to do?` };
    case "capabilities":
      return { text: `Here's what I can do for you:\n• Find work: "show overdue work orders", "which requests are pending?"\n• Create work: "create a work order, the pump in Block A is leaking" (add a photo with 📎 or 📷)
• Update and assign: "mark the first 5 overdue as in progress", "assign the oldest one to John" (I always ask before changing anything)\n• Costs and reports: "how much did we spend this month?", "prepare a report for management"\n• Reliability: "which assets keep breaking down?"\n• Maintenance know-how: "how often should air filters be replaced?"` };
    case "thanks":
      return { text: `${pick(["You're welcome!", "Happy to help!", "Anytime!", "My pleasure!"])}${pick([" Anything else?", " Let me know if you need anything else.", ""])}` };
    case "goodbye":
      return { text: pick(["Bye! Have a great day.", "See you later!", `Goodbye${name ? `, ${name}` : ""}! Enjoy the rest of your ${partOfDay(hour)}.`]) };
    case "affirm":
      return { text: pick(["Great! What would you like me to do?", "Sure, what do you need?"]) };
    case "deny":
      return { text: pick(["No problem.", "Alright.", "Okay."]) + " I'm here whenever you need me." };
    default:
      return { text: notUnderstood() };
  }
}

function notUnderstood() {
  const examples = [...EXAMPLES].sort(() => Math.random() - 0.5).slice(0, 3);
  return `${pick(["Sorry, I didn't quite catch that.", "Hmm, I'm not sure what you mean.", "I didn't understand that one, sorry."])} You could try:\n${examples.map((e) => `• ${e}`).join("\n")}`;
}

module.exports = { greeting, smallTalk, notUnderstood, _internal: { snapshot, firstName, partOfDay } };
