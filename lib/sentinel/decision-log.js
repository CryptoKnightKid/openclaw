/**
 * Decision Log
 *
 * Logs routing decisions for audit and learning.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const LOG_DIR = path.join(__dirname, "..", "memory", "decisions");
const LOG_FILE = path.join(LOG_DIR, "decisions.jsonl");

// Ensure log directory exists
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

/**
 * Log a routing decision
 * @param {Object} params
 * @param {string} params.decision - The decision made
 * @param {string} params.context - Request context
 * @param {string} params.rationale - Why this decision was made
 * @param {string[]} params.alternatives - Other options considered
 */
function logDecision({ decision, context, rationale, alternatives = [] }) {
  const timestamp = new Date().toISOString();
  const logEntry = {
    timestamp,
    decision,
    context: context?.substring(0, 200), // Truncate long contexts
    rationale,
    alternatives,
    session: process.env.OPENCLAW_SESSION || "unknown",
  };

  const logFile = path.join(LOG_DIR, `${new Date().toISOString().split("T")[0]}.jsonl`);
  fs.appendFileSync(logFile, JSON.stringify(logEntry) + "\n");
}

/**
 * Get recent decisions
 * @param {number} limit - Number of decisions to return
 * @returns {Object[]}
 */
function getRecentDecisions(limit = 50) {
  const files = fs
    .readdirSync(LOG_DIR)
    .filter((f) => f.endsWith(".jsonl"))
    .sort()
    .reverse()
    .slice(0, 7); // Last 7 days

  const decisions = [];
  for (const file of files) {
    const content = fs.readFileSync(path.join(LOG_DIR, file), "utf8");
    const lines = content.trim().split("\n").filter(Boolean);
    for (const line of lines) {
      try {
        decisions.push(JSON.parse(line));
      } catch (e) {
        // Skip corrupted lines
      }
    }
  }

  return decisions.slice(-limit);
}

export { 
  logDecision,
  getRecentDecisions,
 };
