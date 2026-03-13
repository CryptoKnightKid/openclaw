const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.join(__dirname, '..');
const SKILLS_DIR = path.join(ROOT_DIR, 'Skills');
const TOOLS_MD_PATH = path.join(ROOT_DIR, 'TOOLS.md');
const STORAGE_PATH = path.join(ROOT_DIR, 'memory', 'skill-usage.json');

const AUTO_SECTION_START = '<!-- AUTO-SKILLS-START -->';
const AUTO_SECTION_END = '<!-- AUTO-SKILLS-END -->';

const DEFAULT_GRAPH = {
  version: 1,
  updatedAt: null,
  skills: {},
  coUsage: {}
};

/**
 * @typedef {Object} SkillOutcomeTotals
 * @property {number} success
 * @property {number} partial
 * @property {number} failure
 */

/**
 * @typedef {Object} SkillNode
 * @property {string} id
 * @property {string} name
 * @property {string} category
 * @property {number} used
 * @property {string|null} lastUsed ISO timestamp
 * @property {SkillOutcomeTotals} outcomes
 * @property {number} effectiveness 0-1 weighted score
 * @property {Object.<string, number>} related Relationship score by skill id
 * @property {Object.<string, number>} taskTypes Usage count by task type
 */

/**
 * Ensure a directory exists.
 * @param {string} dirPath
 */
function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

/**
 * Normalize a skill id to a stable key.
 * @param {string} value
 * @returns {string}
 */
function normalizeSkillId(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-_./]/g, '-')
    .replace(/-+/g, '-');
}

/**
 * Create a default skill node.
 * @param {string} id
 * @param {string} [name]
 * @param {string} [category]
 * @returns {SkillNode}
 */
function createSkillNode(id, name, category) {
  return {
    id,
    name: name || id,
    category: category || 'Other',
    used: 0,
    lastUsed: null,
    outcomes: {
      success: 0,
      partial: 0,
      failure: 0
    },
    effectiveness: 0,
    related: {},
    taskTypes: {}
  };
}

/**
 * Load persisted skill usage graph.
 * @returns {typeof DEFAULT_GRAPH}
 */
function loadGraph() {
  ensureDir(path.dirname(STORAGE_PATH));

  if (!fs.existsSync(STORAGE_PATH)) {
    const initial = { ...DEFAULT_GRAPH, updatedAt: new Date().toISOString() };
    fs.writeFileSync(STORAGE_PATH, JSON.stringify(initial, null, 2));
    return initial;
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(STORAGE_PATH, 'utf8'));
    return {
      ...DEFAULT_GRAPH,
      ...parsed,
      skills: parsed.skills || {},
      coUsage: parsed.coUsage || {}
    };
  } catch (error) {
    return { ...DEFAULT_GRAPH };
  }
}

/**
 * Save graph to disk.
 * @param {typeof DEFAULT_GRAPH} graph
 */
function saveGraph(graph) {
  graph.updatedAt = new Date().toISOString();
  ensureDir(path.dirname(STORAGE_PATH));
  fs.writeFileSync(STORAGE_PATH, JSON.stringify(graph, null, 2));
}

/**
 * Calculate weighted effectiveness score.
 * success=1, partial=0.5, failure=0
 * @param {SkillOutcomeTotals} outcomes
 * @returns {number}
 */
function calculateEffectiveness(outcomes) {
  const total = (outcomes.success || 0) + (outcomes.partial || 0) + (outcomes.failure || 0);
  if (total === 0) return 0;
  const weighted = (outcomes.success || 0) + (outcomes.partial || 0) * 0.5;
  return Number((weighted / total).toFixed(4));
}

/**
 * Build co-usage edge key with deterministic ordering.
 * @param {string} a
 * @param {string} b
 * @returns {string}
 */
function coUsageKey(a, b) {
  return [a, b].sort().join('::');
}

/**
 * Ensure a skill exists in graph.
 * @param {typeof DEFAULT_GRAPH} graph
 * @param {string} skillId
 * @param {string} [name]
 * @param {string} [category]
 * @returns {SkillNode}
 */
function ensureSkill(graph, skillId, name, category) {
  const id = normalizeSkillId(skillId);
  if (!id) {
    throw new Error('skillId is required');
  }

  if (!graph.skills[id]) {
    graph.skills[id] = createSkillNode(id, name, category);
  }

  if (name) graph.skills[id].name = name;
  if (category) graph.skills[id].category = category;

  return graph.skills[id];
}

/**
 * Increment related counters between skills.
 * @param {typeof DEFAULT_GRAPH} graph
 * @param {string[]} skillIds
 */
function updateCoUsage(graph, skillIds) {
  const unique = [...new Set(skillIds.map(normalizeSkillId).filter(Boolean))];
  for (let i = 0; i < unique.length; i++) {
    for (let j = i + 1; j < unique.length; j++) {
      const a = unique[i];
      const b = unique[j];
      const key = coUsageKey(a, b);
      graph.coUsage[key] = (graph.coUsage[key] || 0) + 1;
      graph.skills[a].related[b] = (graph.skills[a].related[b] || 0) + 1;
      graph.skills[b].related[a] = (graph.skills[b].related[a] || 0) + 1;
    }
  }
}

/**
 * Infer a broad category from a skill id/name.
 * @param {string} text
 * @returns {string}
 */
function inferCategory(text) {
  const value = String(text || '').toLowerCase();
  if (/(agent|ai|llm|prompt|autonom)/.test(value)) return 'AI/Agents';
  if (/(design|ui|ux|brand|visual|canvas)/.test(value)) return 'Design';
  if (/(marketing|copy|seo|content|social|launch)/.test(value)) return 'Marketing';
  if (/(security|auth|pentest|vuln|injection|exploit)/.test(value)) return 'Security';
  if (/(cloud|aws|gcp|azure|serverless)/.test(value)) return 'Cloud';
  if (/(devops|docker|k8s|kubernetes|deploy|ci|cd)/.test(value)) return 'DevOps';
  if (/(sql|postgres|database|nosql|orm)/.test(value)) return 'Databases';
  if (/(analytics|data|tracking|metric)/.test(value)) return 'Data/Analytics';
  if (/(business|pricing|saas|product|strategy)/.test(value)) return 'Business';
  if (/(api|backend|frontend|react|node|javascript|typescript|python|coding|develop)/.test(value)) {
    return 'Development';
  }
  return 'Other';
}

/**
 * Parse available skills from Skills/ directory.
 * @returns {Array<{id: string, name: string, category: string, path: string}>}
 */
function readSkillsDirectory() {
  if (!fs.existsSync(SKILLS_DIR)) return [];

  const dirs = fs.readdirSync(SKILLS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory());

  const skills = [];
  for (const entry of dirs) {
    const id = normalizeSkillId(entry.name);
    const skillPath = path.join(SKILLS_DIR, entry.name);
    const skillMdPath = path.join(skillPath, 'SKILL.md');

    let category = inferCategory(entry.name);
    let name = entry.name;

    if (fs.existsSync(skillMdPath)) {
      try {
        const header = fs.readFileSync(skillMdPath, 'utf8').split('\n').slice(0, 30).join('\n');
        const nameMatch = header.match(/\nname:\s*("?)([^"\n]+)\1/i);
        const descMatch = header.match(/\ndescription:\s*("?)([^"\n]+)\1/i);
        if (nameMatch && nameMatch[2]) name = nameMatch[2].trim();
        if (descMatch && descMatch[2]) {
          category = inferCategory(`${entry.name} ${name} ${descMatch[2]}`);
        } else {
          category = inferCategory(`${entry.name} ${name}`);
        }
      } catch (error) {
        category = inferCategory(entry.name);
      }
    }

    skills.push({
      id,
      name,
      category,
      path: skillPath
    });
  }

  return skills;
}

/**
 * Record usage of a skill and update relationships/effectiveness.
 * @param {string} skillId
 * @param {Object} [options]
 * @param {string} [options.name]
 * @param {string} [options.category]
 * @param {'success'|'partial'|'failure'} [options.outcome='success']
 * @param {string} [options.taskType]
 * @param {string[]} [options.relatedSkills]
 * @param {Date|string} [options.timestamp]
 * @returns {SkillNode}
 */
function recordSkillUsage(skillId, options = {}) {
  const graph = loadGraph();
  const node = ensureSkill(
    graph,
    skillId,
    options.name,
    options.category || inferCategory(`${skillId} ${options.name || ''}`)
  );

  const timestamp = options.timestamp ? new Date(options.timestamp) : new Date();
  const outcome = ['success', 'partial', 'failure'].includes(options.outcome)
    ? options.outcome
    : 'success';

  node.used += 1;
  node.lastUsed = timestamp.toISOString();
  node.outcomes[outcome] = (node.outcomes[outcome] || 0) + 1;
  node.effectiveness = calculateEffectiveness(node.outcomes);

  if (options.taskType) {
    const taskKey = String(options.taskType).trim().toLowerCase();
    if (taskKey) {
      node.taskTypes[taskKey] = (node.taskTypes[taskKey] || 0) + 1;
    }
  }

  const relatedSkills = Array.isArray(options.relatedSkills) ? options.relatedSkills : [];
  const allIds = [skillId, ...relatedSkills].map(normalizeSkillId).filter(Boolean);
  for (const id of allIds) {
    if (!graph.skills[id]) {
      ensureSkill(graph, id, id, inferCategory(id));
    }
  }
  updateCoUsage(graph, allIds);

  saveGraph(graph);
  return graph.skills[node.id];
}

/**
 * Get related skills ranked by co-usage score.
 * @param {string} skillId
 * @param {number} [limit=5]
 * @returns {Array<{skillId: string, name: string, category: string, relationship: number, used: number, effectiveness: number}>}
 */
function getRelatedSkills(skillId, limit = 5) {
  const graph = loadGraph();
  const id = normalizeSkillId(skillId);
  const node = graph.skills[id];
  if (!node) return [];

  return Object.entries(node.related || {})
    .map(([relatedId, relationship]) => {
      const related = graph.skills[relatedId];
      if (!related) return null;
      return {
        skillId: related.id,
        name: related.name,
        category: related.category,
        relationship,
        used: related.used,
        effectiveness: related.effectiveness
      };
    })
    .filter(Boolean)
    .sort((a, b) => {
      if (b.relationship !== a.relationship) return b.relationship - a.relationship;
      if (b.effectiveness !== a.effectiveness) return b.effectiveness - a.effectiveness;
      return b.used - a.used;
    })
    .slice(0, Math.max(0, limit));
}

/**
 * Get skill stats for one skill or global summary.
 * @param {string} [skillId]
 * @returns {Object}
 */
function getSkillStats(skillId) {
  const graph = loadGraph();

  if (skillId) {
    const id = normalizeSkillId(skillId);
    const node = graph.skills[id];
    if (!node) return null;
    return {
      ...node,
      relatedSkills: getRelatedSkills(id, 10)
    };
  }

  const nodes = Object.values(graph.skills);
  const totalUsage = nodes.reduce((acc, node) => acc + node.used, 0);
  const averageEffectiveness = nodes.length
    ? Number((nodes.reduce((acc, node) => acc + (node.effectiveness || 0), 0) / nodes.length).toFixed(4))
    : 0;
  const mostUsed = [...nodes]
    .sort((a, b) => b.used - a.used)
    .slice(0, 10)
    .map((node) => ({
      skillId: node.id,
      name: node.name,
      used: node.used,
      effectiveness: node.effectiveness,
      category: node.category
    }));

  const byCategory = {};
  for (const node of nodes) {
    byCategory[node.category] = byCategory[node.category] || {
      count: 0,
      usage: 0,
      avgEffectiveness: 0
    };
    byCategory[node.category].count += 1;
    byCategory[node.category].usage += node.used;
    byCategory[node.category].avgEffectiveness += node.effectiveness || 0;
  }
  for (const category of Object.keys(byCategory)) {
    byCategory[category].avgEffectiveness = Number(
      (byCategory[category].avgEffectiveness / byCategory[category].count).toFixed(4)
    );
  }

  return {
    updatedAt: graph.updatedAt,
    totalSkills: nodes.length,
    totalUsage,
    averageEffectiveness,
    byCategory,
    mostUsed
  };
}

/**
 * Suggest skills for a task using usage history + keyword matching.
 * @param {string} taskDescription
 * @param {Object} [options]
 * @param {number} [options.limit=5]
 * @returns {Array<{skillId: string, name: string, category: string, score: number, reason: string}>}
 */
function suggestSkillsForTask(taskDescription, options = {}) {
  const graph = loadGraph();
  const limit = typeof options.limit === 'number' ? options.limit : 5;
  const task = String(taskDescription || '').toLowerCase();
  if (!task) return [];

  const taskTokens = new Set(task.split(/[^a-z0-9]+/).filter((token) => token.length > 2));
  const suggestions = [];

  for (const node of Object.values(graph.skills)) {
    const nameTokens = new Set(String(node.name || node.id).toLowerCase().split(/[^a-z0-9]+/).filter(Boolean));
    const categoryTokens = new Set(String(node.category || '').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean));

    let tokenMatches = 0;
    for (const token of taskTokens) {
      if (nameTokens.has(token) || categoryTokens.has(token)) {
        tokenMatches += 1;
      }
    }

    const taskTypeMatches = Object.keys(node.taskTypes || {}).reduce((acc, taskType) => {
      if (task.includes(taskType)) return acc + (node.taskTypes[taskType] || 0);
      return acc;
    }, 0);

    const score = tokenMatches * 3 + taskTypeMatches * 2 + node.effectiveness * 2 + Math.log1p(node.used);
    if (score <= 0) continue;

    const reasonParts = [];
    if (tokenMatches > 0) reasonParts.push(`${tokenMatches} keyword match${tokenMatches > 1 ? 'es' : ''}`);
    if (taskTypeMatches > 0) reasonParts.push(`used for similar task types (${taskTypeMatches})`);
    if (node.effectiveness > 0) reasonParts.push(`effectiveness ${(node.effectiveness * 100).toFixed(0)}%`);
    if (node.used > 0) reasonParts.push(`${node.used} total uses`);

    suggestions.push({
      skillId: node.id,
      name: node.name,
      category: node.category,
      score: Number(score.toFixed(4)),
      reason: reasonParts.join(', ')
    });
  }

  return suggestions
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.max(0, limit));
}

/**
 * Build markdown for auto-managed TOOLS.md section.
 * @param {Array<{id: string, name: string, category: string}>} skills
 * @param {Object} stats
 * @returns {string}
 */
function buildToolsAutoSection(skills, stats) {
  const byCategoryCounts = {};
  for (const skill of skills) {
    byCategoryCounts[skill.category] = (byCategoryCounts[skill.category] || 0) + 1;
  }

  const topCategories = Object.entries(byCategoryCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);

  const topUsed = (stats && Array.isArray(stats.mostUsed)) ? stats.mostUsed.slice(0, 8) : [];

  const lines = [
    AUTO_SECTION_START,
    '## Auto-Synced Skills Snapshot',
    '',
    `- Last synced: ${new Date().toISOString()}`,
    `- Skills in \`Skills/\`: ${skills.length}`,
    `- Skills with tracked usage: ${(stats && stats.totalSkills) || 0}`,
    `- Total recorded usage events: ${(stats && stats.totalUsage) || 0}`,
    '',
    '### Top Categories',
    ...topCategories.map(([category, count]) => `- ${category}: ${count}`),
    ''
  ];

  if (topUsed.length > 0) {
    lines.push('### Most Used Skills');
    for (const entry of topUsed) {
      lines.push(`- ${entry.name} (\`${entry.skillId}\`) - ${entry.used} uses, effectiveness ${(entry.effectiveness * 100).toFixed(0)}%`);
    }
    lines.push('');
  }

  lines.push(AUTO_SECTION_END);
  return lines.join('\n');
}

/**
 * Sync skill inventory and usage summary into TOOLS.md.
 * Also backfills missing skills into the graph so suggestions can include them.
 * @returns {{toolsMdUpdated: boolean, skillsDiscovered: number, trackedSkills: number}}
 */
function syncWithToolsMd() {
  const graph = loadGraph();
  const discovered = readSkillsDirectory();

  for (const skill of discovered) {
    if (!graph.skills[skill.id]) {
      graph.skills[skill.id] = createSkillNode(skill.id, skill.name, skill.category);
    } else {
      graph.skills[skill.id].name = skill.name || graph.skills[skill.id].name;
      graph.skills[skill.id].category = skill.category || graph.skills[skill.id].category;
    }
  }

  saveGraph(graph);
  const stats = getSkillStats();
  const autoSection = buildToolsAutoSection(discovered, stats);

  let toolsContent = fs.existsSync(TOOLS_MD_PATH)
    ? fs.readFileSync(TOOLS_MD_PATH, 'utf8')
    : '# TOOLS.md\n\n';

  const hasAutoSection = toolsContent.includes(AUTO_SECTION_START) && toolsContent.includes(AUTO_SECTION_END);
  if (hasAutoSection) {
    const start = toolsContent.indexOf(AUTO_SECTION_START);
    const end = toolsContent.indexOf(AUTO_SECTION_END) + AUTO_SECTION_END.length;
    toolsContent = `${toolsContent.slice(0, start)}${autoSection}${toolsContent.slice(end)}`;
  } else {
    toolsContent = `${toolsContent.trimEnd()}\n\n${autoSection}\n`;
  }

  fs.writeFileSync(TOOLS_MD_PATH, toolsContent);

  return {
    toolsMdUpdated: true,
    skillsDiscovered: discovered.length,
    trackedSkills: Object.keys(graph.skills).length
  };
}

module.exports = {
  recordSkillUsage,
  getRelatedSkills,
  getSkillStats,
  suggestSkillsForTask,
  syncWithToolsMd
};
