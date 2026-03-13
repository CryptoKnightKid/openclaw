/**
 * Sentinel - AI Agent Runtime
 * Built on OpenClaw with advanced cognitive architecture
 */

// Core Smart Router
export { classifyRequest, processRequest } from './lib/sentinel/smart-router.js';
export type { ExecutionPlan, Handlers } from './lib/sentinel/escalation-gate.js';

// Memory Systems
export { retrieve, store, cleanupExpired } from './lib/sentinel/unified-memory.js';
export type { MemoryEntry, RetrieveOptions } from './lib/sentinel/unified-memory.js';

// Observability
export { createTrace, loadTraces, analyzeTraces, generateRecommendations } from './lib/sentinel/trace-standard.js';
export type { TraceData, TraceInstance, TraceFilters, TraceAnalysis } from './lib/sentinel/trace-standard.js';

// Decision Logging
export { logDecision, appendDecision } from './lib/sentinel/decision-log.js';
export type { DecisionEntry, DecisionData } from './lib/sentinel/decision-log.js';

// System Components
export { default as sentinelInterceptor } from './sentinel-interceptor.js';

// Re-export from subsystems
export * from './lib/sentinel/memory-loop.js';
export * from './lib/sentinel/skills-graph.js';
export * from './lib/sentinel/system-health.js';
export * from './lib/sentinel/experience-logger.js';
export * from './lib/sentinel/context-compactor.js';
export * from './lib/sentinel/session-recovery.js';

// Version
export const SENTINEL_VERSION = '1.0.0';
