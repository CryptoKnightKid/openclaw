# GabrielOS Integration Guide for OpenClaw Fork

## Overview
This guide shows how to integrate GabrielOS's Smart Router into the OpenClaw request flow.

## Architecture

```
Discord Message → OpenClaw Gateway → GabrielOS Interceptor → Smart Router
                                                            ↓
                                                    ┌───────┼───────┐
                                                    ↓       ↓       ↓
                                                   RAG  Workflow  Agent
                                                    ↓       ↓       ↓
                                                 Memory   Exec    AI
```

## Integration Steps

### Step 1: Import GabrielOS

In `src/commands/agent.ts` (or wherever main request handling happens):

```typescript
import { gabrielosInterceptor } from '../gabrielos/index.js';
```

### Step 2: Wrap Request Handler

Find the function that handles incoming requests (likely around line 200+ in agent.ts):

```typescript
// BEFORE:
async function handleRequest(request: string, context: Context) {
  const result = await callAIModel(request);
  return result;
}

// AFTER:
async function handleRequest(request: string, context: Context) {
  return await gabrielosInterceptor(
    {
      request,
      userId: context.userId,
      channel: context.channel,
      sessionKey: context.sessionKey
    },
    // Original handler as fallback
    async () => await callAIModel(request)
  );
}
```

### Step 3: Configure GabrielOS

Add to your config (e.g., `config/gabrielos.json`):

```json
{
  "gabrielos": {
    "smartRouter": {
      "enabled": true,
      "defaultLevel": "rag",
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
      "compactionThreshold": 0.8,
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

### Step 4: Initialize Memory Directories

```bash
mkdir -p memory/{core,session,experiences,decisions,traces}
```

### Step 5: Test

```bash
# Test RAG (should be <100ms, 0 tokens)
echo "What is my shopping list?" | gabrielos classify

# Test Workflow (should be <500ms, 1000 tokens)
echo "Run backup now" | gabrielos classify

# Test Agent (should trigger AI)
echo "Build a trading bot" | gabrielos classify
```

## Expected Performance

| Request Type | Latency | Tokens | Cost Reduction |
|--------------|---------|--------|----------------|
| RAG (memory) | <100ms | 0 | 100% |
| Workflow | <500ms | 1000 | ~80% |
| Agent | 2-5s | Variable | Baseline |

## Monitoring

Check traces:
```bash
ls memory/traces/*.json | tail -10
```

View routing decisions:
```bash
tail -20 memory/decisions/decisions.jsonl
```

## Troubleshooting

**Issue:** All requests going to Agent
**Fix:** Check `classifyRequest()` is being called. Lower confidence threshold.

**Issue:** RAG returning empty
**Fix:** Ensure memory files exist and have content.

**Issue:** High latency on RAG
**Fix:** Check `retrieve()` function. May need to limit memory entries.

## Next Steps

1. Wire into actual request handler
2. Add skills auto-loading
3. Configure memory cleanup jobs
4. Set up health monitoring
