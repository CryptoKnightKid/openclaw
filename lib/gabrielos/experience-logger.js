import { fileURLToPath } from "url";
import { dirname } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

import fs from "fs";
import { fileURLToPath } from "url";
import { dirname } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

import path from "path";

const EXPERIENCES_DIR = path.join(__dirname, "..", "memory", "experiences");
const PERSONALITY_FILE = path.join(__dirname, "..", "memory", "personality-profile.json");

// Ensure directory exists
if (!fs.existsSync(EXPERIENCES_DIR)) {
  fs.mkdirSync(EXPERIENCES_DIR, { recursive: true });
}

/**
 * Log a task experience
 * @param {Object} experience
 * @param {string} experience.taskType - Type of task (kol-research, coding, etc.)
 * @param {string} experience.approach - How handled (direct, muscles, sub-agents)
 * @param {number} experience.durationMinutes - How long it took
 * @param {number} experience.tokenEstimate - Rough token count
 * @param {string} experience.outcome - success, partial, failure
 * @param {string} experience.userFeedback - Your reaction (👍, 👎, or comment)
 * @param {string[]} experience.lessons - What I learned
 */
function logExperience(experience) {
  const today = new Date().toISOString().split("T")[0];
  const filePath = path.join(EXPERIENCES_DIR, `${today}.jsonl`);

  const entry = {
    id: `exp-${Date.now()}`,
    timestamp: new Date().toISOString(),
    ...experience,
  };

  // Ensure request field exists for pattern detection
  if (!entry.request && entry.taskType) {
    entry.request = `${entry.taskType} task`;
  }

  fs.appendFileSync(filePath, JSON.stringify(entry) + "\n");

  // Also analyze communication style if response was provided
  if (experience.response) {
    analyzeCommunicationStyle(experience);
  }
}

/**
 * Get recent experiences for pattern analysis
 * @param {number} days - How many days back to look
 * @returns {Array} Recent experiences
 */
function getRecentExperiences(days = 7) {
  const experiences = [];
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);

  const files = fs
    .readdirSync(EXPERIENCES_DIR)
    .filter((f) => f.endsWith(".jsonl"))
    .sort()
    .reverse();

  for (const file of files) {
    const fileDate = file.replace(".jsonl", "");
    if (new Date(fileDate) < cutoff) break;

    const content = fs.readFileSync(path.join(EXPERIENCES_DIR, file), "utf8");
    const lines = content.trim().split("\n").filter(Boolean);

    for (const line of lines) {
      try {
        experiences.push(JSON.parse(line));
      } catch (e) {
        // Skip malformed lines
      }
    }
  }

  return experiences;
}

/**
 * Analyze which approaches work best
 * @returns {Object} Approach effectiveness stats
 */
function analyzeApproachEffectiveness() {
  const experiences = getRecentExperiences(30);
  const stats = {};

  for (const exp of experiences) {
    const key = exp.approach || "unknown";
    if (!stats[key]) {
      stats[key] = { count: 0, success: 0, tokens: 0 };
    }
    stats[key].count++;
    if (exp.outcome === "success") stats[key].success++;
    stats[key].tokens += exp.tokenEstimate || 0;
  }

  // Calculate success rates
  for (const key in stats) {
    stats[key].successRate =
      stats[key].count > 0 ? ((stats[key].success / stats[key].count) * 100).toFixed(1) : 0;
    stats[key].avgTokens =
      stats[key].count > 0 ? Math.round(stats[key].tokens / stats[key].count) : 0;
  }

  return stats;
}

/**
 * Generate weekly review summary
 * Call this during Sunday heartbeat
 */
function generateWeeklyReview() {
  const experiences = getRecentExperiences(7);
  const stats = analyzeApproachEffectiveness();

  const summary = {
    weekEnding: new Date().toISOString().split("T")[0],
    totalTasks: experiences.length,
    approachStats: stats,
    lessons: experiences
      .filter((e) => e.lessons && e.lessons.length > 0)
      .flatMap((e) => e.lessons)
      .filter((v, i, a) => a.indexOf(v) === i), // Unique
    personality: getPersonalityProfile(),
  };

  const reviewPath = path.join(
    __dirname,
    "..",
    "memory",
    "weekly-reviews",
    `${summary.weekEnding}.json`,
  );
  if (!fs.existsSync(path.dirname(reviewPath))) {
    fs.mkdirSync(path.dirname(reviewPath), { recursive: true });
  }

  fs.writeFileSync(reviewPath, JSON.stringify(summary, null, 2));

  return summary;
}

// ============================================================================
// PERSONALITY ADAPTATION - NEW FEATURES
// ============================================================================

/**
 * Default personality profile
 */
const DEFAULT_PERSONALITY = {
  version: "1.0",
  lastUpdated: new Date().toISOString(),

  // Response length preferences
  responseLength: {
    preferred: "medium", // short, medium, long
    wordCount: {
      short: { min: 0, max: 50, target: 30 },
      medium: { min: 50, max: 200, target: 100 },
      long: { min: 200, max: 1000, target: 400 },
    },
    confidence: 0.5,
    feedbackHistory: [],
  },

  // Detail level preferences
  detailLevel: {
    preferred: "balanced", // minimal, balanced, thorough
    indicators: {
      minimal: ["summary", "brief", "quick", "short", "just", "only"],
      thorough: ["explain", "detail", "elaborate", "thorough", "comprehensive", "in-depth"],
    },
    confidence: 0.5,
    feedbackHistory: [],
  },

  // Communication style
  communicationStyle: {
    formality: "casual", // formal, casual, friendly
    emojiUsage: "moderate", // none, minimal, moderate, frequent
    bulletPoints: true,
    examplesPreferred: true,
    confidence: 0.5,
  },

  // Formatting preferences
  formatting: {
    headers: true,
    codeBlocks: true,
    tables: true,
    lists: true,
    boldKeyTerms: true,
  },

  // Task-specific preferences
  taskPreferences: {
    coding: {
      comments: "moderate",
      explanationStyle: "inline",
      testExamples: true,
    },
    research: {
      sourcesRequired: true,
      summaryFirst: true,
      depth: "medium",
    },
    writing: {
      tone: "professional",
      structure: "clear",
      editingLevel: "suggest",
    },
  },

  // Negative feedback tracking
  avoidPatterns: [],
};

/**
 * Load personality profile
 * @returns {Object} Personality profile
 */
function loadPersonalityProfile() {
  if (fs.existsSync(PERSONALITY_FILE)) {
    try {
      const saved = JSON.parse(fs.readFileSync(PERSONALITY_FILE, "utf8"));
      return { ...DEFAULT_PERSONALITY, ...saved };
    } catch (e) {
      console.error("Error loading personality profile:", e.message);
    }
  }
  return { ...DEFAULT_PERSONALITY };
}

/**
 * Save personality profile
 * @param {Object} profile - Profile to save
 */
function savePersonalityProfile(profile) {
  profile.lastUpdated = new Date().toISOString();
  fs.writeFileSync(PERSONALITY_FILE, JSON.stringify(profile, null, 2));
}

/**
 * Get current personality profile
 * @returns {Object} Personality profile
 */
function getPersonalityProfile() {
  return loadPersonalityProfile();
}

/**
 * Analyze communication style from experience entry
 * @param {Object} experience - Experience entry with response
 */
function analyzeCommunicationStyle(experience) {
  const profile = loadPersonalityProfile();
  const response = experience.response || "";
  const feedback = experience.userFeedback || "";
  const request = experience.request || "";

  // Analyze response length
  const wordCount = response.split(/\s+/).length;

  // Check for length-related feedback
  const lengthIndicators = {
    tooLong: ["too long", "verbose", "wordy", "concise", "shorter", "brief", "tl;dr", "summary"],
    tooShort: ["more detail", "elaborate", "expand", "more info", "longer", "explain more"],
  };

  const feedbackLower = feedback.toLowerCase();

  for (const indicator of lengthIndicators.tooLong) {
    if (feedbackLower.includes(indicator)) {
      profile.responseLength.feedbackHistory.push({
        timestamp: new Date().toISOString(),
        wordCount,
        feedback: "too_long",
        indicator,
      });

      // Shift preference toward shorter
      if (profile.responseLength.preferred === "long") {
        profile.responseLength.preferred = "medium";
      } else if (profile.responseLength.preferred === "medium") {
        profile.responseLength.preferred = "short";
      }

      profile.responseLength.confidence = Math.min(0.9, profile.responseLength.confidence + 0.1);
      break;
    }
  }

  for (const indicator of lengthIndicators.tooShort) {
    if (feedbackLower.includes(indicator)) {
      profile.responseLength.feedbackHistory.push({
        timestamp: new Date().toISOString(),
        wordCount,
        feedback: "too_short",
        indicator,
      });

      // Shift preference toward longer
      if (profile.responseLength.preferred === "short") {
        profile.responseLength.preferred = "medium";
      } else if (profile.responseLength.preferred === "medium") {
        profile.responseLength.preferred = "long";
      }

      profile.responseLength.confidence = Math.min(0.9, profile.responseLength.confidence + 0.1);
      break;
    }
  }

  // Analyze detail level from request
  for (const [level, indicators] of Object.entries(profile.detailLevel.indicators)) {
    for (const indicator of indicators) {
      if (request.toLowerCase().includes(indicator)) {
        profile.detailLevel.preferred = level;
        profile.detailLevel.confidence = Math.min(0.9, profile.detailLevel.confidence + 0.05);
        profile.detailLevel.feedbackHistory.push({
          timestamp: new Date().toISOString(),
          detectedLevel: level,
          indicator,
        });
        break;
      }
    }
  }

  // Track positive feedback
  if (
    feedback.includes("👍") ||
    feedbackLower.includes("perfect") ||
    feedbackLower.includes("exactly")
  ) {
    profile.responseLength.confidence = Math.min(0.95, profile.responseLength.confidence + 0.05);
    profile.detailLevel.confidence = Math.min(0.95, profile.detailLevel.confidence + 0.05);
  }

  // Track patterns to avoid
  if (
    feedback.includes("👎") ||
    feedbackLower.includes("don't") ||
    feedbackLower.includes("avoid")
  ) {
    const avoidPattern = extractAvoidPattern(feedback, response);
    if (avoidPattern && !profile.avoidPatterns.some((p) => p.pattern === avoidPattern)) {
      profile.avoidPatterns.push({
        pattern: avoidPattern,
        timestamp: new Date().toISOString(),
        context: request.slice(0, 100),
      });

      // Keep only last 20 avoid patterns
      if (profile.avoidPatterns.length > 20) {
        profile.avoidPatterns = profile.avoidPatterns.slice(-20);
      }
    }
  }

  // Analyze emoji usage preference
  const emojiCount = (response.match(/[\u{1F300}-\u{1F9FF}]/gu) || []).length;
  if (emojiCount > 5) {
    profile.communicationStyle.emojiUsage = "frequent";
  } else if (emojiCount > 0) {
    profile.communicationStyle.emojiUsage = "moderate";
  } else if (feedbackLower.includes("emoji") || feedbackLower.includes("tone")) {
    // User specifically mentioned emojis
    if (feedbackLower.includes("more") || feedbackLower.includes("add")) {
      profile.communicationStyle.emojiUsage = "moderate";
    } else if (feedbackLower.includes("less") || feedbackLower.includes("remove")) {
      profile.communicationStyle.emojiUsage = "minimal";
    }
  }

  // Keep only last 50 feedback entries per category
  if (profile.responseLength.feedbackHistory.length > 50) {
    profile.responseLength.feedbackHistory = profile.responseLength.feedbackHistory.slice(-50);
  }
  if (profile.detailLevel.feedbackHistory.length > 50) {
    profile.detailLevel.feedbackHistory = profile.detailLevel.feedbackHistory.slice(-50);
  }

  savePersonalityProfile(profile);
}

/**
 * Extract pattern to avoid from feedback
 * @param {string} feedback - User feedback
 * @param {string} response - Response that triggered feedback
 * @returns {string|null} Pattern to avoid
 */
function extractAvoidPattern(feedback, response) {
  const feedbackLower = feedback.toLowerCase();

  // Common patterns to detect
  if (feedbackLower.includes("too formal")) return "overly_formal";
  if (feedbackLower.includes("too casual")) return "overly_casual";
  if (feedbackLower.includes("table") && feedbackLower.includes("don't")) return "using_tables";
  if (feedbackLower.includes("list") && feedbackLower.includes("don't")) return "using_lists";
  if (feedbackLower.includes("code") && feedbackLower.includes("don't")) return "showing_code";
  if (feedbackLower.includes("joke")) return "making_jokes";
  if (feedbackLower.includes("sorry") || feedbackLower.includes("apologize"))
    return "over_apologizing";

  return null;
}

/**
 * Get adapted response guidelines
 * @returns {Object} Guidelines for response generation
 */
function getResponseGuidelines() {
  const profile = loadPersonalityProfile();

  const guidelines = {
    length: {
      target: profile.responseLength.wordCount[profile.responseLength.preferred].target,
      range: {
        min: profile.responseLength.wordCount[profile.responseLength.preferred].min,
        max: profile.responseLength.wordCount[profile.responseLength.preferred].max,
      },
    },
    detail: profile.detailLevel.preferred,
    style: {
      formality: profile.communicationStyle.formality,
      emojiUsage: profile.communicationStyle.emojiUsage,
      useBulletPoints: profile.communicationStyle.bulletPoints,
      provideExamples: profile.communicationStyle.examplesPreferred,
    },
    formatting: profile.formatting,
    avoid: profile.avoidPatterns.map((p) => p.pattern),
    confidence: {
      length: profile.responseLength.confidence,
      detail: profile.detailLevel.confidence,
    },
  };

  return guidelines;
}

/**
 * Format guidelines for display
 * @returns {string} Formatted guidelines
 */
function formatGuidelines() {
  const guidelines = getResponseGuidelines();

  let output = "## Response Guidelines (Adapted)\n\n";

  output += `**Length:** Target ~${guidelines.length.target} words `;
  output += `(${guidelines.length.range.min}-${guidelines.length.range.max})\n`;
  output += `**Detail Level:** ${guidelines.detail}\n`;
  output += `**Style:** ${guidelines.style.formality}, emojis: ${guidelines.style.emojiUsage}\n`;
  output += `**Formatting:** ${Object.entries(guidelines.formatting)
    .filter(([_, v]) => v)
    .map(([k]) => k)
    .join(", ")}\n`;

  if (guidelines.avoid.length > 0) {
    output += `**Avoid:** ${guidelines.avoid.join(", ")}\n`;
  }

  output += `\n*Confidence: Length ${Math.round(guidelines.confidence.length * 100)}%, `;
  output += `Detail ${Math.round(guidelines.confidence.detail * 100)}%*\n`;

  return output;
}

/**
 * Update personality based on explicit preference
 * @param {string} preferenceType - Type of preference
 * @param {string} value - Preference value
 */
function setPreference(preferenceType, value) {
  const profile = loadPersonalityProfile();

  switch (preferenceType) {
    case "length":
      if (["short", "medium", "long"].includes(value)) {
        profile.responseLength.preferred = value;
        profile.responseLength.confidence = 0.9;
      }
      break;

    case "detail":
      if (["minimal", "balanced", "thorough"].includes(value)) {
        profile.detailLevel.preferred = value;
        profile.detailLevel.confidence = 0.9;
      }
      break;

    case "formality":
      if (["formal", "casual", "friendly"].includes(value)) {
        profile.communicationStyle.formality = value;
      }
      break;

    case "emoji":
      if (["none", "minimal", "moderate", "frequent"].includes(value)) {
        profile.communicationStyle.emojiUsage = value;
      }
      break;
  }

  savePersonalityProfile(profile);
  return profile;
}

/**
 * Get personality summary for display
 * @returns {string} Formatted summary
 */
function getPersonalitySummary() {
  const profile = loadPersonalityProfile();

  let output = "# 🎭 Personality Profile\n\n";
  output += `*Last updated: ${new Date(profile.lastUpdated).toLocaleDateString()}*\n\n`;

  output += "## Communication Preferences\n\n";
  output += `- **Response Length:** ${profile.responseLength.preferred} `;
  output += `(confidence: ${Math.round(profile.responseLength.confidence * 100)}%)\n`;
  output += `- **Detail Level:** ${profile.detailLevel.preferred} `;
  output += `(confidence: ${Math.round(profile.detailLevel.confidence * 100)}%)\n`;
  output += `- **Formality:** ${profile.communicationStyle.formality}\n`;
  output += `- **Emoji Usage:** ${profile.communicationStyle.emojiUsage}\n\n`;

  if (profile.avoidPatterns.length > 0) {
    output += "## Patterns to Avoid\n\n";
    for (const pattern of profile.avoidPatterns.slice(-5)) {
      output += `- ${pattern.pattern} (${new Date(pattern.timestamp).toLocaleDateString()})\n`;
    }
    output += "\n";
  }

  output += "## Feedback History\n\n";
  output += `- Length feedback: ${profile.responseLength.feedbackHistory.length} entries\n`;
  output += `- Detail feedback: ${profile.detailLevel.feedbackHistory.length} entries\n`;

  return output;
}

/**
 * Reset personality to defaults
 */
function resetPersonality() {
  savePersonalityProfile({ ...DEFAULT_PERSONALITY });
  return DEFAULT_PERSONALITY;
}

export { 
  // Original exports
  logExperience,
  getRecentExperiences,
  analyzeApproachEffectiveness,
  generateWeeklyReview,

  // New personality adaptation exports
  loadPersonalityProfile,
  savePersonalityProfile,
  getPersonalityProfile,
  analyzeCommunicationStyle,
  getResponseGuidelines,
  formatGuidelines,
  setPreference,
  getPersonalitySummary,
  resetPersonality,
  DEFAULT_PERSONALITY,
 };

// Weekly pattern extraction from logs
function extractWeeklyPatterns(logEntries) {
  const patterns = {
    successRate: 0,
    avgDuration: 0,
    commonFailures: {},
    topStrategies: [],
  };

  if (logEntries.length === 0) return patterns;

  const successes = logEntries.filter((e) => e.outcome === "success");
  patterns.successRate = successes.length / logEntries.length;
  patterns.avgDuration = logEntries.reduce((a, b) => a + (b.duration || 0), 0) / logEntries.length;

  // Count failure types
  logEntries
    .filter((e) => e.outcome === "failure")
    .forEach((e) => {
      const key = e.lessons?.[0] || "unknown";
      patterns.commonFailures[key] = (patterns.commonFailures[key] || 0) + 1;
    });

  return patterns;
}

/**
 * Suggest patterns based on task type
 * @param {Object} options - Options for pattern suggestion
 * @returns {Array} Suggested patterns
 */
function suggestPatterns(options = {}) {
  const { taskType, approach } = options;
  const experiences = getRecentExperiences(30);
  
  // Filter by task type if specified
  let relevant = experiences;
  if (taskType) {
    relevant = relevant.filter(e => e.taskType === taskType);
  }
  if (approach) {
    relevant = relevant.filter(e => e.approach === approach);
  }
  
  // Group by task type and find successful patterns
  const byType = {};
  relevant.forEach(e => {
    const type = e.taskType || 'general';
    if (!byType[type]) byType[type] = [];
    byType[type].push(e);
  });
  
  const suggestions = [];
  for (const [type, exps] of Object.entries(byType)) {
    const successful = exps.filter(e => e.outcome === 'success');
    if (successful.length > 0) {
      // Find most common approach
      const approaches = {};
      successful.forEach(e => {
        approaches[e.approach] = (approaches[e.approach] || 0) + 1;
      });
      const bestApproach = Object.entries(approaches)
        .sort((a, b) => b[1] - a[1])[0]?.[0];
      
      suggestions.push({
        taskType: type,
        bestApproach,
        successRate: (successful.length / exps.length * 100).toFixed(1),
        sampleSize: exps.length
      });
    }
  }
  
  return suggestions;
}

/**
 * Update personality profile (alias for setPreference for compatibility)
 * @param {string} preferenceType - Type of preference
 * @param {string} value - Preference value
 */
function updatePersonalityProfile(preferenceType, value) {
  return setPreference(preferenceType, value);
}
