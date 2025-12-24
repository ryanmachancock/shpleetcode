#!/usr/bin/env node

/**
 * NeetCode Problem Scraper
 * Fetches problem details from LeetCode and creates local database
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const DATA_DIR = path.join(process.env.HOME, '.leetcode');
const NEETCODE_DATA = '/tmp/neetcode-raw.json';
const OUTPUT_FILE = path.join(DATA_DIR, 'problems.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// LeetCode GraphQL endpoint
const LEETCODE_GRAPHQL = 'leetcode.com';

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function fetchLeetCodeProblem(titleSlug) {
  return new Promise((resolve, reject) => {
    const query = {
      query: `
        query questionData($titleSlug: String!) {
          question(titleSlug: $titleSlug) {
            questionId
            title
            titleSlug
            content
            difficulty
            exampleTestcases
            topicTags {
              name
            }
            codeSnippets {
              lang
              code
            }
            sampleTestCase
            hints
          }
        }
      `,
      variables: { titleSlug }
    };

    const postData = JSON.stringify(query);

    const options = {
      hostname: LEETCODE_GRAPHQL,
      path: '/graphql',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': postData.length,
        'User-Agent': 'Mozilla/5.0'
      }
    };

    const req = https.request(options, (res) => {
      let data = '';

      res.on('data', chunk => {
        data += chunk;
      });

      res.on('end', () => {
        try {
          const result = JSON.parse(data);
          resolve(result.data?.question || null);
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

async function scrapeProblem(neetcodeEntry, index, total) {
  const titleSlug = neetcodeEntry.link.replace(/\/$/, '');
  console.log(`[${index + 1}/${total}] Fetching: ${neetcodeEntry.problem} (${titleSlug})`);

  try {
    const leetcodeData = await fetchLeetCodeProblem(titleSlug);

    if (!leetcodeData) {
      console.error(`  ⚠️  Failed to fetch data for ${titleSlug}`);
      return null;
    }

    // Extract code snippet for Java
    const javaSnippet = leetcodeData.codeSnippets?.find(s => s.lang === 'Java');

    return {
      id: neetcodeEntry.code,
      number: parseInt(neetcodeEntry.code.split('-')[0]),
      title: neetcodeEntry.problem,
      titleSlug: titleSlug,
      difficulty: neetcodeEntry.difficulty,
      category: neetcodeEntry.pattern,
      neetcode150: neetcodeEntry.neetcode150 || false,
      blind75: neetcodeEntry.blind75 || false,
      description: leetcodeData.content || '',
      hints: leetcodeData.hints || [],
      testCases: leetcodeData.exampleTestcases || '',
      sampleTestCase: leetcodeData.sampleTestCase || '',
      topicTags: leetcodeData.topicTags?.map(t => t.name) || [],
      boilerplate: {
        java: javaSnippet?.code || ''
      },
      videoId: neetcodeEntry.video || '',
      leetcodeUrl: `https://leetcode.com/problems/${titleSlug}/`,
      neetcodeUrl: `https://neetcode.io/problems/${titleSlug}`
    };
  } catch (error) {
    console.error(`  ❌ Error fetching ${titleSlug}:`, error.message);
    return null;
  }
}

async function main() {
  console.log('🚀 Starting NeetCode problem scraper...\n');

  // Load NeetCode data
  const neetcodeData = JSON.parse(fs.readFileSync(NEETCODE_DATA, 'utf8'));

  // Filter for NeetCode 150 problems
  const neetcode150 = neetcodeData.filter(p => p.neetcode150);
  console.log(`📊 Found ${neetcode150.length} NeetCode 150 problems\n`);

  const problems = [];

  for (let i = 0; i < neetcode150.length; i++) {
    const problem = await scrapeProblem(neetcode150[i], i, neetcode150.length);
    if (problem) {
      problems.push(problem);
    }

    // Rate limiting: wait 1 second between requests
    await sleep(1000);
  }

  // Sort by problem number
  problems.sort((a, b) => a.number - b.number);

  // Group by category
  const categories = {};
  problems.forEach(p => {
    if (!categories[p.category]) {
      categories[p.category] = [];
    }
    categories[p.category].push(p.id);
  });

  const database = {
    version: '1.0.0',
    scrapedAt: new Date().toISOString(),
    totalProblems: problems.length,
    categories: categories,
    problems: problems
  };

  // Write to file
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(database, null, 2));

  console.log(`\n✅ Successfully scraped ${problems.length} problems`);
  console.log(`📁 Database saved to: ${OUTPUT_FILE}`);
  console.log('\n📊 Problems by difficulty:');

  const byDifficulty = problems.reduce((acc, p) => {
    acc[p.difficulty] = (acc[p.difficulty] || 0) + 1;
    return acc;
  }, {});

  console.log(`   Easy: ${byDifficulty.Easy || 0}`);
  console.log(`   Medium: ${byDifficulty.Medium || 0}`);
  console.log(`   Hard: ${byDifficulty.Hard || 0}`);
}

main().catch(console.error);
