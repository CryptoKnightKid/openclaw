# GabrielOS API Reference

## Core Modules

### Smart Router

```javascript
import { classifyRequest, processRequest } from './lib/gabrielos/smart-router.js';

// Classify a request
const classification = classifyRequest("What's my shopping list?");
// Returns: { level: 'rag', requiresAI: false, maxTokens: 0, ... }

// Process with handlers
const result = await processRequest(
  "What's my shopping list?",
  {
    rag: async (req, context, plan) => {
      // Handle RAG request
      return { items: ['milk', 'eggs'] };
    },
    workflow: async (req, context, plan) => {
      // Handle workflow
      return { status: 'completed' };
    },
    agent: async (req, context, plan) => {
      // Handle agent request
      return await callAI(req);
    }
  }
);
```

### Unified Memory

```javascript
import { retrieve, store, cleanupExpired } from './lib/gabrielos/unified-memory.js';

// Store a memory
const id = store('experiences', {
  title: 'Completed task',
  content: 'Finished the implementation',
  importance: 8
});

// Retrieve memories
const memories = retrieve({
  query: 'shopping list',
  namespaces: ['core', 'session', 'experiences'],
  limit: 5
});

// Cleanup expired
cleanupExpired();
```

### Trace Standard

```javascript
import { createTrace, analyzeTraces } from './lib/gabrielos/trace-standard.js';

// Create a trace
const trace = createTrace("User request");

// Log routing decision
trace.logRouting({
  level: 'rag',
  justification: 'Simple lookup',
  confidence: 1.0
});

// Log execution step
trace.logStep({
  tool: 'memory_search',
  latency: 50,
  tokens: 0,
  success: true
});

// Log outcome
trace.logOutcome({
  success: true,
  result: 'Found in memory'
});

// Analyze all traces
const insights = analyzeTraces();
console.log(insights.avgTokens); // Average token usage
```

### Decision Log

```javascript
import { logDecision } from './lib/gabrielos/decision-log.js';

// Log a decision
logDecision({
  decision: 'Route to RAG',
  context: 'User asked for shopping list',
  rationale: 'Simple lookup - no AI needed',
  alternatives: ['workflow', 'agent'],
  sessionId: 'session-123'
});
```

## Complete Example

```javascript
import { 
  classifyRequest, 
  processRequest 
} from './lib/gabrielos/smart-router.js';
import { 
  retrieve, 
  store 
} from './lib/gabrielos/unified-memory.js';
import { 
  createTrace 
} from './lib/gabrielos/trace-standard.js';
import { 
  logDecision 
} from './lib/gabrielos/decision-log.js';

async function handleUserRequest(userRequest) {
  // 1. Load context
  const memories = retrieve({ 
    query: userRequest, 
    limit: 5 
  });
  
  // 2. Classify
  const classification = classifyRequest(userRequest);
  
  // 3. Create trace
  const trace = createTrace(userRequest);
  trace.logRouting(classification);
  
  // 4. Log decision
  logDecision({
    decision: `Route to ${classification.level}`,
    context: userRequest,
    rationale: classification.justification
  });
  
  // 5. Process based on level
  const result = await processRequest(userRequest, {
    rag: async () => generateFromMemories(memories),
    workflow: async () => executeWorkflow(userRequest),
    agent: async () => callAIModel(userRequest, memories)
  });
  
  // 6. Store experience
  store('experiences', {
    title: `Request: ${userRequest.slice(0, 50)}`,
    content: `Level: ${result.level}, Success: true`,
    outcome: 'success'
  });
  
  return result;
}
```

## Configuration

```javascript
// config.json
{
  "gabrielos": {
    "smartRouter": {
      "enabled": true,
      "rag": {
        "maxLatency": 100,
        "minConfidence": 0.5
      },
      "workflow": {
        "maxLatency": 500,
        "fixedTokens": 1000
      },
      "agent": {
        "checkpointThreshold": "high",
        "maxTokens": 100000
      }
    },
    "memory": {
      "compactionAt": 0.8,
      "autoWriteInterval": 1800000,
      "namespaces": {
        "core": { "weight": 0.4, "ttl": null },
        "session": { "weight": 0.3, "ttl": "1h" },
        "experiences": { "weight": 0.2, "ttl": "90d" }
      }
    }
  }
}
```

## TypeScript Types

```typescript
interface ExecutionPlan {
  level: 'rag' | 'workflow' | 'agent';
  confidence: number;
  justification: string;
  requiresAI: boolean;
  maxTokens: number;
  checkpoint: boolean;
}

interface MemoryEntry {
  id: string;
  timestamp: string;
  title?: string;
  content?: string;
  importance?: number;
  score?: number;
}

interface TraceData {
  id: string;
  startedAt: string;
  request: { text: string };
  routing: {
    level: string;
    justification: string;
    confidence: number;
  };
  steps: TraceStep[];
  outcome: {
    success: boolean;
    result?: any;
    error?: string;
  };
  metrics: {
    totalTokens: number;
    totalLatency: number;
  };
}
```

## Error Handling

```javascript
try {
  const result = await processRequest(request, handlers);
} catch (error) {
  // Log to decision log
  logDecision({
    decision: 'Request failed',
    context: request,
    rationale: error.message
  });
  
  // Store failure experience
  store('experiences', {
    title: 'Failed request',
    content: error.message,
    outcome: 'failure'
  });
  
  throw error;
}
```
