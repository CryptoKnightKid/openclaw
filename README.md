# Gabriel

**The Cognitive AI Operating System**

Built with advanced memory architecture, intelligent request routing, and 280+ ready-to-use skills.

## What is Gabriel?

Gabriel is a production-ready AI agent runtime that automatically classifies incoming requests and routes them intelligently:

- **RAG Mode** → Memory lookup only (0 AI tokens, <100ms)
- **Workflow Mode** → Deterministic execution (1,000 tokens, <500ms)
- **Agent Mode** → Full AI reasoning (variable tokens, 2-5s)

## Key Features

🧠 **3-Tier Cognitive Memory**
- Hot Context (session) → 1M tokens, auto-compaction
- Daily Cache → Key decisions, outcomes
- Core Memory → SOUL.md, USER.md, long-term

🎯 **Smart Router** — Automatically routes requests to optimal execution tier

📊 **Observability** — Full tracing, decision logs, experience tracking

🛠️ **280+ Skills** — Pre-built capabilities across 10 categories

💰 **70% Cost Reduction** — Simple lookups bypass AI entirely

## Quick Install

```bash
# 1. Clone
git clone https://github.com/CryptoKnightKid/gabriel.git
cd gabriel

# 2. Install dependencies
pnpm install

# 3. Configure
cp config.example.json config.json
# Edit config.json with your API keys

# 4. Run
pnpm build
pnpm start
```

## Architecture

```
User Request → Gabriel Router → Classification
                              ↓
                    ┌─────────┼─────────┐
                    ↓         ↓         ↓
                   RAG    Workflow    Agent
                    ↓         ↓         ↓
                 Memory     Exec      AI
```

## Documentation

- [Installation Guide](docs/INSTALL.md) — Step-by-step setup
- [Architecture](docs/ARCHITECTURE.md) — How it works
- [Skills Guide](docs/SKILLS.md) — Using the 280+ skills
- [Memory System](docs/MEMORY.md) — 3-tier cognitive architecture
- [API Reference](docs/API.md) — Code examples

## Performance

| Request Type | Latency | Tokens | Cost Reduction |
|--------------|---------|--------|----------------|
| RAG (memory) | <100ms | 0 | 100% |
| Workflow | <500ms | 1,000 | ~80% |
| Agent | 2-5s | Variable | Baseline |

## Docker

```bash
docker-compose up -d
```

## License

MIT

---

**Gabriel** — AI that remembers, learns, and saves you money.
