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

const ROOT_DIR = path.join(__dirname, "..");
const MEMORY_DIR = path.join(ROOT_DIR, "memory");
const HEALTH_FILE = path.join(MEMORY_DIR, "system-health.json");
const SKILLS_GRAPH_DIR = path.join(ROOT_DIR, "skills-graph");
const MEMORY_BACKUPS_DIR = path.join(MEMORY_DIR, "backups");
const MEMORY_LATEST_FILE = path.join(MEMORY_DIR, "LATEST.md");
const LOADED_MEMORY_FILE = path.join(ROOT_DIR, ".loaded-memory");
const COMPACTION_LOG_FILE = "/tmp/compaction.log";

const STATUS_WEIGHT = {
  healthy: 0,
  warning: 1,
  critical: 2,
  error: 3,
};

/**
 * Return current timestamp as ISO string.
 * @returns {string}
 */
function nowIso() {
  return new Date().toISOString();
}

/**
 * Convert text length into rough token estimate.
 * @param {string} text
 * @returns {number}
 */
function estimateTokens(text) {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

/**
 * Safely read file contents.
 * @param {string} filePath
 * @returns {{exists: boolean, content: string|null, error: string|null}}
 */
function safeReadFile(filePath) {
  try {
    if (!fs.existsSync(filePath)) {
      return { exists: false, content: null, error: null };
    }
    return { exists: true, content: fs.readFileSync(filePath, "utf8"), error: null };
  } catch (error) {
    return { exists: false, content: null, error: error.message };
  }
}

/**
 * Safely stat a file path.
 * @param {string} filePath
 * @returns {{exists: boolean, mtimeMs: number|null, sizeBytes: number|null, error: string|null}}
 */
function safeStat(filePath) {
  try {
    if (!fs.existsSync(filePath)) {
      return { exists: false, mtimeMs: null, sizeBytes: null, error: null };
    }
    const stat = fs.statSync(filePath);
    return { exists: true, mtimeMs: stat.mtimeMs, sizeBytes: stat.size, error: null };
  } catch (error) {
    return { exists: false, mtimeMs: null, sizeBytes: null, error: error.message };
  }
}

/**
 * Find newest file in a directory by mtime.
 * @param {string} directory
 * @param {(fileName: string) => boolean} [matcher]
 * @returns {{exists: boolean, filePath: string|null, fileName: string|null, mtimeMs: number|null, ageMinutes: number|null, error: string|null}}
 */
function findNewestFile(directory, matcher = () => true) {
  try {
    if (!fs.existsSync(directory)) {
      return {
        exists: false,
        filePath: null,
        fileName: null,
        mtimeMs: null,
        ageMinutes: null,
        error: null,
      };
    }

    const candidates = fs.readdirSync(directory).filter(matcher);
    if (!candidates.length) {
      return {
        exists: false,
        filePath: null,
        fileName: null,
        mtimeMs: null,
        ageMinutes: null,
        error: null,
      };
    }

    let newest = null;
    for (const fileName of candidates) {
      const filePath = path.join(directory, fileName);
      const stat = fs.statSync(filePath);
      if (!stat.isFile()) continue;
      if (!newest || stat.mtimeMs > newest.mtimeMs) {
        newest = { filePath, fileName, mtimeMs: stat.mtimeMs };
      }
    }

    if (!newest) {
      return {
        exists: false,
        filePath: null,
        fileName: null,
        mtimeMs: null,
        ageMinutes: null,
        error: null,
      };
    }

    return {
      exists: true,
      filePath: newest.filePath,
      fileName: newest.fileName,
      mtimeMs: newest.mtimeMs,
      ageMinutes: Math.round((Date.now() - newest.mtimeMs) / 60000),
      error: null,
    };
  } catch (error) {
    return {
      exists: false,
      filePath: null,
      fileName: null,
      mtimeMs: null,
      ageMinutes: null,
      error: error.message,
    };
  }
}

/**
 * Recursively count markdown files in a directory.
 * @param {string} directory
 * @returns {{count: number, newestMtimeMs: number|null, error: string|null}}
 */
function countMarkdownFiles(directory) {
  try {
    if (!fs.existsSync(directory)) {
      return { count: 0, newestMtimeMs: null, error: null };
    }

    const stack = [directory];
    let count = 0;
    let newestMtimeMs = null;

    while (stack.length) {
      const current = stack.pop();
      const entries = fs.readdirSync(current, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(current, entry.name);
        if (entry.isDirectory()) {
          stack.push(fullPath);
          continue;
        }
        if (!entry.isFile() || !entry.name.endsWith(".md")) continue;
        count += 1;
        const stat = fs.statSync(fullPath);
        if (!newestMtimeMs || stat.mtimeMs > newestMtimeMs) {
          newestMtimeMs = stat.mtimeMs;
        }
      }
    }

    return { count, newestMtimeMs, error: null };
  } catch (error) {
    return { count: 0, newestMtimeMs: null, error: error.message };
  }
}

/**
 * Return the worse status between two values.
 * @param {string} current
 * @param {string} candidate
 * @returns {string}
 */
function maxStatus(current, candidate) {
  if (!STATUS_WEIGHT.hasOwnProperty(candidate)) return current;
  if (!STATUS_WEIGHT.hasOwnProperty(current)) return candidate;
  return STATUS_WEIGHT[candidate] > STATUS_WEIGHT[current] ? candidate : current;
}

/**
 * Check memory loop freshness (daily memory, LATEST summary, and rolling backups).
 * @returns {{
 *   status: 'healthy'|'warning'|'critical'|'error',
 *   checkedAt: string,
 *   details: Record<string, unknown>,
 *   issues: string[]
 * }}
 */
function checkMemoryLoopStatus() {
  const today = new Date().toISOString().split("T")[0];
  const todayMemoryFile = path.join(MEMORY_DIR, `${today}.md`);
  const todayStat = safeStat(todayMemoryFile);
  const latestStat = safeStat(MEMORY_LATEST_FILE);
  const latestBackup = findNewestFile(
    MEMORY_BACKUPS_DIR,
    (name) => name.endsWith(".md") || name.endsWith(".bak"),
  );

  let status = "healthy";
  const issues = [];

  if (!todayStat.exists) {
    status = maxStatus(status, "critical");
    issues.push(`Missing daily memory file for ${today}`);
  }

  if (!latestStat.exists) {
    status = maxStatus(status, "warning");
    issues.push("Missing memory/LATEST.md summary file");
  } else {
    const latestAgeMinutes = Math.round((Date.now() - latestStat.mtimeMs) / 60000);
    if (latestAgeMinutes > 180) {
      status = maxStatus(status, "warning");
      issues.push(`memory/LATEST.md is stale (${latestAgeMinutes} minutes old)`);
    }
  }

  if (!latestBackup.exists) {
    status = maxStatus(status, "warning");
    issues.push("No backup snapshots found in memory/backups");
  } else if (latestBackup.ageMinutes > 180) {
    status = maxStatus(status, "critical");
    issues.push(`Latest memory backup is stale (${latestBackup.ageMinutes} minutes old)`);
  }

  if (todayStat.error || latestStat.error || latestBackup.error) {
    status = maxStatus(status, "error");
    issues.push("Read error while checking memory loop");
  }

  return {
    status,
    checkedAt: nowIso(),
    details: {
      todayMemoryFile,
      todayMemoryExists: todayStat.exists,
      latestSummaryFile: MEMORY_LATEST_FILE,
      latestSummaryExists: latestStat.exists,
      latestSummaryAgeMinutes: latestStat.exists
        ? Math.round((Date.now() - latestStat.mtimeMs) / 60000)
        : null,
      latestBackupFile: latestBackup.filePath,
      latestBackupAgeMinutes: latestBackup.ageMinutes,
    },
    issues,
  };
}

/**
 * Check skills graph integrity and recency.
 * @returns {{
 *   status: 'healthy'|'warning'|'critical'|'error',
 *   checkedAt: string,
 *   details: Record<string, unknown>,
 *   issues: string[]
 * }}
 */
function checkSkillsGraphStatus() {
  const skillsGraphStat = safeStat(SKILLS_GRAPH_DIR);
  const skillsGraphIndexStat = safeStat(path.join(SKILLS_GRAPH_DIR, "index.md"));
  const markdownScan = countMarkdownFiles(SKILLS_GRAPH_DIR);

  let status = "healthy";
  const issues = [];

  if (!skillsGraphStat.exists) {
    status = maxStatus(status, "critical");
    issues.push("skills-graph directory is missing");
  }

  if (!skillsGraphIndexStat.exists) {
    status = maxStatus(status, "warning");
    issues.push("skills-graph/index.md is missing");
  }

  if (!markdownScan.error && markdownScan.count < 5) {
    status = maxStatus(status, "warning");
    issues.push(`Skills graph has low content density (${markdownScan.count} markdown files)`);
  }

  if (markdownScan.newestMtimeMs) {
    const ageDays = Math.round((Date.now() - markdownScan.newestMtimeMs) / 86400000);
    if (ageDays > 180) {
      status = maxStatus(status, "warning");
      issues.push(`Skills graph has not been updated for ${ageDays} days`);
    }
  }

  if (skillsGraphStat.error || skillsGraphIndexStat.error || markdownScan.error) {
    status = maxStatus(status, "error");
    issues.push("Read error while checking skills graph");
  }

  return {
    status,
    checkedAt: nowIso(),
    details: {
      skillsGraphDir: SKILLS_GRAPH_DIR,
      exists: skillsGraphStat.exists,
      hasIndex: skillsGraphIndexStat.exists,
      markdownFiles: markdownScan.count,
      latestSkillUpdateAt: markdownScan.newestMtimeMs
        ? new Date(markdownScan.newestMtimeMs).toISOString()
        : null,
    },
    issues,
  };
}

/**
 * Check backup posture across local memory backups and encrypted nightly backups.
 * @returns {{
 *   status: 'healthy'|'warning'|'critical'|'error',
 *   checkedAt: string,
 *   details: Record<string, unknown>,
 *   issues: string[]
 * }}
 */
function checkBackupStatus() {
  const memorySnapshot = findNewestFile(
    MEMORY_BACKUPS_DIR,
    (name) => name.endsWith(".md") || name.endsWith(".bak"),
  );
  const backupScript = safeStat(path.join(ROOT_DIR, "backup-nightly.sh"));
  const restoreScript = safeStat(path.join(ROOT_DIR, "restore-backup.sh"));

  const encryptedDirCandidates = ["/root/.openclaw/backups", "/home/ubuntu/.openclaw/backups"];
  let encryptedBackup = null;
  let encryptedDirUsed = null;
  for (const candidate of encryptedDirCandidates) {
    const scan = findNewestFile(candidate, (name) => /^openclaw_backup_.*\.enc$/.test(name));
    if (scan.error) {
      encryptedBackup = scan;
      encryptedDirUsed = candidate;
      break;
    }
    if (scan.exists) {
      encryptedBackup = scan;
      encryptedDirUsed = candidate;
      break;
    }
    if (!encryptedBackup) {
      encryptedBackup = scan;
      encryptedDirUsed = candidate;
    }
  }

  let status = "healthy";
  const issues = [];

  if (!backupScript.exists || !restoreScript.exists) {
    status = maxStatus(status, "critical");
    issues.push("Backup/restore scripts are missing");
  }

  if (!memorySnapshot.exists) {
    status = maxStatus(status, "warning");
    issues.push("No rolling memory backup snapshots found");
  } else if (memorySnapshot.ageMinutes > 360) {
    status = maxStatus(status, "critical");
    issues.push(`Rolling memory backup appears stale (${memorySnapshot.ageMinutes} minutes old)`);
  }

  if (encryptedBackup && encryptedBackup.error) {
    status = maxStatus(status, "error");
    issues.push(
      `Unable to inspect encrypted backups in ${encryptedDirUsed}: ${encryptedBackup.error}`,
    );
  } else if (encryptedBackup && !encryptedBackup.exists) {
    status = maxStatus(status, "warning");
    issues.push(`No encrypted nightly backup found in ${encryptedDirUsed}`);
  } else if (encryptedBackup && encryptedBackup.ageMinutes > 48 * 60) {
    status = maxStatus(status, "critical");
    issues.push(
      `Encrypted nightly backup is stale (${Math.round(encryptedBackup.ageMinutes / 60)} hours old)`,
    );
  }

  return {
    status,
    checkedAt: nowIso(),
    details: {
      memoryBackupsDir: MEMORY_BACKUPS_DIR,
      latestMemorySnapshot: memorySnapshot.filePath,
      latestMemorySnapshotAgeMinutes: memorySnapshot.ageMinutes,
      backupScript: path.join(ROOT_DIR, "backup-nightly.sh"),
      restoreScript: path.join(ROOT_DIR, "restore-backup.sh"),
      encryptedBackupDir: encryptedDirUsed,
      encryptedBackupFile: encryptedBackup ? encryptedBackup.filePath : null,
      encryptedBackupAgeMinutes: encryptedBackup ? encryptedBackup.ageMinutes : null,
    },
    issues,
  };
}

/**
 * Check context usage risk signals from local memory state and compaction logs.
 * @returns {{
 *   status: 'healthy'|'warning'|'critical'|'error',
 *   checkedAt: string,
 *   details: Record<string, unknown>,
 *   issues: string[]
 * }}
 */
function checkContextUsage() {
  const today = new Date().toISOString().split("T")[0];
  const dailyMemoryFile = path.join(MEMORY_DIR, `${today}.md`);
  const loadedMemory = safeReadFile(LOADED_MEMORY_FILE);
  const dailyMemory = safeReadFile(dailyMemoryFile);
  const compactionLog = safeReadFile(COMPACTION_LOG_FILE);

  const loadedTokens = loadedMemory.exists ? estimateTokens(loadedMemory.content) : 0;
  const dailyTokens = dailyMemory.exists ? estimateTokens(dailyMemory.content) : 0;
  const estimatedTokens = loadedTokens + dailyTokens;
  const contextWindowTokens = 1000000;
  const usagePercent = Number(((estimatedTokens / contextWindowTokens) * 100).toFixed(2));

  let status = "healthy";
  const issues = [];

  if (usagePercent >= 90) {
    status = maxStatus(status, "critical");
    issues.push(`Estimated context usage is critical (${usagePercent}%)`);
  } else if (usagePercent >= 80) {
    status = maxStatus(status, "warning");
    issues.push(`Estimated context usage is high (${usagePercent}%)`);
  }

  let compactionEventsLast24h = 0;
  if (compactionLog.exists && compactionLog.content) {
    compactionEventsLast24h = (compactionLog.content.match(/Compaction needed/g) || []).length;
    if (compactionEventsLast24h >= 4) {
      status = maxStatus(status, "warning");
      issues.push(
        `Frequent compaction triggers detected (${compactionEventsLast24h} events logged)`,
      );
    }
  }

  if (loadedMemory.error || dailyMemory.error || compactionLog.error) {
    status = maxStatus(status, "error");
    issues.push("Read error while checking context usage");
  }

  return {
    status,
    checkedAt: nowIso(),
    details: {
      contextWindowTokens,
      estimatedTokens,
      usagePercent,
      loadedMemoryTokens: loadedTokens,
      dailyMemoryTokens: dailyTokens,
      loadedMemoryFile: LOADED_MEMORY_FILE,
      dailyMemoryFile,
      compactionLogFile: COMPACTION_LOG_FILE,
      compactionEventsLast24h,
    },
    issues,
  };
}

/**
 * Persist a health report to memory/system-health.json.
 * @param {Record<string, unknown>} report
 */
function saveHealthReport(report) {
  if (!fs.existsSync(MEMORY_DIR)) {
    fs.mkdirSync(MEMORY_DIR, { recursive: true });
  }
  fs.writeFileSync(HEALTH_FILE, JSON.stringify(report, null, 2));
}

/**
 * Generate a full system health report and persist it to memory/system-health.json.
 * @returns {{
 *   timestamp: string,
 *   overallStatus: 'healthy'|'warning'|'critical'|'error',
 *   checks: {
 *     memoryLoop: ReturnType<typeof checkMemoryLoopStatus>,
 *     skillsGraph: ReturnType<typeof checkSkillsGraphStatus>,
 *     backup: ReturnType<typeof checkBackupStatus>,
 *     contextUsage: ReturnType<typeof checkContextUsage>
 *   },
 *   issues: string[],
 *   healthFile: string
 * }}
 */
function generateHealthReport() {
  const checks = {
    memoryLoop: checkMemoryLoopStatus(),
    skillsGraph: checkSkillsGraphStatus(),
    backup: checkBackupStatus(),
    contextUsage: checkContextUsage(),
  };

  let overallStatus = "healthy";
  const issues = [];

  for (const check of Object.values(checks)) {
    overallStatus = maxStatus(overallStatus, check.status);
    if (Array.isArray(check.issues) && check.issues.length) {
      issues.push(...check.issues);
    }
  }

  const report = {
    timestamp: nowIso(),
    overallStatus,
    checks,
    issues,
    healthFile: HEALTH_FILE,
  };

  saveHealthReport(report);
  return report;
}

/**
 * Get current health snapshot and persist it to memory/system-health.json.
 * @returns {ReturnType<typeof generateHealthReport>}
 */
function getSystemHealth() {
  return generateHealthReport();
}

export { 
  getSystemHealth,
  checkMemoryLoopStatus,
  checkSkillsGraphStatus,
  checkBackupStatus,
  checkContextUsage,
  generateHealthReport,
 };

// Health metrics aggregation
const healthMetrics = {
  apiCalls: { total: 0, errors: 0, byModel: {} },
  costs: { daily: 0, monthly: 0, byService: {} },
  uptime: { startTime: Date.now(), checks: [] },
};

function recordApiCall(model, success, cost = 0) {
  healthMetrics.apiCalls.total++;
  if (!success) healthMetrics.apiCalls.errors++;
  if (!healthMetrics.apiCalls.byModel[model]) {
    healthMetrics.apiCalls.byModel[model] = { calls: 0, errors: 0 };
  }
  healthMetrics.apiCalls.byModel[model].calls++;
  if (!success) healthMetrics.apiCalls.byModel[model].errors++;
  healthMetrics.costs.daily += cost;
  healthMetrics.costs.monthly += cost;
}

function getHealthReport() {
  const uptime = Date.now() - healthMetrics.uptime.startTime;
  const errorRate =
    healthMetrics.apiCalls.total > 0
      ? healthMetrics.apiCalls.errors / healthMetrics.apiCalls.total
      : 0;
  return { uptime, errorRate, costs: healthMetrics.costs };
}

export {  recordApiCall, getHealthReport, healthMetrics  };
