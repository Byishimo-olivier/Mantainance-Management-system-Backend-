// MIA action engine: turns the AI service's structured intent into an answer built from the
// company's real records. It never writes to the database. Changes are returned as a confirmation
// card; the user's click calls the normal protected issue routes (ownership + role checks apply).
const client = require("./mia.client");
const persona = require("./mia.persona");

const TABLE_LIMIT = 10;
const MAX_BULK = 50; // most records one confirmation may change
const DONE = new Set(["COMPLETED", "COMPLETE", "DONE", "RESOLVED", "CLOSED"]);
const STATUS_MATCH = {
  Open: ["OPEN", "NEW"],
  Pending: ["PENDING", "AWAITING APPROVAL", "WAITING"],
  "In Progress": ["IN PROGRESS", "INPROGRESS", "STARTED"],
  "On Hold": ["ON HOLD", "ONHOLD", "PAUSED"],
  Completed: ["COMPLETED", "COMPLETE", "DONE", "RESOLVED"],
  Closed: ["CLOSED"],
};
// The value the backend stores (issue.controller upper-cases status on update).
const STATUS_STORE = { Open: "OPEN", Pending: "PENDING", "In Progress": "IN PROGRESS", "On Hold": "ON HOLD", Completed: "COMPLETED", Closed: "CLOSED" };
const WORKER_ROLES = new Set(["technician", "internal", "manager", "admin", "staff", "client"]);
const STOPWORDS = new Set(["the", "a", "an", "for", "of", "on", "in", "at", "to", "and", "work", "order", "request", "job", "task", "one"]);

// ---------- record helpers ----------
const norm = (v) => String(v || "").trim().toUpperCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
const idOf = (r) => String(r?.id || r?._id || r?.userId || "");
const toDate = (v) => { if (!v) return null; const d = new Date(v); return Number.isNaN(d.getTime()) ? null : d; };
const statusOf = (issue) => norm(issue?.status) || "OPEN";
const isDone = (issue) => DONE.has(statusOf(issue));
const deadlineOf = (issue) => toDate(issue?.fixDeadline || issue?.dueDate);
const createdOf = (issue) => toDate(issue?.createdAt || issue?.date);
const isOverdue = (issue, now = new Date()) => !isDone(issue) && (issue?.overdue === true || Boolean(deadlineOf(issue) && deadlineOf(issue) < now));
const priorityOf = (issue) => {
  const p = norm(issue?.priority);
  if (["HIGH", "URGENT", "CRITICAL", "EMERGENCY"].includes(p)) return "High";
  return p === "LOW" ? "Low" : "Medium";
};
const statusLabel = (issue) => {
  const s = statusOf(issue);
  const hit = Object.entries(STATUS_MATCH).find(([, values]) => values.includes(s));
  return hit ? hit[0] : s.charAt(0) + s.slice(1).toLowerCase();
};
const shortRef = (issue) => `#${idOf(issue).slice(-6).toUpperCase()}`;
const titleOf = (issue) => String(issue?.title || "Untitled").trim();
const assetOf = (issue) => String(issue?.asset?.name || issue?.assetName || "").trim();
const locationOf = (issue) => String(issue?.property?.name || issue?.propertyName || issue?.location || "").trim();
const assigneeOf = (issue) => {
  const list = Array.isArray(issue?.assignees) ? issue.assignees : [];
  const fromList = list.map((a) => (typeof a === "string" ? "" : a?.name || [a?.firstName, a?.lastName].filter(Boolean).join(" "))).filter(Boolean);
  if (fromList.length) return fromList.join(", ");
  return issue?.assignedTo?.name || issue?.assignedTechnicianName || issue?.technicianName || "";
};
const personName = (u) => String(u?.name || [u?.firstName, u?.lastName].filter(Boolean).join(" ") || u?.email || "").trim();
const pad = (n) => String(n).padStart(2, "0");
const fmtDate = (d) => (d ? `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` : "-"); // server local date
const money = (n) => Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
const cell = (v) => String(v === undefined || v === null || v === "" ? "-" : v).replace(/\|/g, "/").replace(/\s+/g, " ").slice(0, 48);

const table = (headers, rows) => [
  `| ${headers.join(" | ")} |`,
  `| ${headers.map(() => "---").join(" | ")} |`,
  ...rows.map((r) => `| ${r.map(cell).join(" | ")} |`),
].join("\n");

const issueTable = (issues, now) => table(
  ["Ref", "Title", "Status", "Priority", "Due", "Assignee"],
  issues.slice(0, TABLE_LIMIT).map((i) => [
    shortRef(i), titleOf(i), statusLabel(i), priorityOf(i),
    `${fmtDate(deadlineOf(i))}${isOverdue(i, now) ? " (overdue)" : ""}`, assigneeOf(i),
  ]),
);

// Due date first (soonest at the top, no due date last), then newest.
const sortIssues = (issues) => [...issues].sort((a, b) => {
  const da = deadlineOf(a)?.getTime() ?? Infinity;
  const db = deadlineOf(b)?.getTime() ?? Infinity;
  if (da !== db) return da - db;
  return (createdOf(b)?.getTime() || 0) - (createdOf(a)?.getTime() || 0);
});

const periodRange = (period, now = new Date()) => {
  const y = now.getFullYear(); const m = now.getMonth(); const d = now.getDate();
  const dow = (now.getDay() + 6) % 7; // Monday = 0
  const q = Math.floor(m / 3) * 3;
  const ranges = {
    today: [new Date(y, m, d), now, "today"],
    yesterday: [new Date(y, m, d - 1), new Date(y, m, d), "yesterday"],
    this_week: [new Date(y, m, d - dow), now, "this week"],
    last_week: [new Date(y, m, d - dow - 7), new Date(y, m, d - dow), "last week"],
    this_month: [new Date(y, m, 1), now, "this month"],
    last_month: [new Date(y, m - 1, 1), new Date(y, m, 1), "last month"],
    this_quarter: [new Date(y, q, 1), now, "this quarter"],
    last_quarter: [new Date(y, q - 3, 1), new Date(y, q, 1), "last quarter"],
    this_year: [new Date(y, 0, 1), now, "this year"],
    last_year: [new Date(y - 1, 0, 1), new Date(y, 0, 1), "last year"],
  };
  const r = ranges[period];
  return r ? { from: r[0], to: r[1], label: r[2] } : null;
};
const inRange = (issue, range) => {
  if (!range) return true;
  const c = createdOf(issue);
  return Boolean(c && c >= range.from && c <= range.to);
};

async function remember(ctx, issues) {
  if (!ctx.sessionId) return;
  try {
    await client.reportResults(ctx.sessionId, issues.map(idOf));
  } catch (err) {
    console.warn("MIA: could not store conversation results:", err.message);
  }
}

// ---------- finding the record a command is about ----------
function findIssueById(recordId, issues) {
  const id = String(recordId || "");
  if (id.startsWith("#")) {
    const suffix = id.slice(1).toLowerCase();
    return issues.filter((i) => idOf(i).toLowerCase().endsWith(suffix));
  }
  return issues.filter((i) => idOf(i) === id);
}

function searchIssues(query, issues) {
  const words = String(query || "").toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2 && !STOPWORDS.has(w));
  if (!words.length) return [];
  const scored = issues.map((issue) => {
    const title = titleOf(issue).toLowerCase();
    const other = `${assetOf(issue)} ${locationOf(issue)} ${issue?.description || ""}`.toLowerCase();
    const score = words.reduce((s, w) => s + (title.includes(w) ? 2 : other.includes(w) ? 1 : 0), 0)
      + (isDone(issue) ? 0 : 0.5); // prefer work that is still open
    return { issue, score };
  }).filter((x) => x.score >= Math.max(2, words.length));
  scored.sort((a, b) => b.score - a.score);
  return scored;
}

async function resolveTarget(ctx) {
  const e = ctx.entities;
  if (e.record_id) {
    const found = findIssueById(e.record_id, ctx.issues);
    if (found.length === 1) return { issue: found[0] };
    if (found.length > 1) return { reply: `More than one record matches ${e.record_id}. Please use a longer reference.` };
    return { reply: `I couldn't find ${e.record_id.startsWith("#") ? e.record_id : `"${e.record_id}"`} in your company's work orders.` };
  }
  if (e.record_query) {
    const scored = searchIssues(e.record_query, ctx.issues);
    if (!scored.length) return { reply: `I couldn't find a work order matching "${e.record_query}".` };
    if (scored.length === 1 || scored[0].score > scored[1].score) return { issue: scored[0].issue };
    const candidates = scored.filter((s) => s.score === scored[0].score).map((s) => s.issue);
    await remember(ctx, candidates);
    return { reply: `Several work orders match "${e.record_query}". Which one do you mean? You can say "the first one" or use the reference.\n\n${issueTable(candidates, new Date())}` };
  }
  if (e.reference) {
    return { reply: "I'm not sure which work order you mean. Ask me to show a list first, or use its reference, for example #3F9A2C." };
  }
  return { reply: "Which work order do you mean? Give me its reference (for example #3F9A2C) or ask me to list them first." };
}

const confirmCard = (content, label, method, url, body, successMessage) => ({
  kind: "confirm",
  content,
  confirm: { label, method, url, body, successMessage },
});

// One confirmation that changes several records; the frontend runs the calls one by one.
const bulkConfirmCard = (content, label, requests, successMessage) => ({
  kind: "confirm",
  content,
  confirm: { label, requests, successMessage },
});

const filterIssues = (issues, f = {}, now = new Date()) => {
  const range = periodRange(f.period, now);
  const wanted = f.status ? STATUS_MATCH[f.status] || [norm(f.status)] : null;
  return issues.filter((i) => (
    (!wanted || wanted.includes(statusOf(i)))
    && (!f.overdue || isOverdue(i, now))
    && (!f.priority || priorityOf(i) === f.priority)
    && inRange(i, range)
  ));
};

const isBulk = (e) => Boolean(e.selection || Array.isArray(e.record_ids));

// Records chosen by "the first 10 overdue work orders", "all open requests" or "them".
async function resolveMany(ctx) {
  const e = ctx.entities;
  const sel = e.selection || {};
  let rows;
  if (Array.isArray(e.record_ids)) {
    const byId = new Map(ctx.issues.map((i) => [idOf(i), i]));
    rows = e.record_ids.map((id) => byId.get(String(id))).filter(Boolean);
  } else {
    const filters = sel.filters || {};
    rows = filterIssues(ctx.issues, filters);
    if (sel.order === "oldest" || sel.order === "newest") {
      const dir = sel.order === "oldest" ? 1 : -1;
      rows = [...rows].sort((a, b) => dir * ((createdOf(a)?.getTime() || 0) - (createdOf(b)?.getTime() || 0)));
    } else {
      rows = sortIssues(rows);
    }
    // Without an explicit status, never sweep finished work into a bulk change.
    if (!filters.status) rows = rows.filter((i) => !isDone(i));
    if (sel.limit) rows = rows.slice(0, sel.limit);
  }
  const orderNote = sel.order === "oldest" ? " (oldest first)" : sel.order === "newest" ? " (newest first)" : "";
  const phrase = (n) => `${describeFilters({ ...(sel.filters || {}), record_type: e.record_type }, n)}${orderNote}`;
  if (!rows.length) return { reply: `There are no ${phrase(0)} to change.` };
  if (rows.length > MAX_BULK) {
    return { reply: `That would change ${rows.length} ${phrase(rows.length)}. I can change at most ${MAX_BULK} at a time; say for example "the first ${MAX_BULK}".` };
  }
  return { rows, phrase };
}

// "The oldest overdue open work order is #A1B2C3 "Pump leak" (created 2026-10-02, due 2026-10-09)."
function oneRecordIntro(ctx, issue) {
  const sel = ctx.entities.selection || {};
  const which = sel.order === "oldest" ? "oldest " : sel.order === "newest" ? "newest " : "";
  const what = describeFilters({ ...(sel.filters || {}), record_type: ctx.entities.record_type }, 1);
  const dates = [`created ${fmtDate(createdOf(issue))}`, deadlineOf(issue) ? `due ${fmtDate(deadlineOf(issue))}` : null].filter(Boolean).join(", ");
  const intro = sel.limit === 1 ? `The ${which}${what} is` : "That is";
  return `${intro} ${shortRef(issue)} "${titleOf(issue)}" (${dates}).`;
}

const listPreview = (rows, now = new Date()) => `${issueTable(rows, now)}${rows.length > TABLE_LIMIT ? `\n\n…and ${rows.length - TABLE_LIMIT} more.` : ""}`;

// ---------- intent handlers ----------
function describeFilters(e, count) {
  const parts = [];
  if (e.overdue) parts.push("overdue");
  if (e.status) parts.push(e.status.toLowerCase());
  if (e.priority) parts.push(`${e.priority.toLowerCase()}-priority`);
  const noun = e.record_type === "request" ? "request" : "work order";
  const range = periodRange(e.period);
  return `${parts.length ? `${parts.join(" ")} ` : ""}${count === 1 ? noun : `${noun}s`}${range ? ` created ${range.label}` : ""}`;
}

async function listRecords(ctx) {
  const e = ctx.entities;
  const now = new Date();
  const rows = sortIssues(filterIssues(ctx.issues, e, now));
  await remember(ctx, rows);

  const phrase = describeFilters(e, rows.length);
  const lead = e.scope === "previous_results" ? "Of those, " : "";
  if (e.count_only) return `${lead}${lead ? "y" : "Y"}ou have ${rows.length} ${phrase}.`;
  if (!rows.length) return `${lead}${lead ? "t" : "T"}here are no ${describeFilters(e, 0)} right now.`;
  const more = rows.length > TABLE_LIMIT ? ` Here are the first ${TABLE_LIMIT}:` : "";
  return `${lead}I found ${rows.length} ${phrase}.${more}\n\n${issueTable(rows, now)}`;
}

async function getRecord(ctx) {
  const target = await resolveTarget(ctx);
  if (target.reply) return target.reply;
  const i = target.issue;
  await remember(ctx, [i]);
  const lines = [
    `${shortRef(i)} — ${titleOf(i)}`,
    `Status: ${statusLabel(i)} · Priority: ${priorityOf(i)}`,
    `Location: ${locationOf(i) || "-"} · Asset: ${assetOf(i) || "-"}`,
    `Due: ${fmtDate(deadlineOf(i))}${isOverdue(i) ? " (overdue)" : ""} · Assigned to: ${assigneeOf(i) || "nobody yet"}`,
    `Created: ${fmtDate(createdOf(i))}`,
  ];
  if (Number(i.totalCost)) lines.push(`Total cost: ${money(i.totalCost)}`);
  return lines.join("\n");
}

async function updateStatus(ctx) {
  if (ctx.role === "requestor") return "Only maintenance staff can change the status of a work order.";
  const next = ctx.entities.new_status;
  const stored = STATUS_STORE[next];
  if (!stored) {
    return "Which status should I set? I can use Open, Pending, In Progress, On Hold, Completed or Closed.";
  }

  if (isBulk(ctx.entities)) {
    const many = await resolveMany(ctx);
    if (many.reply) return many.reply;
    const changing = many.rows.filter((r) => statusOf(r) !== stored);
    if (!changing.length) return `All ${plural(many.rows.length, "selected work order")} are already ${next}.`;
    await remember(ctx, changing);
    const skipped = many.rows.length - changing.length;
    if (many.rows.length === 1) {
      const one = changing[0];
      return confirmCard(
        `${oneRecordIntro(ctx, one)} Change it from ${statusLabel(one)} to ${next}?`,
        `Yes, set to ${next}`,
        "PUT", `/api/issues/${idOf(one)}`, { status: stored },
        `Done. ${shortRef(one)} is now ${next}.`,
      );
    }
    return bulkConfirmCard(
      `Change ${changing.length} ${many.phrase(changing.length)} to ${next}?${skipped ? ` (${skipped} already ${next}, left as is.)` : ""}\n\n${listPreview(changing)}`,
      `Yes, update ${changing.length}`,
      changing.map((r) => ({ method: "PUT", url: `/api/issues/${idOf(r)}`, body: { status: stored } })),
      `Done. ${plural(changing.length, "work order")} set to ${next}.`,
    );
  }

  const target = await resolveTarget(ctx);
  if (target.reply) return target.reply;
  const i = target.issue;
  await remember(ctx, [i]);
  if (statusOf(i) === stored) return `${shortRef(i)} "${titleOf(i)}" is already ${next}.`;
  return confirmCard(
    `Change ${shortRef(i)} "${titleOf(i)}" from ${statusLabel(i)} to ${next}?`,
    `Yes, set to ${next}`,
    "PUT", `/api/issues/${idOf(i)}`, { status: stored },
    `Done. ${shortRef(i)} is now ${next}.`,
  );
}

function findPeople(name, users) {
  const tokens = String(name || "").toLowerCase().split(/\s+/).filter(Boolean);
  return users.filter((u) => {
    const parts = personName(u).toLowerCase().split(/\s+/);
    return tokens.every((t) => parts.some((p) => p.startsWith(t)));
  });
}

async function assignRecord(ctx) {
  if (ctx.role === "requestor") return "Only maintenance staff can assign work orders.";
  let rows = null;
  let phrase = null;
  let i = null;
  if (isBulk(ctx.entities)) {
    const many = await resolveMany(ctx);
    if (many.reply) return many.reply;
    ({ rows, phrase } = many);
  } else {
    const target = await resolveTarget(ctx);
    if (target.reply) return target.reply;
    i = target.issue;
  }
  await remember(ctx, rows || [i]);

  let person;
  if (ctx.entities.assignee === "self") {
    person = { id: ctx.userId, name: "you" };
  } else {
    const workers = ctx.companyUsers.filter((u) => WORKER_ROLES.has(String(u?.role || "").toLowerCase()) && idOf(u));
    const matches = findPeople(ctx.entities.assignee, workers);
    if (!matches.length) return `I couldn't find anyone called "${ctx.entities.assignee}" in your company's team.`;
    if (matches.length > 1) {
      return `More than one person matches "${ctx.entities.assignee}": ${matches.slice(0, 6).map(personName).join(", ")}. Please use the full name.`;
    }
    person = { id: idOf(matches[0]), name: personName(matches[0]) };
  }
  if (["technician", "internal"].includes(ctx.role) && person.id !== ctx.userId) {
    return "Technicians can only assign work orders to themselves. Ask your manager to assign it to someone else.";
  }
  if (rows && rows.length === 1) {
    const one = rows[0];
    return confirmCard(
      `${oneRecordIntro(ctx, one)} Assign it to ${person.name}?${assigneeOf(one) ? ` It is currently assigned to ${assigneeOf(one)}.` : ""}`,
      "Yes, assign",
      "POST", `/api/issues/${idOf(one)}/assign`, { techId: person.id },
      `Done. ${shortRef(one)} is assigned to ${person.name}.`,
    );
  }
  if (rows) {
    return bulkConfirmCard(
      `Assign ${rows.length} ${phrase(rows.length)} to ${person.name}?\n\n${listPreview(rows)}`,
      `Yes, assign ${rows.length}`,
      rows.map((r) => ({ method: "POST", url: `/api/issues/${idOf(r)}/assign`, body: { techId: person.id } })),
      `Done. ${plural(rows.length, "work order")} assigned to ${person.name}.`,
    );
  }
  return confirmCard(
    `Assign ${shortRef(i)} "${titleOf(i)}" to ${person.name}?${assigneeOf(i) ? ` It is currently assigned to ${assigneeOf(i)}.` : ""}`,
    "Yes, assign",
    "POST", `/api/issues/${idOf(i)}/assign`, { techId: person.id },
    `Done. ${shortRef(i)} is assigned to ${person.name}.`,
  );
}

function costSummary(ctx) {
  const e = ctx.entities;
  const range = periodRange(e.period);
  const rows = ctx.issues.filter((i) => inRange(i, range));
  const label = range ? range.label : "in total (all time)";
  const sum = (key) => rows.reduce((s, i) => s + (Number(i[key]) || 0), 0);
  const total = sum("totalCost");
  if (!rows.length) return `There are no work orders ${range ? `created ${range.label}` : "yet"}, so there is no maintenance cost to report.`;
  if (!total) return `No costs have been recorded on the ${plural(rows.length, "work order")} ${range ? `created ${range.label}` : "so far"}.`;

  let text = `Maintenance spending ${label}: ${money(total)} across ${plural(rows.length, "work order")}.\n`
    + `Labor ${money(sum("laborCost"))} · Parts ${money(sum("partsCost"))} · Other ${money(sum("otherCost"))}`;
  if (e.group_by) {
    const keyOf = {
      asset: (i) => assetOf(i) || "No asset",
      location: (i) => locationOf(i) || "No location",
      property: (i) => locationOf(i) || "No location",
      category: (i) => i.category || "Uncategorised",
      technician: (i) => assigneeOf(i) || "Unassigned",
    }[e.group_by] || ((i) => assetOf(i) || "No asset");
    const groups = new Map();
    rows.forEach((i) => { const k = keyOf(i); groups.set(k, (groups.get(k) || 0) + (Number(i.totalCost) || 0)); });
    const top = [...groups.entries()].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).slice(0, TABLE_LIMIT);
    const heading = e.group_by.charAt(0).toUpperCase() + e.group_by.slice(1);
    text += `\n\n${table([heading, "Cost"], top.map(([k, v]) => [k, money(v)]))}`;
  }
  return text;
}

function failureGroups(issues) {
  const groups = new Map();
  issues.forEach((i) => {
    const asset = assetOf(i);
    if (!asset) return;
    const key = String(i.assetId || asset.toLowerCase());
    const g = groups.get(key) || { asset, count: 0, open: 0, last: null };
    g.count += 1;
    if (!isDone(i)) g.open += 1;
    const c = createdOf(i);
    if (c && (!g.last || c > g.last)) g.last = c;
    groups.set(key, g);
  });
  return [...groups.values()].filter((g) => g.count >= 2).sort((a, b) => b.count - a.count || (b.last || 0) - (a.last || 0));
}

function repeatedFailures(ctx) {
  const range = periodRange(ctx.entities.period);
  const groups = failureGroups(ctx.issues.filter((i) => inRange(i, range)));
  const when = range ? ` ${range.label}` : "";
  if (!groups.length) return `No asset has had more than one work order${when}. Work orders need an asset linked to them for me to spot repeats.`;
  return `${plural(groups.length, "asset")} had repeated work orders${when}:\n\n`
    + table(["Asset", "Work orders", "Still open", "Last reported"],
      groups.slice(0, TABLE_LIMIT).map((g) => [g.asset, g.count, g.open, fmtDate(g.last)]));
}

function generateReport(ctx) {
  const range = periodRange(ctx.entities.period || "this_month");
  const now = new Date();
  const rows = ctx.issues.filter((i) => inRange(i, range));
  const done = rows.filter(isDone).length;
  const open = rows.length - done;
  const overdue = rows.filter((i) => isOverdue(i, now)).length;
  const highOpen = rows.filter((i) => !isDone(i) && priorityOf(i) === "High").length;
  const sum = (key) => rows.reduce((s, i) => s + (Number(i[key]) || 0), 0);
  const top = failureGroups(rows).slice(0, 3);
  const lines = [
    `Maintenance report — ${range.label} (${fmtDate(range.from)} to ${fmtDate(now < range.to ? now : range.to)})`,
    ctx.companyName && ctx.companyName !== "__all__" ? `Company: ${ctx.companyName}` : null,
    "",
    `• Work orders created: ${rows.length}`,
    `• Completed: ${done}${rows.length ? ` (${Math.round((done / rows.length) * 100)}%)` : ""}`,
    `• Still open: ${open}, of which ${overdue} overdue and ${highOpen} high priority`,
    `• Total cost: ${money(sum("totalCost"))} (labor ${money(sum("laborCost"))}, parts ${money(sum("partsCost"))})`,
    `• Assets with repeated work orders: ${top.length ? top.map((g) => `${g.asset} (${g.count})`).join(", ") : "none"}`,
  ];
  return lines.filter((l) => l !== null).join("\n");
}

async function knowledgeQuestion(ctx) {
  const { passages = [] } = await client.searchKnowledge(ctx.message, 2);
  if (!passages.length) {
    return "I don't have an answer to that in FixNest's maintenance knowledge base yet. I only answer from our own documents, so I won't guess.";
  }
  return passages.map((p) => p.text).join("\n\n");
}

// ---------- photos ----------
// MIA cannot see inside images yet (no vision model of our own). It uses photos for two things:
// attaching them to an existing work order, and reporting a new problem with the photo attached.
// With a photo, these mean "here is a problem": log it.
const PHOTO_REPORT_INTENTS = new Set(["unknown", "greeting", "small_talk", "knowledge_question"]);

function sanitizeAttachment(a) {
  if (!a || typeof a !== "object") return null;
  const type = String(a.type || "");
  if (!/^image\//.test(type)) return null;
  return { name: String(a.name || "photo.jpg").replace(/[^\w .()-]/g, "").slice(0, 80) || "photo.jpg", type };
}

async function attachPhoto(ctx) {
  const target = await resolveTarget(ctx);
  if (target.reply) return target.reply;
  const i = target.issue;
  await remember(ctx, [i]);
  return {
    kind: "confirm",
    content: `Attach your photo "${ctx.attachment.name}" to ${shortRef(i)} "${titleOf(i)}"?`,
    confirm: {
      label: "Yes, attach photo",
      method: "POST",
      url: `/api/issues/${idOf(i)}/files`,
      upload: { field: "files" },
      successMessage: `Done. The photo is attached to ${shortRef(i)}.`,
    },
  };
}

const nameOf = (r) => String(r?.name || r?.title || r?.assetName || "").trim();

// "create a work order, the pump in Block A is leaking" (with or without a photo).
// The AI service writes the title/description; we add the company's asset and location, then show
// a read-only summary. One click creates it through the normal protected routes.
async function createRecord(ctx) {
  const photo = ctx.attachment;
  let type = ctx.entities.record_type === "work_order" ? "work_order" : "request";
  let roleNote = "";
  if (type === "work_order" && ctx.role === "requestor") {
    type = "request";
    roleNote = " Requestors can't open work orders directly, so I'll send it as a request for approval.";
  }
  const label = type === "work_order" ? "work order" : "request";

  if (ctx.entities.missing?.includes("details") || !ctx.message.trim() || ctx.message === "Photo attached") {
    return {
      kind: "need_details",
      content: photo
        ? `Got your photo! I can't see what's in pictures yet, so tell me in a few words what's wrong and where, for example "the pump in Block A is leaking". I'll then create the ${label} with your photo attached.`
        : `Sure, I'll create a ${label}. What's the problem and where is it? For example "the pump in Block A is leaking".`,
    };
  }

  const assets = ctx.assets || [];
  const properties = ctx.properties || [];
  const { draft } = await client.draftRecord(ctx.message, assets.map(nameOf), properties.map(nameOf));
  if (draft.needs_details) {
    return {
      kind: "need_details",
      content: `I need a little more detail to write a useful ${label}. What's wrong, and where? For example "the pump in Block A is leaking".`,
    };
  }

  const asset = draft.asset_name ? assets.find((a) => nameOf(a).toLowerCase() === draft.asset_name.toLowerCase()) : null;
  const assetProperty = asset ? properties.find((p) => idOf(p) === String(asset.propertyId || "")) : null;
  const location = draft.location || nameOf(assetProperty) || String(asset?.location || "").trim() || "Not specified";
  const body = {
    title: draft.title,
    description: `${draft.description}${photo ? " Photo attached." : ""} (Reported through the FixNest assistant.)`,
    location,
    priority: draft.priority,
    category: draft.category,
  };
  if (asset) {
    body.assetId = idOf(asset);
    body.assetName = nameOf(asset);
  }

  const lines = [
    ctx.entities.implicit
      ? `That sounds like something to fix. Here's the ${label} I can log for you${photo ? " with your photo" : ""}:${roleNote}`
      : `Here's the ${label} I prepared${photo ? " with your photo" : ""}:${roleNote}`,
    "",
    `• Title: ${body.title}`,
    `• Location: ${location}`,
    `• Priority: ${body.priority}`,
    `• Category: ${body.category}`,
    asset ? `• Asset: ${body.assetName}` : null,
    `• Description: ${draft.description}`,
    "",
    `You can change any of this later from ${type === "work_order" ? "Work Orders" : "Requests"}.`,
  ].filter((l) => l !== null);

  const requests = [{ method: "POST", url: "/api/issues", body, ...(photo ? { upload: { field: "photos" } } : {}) }];
  if (type === "work_order") {
    // In FixNest a work order is an approved issue (same as the app's own work order flow).
    requests.push({ method: "PUT", url: "/api/issues/{created}", body: { approved: true, status: "APPROVED" } });
  }
  return {
    kind: "confirm",
    content: lines.join("\n"),
    confirm: {
      label: `Create ${label}`,
      requests,
      successMessage: `Done! The ${label} "${body.title}" was created. You'll find it in ${type === "work_order" ? "Work Orders" : "Requests"}.`,
    },
  };
}

// ---------- preventive maintenance ----------
const DAY_LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// First time the schedule is due, from now (server local time, same as the app's PM form).
function firstOccurrence(rec, time, now = new Date()) {
  const [h, m] = String(time || "09:00").split(":").map(Number);
  const at = (d) => { const x = new Date(d); x.setHours(h, m, 0, 0); return x; };
  let next = at(now);
  if (rec.type === "weekly" && Array.isArray(rec.week_days) && rec.week_days.length) {
    while (!rec.week_days.includes(next.getDay()) || next <= now) next = at(new Date(next.getTime() + 86400000));
    return next;
  }
  if (rec.type === "monthly" && rec.month_day) {
    next = at(new Date(now.getFullYear(), now.getMonth(), rec.month_day));
    if (next <= now) next = at(new Date(now.getFullYear(), now.getMonth() + 1, rec.month_day));
    return next;
  }
  if (next <= now) next = at(new Date(next.getTime() + 86400000));
  return next;
}

function findPerson(name, users) {
  const workers = users.filter((u) => WORKER_ROLES.has(String(u?.role || "").toLowerCase()) && idOf(u));
  let matches = findPeople(name, workers);
  if (!matches.length && /^[A-Za-z]{2,4}$/.test(name)) {
    // Initials: "BK" -> Brian Kato
    const initials = name.toUpperCase();
    matches = workers.filter((u) => personName(u).split(/\s+/).map((w) => w[0] || "").join("").toUpperCase() === initials);
  }
  return matches;
}

async function createPm(ctx) {
  if (ctx.role === "requestor") return "Only maintenance staff can create preventive maintenance schedules.";
  const text = ctx.entities.source_text || ctx.message;
  const missing = ctx.entities.missing || [];
  if (missing.includes("task")) {
    return "Sure, I'll set up a preventive maintenance. What should be done, and how often? For example \"clean the shop every day at 9:00\".";
  }
  const assets = ctx.assets || [];
  const properties = ctx.properties || [];
  const { draft } = await client.draftPm(text, assets.map(nameOf), properties.map(nameOf));
  if (!draft.recurrence) {
    return `Got it: "${draft.title}". How often should it repeat, and at what time? For example "every day at 9:00", "every Monday at 8am" or "every 3 months".`;
  }

  // Who does it
  let person = null;
  let personNote = "";
  if (draft.assignee) {
    const people = findPerson(draft.assignee, ctx.companyUsers);
    if (people.length === 1) person = { id: idOf(people[0]), name: personName(people[0]) };
    else if (people.length > 1) personNote = `More than one person matches "${draft.assignee}" (${people.slice(0, 4).map(personName).join(", ")}), so I left it unassigned. Tell me the full name and I'll update it.`;
    else personNote = `I couldn't find anyone called "${draft.assignee}" in your team, so I left it unassigned for now.`;
  }
  if (person && ["technician", "internal"].includes(ctx.role) && person.id !== ctx.userId) {
    return "Technicians can only create preventive maintenance for themselves. Ask your manager to assign it to someone else.";
  }

  const rec = draft.recurrence;
  const first = firstOccurrence(rec, draft.time);
  const date = fmtDate(first);
  const asset = draft.asset_name ? assets.find((a) => nameOf(a).toLowerCase() === draft.asset_name.toLowerCase()) : null;
  const unit = { daily: "day", weekly: "week", monthly: "month", yearly: "year" }[rec.type];
  const assignees = person ? [{ id: person.id, name: person.name }] : [];
  const body = {
    name: draft.title,
    workOrderTitle: draft.title,
    workOrderDescription: draft.instructions,
    description: draft.instructions,
    priority: draft.priority,
    category: "General",
    scheduleType: "calendar",
    calendarRule: {
      every: rec.every || 1,
      unit,
      time: draft.time,
      leadDays: 0,
      recurrenceType: rec.type,
      recurrenceEndType: "never",
      recurrenceEndDate: null,
      recurrenceMaxOccurrences: null,
      selectedWeekDays: rec.week_days || [],
      selectedMonthDay: rec.type === "monthly" ? (rec.month_day || first.getDate()) : null,
      selectedYearMonth: rec.type === "yearly" ? first.getMonth() + 1 : null,
      selectedYearDay: rec.type === "yearly" ? first.getDate() : null,
    },
    date,
    time: draft.time,
    routine: true,
    status: "Pending",
    assignedTo: person?.id,
    assignedToName: person?.name,
    technicianUserId: person?.id,
    assignees,
    woAssignees: assignees,
    employees: person?.id || "N/A",
    assetsRows: asset ? [{ assetId: idOf(asset), assignee: person?.id || "", startDate: `${date}T${draft.time}` }] : [],
    block: draft.location || undefined,
  };
  Object.keys(body).forEach((k) => body[k] === undefined && delete body[k]);

  const firstText = `${DAY_LONG[first.getDay()]} ${first.getDate()} ${MONTHS[first.getMonth()]} ${first.getFullYear()} at ${draft.time}`;
  const lines = [
    "Here's the preventive maintenance I prepared:",
    "",
    `• Title: ${draft.title}`,
    `• Repeats: ${draft.schedule_text}`,
    `• First one: ${firstText}`,
    `• Assigned to: ${person ? person.name : "Nobody yet"}`,
    `• Instructions: ${draft.instructions}`,
    draft.location ? `• Location: ${draft.location}` : null,
    asset ? `• Asset: ${nameOf(asset)}` : null,
    `• Priority: ${draft.priority}`,
    "",
    person ? `Each time it's due, a work order will be created for ${person.name}.` : "Each time it's due, a work order will be created.",
    draft.time_given ? null : "No time was given, so I used 09:00.",
    personNote || null,
  ].filter((l) => l !== null);

  return {
    kind: "confirm",
    content: lines.join("\n"),
    confirm: {
      label: "Create PM",
      method: "POST",
      url: "/api/maintenance-schedules",
      body,
      successMessage: `Done! "${draft.title}" is scheduled. You'll find it in Preventive Maintenance.`,
    },
  };
}

const personaContext = (ctx) => ({ user: ctx.user, issues: ctx.issues, hasCompany: Boolean(ctx.companyName), hour: ctx.hour });

// Say something; if MIA offered a next step ("want me to show them?"), remember it so "yes" runs it.
async function speak(ctx, { text, suggestion }) {
  if (suggestion && ctx.sessionId) {
    try {
      await client.rememberSuggestion(ctx.sessionId, suggestion);
    } catch (err) {
      console.warn("MIA: could not store suggestion:", err.message);
    }
  }
  return text;
}

const HELP = "I can help with your maintenance data. Try:\n"
  + "• Show pending work orders\n• Which work orders are overdue?\n• Assign #3F9A2C to John\n"
  + "• Mark the first one as in progress\n• How much did we spend this month?\n"
  + "• Which assets have repeated failures?\n• Prepare a maintenance report for management";

const HANDLERS = {
  list_records: listRecords,
  get_record: getRecord,
  update_status: updateStatus,
  assign_record: assignRecord,
  cost_summary: costSummary,
  repeated_failures: repeatedFailures,
  generate_report: generateReport,
  knowledge_question: knowledgeQuestion,
  greeting: (ctx) => speak(ctx, persona.greeting({ word: ctx.entities.word, ...personaContext(ctx) })),
  small_talk: (ctx) => speak(ctx, persona.smallTalk({ kind: ctx.entities.kind, ...personaContext(ctx) })),
  unsupported_action: () => "I can't delete records from the chat. To remove a work order, open it in Work Orders, where the usual permissions and confirmations apply.",
};

async function handleChat({ message, user, companyName, scopedData, conversationId, localHour, attachment }) {
  const userId = user?.userId ? String(user.userId) : null;
  const sessionId = userId ? client.sessionIdFor(userId, conversationId) : null;
  const parsed = await client.parseIntent(message, sessionId);
  const photo = sanitizeAttachment(attachment);
  if ((photo || parsed.intent === "attach_photo") && !companyName) {
    return "Please log in so I can add photos to your company's maintenance records.";
  }
  let handler = HANDLERS[parsed.intent];
  let photoNote = false;
  if (parsed.intent === "attach_photo" || (photo && parsed.intent === "get_record")) {
    handler = photo ? attachPhoto : () => "Add a photo first with the 📎 or 📷 button next to the message box, then tell me which work order it's for.";
  } else if (parsed.intent === "create_pm") {
    handler = createPm;
  } else if (parsed.intent === "create_record" || (photo && (PHOTO_REPORT_INTENTS.has(parsed.intent) || !handler))) {
    handler = createRecord;
  } else if (photo) {
    photoNote = true;
  }
  if (!handler) return null; // not understood: the caller may try other local answers, then HELP
  if (!companyName && !["knowledge_question", "greeting", "small_talk", "unsupported_action"].includes(parsed.intent)) {
    return "Please log in so I can look at your company's maintenance records.";
  }
  const reply = await handler({
    message,
    entities: parsed.entities || {},
    issues: scopedData?.issues || [],
    companyUsers: scopedData?.companyUsers || [],
    companyName,
    role: String(user?.role || "").toLowerCase(),
    userId,
    sessionId,
    user,
    hour: Number.isInteger(localHour) && localHour >= 0 && localHour <= 23 ? localHour : undefined,
    attachment: photo,
    properties: scopedData?.properties || [],
    assets: scopedData?.assets || [],
  });
  if (photoNote && typeof reply === "string") {
    return `${reply}

(I didn't use your photo for this. Say "attach this to #3F9A2C" to add it to a work order, or send it with a description to report a problem.)`;
  }
  return reply;
}

const fallbackReply = () => persona.notUnderstood();

module.exports = { handleChat, HELP, fallbackReply, _internal: { periodRange, isOverdue, statusOf, searchIssues, findPeople, sortIssues } };
