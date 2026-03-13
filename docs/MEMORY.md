# GabrielOS Memory System

## 3-Tier Cognitive Architecture

GabrielOS uses a 3-tier memory system modeled after human cognition:

```
┌─────────────────────────────────────────────────────────────┐
│  SHORT-TERM (Hot Context)                                   │
│  Duration: Session only                                     │
│  Size: 1M tokens                                            │
│  Access: Instant                                            │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│  MEDIUM-TERM (Daily Cache)                                  │
│  Duration: Days to weeks                                    │
│  Format: Markdown files (YYYY-MM-DD.md)                     │
│  Content: Decisions, outcomes, learnings                    │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│  LONG-TERM (Core Memory)                                    │
│  Duration: Permanent                                        │
│  Files: SOUL.md, USER.md, MEMORY.md                         │
│  Updated: Manual, curated                                   │
└─────────────────────────────────────────────────────────────┘
```

## Tier 1: Hot Context (Session)

**Purpose:** Immediate working memory for current conversation

**Characteristics:**
- Lives in RAM only
- 1M token capacity (upgraded from 200k)
- Auto-compaction at 80% usage
- Cleared on session end

**Auto-Compaction Strategy:**

**Preserve:**
- ✅ Decisions made
- ✅ Actions taken
- ✅ Files created/modified
- ✅ Key learnings
- ✅ User preferences stated

**Remove:**
- ❌ Chat pleasantries
- ❌ Error messages (resolved)
- ❌ Failed attempts before success
- ❌ Debug output

**Trigger Conditions:**
- Every 30 minutes
- Context hits 80%
- User says "compact"
- Before spawning sub-agents

## Tier 2: Daily Cache

**Purpose:** Persistent record of daily activity

**Files:**
```
memory/
├── 2026-03-13.md    # Today
├── 2026-03-12.md    # Yesterday
├── 2026-03-11.md    # Day before
└── ...
```

**Format:**
```markdown
# March 13, 2026

## Morning Session (09:00-12:00)
- Completed: Smart Router implementation
- Decisions: RAG threshold set to 0.5
- Files: lib/smart-router.js (120 lines)

## Afternoon Session (14:00-18:00)
- Completed: Memory integration
- Blockers: None
- Next: Testing
```

**Auto-Write:**
- Every 30 minutes of active work
- Context hits 80%
- End of session

## Tier 3: Core Memory

**Purpose:** Long-term identity, preferences, and curated knowledge

### SOUL.md — Agent Identity

```markdown
# SOUL — GabrielOS Identity

## Personality
- Direct, high-signal communication
- Security-first mindset
- Quality-focused

## Values
- No fake certainty
- No insecure defaults
- No unnecessary complexity

## Communication Style
- Bullet points over prose
- Actionable next steps
- Technical rigor

## Role
- System Architect
- Code Reviewer
- Implementation partner
```

### USER.md — User Profile

```markdown
# USER — Who I'm Helping

## Profile
- Name: Easy
- Handle: @sammie_crypto
- Role: Founder, BD Lead at MEXC
- Timezone: UTC+10 (Australia)

## Work Style
- Pace: Breakneck
- Communication: Direct, bullet points
- Stack: Systems thinker

## Preferences
- No em dashes
- Bullet points preferred
- Fast decisions

## Active Projects
- MEXC BD
- Mission Control
- GabrielOS
```

### MEMORY.md — Curated Learnings

```markdown
# MEMORY — Long-Term Context

## Current Projects
- GabrielOS: AI agent runtime with smart routing
- Mission Control: BD dashboard
- Night Shift: Automation tools

## Key Decisions
- 2026-03-13: Fork OpenClaw to GabrielOS
- 2026-03-13: Implement 3-tier memory

## Patterns
- Escalation gate: RAG → Workflow → Agent
- Compaction every 30 mins
- Skills auto-match on keywords
```

## Memory Retrieval

**Weighted Scoring:**

```javascript
function calculateScore(memory, query) {
  const semantic = keywordOverlap(memory, query) * 0.5;
  const recency = timeDecay(memory.timestamp, 30) * 0.3;
  const importance = (memory.importance / 10) * 0.2;
  
  return semantic + recency + importance;
}
```

**Namespaces:**

| Namespace | Weight | TTL | Purpose |
|-----------|--------|-----|---------|
| core | 0.4 | None | Identity, preferences |
| session | 0.3 | 1h | Current context |
| decisions | 0.2 | 30d | Past decisions |
| experiences | 0.1 | 90d | Outcomes, lessons |

**Retrieval Example:**

```javascript
const memories = retrieve({
  query: "shopping list",
  namespaces: ['core', 'session', 'experiences'],
  limit: 5
});

// Returns top 5 memories sorted by weighted score
```

## Cleanup & Maintenance

**Automatic:**
- Session namespace: Cleared every 1 hour
- Decisions: 30-day TTL
- Experiences: 90-day TTL

**Manual:**
- Core memory: Edit SOUL.md, USER.md directly
- Daily cache: Review and archive monthly

**Best Practices:**

1. **Write to experiences after every task**
2. **Update USER.md when preferences change**
3. **Review MEMORY.md weekly for accuracy**
4. **Let auto-compaction handle hot context**

## Comparison: Traditional vs GabrielOS

| Aspect | Traditional AI | GabrielOS |
|--------|---------------|-----------|
| Context | 200k tokens, flat | 1M tokens, tiered |
| Persistence | None | Multi-tier |
| Retrieval | Recent only | Weighted scoring |
| Cost | High (always AI) | Low (RAG bypasses AI) |
| Learning | None | Experience tracking |

## Next Steps

- [Installation Guide](INSTALL.md) — Get started
- [Architecture](ARCHITECTURE.md) — System design
- [API Reference](API.md) — Code examples
