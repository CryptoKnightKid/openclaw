/**
 * Smart context compaction utilities.
 *
 * Preserves high-signal content (decisions, actions, files), removes low-signal
 * conversational fluff, and summarizes very long sections to keep context small.
 *
 * Proactive compaction at 80% threshold to prevent context overflow.
 *
 * Data Structures (per ARCHITECTURE.md 3.6-3.8):
 * - CompactionThreshold: { percentage, tokenLimit, messageLimit }
 * - ContextUsage: { currentTokens, maxTokens, percentage }
 * - CompactionStrategy: 'aggressive' | 'selective' | 'minimal'
 */

import fs from "fs";
import path from "path";

const DEFAULTS = {
  tokenThreshold: 12000,
  maxMessagesBeforeCompact: 120,
  maxSectionChars: 900,
  maxSummaryPointsPerSection: 3,
  // 80% threshold for proactive compaction
  contextThresholdPercent: 80,
  maxContextTokens: 200000, // Default context window
  aggressiveThresholdPercent: 90,
  minimalThresholdPercent: 60,
  backupsDir: "/home/ubuntu/.openclaw/workspace/memory/backups/compactions",
  restorePointerFile: "/home/ubuntu/.openclaw/workspace/memory/backups/LATEST-POINTER.json",
  promoteFile: "/home/ubuntu/.openclaw/workspace/memory/LATEST.md",
};

const DECISION_PATTERN =
  /\b(decision|decide[ds]?|agreed?|approved?|final(?:ized)?|chosen?|we will|ship(?:ped|ping)?|go with)\b/i;
const ACTION_PATTERN =
  /\b(done|completed?|implemented?|fixed|added|updated|created|ran|tested|refactor(?:ed)?|next step|todo|action item)\b/i;
const FILE_PATTERN =
  /(?:^|\s)((?:\/)?[\w.-]+(?:\/[\w.-]+)*\/?[\w.-]*\.(?:js|ts|jsx|tsx|md|json|py|sh|css|html|yaml|yml|sql))(?::\d+)?/gi;
const FLUFF_PATTERN =
  /^(hi|hello|hey|thanks|thank you|ok|okay|sure|got it|sounds good|awesome|great|nice|cool|lol|haha|done)\b[.! ]*$/i;

/**
 * Normalize a session log into an array of message-like strings.
 * @param {string|Array|Object} sessionLog - Raw session content.
 * @returns {string[]} Normalized message strings.
 */
function normalizeMessages(sessionLog) {
  if (!sessionLog) return [];

  if (typeof sessionLog === "string") {
    return sessionLog
      .split(/\n{2,}/)
      .map((m) => m.trim())
      .filter(Boolean);
  }

  if (Array.isArray(sessionLog)) {
    return sessionLog
      .map((entry) => {
        if (!entry) return "";
        if (typeof entry === "string") return entry.trim();
        if (typeof entry.content === "string") {
          const role = entry.role ? `[${entry.role}] ` : "";
          return `${role}${entry.content}`.trim();
        }
        return JSON.stringify(entry);
      })
      .filter(Boolean);
  }

  if (Array.isArray(sessionLog.messages)) {
    return normalizeMessages(sessionLog.messages);
  }

  return [String(sessionLog)];
}

/**
 * Estimate approximate token usage from raw text.
 * @param {string} text - Input text.
 * @returns {number} Approximate token count.
 */
function estimateTokens(text) {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

/**
 * Check if a line appears to be low-signal conversational fluff.
 * @param {string} line - A single message line.
 * @returns {boolean} True when likely fluff.
 */
function isFluffLine(line) {
  const trimmed = line.trim();
  if (!trimmed) return true;
  if (FILE_PATTERN.test(trimmed)) return false;
  FILE_PATTERN.lastIndex = 0;
  if (DECISION_PATTERN.test(trimmed) || ACTION_PATTERN.test(trimmed)) return false;

  if (trimmed.length <= 16 && FLUFF_PATTERN.test(trimmed)) return true;
  if (trimmed.length <= 10 && /^[\w.!? ]+$/.test(trimmed)) return true;
  return false;
}

/**
 * Extract file paths from text.
 * @param {string} text - Text to parse.
 * @returns {string[]} Unique file paths.
 */
function extractFiles(text) {
  if (!text) return [];
  const found = new Set();
  let match;

  FILE_PATTERN.lastIndex = 0;
  while ((match = FILE_PATTERN.exec(text)) !== null) {
    const path = (match[1] || "").trim();
    if (path) found.add(path);
  }
  FILE_PATTERN.lastIndex = 0;
  return [...found];
}

/**
 * Create a short deterministic summary for long message sections.
 * @param {string} message - A potentially long message.
 * @param {number} maxPoints - Max lines in the summary.
 * @returns {string} Summarized section.
 */
function summarizeLongSection(message, maxPoints) {
  const lines = message
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  if (!lines.length) return "";

  const picks = [];
  picks.push(lines[0]);

  for (const line of lines) {
    if (picks.length >= maxPoints) break;
    if (DECISION_PATTERN.test(line) || ACTION_PATTERN.test(line) || FILE_PATTERN.test(line)) {
      picks.push(line);
    }
    FILE_PATTERN.lastIndex = 0;
  }

  const deduped = [...new Set(picks)].slice(0, maxPoints);
  return deduped.map((line) => `- ${line}`).join("\n");
}

/**
 * Preserve important session content while dropping fluff.
 *
 * @param {string|Array|Object} sessionLog - Session log content.
 * @param {Object} [options] - Preservation options.
 * @param {number} [options.maxSectionChars=900] - Long section threshold.
 * @param {number} [options.maxSummaryPointsPerSection=3] - Summary bullet count.
 * @returns {{
 *   decisions: string[],
 *   actions: string[],
 *   files: string[],
 *   highlights: string[],
 *   removedFluffCount: number
 * }} Preserved high-signal content.
 */
function preserveImportantContent(sessionLog, options = {}) {
  const cfg = { ...DEFAULTS, ...options };
  const messages = normalizeMessages(sessionLog);
  const decisions = new Set();
  const actions = new Set();
  const files = new Set();
  const highlights = [];
  let removedFluffCount = 0;

  for (const message of messages) {
    const text = message.trim();
    if (!text) continue;

    if (isFluffLine(text)) {
      removedFluffCount += 1;
      continue;
    }

    extractFiles(text).forEach((filePath) => files.add(filePath));

    if (DECISION_PATTERN.test(text)) decisions.add(text);
    if (ACTION_PATTERN.test(text)) actions.add(text);

    if (text.length > cfg.maxSectionChars) {
      highlights.push(summarizeLongSection(text, cfg.maxSummaryPointsPerSection));
    } else if (
      DECISION_PATTERN.test(text) ||
      ACTION_PATTERN.test(text) ||
      FILE_PATTERN.test(text)
    ) {
      highlights.push(text);
    }
  }

  return {
    decisions: [...decisions],
    actions: [...actions],
    files: [...files],
    highlights: [...new Set(highlights.filter(Boolean))],
    removedFluffCount,
  };
}

/**
 * Decide whether the current session should be compacted.
 *
 * @param {string|Array|Object} sessionLog - Session log to evaluate.
 * @param {Object} [options] - Compaction thresholds.
 * @param {number} [options.tokenThreshold=12000] - Token estimate trigger.
 * @param {number} [options.maxMessagesBeforeCompact=120] - Message count trigger.
 * @param {number} [options.maxSectionChars=900] - Long section trigger.
 * @returns {boolean} True if compaction is recommended.
 */
function shouldCompact(sessionLog, options = {}) {
  const cfg = { ...DEFAULTS, ...options };
  const messages = normalizeMessages(sessionLog);
  const joined = messages.join("\n\n");
  const estimatedTokens = estimateTokens(joined);
  const hasLongSection = messages.some((m) => m.length > cfg.maxSectionChars);

  let fluffCount = 0;
  for (const message of messages) {
    if (isFluffLine(message)) fluffCount += 1;
  }
  const fluffRatio = messages.length ? fluffCount / messages.length : 0;

  return (
    estimatedTokens >= cfg.tokenThreshold ||
    messages.length >= cfg.maxMessagesBeforeCompact ||
    hasLongSection ||
    fluffRatio >= 0.25
  );
}

/**
 * Compact a session log into a structured high-signal summary.
 *
 * @param {string|Array|Object} sessionLog - Session log content.
 * @param {Object} [options] - Compaction options.
 * @returns {string} Compact summary text.
 */
function compactSessionLog(sessionLog, options = {}) {
  const messages = normalizeMessages(sessionLog);
  const compacted = preserveImportantContent(messages, options);

  const sections = [];

  if (compacted.decisions.length) {
    sections.push("## Decisions");
    sections.push(...compacted.decisions.map((line) => `- ${line}`));
  }

  if (compacted.actions.length) {
    sections.push("## Actions");
    sections.push(...compacted.actions.map((line) => `- ${line}`));
  }

  if (compacted.files.length) {
    sections.push("## Files");
    sections.push(...compacted.files.map((line) => `- ${line}`));
  }

  if (compacted.highlights.length) {
    sections.push("## Summaries");
    sections.push(
      ...compacted.highlights.map((line) => (line.startsWith("- ") ? line : `- ${line}`)),
    );
  }

  sections.push("## Compaction Stats");
  sections.push(`- Original messages: ${messages.length}`);
  sections.push(`- Removed fluff lines: ${compacted.removedFluffCount}`);
  sections.push(
    `- Estimated token reduction: ~${Math.max(0, estimateTokens(messages.join("\n\n")) - estimateTokens(sections.join("\n")))} tokens`,
  );

  return sections.join("\n");
}

/**
 * Automatically compact a session log when thresholds are exceeded.
 *
 * @param {string|Array|Object} sessionLog - Session content to process.
 * @param {Object} [options] - Auto-compaction settings.
 * @returns {{
 *   didCompact: boolean,
 *   compactedLog: string,
 *   reason: string,
 *   stats: {
 *     messageCount: number,
 *     estimatedTokens: number
 *   }
 * }} Auto-compaction result.
 */
function autoCompact(sessionLog, options = {}) {
  const messages = normalizeMessages(sessionLog);
  const raw = messages.join("\n\n");
  const stats = {
    messageCount: messages.length,
    estimatedTokens: estimateTokens(raw),
  };

  if (!shouldCompact(messages, options)) {
    return {
      didCompact: false,
      compactedLog: raw,
      reason: "Thresholds not exceeded",
      stats,
    };
  }

  return {
    didCompact: true,
    compactedLog: compactSessionLog(messages, options),
    reason: "Context thresholds exceeded, compacted to high-signal summary",
    stats,
  };
}

/**
 * Calculate current context usage
 * @param {string|Array|Object} sessionLog - Session content
 * @param {number} maxTokens - Maximum context tokens
 * @returns {Object} Context usage stats
 */
function calculateContextUsage(sessionLog, maxTokens = DEFAULTS.maxContextTokens) {
  const messages = normalizeMessages(sessionLog);
  const raw = messages.join("\n\n");
  const currentTokens = estimateTokens(raw);
  const percentage = (currentTokens / maxTokens) * 100;

  return {
    currentTokens,
    maxTokens,
    percentage: Math.round(percentage * 100) / 100,
    messageCount: messages.length,
    status:
      percentage >= DEFAULTS.contextThresholdPercent
        ? "critical"
        : percentage >= DEFAULTS.minimalThresholdPercent
          ? "warning"
          : "normal",
  };
}

/**
 * Determine compaction strategy based on context usage
 * @param {Object} usage - Context usage from calculateContextUsage
 * @returns {string} Compaction strategy
 */
function determineStrategy(usage) {
  if (usage.percentage >= DEFAULTS.aggressiveThresholdPercent) {
    return "aggressive";
  } else if (usage.percentage >= DEFAULTS.contextThresholdPercent) {
    return "selective";
  } else if (usage.percentage >= DEFAULTS.minimalThresholdPercent) {
    return "minimal";
  }
  return "none";
}

/**
 * Apply compaction strategy
 * @param {Array} messages - Normalized messages
 * @param {string} strategy - Compaction strategy
 * @param {Object} options - Additional options
 * @returns {Object} Compacted content
 */
function applyStrategy(messages, strategy, options = {}) {
  const cfg = { ...DEFAULTS, ...options };

  switch (strategy) {
    case "aggressive":
      // Keep only essential: decisions, actions, files
      return preserveImportantContent(messages, {
        ...cfg,
        maxSummaryPointsPerSection: 1,
        maxSectionChars: 400,
      });

    case "selective":
      // Standard compaction at 80% threshold
      return preserveImportantContent(messages, {
        ...cfg,
        maxSummaryPointsPerSection: 2,
        maxSectionChars: 600,
      });

    case "minimal":
      // Light compaction - just remove fluff
      return preserveImportantContent(messages, {
        ...cfg,
        maxSummaryPointsPerSection: 3,
        maxSectionChars: 900,
      });

    default:
      // No compaction
      return {
        decisions: [],
        actions: [],
        files: [],
        highlights: messages.filter((m) => !isFluffLine(m)),
        removedFluffCount: messages.filter(isFluffLine).length,
      };
  }
}

/**
 * Smart compaction with proactive 80% threshold
 * Compacts BEFORE reaching 100% to maintain performance
 *
 * @param {string|Array|Object} sessionLog - Session content
 * @param {Object} options - Smart compaction options
 * @param {number} [options.maxContextTokens] - Maximum context tokens
 * @param {number} [options.thresholdPercent] - Compaction threshold (default 80%)
 * @param {boolean} [options.alwaysPreserveDecisions] - Always keep decisions
 * @returns {{
 *   didCompact: boolean,
 *   strategy: string,
 *   originalUsage: Object,
 *   compactedLog: string,
 *   reason: string,
 *   stats: {
 *     originalTokens: number,
 *     compactedTokens: number,
 *     tokenReduction: number,
 *     percentage: number
 *   }
 * }} Smart compaction result
 */
function smartCompact(sessionLog, options = {}) {
  const cfg = { ...DEFAULTS, ...options };
  const maxTokens = cfg.maxContextTokens || DEFAULTS.maxContextTokens;

  // Calculate current usage
  const usage = calculateContextUsage(sessionLog, maxTokens);
  const threshold = cfg.thresholdPercent || DEFAULTS.contextThresholdPercent;

  // Determine if compaction needed
  const needsCompaction = usage.percentage >= threshold;
  const strategy = determineStrategy(usage);

  if (!needsCompaction) {
    const messages = normalizeMessages(sessionLog);
    return {
      didCompact: false,
      strategy: "none",
      originalUsage: usage,
      compactedLog: messages.join("\n\n"),
      reason: `Context at ${usage.percentage.toFixed(1)}% (below ${threshold}% threshold)`,
      stats: {
        originalTokens: usage.currentTokens,
        compactedTokens: usage.currentTokens,
        tokenReduction: 0,
        percentage: 0,
      },
    };
  }

  // Apply compaction strategy
  const messages = normalizeMessages(sessionLog);
  const compacted = applyStrategy(messages, strategy, cfg);

  // Build compacted log based on strategy
  const sections = [];

  if (compacted.decisions.length) {
    sections.push("## Decisions");
    sections.push(...compacted.decisions.map((line) => `- ${line}`));
  }

  if (compacted.actions.length) {
    sections.push("## Actions");
    sections.push(...compacted.actions.map((line) => `- ${line}`));
  }

  if (compacted.files.length) {
    sections.push("## Files");
    sections.push(...compacted.files.map((line) => `- ${line}`));
  }

  if (compacted.highlights.length && strategy !== "aggressive") {
    sections.push("## Summaries");
    sections.push(
      ...compacted.highlights.map((line) => (line.startsWith("- ") ? line : `- ${line}`)),
    );
  }

  sections.push("## Compaction Info");
  sections.push(`- Strategy: ${strategy}`);
  sections.push(`- Original usage: ${usage.percentage.toFixed(1)}%`);
  sections.push(`- Removed fluff: ${compacted.removedFluffCount} lines`);

  const compactedLog = sections.join("\n");
  const compactedTokens = estimateTokens(compactedLog);
  const tokenReduction = usage.currentTokens - compactedTokens;

  return {
    didCompact: true,
    strategy,
    originalUsage: usage,
    compactedLog,
    reason: `Proactive compaction at ${usage.percentage.toFixed(1)}% (${strategy} strategy)`,
    stats: {
      originalTokens: usage.currentTokens,
      compactedTokens,
      tokenReduction,
      percentage: Math.round((tokenReduction / usage.currentTokens) * 100 * 100) / 100,
    },
  };
}

/**
 * Check if compaction should be triggered (for polling/checks)
 * @param {string|Array|Object} sessionLog - Session content
 * @param {number} thresholdPercent - Threshold to check against
 * @param {number} maxContextTokens - Maximum context tokens
 * @returns {boolean} True if compaction should trigger
 */
function shouldTriggerCompaction(
  sessionLog,
  thresholdPercent = DEFAULTS.contextThresholdPercent,
  maxContextTokens = DEFAULTS.maxContextTokens,
) {
  const usage = calculateContextUsage(sessionLog, maxContextTokens);
  return usage.percentage >= thresholdPercent;
}

/**
 * Get compaction recommendations
 * @param {string|Array|Object} sessionLog - Session content
 * @param {Object} options - Options
 * @returns {Object} Recommendations
 */
function getCompactionRecommendations(sessionLog, options = {}) {
  const cfg = { ...DEFAULTS, ...options };
  const usage = calculateContextUsage(sessionLog, cfg.maxContextTokens);
  const strategy = determineStrategy(usage);

  const recommendations = {
    currentUsage: usage,
    recommendedStrategy: strategy,
    shouldCompact: usage.percentage >= cfg.contextThresholdPercent,
    suggestions: [],
  };

  if (usage.percentage >= DEFAULTS.aggressiveThresholdPercent) {
    recommendations.suggestions.push(
      "URGENT: Context near limit. Aggressive compaction recommended.",
      "Consider starting a new session or archiving old context.",
      "Only decisions, actions, and files will be preserved.",
    );
  } else if (usage.percentage >= cfg.contextThresholdPercent) {
    recommendations.suggestions.push(
      "Context at 80%+ threshold. Selective compaction recommended.",
      "Summaries will be condensed to preserve key information.",
    );
  } else if (usage.percentage >= DEFAULTS.minimalThresholdPercent) {
    recommendations.suggestions.push(
      "Context growing. Monitor usage and consider light compaction.",
      "Fluff removal will help maintain efficiency.",
    );
  } else {
    recommendations.suggestions.push("Context healthy. No action needed.");
  }

  return recommendations;
}

/**
 * Persist pre-compact snapshot + restore pointer + promoted summary.
 * @param {string} rawLog
 * @param {string} compactedLog
 * @param {Object} options
 * @returns {{snapshotFile:string,pointerFile:string,promoteFile:string}}
 */
function persistCompactionArtifacts(rawLog, compactedLog, options = {}) {
  const cfg = { ...DEFAULTS, ...options };
  const now = new Date();
  const stamp = now.toISOString().replace(/[:.]/g, "-");

  fs.mkdirSync(cfg.backupsDir, { recursive: true });
  const snapshotFile = path.join(cfg.backupsDir, `pre-compact-${stamp}.md`);
  fs.writeFileSync(snapshotFile, rawLog, "utf8");

  const pointer = {
    updatedAt: now.toISOString(),
    snapshotFile,
    promoteFile: cfg.promoteFile,
    notes: "Auto-generated before compaction",
  };

  fs.mkdirSync(path.dirname(cfg.restorePointerFile), { recursive: true });
  fs.writeFileSync(cfg.restorePointerFile, JSON.stringify(pointer, null, 2), "utf8");

  const promoted = [
    `# Latest Compaction Summary`,
    ``,
    `- Timestamp: ${now.toISOString()}`,
    `- Snapshot: ${snapshotFile}`,
    ``,
    compactedLog,
  ].join("\n");
  fs.writeFileSync(cfg.promoteFile, promoted, "utf8");

  return {
    snapshotFile,
    pointerFile: cfg.restorePointerFile,
    promoteFile: cfg.promoteFile,
  };
}

/**
 * Run smart compaction and persist artifacts automatically when compacted.
 */
function smartCompactWithSnapshot(sessionLog, options = {}) {
  const messages = normalizeMessages(sessionLog);
  const rawLog = messages.join("\n\n");
  const result = smartCompact(sessionLog, options);

  if (!result.didCompact) {
    return { ...result, artifacts: null };
  }

  const artifacts = persistCompactionArtifacts(rawLog, result.compactedLog, options);
  return { ...result, artifacts };
}

export { 
  shouldCompact,
  compactSessionLog,
  preserveImportantContent,
  autoCompact,
  // New smart compaction exports
  smartCompact,
  calculateContextUsage,
  determineStrategy,
  shouldTriggerCompaction,
  getCompactionRecommendations,
  persistCompactionArtifacts,
  smartCompactWithSnapshot,
 };

// Smart context compression based on token pressure
function calculateCompactionStrategy(currentTokens, maxTokens) {
  const ratio = currentTokens / maxTokens;
  if (ratio < 0.5) return { action: "none", reason: "healthy" };
  if (ratio < 0.7) return { action: "trim_old", keep: 0.9 };
  if (ratio < 0.85) return { action: "summarize", preserve: ["decisions", "action_items"] };
  return { action: "aggressive", preserve: ["decisions_only"] };
}

// Add calculateCompactionStrategy to existing exports
module.exports.calculateCompactionStrategy = calculateCompactionStrategy;
