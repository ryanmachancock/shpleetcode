#!/usr/bin/env node

/**
 * LeetCode MCP Server
 * Provides tools for managing LeetCode/NeetCode problem practice
 */

const { Server } = require("@modelcontextprotocol/sdk/server/index.js");
const { StdioServerTransport } = require("@modelcontextprotocol/sdk/server/stdio.js");
const {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} = require("@modelcontextprotocol/sdk/types.js");

const fs = require('fs');
const path = require('path');

// Paths
const DATA_DIR = path.join(process.env.HOME, '.leetcode');
const PROBLEMS_FILE = path.join(DATA_DIR, 'problems.json');
const PROGRESS_FILE = path.join(DATA_DIR, 'progress.json');
const CURRENT_FILE_PATH = path.join(DATA_DIR, '.current-file');
const WORKSPACE_DIR = path.join(DATA_DIR, 'workspace');

// Ensure directories exist
[DATA_DIR, WORKSPACE_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

// Initialize progress file if not exists
if (!fs.existsSync(PROGRESS_FILE)) {
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify({ solved: {}, attempts: {} }, null, 2));
}

// Helper functions
function loadProblems() {
  if (!fs.existsSync(PROBLEMS_FILE)) {
    throw new Error('Problems database not found. Run scraper.js first.');
  }
  return JSON.parse(fs.readFileSync(PROBLEMS_FILE, 'utf8'));
}

function loadProgress() {
  return JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8'));
}

function saveProgress(progress) {
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2));
}

function getCurrentFilePath() {
  if (fs.existsSync(CURRENT_FILE_PATH)) {
    return fs.readFileSync(CURRENT_FILE_PATH, 'utf8').trim();
  }
  return null;
}

function slugToFilename(titleSlug, number) {
  // Convert "two-sum" to "001-two-sum.java"
  const paddedNumber = String(number).padStart(3, '0');
  return `${paddedNumber}-${titleSlug}.java`;
}

function categoryToDirectory(category) {
  // Convert "Arrays & Hashing" to "arrays-hashing"
  return category.toLowerCase().replace(/[^a-z0-9]+/g, '-');
}

// Create MCP server
const server = new Server(
  {
    name: "leetcode-practice-server",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Tool: get_current_problem
// Returns the content of the file currently open in Neovim
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "get_current_problem",
        description: "Get the contents of the Java file currently open in Neovim. This gives you the user's current code without them needing to paste it.",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "list_problems",
        description: "List all available problems with optional filters for category and difficulty",
        inputSchema: {
          type: "object",
          properties: {
            category: {
              type: "string",
              description: "Filter by category (e.g., 'Arrays & Hashing', 'Two Pointers')",
            },
            difficulty: {
              type: "string",
              enum: ["Easy", "Medium", "Hard"],
              description: "Filter by difficulty level",
            },
            onlyUnsolved: {
              type: "boolean",
              description: "Show only unsolved problems",
            },
          },
        },
      },
      {
        name: "get_problem",
        description: "Get full details of a specific problem including description, examples, constraints, and test cases",
        inputSchema: {
          type: "object",
          properties: {
            id: {
              type: "string",
              description: "Problem ID (e.g., '0001-two-sum')",
            },
          },
          required: ["id"],
        },
      },
      {
        name: "create_problem_file",
        description: "Create a new Java file for a problem with boilerplate code in the appropriate directory",
        inputSchema: {
          type: "object",
          properties: {
            id: {
              type: "string",
              description: "Problem ID (e.g., '0001-two-sum')",
            },
          },
          required: ["id"],
        },
      },
      {
        name: "mark_solved",
        description: "Mark a problem as solved with optional notes",
        inputSchema: {
          type: "object",
          properties: {
            id: {
              type: "string",
              description: "Problem ID (e.g., '0001-two-sum')",
            },
            notes: {
              type: "string",
              description: "Optional notes about the solution",
            },
          },
          required: ["id"],
        },
      },
      {
        name: "get_progress",
        description: "Get statistics about solved problems by category and difficulty",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "search_problems",
        description: "Search problems by title or topic tags",
        inputSchema: {
          type: "object",
          properties: {
            query: {
              type: "string",
              description: "Search query for problem title or tags",
            },
          },
          required: ["query"],
        },
      },
    ],
  };
});

// Tool handlers
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "get_current_problem": {
        const filepath = getCurrentFilePath();
        if (!filepath) {
          return {
            content: [{
              type: "text",
              text: "No file currently open in Neovim.",
            }],
          };
        }

        if (!fs.existsSync(filepath)) {
          return {
            content: [{
              type: "text",
              text: `File not found: ${filepath}`,
            }],
          };
        }

        const content = fs.readFileSync(filepath, 'utf8');
        const filename = path.basename(filepath);

        return {
          content: [{
            type: "text",
            text: `Current file: ${filename}\n\n\`\`\`java\n${content}\n\`\`\``,
          }],
        };
      }

      case "list_problems": {
        const db = loadProblems();
        const progress = loadProgress();
        let problems = db.problems;

        // Apply filters
        if (args.category) {
          problems = problems.filter(p => p.category === args.category);
        }
        if (args.difficulty) {
          problems = problems.filter(p => p.difficulty === args.difficulty);
        }
        if (args.onlyUnsolved) {
          problems = problems.filter(p => !progress.solved[p.id]);
        }

        // Format output
        const grouped = {};
        problems.forEach(p => {
          if (!grouped[p.category]) {
            grouped[p.category] = [];
          }
          grouped[p.category].push({
            id: p.id,
            title: p.title,
            difficulty: p.difficulty,
            solved: !!progress.solved[p.id],
            blind75: p.blind75,
          });
        });

        let output = `Found ${problems.length} problems:\n\n`;
        Object.entries(grouped).forEach(([category, probs]) => {
          output += `## ${category}\n`;
          probs.forEach(p => {
            const check = p.solved ? '✓' : ' ';
            const badge = p.blind75 ? '[B75]' : '';
            output += `[${check}] ${p.id} - ${p.title} (${p.difficulty}) ${badge}\n`;
          });
          output += '\n';
        });

        return {
          content: [{
            type: "text",
            text: output,
          }],
        };
      }

      case "get_problem": {
        const db = loadProblems();
        const problem = db.problems.find(p => p.id === args.id);

        if (!problem) {
          return {
            content: [{
              type: "text",
              text: `Problem not found: ${args.id}`,
            }],
          };
        }

        const progress = loadProgress();
        const solved = progress.solved[args.id];

        let output = `# ${problem.title}\n\n`;
        output += `**Difficulty:** ${problem.difficulty}\n`;
        output += `**Category:** ${problem.category}\n`;
        output += `**Status:** ${solved ? '✓ Solved' : '○ Not solved'}\n`;
        if (problem.blind75) output += `**Blind 75:** Yes\n`;
        output += `**LeetCode:** ${problem.leetcodeUrl}\n`;
        if (problem.videoId) {
          output += `**NeetCode Video:** https://www.youtube.com/watch?v=${problem.videoId}\n`;
        }
        output += `\n---\n\n${problem.description}\n\n`;

        if (problem.hints.length > 0) {
          output += `## Hints\n`;
          problem.hints.forEach((hint, i) => {
            output += `${i + 1}. ${hint}\n`;
          });
          output += '\n';
        }

        if (problem.testCases) {
          output += `## Test Cases\n\`\`\`\n${problem.testCases}\n\`\`\`\n\n`;
        }

        output += `## Java Boilerplate\n\`\`\`java\n${problem.boilerplate.java}\n\`\`\`\n`;

        return {
          content: [{
            type: "text",
            text: output,
          }],
        };
      }

      case "create_problem_file": {
        const db = loadProblems();
        const problem = db.problems.find(p => p.id === args.id);

        if (!problem) {
          return {
            content: [{
              type: "text",
              text: `Problem not found: ${args.id}`,
            }],
          };
        }

        const categoryDir = path.join(WORKSPACE_DIR, categoryToDirectory(problem.category));
        if (!fs.existsSync(categoryDir)) {
          fs.mkdirSync(categoryDir, { recursive: true });
        }

        const filename = slugToFilename(problem.titleSlug, problem.number);
        const filepath = path.join(categoryDir, filename);

        if (fs.existsSync(filepath)) {
          return {
            content: [{
              type: "text",
              text: `File already exists: ${filepath}\n\nOpen it with: nvim ${filepath}`,
            }],
          };
        }

        // Create file with boilerplate and problem description as comments
        const content = `/*
 * ${problem.title}
 * Difficulty: ${problem.difficulty}
 * Category: ${problem.category}
 *
 * ${problem.description.replace(/<[^>]*>/g, '').substring(0, 500)}...
 *
 * LeetCode: ${problem.leetcodeUrl}
 * NeetCode: ${problem.neetcodeUrl}
 */

${problem.boilerplate.java}
`;

        fs.writeFileSync(filepath, content);

        return {
          content: [{
            type: "text",
            text: `✓ Created: ${filepath}\n\nOpen it with: nvim ${filepath}`,
          }],
        };
      }

      case "mark_solved": {
        const progress = loadProgress();
        progress.solved[args.id] = {
          solvedAt: new Date().toISOString(),
          notes: args.notes || '',
        };
        saveProgress(progress);

        return {
          content: [{
            type: "text",
            text: `✓ Marked ${args.id} as solved!`,
          }],
        };
      }

      case "get_progress": {
        const db = loadProblems();
        const progress = loadProgress();

        const stats = {
          total: db.problems.length,
          solved: Object.keys(progress.solved).length,
          byDifficulty: { Easy: { total: 0, solved: 0 }, Medium: { total: 0, solved: 0 }, Hard: { total: 0, solved: 0 } },
          byCategory: {},
        };

        db.problems.forEach(p => {
          // By difficulty
          stats.byDifficulty[p.difficulty].total++;
          if (progress.solved[p.id]) {
            stats.byDifficulty[p.difficulty].solved++;
          }

          // By category
          if (!stats.byCategory[p.category]) {
            stats.byCategory[p.category] = { total: 0, solved: 0 };
          }
          stats.byCategory[p.category].total++;
          if (progress.solved[p.id]) {
            stats.byCategory[p.category].solved++;
          }
        });

        let output = `# Your Progress\n\n`;
        output += `**Overall:** ${stats.solved}/${stats.total} (${Math.round(stats.solved / stats.total * 100)}%)\n\n`;

        output += `## By Difficulty\n`;
        Object.entries(stats.byDifficulty).forEach(([diff, s]) => {
          const pct = s.total > 0 ? Math.round(s.solved / s.total * 100) : 0;
          output += `- ${diff}: ${s.solved}/${s.total} (${pct}%)\n`;
        });

        output += `\n## By Category\n`;
        Object.entries(stats.byCategory).forEach(([cat, s]) => {
          const pct = s.total > 0 ? Math.round(s.solved / s.total * 100) : 0;
          output += `- ${cat}: ${s.solved}/${s.total} (${pct}%)\n`;
        });

        return {
          content: [{
            type: "text",
            text: output,
          }],
        };
      }

      case "search_problems": {
        const db = loadProblems();
        const query = args.query.toLowerCase();
        const results = db.problems.filter(p =>
          p.title.toLowerCase().includes(query) ||
          p.topicTags.some(tag => tag.toLowerCase().includes(query))
        );

        if (results.length === 0) {
          return {
            content: [{
              type: "text",
              text: `No problems found matching "${args.query}"`,
            }],
          };
        }

        let output = `Found ${results.length} problems matching "${args.query}":\n\n`;
        results.forEach(p => {
          output += `- ${p.id} - ${p.title} (${p.difficulty})\n`;
        });

        return {
          content: [{
            type: "text",
            text: output,
          }],
        };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    return {
      content: [{
        type: "text",
        text: `Error: ${error.message}`,
      }],
      isError: true,
    };
  }
});

// Start server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("LeetCode MCP server running on stdio");
}

main().catch(console.error);
