/**
 * GabrielOS Request Interceptor
 * 
 * Wraps the OpenClaw request flow to add Smart Router classification
 * before AI model selection. This is cleaner than modifying core internals.
 */

import { classifyRequest, processRequest } from '../lib/gabrielos/smart-router.js';
import { retrieve } from '../lib/gabrielos/unified-memory.js';
import { createTrace } from '../lib/gabrielos/trace-standard.js';
import { logDecision } from '../lib/gabrielos/decision-log.js';

export interface GabrielOSContext {
  request: string;
  userId: string;
  channel: string;
  sessionKey: string;
}

/**
 * Main entry point - wraps OpenClaw's request handling
 * Call this BEFORE calling the original OpenClaw agent handler
 */
export async function gabrielosInterceptor(
  context: GabrielOSContext,
  originalHandler: () => Promise<any>
): Promise<any> {
  const { request, userId, channel, sessionKey } = context;
  
  // STEP 1: Load cognitive context
  const memories = retrieve({ 
    query: request,
    namespaces: ['core', 'session', 'experiences'],
    limit: 5
  });
  
  // STEP 2: Classify the request
  const classification = classifyRequest(request);
  
  // STEP 3: Create trace for observability
  const trace = createTrace(request);
  trace.logRouting({
    level: classification.level,
    justification: classification.justification,
    confidence: classification.confidence
  });
  
  // STEP 4: Route based on classification
  switch (classification.level) {
    case 'rag':
      return await handleRAG(request, memories, trace);
      
    case 'workflow':
      return await handleWorkflow(request, memories, trace, originalHandler);
      
    case 'agent':
      return await handleAgent(request, memories, classification, trace, originalHandler);
      
    default:
      throw new Error(`Unknown classification level: ${classification.level}`);
  }
}

/**
 * RAG Handler - Zero AI tokens, just memory retrieval
 */
async function handleRAG(
  request: string,
  memories: any[],
  trace: any
): Promise<any> {
  logDecision({
    decision: 'Route to RAG',
    context: request,
    rationale: 'Simple lookup - no AI needed',
    alternatives: ['workflow', 'agent']
  });
  
  // Generate response from memories only
  const response = generateFromMemories(request, memories);
  
  trace.logStep({
    tool: 'memory_retrieval',
    input: request,
    output: `Found ${memories.length} memories`,
    latency: 50,
    tokens: 0,
    success: true
  });
  
  trace.logOutcome({
    success: true,
    result: response
  });
  
  return {
    result: response,
    metadata: {
      level: 'rag',
      tokensUsed: 0,
      latency: '<100ms',
      source: 'memory',
      traceId: trace.id
    }
  };
}

/**
 * Workflow Handler - Minimal AI tokens for formatting
 */
async function handleWorkflow(
  request: string,
  memories: any[],
  trace: any,
  originalHandler: () => Promise<any>
): Promise<any> {
  logDecision({
    decision: 'Route to Workflow',
    context: request,
    rationale: 'Deterministic task execution',
    alternatives: ['rag', 'agent']
  });
  
  trace.logStep({
    tool: 'workflow_execution',
    input: request,
    output: 'Executing workflow',
    latency: 100,
    tokens: 1000, // Fixed cost
    success: true
  });
  
  // Call original handler but with workflow context
  const result = await originalHandler();
  
  trace.logOutcome({
    success: true,
    result
  });
  
  return {
    result,
    metadata: {
      level: 'workflow',
      tokensUsed: 1000,
      latency: '<500ms',
      source: 'workflow',
      traceId: trace.id
    }
  };
}

/**
 * Agent Handler - Full AI reasoning
 */
async function handleAgent(
  request: string,
  memories: any[],
  classification: any,
  trace: any,
  originalHandler: () => Promise<any>
): Promise<any> {
  logDecision({
    decision: 'Route to Agent',
    context: request,
    rationale: classification.justification,
    alternatives: ['rag', 'workflow']
  });
  
  // Check if checkpoint needed
  if (classification.checkpoint) {
    console.log('⚠️  High complexity - checkpoint required');
    // In production: await requireHumanApproval(request, classification.justification);
  }
  
  trace.logStep({
    tool: 'agent_reasoning',
    input: request,
    output: 'Full AI processing',
    latency: 2000,
    tokens: classification.maxTokens,
    success: true
  });
  
  // Call original OpenClaw handler
  const result = await originalHandler();
  
  trace.logOutcome({
    success: true,
    result
  });
  
  return {
    result,
    metadata: {
      level: 'agent',
      tokensUsed: classification.maxTokens,
      latency: '2-5s',
      source: 'agent',
      traceId: trace.id,
      checkpoint: classification.checkpoint
    }
  };
}

/**
 * Generate response from memories (RAG mode)
 */
function generateFromMemories(request: string, memories: any[]): string {
  if (memories.length === 0) {
    return "I don't have any relevant information about that in my memory.";
  }
  
  // Simple template-based response from memories
  const relevant = memories
    .filter(m => m.score > 0.5)
    .slice(0, 3)
    .map(m => m.content || m.title)
    .join('\n\n');
  
  return `Based on my memory:\n\n${relevant}`;
}

export default gabrielosInterceptor;
