// HTTP client for FixNest's own AI service (maintenance-intelligence-ai, Python/FastAPI).
// The service is private: it is reached only from this backend, with a shared API key.
const crypto = require("crypto");

const baseUrl = () => String(process.env.MIA_API_URL || "").trim().replace(/\/+$/, "");
const timeoutMs = () => Number(process.env.MIA_TIMEOUT_MS) || 8000;

class MiaUnavailableError extends Error {}

const isEnabled = () => Boolean(baseUrl());

async function call(method, path, body) {
  let res;
  try {
    res = await fetch(`${baseUrl()}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": process.env.MIA_API_KEY || "",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs()),
    });
  } catch (err) {
    throw new MiaUnavailableError(`MIA service unreachable: ${err.message}`);
  }
  if (!res.ok) {
    throw new MiaUnavailableError(`MIA service ${method} ${path} failed with HTTP ${res.status}`);
  }
  return res.json();
}

// One conversation memory per user. Hashed so the AI service never receives a real user id.
const sessionIdFor = (userId, conversationId = "default") => crypto
  .createHash("sha256")
  .update(`${process.env.MIA_SESSION_SALT || process.env.JWT_SECRET || "mia"}:${userId}:${conversationId}`)
  .digest("hex")
  .slice(0, 40);

module.exports = {
  MiaUnavailableError,
  isEnabled,
  sessionIdFor,
  health: () => call("GET", "/health"),
  parseIntent: (text, sessionId) => call("POST", "/intent", { text, session_id: sessionId || undefined }),
  reportResults: (sessionId, recordIds) => call("POST", `/sessions/${sessionId}/results`, { record_ids: recordIds.slice(0, 500) }),
  rememberSuggestion: (sessionId, command) => call("POST", `/sessions/${sessionId}/suggestion`, { command: command || null }),
  draftRecord: (text, assets = [], locations = []) => call("POST", "/draft", { text, assets: assets.slice(0, 3000), locations: locations.slice(0, 3000) }),
  draftPm: (text, assets = [], locations = []) => call("POST", "/draft-pm", { text, assets: assets.slice(0, 3000), locations: locations.slice(0, 3000) }),
  searchKnowledge: (question, topK = 2) => call("POST", "/knowledge", { question, top_k: topK }),
};
