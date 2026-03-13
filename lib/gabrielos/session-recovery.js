/**
 * Session Crash Recovery Module
 *
 * Detects likely memory/session crashes by comparing `memory/` with
 * `memory/backups/`, generates diff reports, and provides safe restore flows.
 */

import { fileURLToPath } from "url";
import { dirname } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

import fs from "fs";
import path from "path";

const ROOT_DIR = path.join(__dirname, "..");
const MEMORY_DIR = path.join(ROOT_DIR, "memory");
const BACKUP_DIR = path.join(MEMORY_DIR, "backups");
const REPORT_DIR = path.join(MEMORY_DIR, "recovery-reports");
const RECOVERY_LOG = path.join(MEMORY_DIR, "session-recovery-log.jsonl");

/**
 * @typedef {Object} DiffStats
 * @property {boolean} changed
 * @property {number} changedLineCount
 * @property {number} addedLineCount
 * @property {number} removedLineCount
 * @property {number} currentLineCount
 * @property {number} backupLineCount
 */

/**
 * @typedef {Object} CrashCheckResult
 * @property {boolean} crashDetected
 * @property {'low'|'medium'|'high'} confidence
 * @property {string[]} reasons
 * @property {string} reportPath
 * @property {Object} report
 */

ensureDir(MEMORY_DIR);
ensureDir(BACKUP_DIR);
ensureDir(REPORT_DIR);

/**
 * Ensure a directory exists.
 * @param {string} dirPath - Directory to create if missing.
 */
function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

/**
 * Return YYYY-MM-DD for local time.
 * @returns {string}
 */
function getTodayDateString() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Format date as YYYY-MM-DD-HHmmss.
 * @param {Date} [value]
 * @returns {string}
 */
function formatTimestamp(value = new Date()) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  const hours = String(value.getHours()).padStart(2, "0");
  const minutes = String(value.getMinutes()).padStart(2, "0");
  const seconds = String(value.getSeconds()).padStart(2, "0");
  return `${year}-${month}-${day}-${hours}${minutes}${seconds}`;
}

/**
 * Write a JSONL log entry.
 * @param {Object} entry - Entry data.
 */
function logRecoveryEvent(entry) {
  const payload = {
    timestamp: new Date().toISOString(),
    ...entry,
  };
  fs.appendFileSync(RECOVERY_LOG, JSON.stringify(payload) + "\n");
}

/**
 * Parse backup date/time from file name.
 * Supports patterns like `YYYY-MM-DD-HHMM.md`.
 * @param {string} fileName - Base file name.
 * @returns {{date: string|null, time: string|null}}
 */
function parseBackupName(fileName) {
  const match = fileName.match(/^(\d{4}-\d{2}-\d{2})-(\d{4})(?:\..+)?$/);
  if (!match) {
    return { date: null, time: null };
  }
  return { date: match[1], time: match[2] };
}

/**
 * Read UTF-8 file or empty string if missing.
 * @param {string} filePath - Absolute path.
 * @returns {string}
 */
function readText(filePath) {
  if (!fs.existsSync(filePath)) return "";
  return fs.readFileSync(filePath, "utf8");
}

/**
 * Build line-level diff stats for two strings.
 * @param {string} currentContent - Content from memory/.
 * @param {string} backupContent - Content from memory/backups/.
 * @returns {DiffStats}
 */
function computeDiffStats(currentContent, backupContent) {
  const currentLines = currentContent.split(/\r?\n/);
  const backupLines = backupContent.split(/\r?\n/);
  const maxLen = Math.max(currentLines.length, backupLines.length);

  let changedLineCount = 0;
  let addedLineCount = 0;
  let removedLineCount = 0;

  for (let i = 0; i < maxLen; i++) {
    const currentLine = currentLines[i];
    const backupLine = backupLines[i];

    if (currentLine === backupLine) continue;
    changedLineCount++;

    if (backupLine === undefined && currentLine !== undefined) {
      addedLineCount++;
    } else if (currentLine === undefined && backupLine !== undefined) {
      removedLineCount++;
    }
  }

  return {
    changed: changedLineCount > 0,
    changedLineCount,
    addedLineCount,
    removedLineCount,
    currentLineCount: currentLines.length,
    backupLineCount: backupLines.length,
  };
}

/**
 * Get all timestamped backups for a memory date.
 * @param {string} date - Date string YYYY-MM-DD.
 * @returns {Array<{path: string, fileName: string, date: string, time: string, mtimeMs: number, size: number}>}
 */
function getBackupsForDate(date) {
  const files = fs.existsSync(BACKUP_DIR) ? fs.readdirSync(BACKUP_DIR) : [];
  return files
    .map((fileName) => {
      const parsed = parseBackupName(fileName);
      if (!parsed.date || parsed.date !== date) return null;
      const fullPath = path.join(BACKUP_DIR, fileName);
      if (!fs.existsSync(fullPath) || !fs.statSync(fullPath).isFile()) return null;
      const stats = fs.statSync(fullPath);
      return {
        path: fullPath,
        fileName,
        date: parsed.date,
        time: parsed.time,
        mtimeMs: stats.mtimeMs,
        size: stats.size,
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.mtimeMs - a.mtimeMs);
}

/**
 * Compare memory files and backup snapshots and produce a report object.
 * @param {Object} [options]
 * @param {string} [options.date] - Date to inspect (YYYY-MM-DD).
 * @param {boolean} [options.writeToDisk=true] - Persist report JSON.
 * @returns {{path: string, report: Object}}
 */
function generateDiffReport(options = {}) {
  const date = options.date || getTodayDateString();
  const writeToDisk = options.writeToDisk !== false;
  const currentFilePath = path.join(MEMORY_DIR, `${date}.md`);

  const memoryFiles = fs
    .readdirSync(MEMORY_DIR)
    .filter((name) => /^\d{4}-\d{2}-\d{2}\.md$/.test(name));
  const memoryDates = new Set(memoryFiles.map((name) => name.replace(/\.md$/, "")));

  const backupFiles = fs.existsSync(BACKUP_DIR) ? fs.readdirSync(BACKUP_DIR) : [];
  const backupDates = new Set(
    backupFiles.map((name) => parseBackupName(name).date).filter(Boolean),
  );

  const missingBackupForMemoryDates = [...memoryDates].filter((d) => !backupDates.has(d));
  const orphanBackupDates = [...backupDates].filter((d) => !memoryDates.has(d));

  const backups = getBackupsForDate(date);
  const latestBackup = backups[0] || null;

  const currentExists = fs.existsSync(currentFilePath);
  const currentStat = currentExists ? fs.statSync(currentFilePath) : null;
  const currentContent = currentExists ? readText(currentFilePath) : "";
  const backupContent = latestBackup ? readText(latestBackup.path) : "";

  const diff = computeDiffStats(currentContent, backupContent);

  const report = {
    generatedAt: new Date().toISOString(),
    targetDate: date,
    currentFilePath,
    currentExists,
    currentMtime: currentStat ? new Date(currentStat.mtimeMs).toISOString() : null,
    currentSize: currentStat ? currentStat.size : 0,
    latestBackup: latestBackup
      ? {
          path: latestBackup.path,
          fileName: latestBackup.fileName,
          mtime: new Date(latestBackup.mtimeMs).toISOString(),
          size: latestBackup.size,
        }
      : null,
    backupCountForDate: backups.length,
    diff,
    coverage: {
      memoryDateFileCount: memoryDates.size,
      backupDateCount: backupDates.size,
      missingBackupForMemoryDates,
      orphanBackupDates,
    },
  };

  const reportPath = path.join(REPORT_DIR, `diff-report-${formatTimestamp()}.json`);
  if (writeToDisk) {
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  }

  return { path: reportPath, report };
}

/**
 * Detect likely crash/incomplete-write states for the daily memory file.
 * Also generates a diff report comparing `memory/` and `memory/backups/`.
 *
 * @param {Object} [options]
 * @param {string} [options.date] - Date to check, defaults to today.
 * @param {number} [options.staleMinutes=10] - Threshold for backup newer than current.
 * @returns {CrashCheckResult}
 */
function checkForCrash(options = {}) {
  const date = options.date || getTodayDateString();
  const staleMinutes = Number.isFinite(options.staleMinutes) ? options.staleMinutes : 10;
  const { path: reportPath, report } = generateDiffReport({ date, writeToDisk: true });

  const reasons = [];
  const currentPath = report.currentFilePath;
  const latestBackup = report.latestBackup;

  if (!report.currentExists && latestBackup) {
    reasons.push("Current memory file missing while backups exist");
  }

  if (report.currentExists && report.currentSize === 0 && latestBackup && latestBackup.size > 0) {
    reasons.push("Current memory file is empty but latest backup has content");
  }

  if (report.currentExists && latestBackup && report.diff.changed) {
    const currentMtime = new Date(report.currentMtime).getTime();
    const backupMtime = new Date(latestBackup.mtime).getTime();
    const deltaMinutes = (backupMtime - currentMtime) / (1000 * 60);
    if (deltaMinutes >= staleMinutes) {
      reasons.push(
        `Latest backup is newer than current file by ${Math.floor(deltaMinutes)} minutes with content differences`,
      );
    }
  }

  if (!fs.existsSync(currentPath) && !latestBackup) {
    reasons.push("No current file and no backup available");
  }

  let confidence = "low";
  if (reasons.length >= 2) confidence = "high";
  else if (reasons.length === 1) confidence = "medium";

  const crashDetected = reasons.length > 0;

  logRecoveryEvent({
    event: "check-for-crash",
    date,
    crashDetected,
    confidence,
    reasons,
    reportPath,
  });

  return {
    crashDetected,
    confidence,
    reasons,
    reportPath,
    report,
  };
}

/**
 * Get possible restore candidates for a date, ordered newest-first.
 * Includes diff stats against the current daily memory file.
 *
 * @param {Object} [options]
 * @param {string} [options.date] - Target date (YYYY-MM-DD), defaults to today.
 * @param {number} [options.limit=10] - Maximum number of options returned.
 * @returns {{date: string, currentFilePath: string, currentExists: boolean, options: Array, recommended: Object|null}}
 */
function getRecoveryOptions(options = {}) {
  const date = options.date || getTodayDateString();
  const limit = Number.isFinite(options.limit) ? options.limit : 10;
  const currentFilePath = path.join(MEMORY_DIR, `${date}.md`);
  const currentExists = fs.existsSync(currentFilePath);
  const currentContent = currentExists ? readText(currentFilePath) : "";

  const candidates = getBackupsForDate(date).slice(0, Math.max(1, limit));

  const optionsList = candidates.map((backup, index) => {
    const backupContent = readText(backup.path);
    const diff = computeDiffStats(currentContent, backupContent);
    return {
      id: `${date}-${index + 1}`,
      backupPath: backup.path,
      backupFile: backup.fileName,
      backupTime: backup.time,
      backupMtime: new Date(backup.mtimeMs).toISOString(),
      backupSize: backup.size,
      diff,
    };
  });

  const recommended = optionsList.find((opt) => opt.backupSize > 0) || optionsList[0] || null;

  logRecoveryEvent({
    event: "get-recovery-options",
    date,
    optionCount: optionsList.length,
    recommended: recommended ? recommended.backupFile : null,
  });

  return {
    date,
    currentFilePath,
    currentExists,
    options: optionsList,
    recommended,
  };
}

/**
 * Create a recovery point of the target memory file before mutation.
 *
 * @param {Object} [options]
 * @param {string} [options.targetFile] - File to snapshot. Defaults to today's memory file.
 * @param {string} [options.label] - Optional short label suffix.
 * @returns {{created: boolean, path: string|null, source: string, reason?: string}}
 */
function createRecoveryPoint(options = {}) {
  const defaultTarget = path.join(MEMORY_DIR, `${getTodayDateString()}.md`);
  const source = options.targetFile ? path.resolve(options.targetFile) : defaultTarget;

  if (!fs.existsSync(source)) {
    const result = {
      created: false,
      path: null,
      source,
      reason: "Source file does not exist",
    };
    logRecoveryEvent({ event: "create-recovery-point", ...result });
    return result;
  }

  const safeLabel = options.label
    ? String(options.label)
        .toLowerCase()
        .replace(/[^a-z0-9-_]/g, "")
        .slice(0, 30)
    : "";
  const suffix = safeLabel ? `-${safeLabel}` : "";
  const ext = path.extname(source) || ".md";
  const fileName = `recovery-point-${formatTimestamp()}${suffix}${ext}`;
  const destination = path.join(BACKUP_DIR, fileName);

  fs.copyFileSync(source, destination);

  const result = {
    created: true,
    path: destination,
    source,
  };

  logRecoveryEvent({ event: "create-recovery-point", ...result });
  return result;
}

/**
 * Restore a memory file from a backup snapshot.
 * Creates a pre-restore recovery point unless disabled.
 *
 * @param {string} backupPath - Absolute/relative backup file path.
 * @param {Object} [options]
 * @param {string} [options.targetFile] - Destination file path. Defaults by inferring date from backup name, else today.
 * @param {boolean} [options.createPoint=true] - Create a pre-restore recovery point first.
 * @returns {{restored: boolean, backupPath: string, targetFile: string, recoveryPoint: Object|null, reportPath: string|null, reason?: string}}
 */
function restoreFromBackup(backupPath, options = {}) {
  const resolvedBackup = path.resolve(backupPath);

  if (!fs.existsSync(resolvedBackup)) {
    const failure = {
      restored: false,
      backupPath: resolvedBackup,
      targetFile: "",
      recoveryPoint: null,
      reportPath: null,
      reason: "Backup file not found",
    };
    logRecoveryEvent({ event: "restore-from-backup", ...failure });
    return failure;
  }

  const backupFileName = path.basename(resolvedBackup);
  const parsed = parseBackupName(backupFileName);
  const inferredDate = parsed.date || getTodayDateString();
  const targetFile = options.targetFile
    ? path.resolve(options.targetFile)
    : path.join(MEMORY_DIR, `${inferredDate}.md`);

  ensureDir(path.dirname(targetFile));

  let recoveryPoint = null;
  if (options.createPoint !== false && fs.existsSync(targetFile)) {
    recoveryPoint = createRecoveryPoint({
      targetFile,
      label: "pre-restore",
    });
  }

  fs.copyFileSync(resolvedBackup, targetFile);
  const { path: reportPath } = generateDiffReport({ date: inferredDate, writeToDisk: true });

  const result = {
    restored: true,
    backupPath: resolvedBackup,
    targetFile,
    recoveryPoint,
    reportPath,
  };

  logRecoveryEvent({ event: "restore-from-backup", ...result });
  return result;
}

/**
 * Perform automatic recovery if a likely crash is detected.
 *
 * @param {Object} [options]
 * @param {string} [options.date] - Date to recover (YYYY-MM-DD).
 * @param {number} [options.staleMinutes=10] - Crash check staleness threshold.
 * @param {boolean} [options.dryRun=false] - If true, only return what would happen.
 * @returns {{attempted: boolean, recovered: boolean, dryRun: boolean, check: CrashCheckResult, selectedOption: Object|null, restoreResult: Object|null}}
 */
function autoRecover(options = {}) {
  const date = options.date || getTodayDateString();
  const dryRun = Boolean(options.dryRun);
  const check = checkForCrash({ date, staleMinutes: options.staleMinutes });

  if (!check.crashDetected) {
    return {
      attempted: false,
      recovered: false,
      dryRun,
      check,
      selectedOption: null,
      restoreResult: null,
    };
  }

  const recovery = getRecoveryOptions({ date, limit: 10 });
  const selectedOption = recovery.recommended;

  if (!selectedOption) {
    logRecoveryEvent({
      event: "auto-recover",
      date,
      attempted: true,
      recovered: false,
      reason: "No recovery options available",
    });

    return {
      attempted: true,
      recovered: false,
      dryRun,
      check,
      selectedOption: null,
      restoreResult: null,
    };
  }

  if (dryRun) {
    return {
      attempted: true,
      recovered: false,
      dryRun: true,
      check,
      selectedOption,
      restoreResult: null,
    };
  }

  const restoreResult = restoreFromBackup(selectedOption.backupPath, {
    createPoint: true,
  });

  logRecoveryEvent({
    event: "auto-recover",
    date,
    attempted: true,
    recovered: Boolean(restoreResult.restored),
    selectedBackup: selectedOption.backupFile,
  });

  return {
    attempted: true,
    recovered: Boolean(restoreResult.restored),
    dryRun: false,
    check,
    selectedOption,
    restoreResult,
  };
}

export { 
  checkForCrash,
  getRecoveryOptions,
  restoreFromBackup,
  createRecoveryPoint,
  autoRecover,
 };
