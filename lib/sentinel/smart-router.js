/**
 * Smart Router
 *
 * Integration of Escalation Gate + Unified Memory + Trace Standard.
 * Drop-in replacement for direct AI calls.
 */

import { determineLevel, executeWithGate } from "./escalation-gate.js";
import { retrieve, store } from "./unified-memory.js";
import { createTrace } from "./trace-standard.js";

/**
 * Process a request with full observability and routing
 * @param {string} request - User request
 * @param {Object} handlers - Handler functions for each level
 * @returns {Promise} Result with trace ID
 */
async function processRequest(request, handlers) {
  // Create trace
  const trace = createTrace(request);

  // Retrieve relevant context
  const context = retrieve({ query: request, limit: 5 });
  trace.logStep({
    tool: "unified_memory.retrieve",
    input: request,
    output: `${context.length} memories loaded`,
    latency: 50,
    success: true,
  });

  // Determine routing
  const plan = determineLevel(request, context);
  trace.logRouting(plan);

  // Execute based on level
  let result;
  let tokensUsed = 0;
  try {
    switch (plan.level) {
      case "rag":
        result = await handlers.rag(request, context, plan);
        tokensUsed = 0; // RAG uses no AI tokens
        break;
      case "workflow":
        result = await handlers.workflow(request, context, plan);
        tokensUsed = plan.maxTokens || 1000; // Workflow uses minimal tokens
        break;
      case "agent":
        result = await handlers.agent(request, context, plan);
        tokensUsed = plan.maxTokens || 50000; // Agent uses full AI tokens
        break;
    }

    // Log the execution step with token count
    trace.logStep({
      tool: `handler:${plan.level}`,
      input: request,
      output: "Handler executed",
      latency: 100,
      tokens: tokensUsed,
      success: true,
    });

    trace.logOutcome({ success: true, result });

    // Store experience
    store("experiences", {
      title: `Request: ${request.slice(0, 50)}`,
      content: `Level: ${plan.level}, Success: true`,
      approach: plan.level,
      outcome: "success",
      importance: plan.complexity === "high" ? 8 : 5,
    });
  } catch (error) {
    trace.logOutcome({ success: false, error: error.message });

    store("experiences", {
      title: `Failed: ${request.slice(0, 50)}`,
      content: `Error: ${error.message}`,
      approach: plan.level,
      outcome: "failure",
      importance: 7,
    });

    throw error;
  }

  return {
    result,
    traceId: trace.id,
    level: plan.level,
    tokensUsed: trace.data.metrics.totalTokens,
  };
}

/**
 * Example usage for cron jobs (no AI needed)
 * @param {string} jobName - Name of cron job
 * @param {Function} jobFn - Job function
 */
async function runCronJob(jobName, jobFn) {
  const { cronJobNeedsAI } = await import("./escalation-gate.js");

  if (cronJobNeedsAI(jobName)) {
    console.log(`[Router] Cron job ${jobName} requires AI - routing through agent`);
    // Route through full processRequest for complex jobs
    return await processRequest(`Cron: ${jobName}`, {
      agent: jobFn,
      workflow: jobFn,
      rag: jobFn,
    });
  } else {
    console.log(`[Router] Cron job ${jobName} → direct execution (no AI)`);
    // Execute directly, no AI overhead
    return await jobFn();
  }
}

/**
 * Quick check for request classification
 * @param {string} request
 * @returns {Object} Classification
 */
function classifyRequest(request) {
  return determineLevel(request);
}

export { 
  processRequest,
  runCronJob,
  classifyRequest,
 };
