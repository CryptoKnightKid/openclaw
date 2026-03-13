# GabrielOS Skills Guide

## Overview

GabrielOS includes 280+ pre-built skills across 10 categories. Skills are automatically matched to requests based on keywords.

## Using Skills

### Automatic Matching

Skills are automatically selected based on your request:

```
You: "Analyze this code for security issues"
GabrielOS: Matches "security-audit" skill → Runs security analysis
```

### Manual Skill Call

```javascript
import { matchSkills } from './lib/gabrielos/skills-graph.js';

const matches = matchSkills("Deploy to AWS");
// Returns: [{ skill: 'aws-deploy', score: 0.9 }, ...]
```

## Skill Categories

### AI/Agents (25 skills)
- `model-selector` — Choose optimal AI model for task
- `prompt-optimizer` — Improve prompt quality
- `context-compactor` — Compress long contexts
- `agent-orchestrator` — Manage multi-agent workflows

### Business (20 skills)
- `pricing-analyzer` — Analyze pricing strategies
- `competitor-research` — Research competitors
- `market-analysis` — Market trend analysis
- `financial-modeling` — Build financial models

### Cloud (30 skills)
- `aws-deploy` — Deploy to AWS
- `gcp-setup` — Setup GCP services
- `azure-config` — Configure Azure
- `terraform-generator` — Generate Terraform configs
- `kubernetes-management` — K8s operations

### Crypto (35 skills)
- `solana-rug-check` — Check token safety
- `defi-yield-optimizer` — Find best yields
- `wallet-monitor` — Monitor wallet activity
- `trading-signal-generator` — Generate trade signals
- `smart-contract-audit` — Audit contracts

### Design (25 skills)
- `ui-component-generator` — Generate UI components
- `color-palette-suggester` — Suggest color schemes
- `logo-designer` — Design logos
- `wireframe-creator` — Create wireframes

### DevOps (40 skills)
- `dockerfile-generator` — Generate Dockerfiles
- `ci-cd-setup` — Setup CI/CD pipelines
- `log-analyzer` — Analyze logs
- `monitoring-setup` — Setup monitoring
- `backup-automation` — Automate backups

### Development (50 skills)
- `code-generator` — Generate code
- `refactoring-assistant` — Help refactor
- `bug-finder` — Find bugs
- `test-generator` — Generate tests
- `documentation-writer` — Write docs
- `api-designer` — Design APIs

### Security (30 skills)
- `vulnerability-scanner` — Scan for vulnerabilities
- `penetration-tester` — Pentest guidance
- `security-audit` — Security audits
- `compliance-checker` — Check compliance

### System (25 skills)
- `system-monitor` — Monitor system health
- `process-optimizer` — Optimize processes
- `cron-job-manager` — Manage cron jobs

## Creating Custom Skills

### 1. Create Skill File

```javascript
// Skills/custom/my-skill.js
export default {
  id: 'my-custom-skill',
  name: 'My Custom Skill',
  description: 'Does something useful',
  category: 'custom',
  
  // Keywords that trigger this skill
  triggers: ['custom', 'my', 'special'],
  
  // Examples for training
  examples: [
    'Run my custom analysis',
    'Do something special'
  ],
  
  // Main handler
  async handler(request, context) {
    // Your logic here
    return { result: 'Done!' };
  }
};
```

### 2. Register Skill

```javascript
// In your initialization
import mySkill from './Skills/custom/my-skill.js';
import { registerSkill } from './lib/gabrielos/skills-graph.js';

registerSkill(mySkill);
```

### 3. Test

```
You: "Run my custom analysis"
GabrielOS: Matches 'my-custom-skill' → Executes handler
```

## Skill Matching Algorithm

```javascript
function calculateMatchScore(request, skill) {
  let score = 0;
  
  // Keyword matching (30%)
  for (const trigger of skill.triggers) {
    if (request.includes(trigger)) score += 0.3;
  }
  
  // Example similarity (40%)
  for (const example of skill.examples) {
    score += semanticSimilarity(request, example) * 0.4;
  }
  
  // Historical success (30%)
  score += getSuccessRate(skill.id) * 0.3;
  
  return Math.min(score, 1.0);
}
```

## Best Practices

1. **Specific Triggers** — Use specific keywords, not generic ones
2. **Good Examples** — Include 3-5 diverse examples
3. **Clear Descriptions** — Help the matching algorithm
4. **Error Handling** — Always return structured results

## Troubleshooting

**Skill not matching?**
- Check triggers are in the request
- Add more examples
- Verify skill is registered

**Wrong skill matching?**
- Make triggers more specific
- Add negative examples
- Adjust confidence threshold

## Built-in Skills List

See `Skills/` directory for complete list. Each skill has:
- `SKILL.md` — Documentation
- `handler.js` — Implementation
- `examples/` — Usage examples

## Next Steps

- [API Reference](API.md) — Code examples
- [Architecture](ARCHITECTURE.md) — How skills fit in
