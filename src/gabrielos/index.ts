/**
 * GabrielOS - AI Agent Runtime
 * Built on OpenClaw with advanced cognitive architecture
 */

// Core Smart Router
export { classifyRequest, processRequest } from './lib/gabrielos/smart-router.js';
export type { ExecutionPlan, Handlers } from './lib/gabrielos/escalation-gate.js';

// Memory Systems
export { retrieve, store, cleanupExpired } from './lib/gabrielos/unified-memory.js';
export type { MemoryEntry, RetrieveOptions } from './lib/gabrielos/unified-memory.js';

// Observability
export { createTrace, loadTraces, analyzeTraces, generateRecommendations } from './lib/gabrielos/trace-standard.js';
export type { TraceData, TraceInstance, TraceFilters, TraceAnalysis } from './lib/gabrielos/trace-standard.js';

// Decision Logging
export { logDecision, appendDecision } from './lib/gabrielos/decision-log.js';
export type { DecisionEntry, DecisionData } from './lib/gabrielos/decision-log.js';

// System Components
export { default as gabrielosInterceptor } from './gabrielos-interceptor.js';

// Re-export from subsystems
export * from './lib/gabrielos/memory-loop.js';
export * from './lib/gabrielos/skills-graph.js';
export * from './lib/gabrielos/system-health.js';
export * from './lib/gabrielos/experience-logger.js';
export * from './lib/gabrielos/context-compactor.js';
export * from './lib/gabrielos/session-recovery.js';

// Version
export const SENTINEL_VERSION = '1.0.0';
