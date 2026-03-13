/**
 * Memory Reflection Loop
 *
 * Scans daily memory files, extracts decisions/lessons/errors,
 * and writes structured reflections to memory/reflections/.
 */

import { fileURLToPath } from "url";
import { dirname } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

import fs from "fs";
import path from "path";

const DEFAULT_MEMORY_DIR = path.join(__dirname, "..", "memory");
const DEFAULT_REFLECTIONS_DIR = path.join(DEFAULT_MEMORY_DIR, "reflections");
const DEFAULT_STATE_FILE = path.join(DEFAULT_REFLECTIONS_DIR, "state.json");
const MEMORY_FILE_REGEX = /^\d{4}-\d{2}-\d{2}\.md$/;

let activeSchedule = null;

/**
 * Safely load node-cron only when scheduling is requested.
 * @returns {import('node-cron')|null} node-cron module if available.
 */
function loadCronModule() {
  try {
    // eslint-disable-next-line global-require
    return require("node-cron");
  } catch (error) {
    return null;
  }
}

/**
 * Ensure required directories exist.
 * @param {string} reflectionsDir - Reflections directory path.
 */
function ensureDirectories(reflectionsDir) {
  if (!fs.existsSync(reflectionsDir)) {
    fs.mkdirSync(reflectionsDir, { recursive: true });
  }
}

/**
 * Load reflection state from disk.
 * @param {string} stateFile - State file path.
 * @returns {{lastRun: (string|null), processedDates: string[]}} Persisted state.
 */
function loadState(stateFile) {
  if (!fs.existsSync(stateFile)) {
    return { lastRun: null, processedDates: [] };
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(stateFile, "utf8"));
    return {
      lastRun: parsed.lastRun || null,
      processedDates: Array.isArray(parsed.processedDates) ? parsed.processedDates : [],
    };
  } catch (error) {
    return { lastRun: null, processedDates: [] };
  }
}

/**
 * Save reflection state to disk.
 * @param {string} stateFile - State file path.
 * @param {{lastRun: (string|null), processedDates: string[]}} state - State to persist.
 */
function saveState(stateFile, state) {
  fs.writeFileSync(stateFile, JSON.stringify(state, null, 2));
}

/**
 * List daily memory files.
 * @param {string} memoryDir - Memory directory path.
 * @returns {Array<{date: string, filePath: string}>} Sorted list of daily memory files.
 */
function getMemoryFiles(memoryDir) {
  if (!fs.existsSync(memoryDir)) return [];

  return fs
    .readdirSync(memoryDir)
    .filter((file) => MEMORY_FILE_REGEX.test(file))
    .sort()
    .map((file) => ({
      date: file.replace(".md", ""),
      filePath: path.join(memoryDir, file),
    }));
}

/**
 * Create a concise reflection summary string.
 * @param {{decisions: string[], lessons: string[], errors: string[]}} extracted - Extracted content buckets.
 * @returns {string} Human-readable summary.
 */
function buildReflectionText(extracted) {
  const parts = [];

  if (extracted.decisions.length > 0) {
    parts.push(`Captured ${extracted.decisions.length} decision(s) to preserve execution context.`);
  }

  if (extracted.lessons.length > 0) {
    parts.push(`Identified ${extracted.lessons.length} lesson(s) to reinforce what worked.`);
  }

  if (extracted.errors.length > 0) {
    parts.push(`Logged ${extracted.errors.length} error/risk item(s) for follow-up prevention.`);
  }

  if (parts.length === 0) {
    return "No clear decisions, lessons, or errors found in this memory file.";
  }

  return parts.join(" ");
}

/**
 * Parse memory content into structured reflection buckets.
 * @param {string} content - Memory file content.
 * @returns {{decisions: string[], lessons: string[], errors: string[]}} Extracted entries.
 */
function extractReflectionSignals(content) {
  const lines = content.split(/\r?\n/);
  const buckets = {
    decisions: [],
    lessons: [],
    errors: [],
  };

  let activeSection = null;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    if (line.startsWith("#")) {
      const heading = line.replace(/^#+\s*/, "").toLowerCase();

      if (/decision|decide|status/.test(heading)) {
        activeSection = "decisions";
      } else if (/lesson|learned|what we learned|learning/.test(heading)) {
        activeSection = "lessons";
      } else if (/error|issue|problem|failure|incident|risk/.test(heading)) {
        activeSection = "errors";
      } else {
        activeSection = null;
      }

      continue;
    }

    const normalized = line
      .replace(/^[-*]\s+/, "")
      .replace(/^\d+\.\s+/, "")
      .replace(/^\*\*(.+?)\*\*:?\s*/, "$1: ")
      .trim();

    if (!normalized) continue;

    const lower = normalized.toLowerCase();

    if (activeSection) {
      buckets[activeSection].push(normalized);
      continue;
    }

    if (/(^|\b)(decided|decision|agreed|chose|approved|finalized)\b/.test(lower)) {
      buckets.decisions.push(normalized);
      continue;
    }

    if (/(^|\b)(learned|lesson|insight|takeaway|what worked)\b/.test(lower)) {
      buckets.lessons.push(normalized);
      continue;
    }

    if (/(^|\b)(error|issue|bug|failed|failure|problem|broke|incident|risk)\b/.test(lower)) {
      buckets.errors.push(normalized);
      continue;
    }
  }

  return {
    decisions: Array.from(new Set(buckets.decisions)),
    lessons: Array.from(new Set(buckets.lessons)),
    errors: Array.from(new Set(buckets.errors)),
  };
}

/**
 * Get memory files that still need reflection generation.
 * A file is pending when no reflection exists, or the memory file changed after reflection generation.
 *
 * @param {Object} [options] - Optional configuration.
 * @param {string} [options.memoryDir] - Custom memory directory path.
 * @param {string} [options.reflectionsDir] - Custom reflections directory path.
 * @returns {Array<{date: string, filePath: string, reflectionPath: string, reason: string}>} Pending items.
 */
function getPendingReflections(options = {}) {
  const memoryDir = options.memoryDir || DEFAULT_MEMORY_DIR;
  const reflectionsDir = options.reflectionsDir || DEFAULT_REFLECTIONS_DIR;

  ensureDirectories(reflectionsDir);

  const memoryFiles = getMemoryFiles(memoryDir);

  return memoryFiles
    .map(({ date, filePath }) => {
      const reflectionPath = path.join(reflectionsDir, `${date}.json`);

      if (!fs.existsSync(reflectionPath)) {
        return { date, filePath, reflectionPath, reason: "missing_reflection" };
      }

      const memoryMtime = fs.statSync(filePath).mtimeMs;
      const reflectionMtime = fs.statSync(reflectionPath).mtimeMs;

      if (memoryMtime > reflectionMtime) {
        return { date, filePath, reflectionPath, reason: "memory_updated" };
      }

      return null;
    })
    .filter(Boolean);
}

/**
 * Run one reflection cycle over pending memory files.
 *
 * @param {Object} [options] - Optional configuration.
 * @param {string} [options.memoryDir] - Custom memory directory path.
 * @param {string} [options.reflectionsDir] - Custom reflections directory path.
 * @param {string} [options.stateFile] - Custom state file path.
 * @returns {{
 *   generatedAt: string,
 *   processedCount: number,
 *   pendingBefore: number,
 *   reflections: Array<{date: string, reflectionPath: string}>
 * }} Reflection run summary.
 */
function runReflection(options = {}) {
  const memoryDir = options.memoryDir || DEFAULT_MEMORY_DIR;
  const reflectionsDir = options.reflectionsDir || DEFAULT_REFLECTIONS_DIR;
  const stateFile =
    options.stateFile || path.join(reflectionsDir, path.basename(DEFAULT_STATE_FILE));

  ensureDirectories(reflectionsDir);

  const state = loadState(stateFile);
  const pending = getPendingReflections({ memoryDir, reflectionsDir });
  const reflections = [];

  for (const item of pending) {
    const content = fs.readFileSync(item.filePath, "utf8");
    const extracted = extractReflectionSignals(content);

    const reflection = {
      date: item.date,
      sourceFile: item.filePath,
      generatedAt: new Date().toISOString(),
      reason: item.reason,
      summary: {
        decisions: extracted.decisions.length,
        lessons: extracted.lessons.length,
        errors: extracted.errors.length,
      },
      reflection: buildReflectionText(extracted),
      entries: extracted,
    };

    fs.writeFileSync(item.reflectionPath, JSON.stringify(reflection, null, 2));
    reflections.push({ date: item.date, reflectionPath: item.reflectionPath });

    if (!state.processedDates.includes(item.date)) {
      state.processedDates.push(item.date);
    }
  }

  state.lastRun = new Date().toISOString();
  saveState(stateFile, state);

  return {
    generatedAt: state.lastRun,
    processedCount: reflections.length,
    pendingBefore: pending.length,
    reflections,
  };
}

/**
 * Schedule automated reflection runs.
 *
 * Default cron expression is every 6 hours: `0 *\/6 * * *`.
 *
 * @param {Object} [options] - Optional configuration.
 * @param {string} [options.cronExpression] - Cron schedule expression.
 * @param {boolean} [options.runOnStart=true] - Whether to run once immediately.
 * @param {string} [options.memoryDir] - Custom memory directory path.
 * @param {string} [options.reflectionsDir] - Custom reflections directory path.
 * @param {string} [options.stateFile] - Custom state file path.
 * @returns {{stop: Function, start?: Function, destroy?: Function}} Active scheduler handle.
 */
function scheduleReflection(options = {}) {
  const cronExpression = options.cronExpression || "0 */6 * * *";
  const runOnStart = options.runOnStart !== false;
  const cron = loadCronModule();

  if (cron && !cron.validate(cronExpression)) {
    throw new Error(`Invalid cron expression: ${cronExpression}`);
  }

  if (activeSchedule) {
    activeSchedule.stop();
  }

  const taskOptions = {
    memoryDir: options.memoryDir,
    reflectionsDir: options.reflectionsDir,
    stateFile: options.stateFile,
  };

  if (cron) {
    activeSchedule = cron.schedule(cronExpression, () => {
      try {
        runReflection(taskOptions);
      } catch (error) {
        // Keep scheduler alive even if one run fails.
        console.error("[memory-loop] Reflection run failed:", error.message);
      }
    });
  } else {
    if (cronExpression !== "0 */6 * * *") {
      throw new Error(
        "node-cron is not installed; only default 6-hour scheduling is supported in fallback mode.",
      );
    }

    const intervalMs = 6 * 60 * 60 * 1000;
    const timer = setInterval(() => {
      try {
        runReflection(taskOptions);
      } catch (error) {
        console.error("[memory-loop] Reflection run failed:", error.message);
      }
    }, intervalMs);

    activeSchedule = {
      stop() {
        clearInterval(timer);
      },
      destroy() {
        clearInterval(timer);
      },
    };
  }

  if (runOnStart) {
    runReflection(taskOptions);
  }

  return activeSchedule;
}

export { 
  runReflection,
  scheduleReflection,
  getPendingReflections,
  extractReflectionSignals,
 };

// Scheduled reflection triggers
const REFLECTION_SCHEDULE = ["08:00", "16:00", "00:00"];

function shouldRunReflection(now = new Date()) {
  const timeStr = now.toTimeString().slice(0, 5);
  return REFLECTION_SCHEDULE.includes(timeStr);
}

function getReflectionPriority(unreadCount, hoursSinceLast) {
  if (unreadCount > 50 || hoursSinceLast > 12) return "high";
  if (unreadCount > 20 || hoursSinceLast > 6) return "medium";
  return "low";
}

export {  shouldRunReflection, getReflectionPriority, REFLECTION_SCHEDULE  };
