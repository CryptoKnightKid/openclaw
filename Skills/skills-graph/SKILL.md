---
name: skills-graph
description: "Track, analyze, and optimize your AI assistant's skill usage over time. Builds a dynamic graph of capabilities, their relationships, and effectiveness. Auto-suggests skills based on task context and learns which skills work best for different scenarios."
---

# Skills Graph

Track and optimize your AI's skill usage with an intelligent capability graph.

## What It Does

- **Tracks Usage**: Logs every time a skill is used, with outcome
- **Builds Relationships**: Discovers which skills are used together
- **Measures Effectiveness**: Success rate per skill, per task type
- **Smart Suggestions**: Recommends skills based on current task
- **Auto-Catalog**: Keeps TOOLS.md in sync with actual Skills/ directory

## Quick Start

```javascript
const SkillsGraph = require('./Skills/skills-graph/SKILL.js');

// Record that you used a skill
SkillsGraph.recordSkillUsage('coding-agent', 'success');

// Get related skills
const related = SkillsGraph.getRelatedSkills('coding-agent');
// Returns: ['claude-code-guide', 'agent-tool-builder', ...]

// Get suggestions for current task
const suggestions = SkillsGraph.suggestSkillsForTask('building-api');
// Returns: ranked list of relevant skills

// View stats
console.log(SkillsGraph.getSkillStats());
```

## Data Storage

Skills graph data is stored in `memory/skill-usage.json`:

```json
{
  "coding-agent": {
    "name": "coding-agent",
    "category": "AI/Agents",
    "used": 15,
    "lastUsed": "2026-02-26T13:30:00Z",
    "related": ["claude-code-guide", "agent-tool-builder"],
    "effectiveness": 0.87,
    "outcomes": {
      "success": 13,
      "partial": 2,
      "failure": 0
    }
  }
}
```

## API Reference

### recordSkillUsage(skillId, outcome, metadata)

Log a skill usage event.

- `skillId` (string): Skill identifier
- `outcome` (string): 'success', 'partial', or 'failure'
- `metadata` (object, optional): Additional context

### getRelatedSkills(skillId)

Get skills commonly used with the given skill.

Returns: Array of skill IDs sorted by co-usage frequency.

### suggestSkillsForTask(taskType)

Get skill recommendations for a task.

- `taskType` (string): Description of task ('building-api', 'research', etc.)

Returns: Array of skill objects with relevance scores.

### getSkillStats()

Get comprehensive usage statistics.

Returns: Object with top skills, categories, trends.

### syncWithToolsMd()

Update TOOLS.md with current skills catalog.

Scans Skills/ directory and regenerates the catalog section.

## Integration

The skills graph integrates with:

- **Experience Logger**: Logs skill usage after each task
- **System Health**: Reports on skill coverage and gaps
- **Memory Loop**: Suggests skills based on reflection topics

## Configuration

Add to your HEARTBEAT.md to track regularly:

```markdown
### Skills Check
- [ ] Run SkillsGraph.syncWithToolsMd() if new skills added
- [ ] Review top unused skills for potential value
```
