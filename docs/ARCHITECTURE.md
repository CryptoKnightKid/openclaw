# GabrielOS Architecture

## Overview

GabrielOS is built on three core principles:

1. **Intelligent Routing** — Every request is classified before AI is called
2. **Cognitive Memory** — 3-tier system for context management
3. **Observability** — Full tracing and decision logging

## System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     USER INTERFACE                          │
│         (Discord, Telegram, CLI, Web, etc.)                 │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│                   GABRIELOS ROUTER                          │
│                                                             │
│  1. Load Context (Unified Memory)                          │
│  2. Classify Request (RAG/Workflow/Agent)                  │
│  3. Create Trace (Observability)                           │
│  4. Route to Handler                                       │
└──────────┬───────────────────────────────┬──────────────────┘
           │                               │
     ┌─────┴─────┐                 ┌──────┴──────┐
     ▼           ▼                 ▼             ▼
┌─────────┐  ┌──────────┐    ┌─────────┐   ┌──────────┐
│   RAG   │  │ Workflow │    │  Agent  │   │  Skills  │
│  Mode   │  │   Mode   │    │  Mode   │   │  System  │
└────┬────┘  └────┬─────┘    └────┬────┘   └────┬─────┘
     │            │               │             │
     ▼            ▼               ▼             ▼
┌─────────┐  ┌──────────┐    ┌─────────┐   ┌──────────┐
│ Memory  │  │  Exec    │    │   AI    │   │  280+    │
│ Search  │  │ Command  │    │  Model  │   │  Skills  │
│ 0 tokens│  │ 1k tokens│    │ Variable│   │  Auto    │
└─────────┘  └──────────┘    └─────────┘   └──────────┘
```

## Core Components

### 1. Smart Router (`lib/gabrielos/smart-router.js`)

**Purpose:** Classify and route every incoming request

**Logic:**
```javascript
if (isLookupRequest(request)) {
  return { level: 'rag', tokens: 0 };
} else if (isCommandRequest(request)) {
  return { level: 'workflow', tokens: 1000 };
} else {
  return { level: 'agent', tokens: variable };
}
```

**Integration:** Modified `src/commands/agent.ts` to call router before AI

### 2. Unified Memory (`lib/gabrielos/unified-memory.js`)

**3-Tier Architecture:**

```
┌─────────────────────────────────────────────────────────────┐
│  TIER 1: HOT CONTEXT                                        │
│  • Scope: Current session                                   │
│  • Size: 1M tokens                                          │
│  • Persistence: None (in-memory only)                       │
│  • Auto-compaction: At 80%                                  │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│  TIER 2: DAILY CACHE                                        │
│  • Files: memory/YYYY-MM-DD.md                             │
│  • Content: Key decisions, outcomes                        │
│  • Auto-write: Every 30 mins or at 80% context             │
│  • TTL: None (manual cleanup)                              │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│  TIER 3: CORE MEMORY                                        │
│  • SOUL.md — Identity, personality, values                │
│  • USER.md — User preferences, work style                 │
│  • MEMORY.md — Long-term curated learnings                │
│  • Loaded: Every session                                   │
│  • Modified: Manual only                                   │
└─────────────────────────────────────────────────────────────┘
```

**Scoring:** Semantic (50%) + Recency (30%) + Importance (20%)

### 3. Observability (`lib/gabrielos/trace-standard.js`)

**Every request creates:**
- Unique trace ID
- Classification decision
- Execution steps
- Token usage
- Outcome (success/failure)

**Stored in:** `memory/traces/<trace-id>.json`

### 4. Skills System (`lib/gabrielos/skills-graph.js`)

**280+ skills across categories:**
- AI/Agents — ML operations, model management
- Business — Analysis, pricing, strategy
- Cloud — AWS, GCP, Azure operations
- Crypto — Blockchain, trading, DeFi
- Design — UI/UX, graphics, branding
- DevOps — Docker, CI/CD, deployment
- Development — Code generation, debugging
- Security — Testing, hardening, audits
- System — Administration, monitoring

**Auto-matching:** Skills are matched based on request keywords

## Request Flow

### Example 1: "What's my shopping list?"

```
1. Request arrives
2. Router classifies as RAG (keywords: "what", "my", "list")
3. Load memories (shopping list from memory/session)
4. Return from memory (0 tokens, <100ms)
5. Log trace with 0 tokens used
```

### Example 2: "Build a trading bot"

```
1. Request arrives
2. Router classifies as AGENT (keywords: "build", "trading", "bot")
3. Check if checkpoint needed (complexity: high)
4. Create trace
5. Call AI model with full context
6. Log trace with variable tokens
```

### Example 3: "Run backup now"

```
1. Request arrives
2. Router classifies as WORKFLOW (keywords: "run", "backup")
3. Execute backup script directly
4. Minimal AI for formatting (1,000 tokens)
5. Return result
```

## Cost Savings

| Scenario | Traditional AI | GabrielOS | Savings |
|----------|----------------|-----------|---------|
| 100 RAG queries | 200,000 tokens | 0 tokens | 100% |
| 50 workflows | 50,000 tokens | 50,000 tokens | Same |
| 10 complex tasks | 100,000 tokens | 100,000 tokens | Same |
| **Total** | **350,000** | **150,000** | **57%** |

## Data Flow

```
User Message
    ↓
GabrielOS Router
    ↓
┌─────────────────┐
│ Classification  │──→ Trace created
└─────────────────┘
    ↓
┌─────────────────┐
│ Memory Load     │──→ Retrieve relevant context
└─────────────────┘
    ↓
Handler (RAG/Workflow/Agent)
    ↓
Response + Metadata
    ↓
Experience Logger
```

## Configuration

**Key config options:**

```json
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
      "autoWriteInterval": 1800000
    }
  }
}
```

## Next Steps

- See [Memory System](MEMORY.md) for memory architecture
- See [Skills Guide](SKILLS.md) for using skills
- See [API Reference](API.md) for code examples
