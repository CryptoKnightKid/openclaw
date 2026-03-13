# GabrielOS Installation Guide

## Prerequisites

- Node.js 18+ (or 20+ recommended)
- pnpm (or npm/yarn)
- Git
- API keys for at least one AI provider (OpenAI, Anthropic, or local)

## Quick Install (5 minutes)

### Step 1: Clone the Repository

```bash
git clone https://github.com/yourusername/gabrielos.git
cd gabrielos
```

### Step 2: Install Dependencies

```bash
pnpm install
```

Or with npm:
```bash
npm install
```

### Step 3: Configure Environment

```bash
# Copy example config
cp config.example.json config.json

# Edit with your API keys
nano config.json  # or use your editor
```

**Minimum required config:**
```json
{
  "ai": {
    "defaultModel": "openai/gpt-4",
    "apiKey": "your-api-key-here"
  },
  "channels": {
    "discord": {
      "enabled": true,
      "token": "your-discord-bot-token"
    }
  }
}
```

### Step 4: Initialize Memory

```bash
# Create memory directories
mkdir -p memory/{core,session,experiences,decisions,traces}

# Copy personality files
cp templates/SOUL.md.example memory/SOUL.md
cp templates/USER.md.example memory/USER.md
```

### Step 5: Build & Run

```bash
# Build TypeScript
pnpm build

# Start GabrielOS
pnpm start
```

## Verify Installation

Test the Smart Router:

```bash
# In another terminal
node --input-type=module -e "
import { classifyRequest } from './lib/gabrielos/smart-router.js';
console.log(classifyRequest('What is my shopping list?'));
// Should output: { level: 'rag', requiresAI: false, ... }
"
```

## Docker Install (Alternative)

```bash
# Build image
docker build -t gabrielos .

# Run
docker run -v $(pwd)/config.json:/app/config.json -v $(pwd)/memory:/app/memory gabrielos
```

## Troubleshooting

### Issue: Build fails with TypeScript errors
**Fix:**
```bash
pnpm clean
pnpm install
pnpm build
```

### Issue: "Cannot find module" errors
**Fix:** Ensure all dependencies installed:
```bash
pnpm install --force
```

### Issue: Memory not persisting
**Fix:** Check memory directory permissions:
```bash
chmod -R 755 memory/
```

### Issue: Smart Router not classifying
**Fix:** Check that `lib/gabrielos/` exists with all files:
```bash
ls lib/gabrielos/
# Should show: smart-router.js, unified-memory.js, etc.
```

## Next Steps

1. **Configure Channels** — Add Discord, Telegram, etc.
2. **Customize SOUL.md** — Define your agent's personality
3. **Add Skills** — Place custom skills in `Skills/` directory
4. **Test Routing** — Try RAG vs Workflow vs Agent requests

See [Architecture Guide](ARCHITECTURE.md) for deep dive.
