#!/usr/bin/env node
// CLI run/submit — called by start-leetcode --run / --submit
// Usage: node cli-submit.js <run|submit> [filepath]

'use strict';

const fs = require('fs');
const path = require('path');

const { runTests, submitSolution, formatRunResult, formatSubmitResult, langFromFile } = require('./leetcode-api');

const PROBLEMS_FILE = path.join(process.env.HOME, '.leetcode', 'problems.json');
const CURRENT_FILE  = path.join(process.env.HOME, '.leetcode', '.current-file');

function die(msg) { process.stderr.write(msg + '\n'); process.exit(1); }

function findProblem(filePath) {
  const db = JSON.parse(fs.readFileSync(PROBLEMS_FILE, 'utf8'));
  // Derive slug from filename: "001-two-sum.java" → "two-sum"
  const base = path.basename(filePath, path.extname(filePath)); // "001-two-sum"
  const slug = base.replace(/^\d+-/, '');                        // "two-sum"
  const problem = db.problems.find(p => p.titleSlug === slug);
  if (!problem) die(`Could not find problem for file: ${filePath}\n(derived slug: ${slug})`);
  return problem;
}

async function main() {
  const mode     = process.argv[2]; // 'run' or 'submit'
  const argFile  = process.argv[3];

  if (!mode || (mode !== 'run' && mode !== 'submit')) {
    die('Usage: node cli-submit.js <run|submit> [filepath]');
  }

  // Resolve file path
  let filePath = argFile;
  if (!filePath) {
    if (!fs.existsSync(CURRENT_FILE)) {
      die('No current problem file found. Either start a session or provide a file path.');
    }
    filePath = fs.readFileSync(CURRENT_FILE, 'utf8').trim();
  }

  if (!fs.existsSync(filePath)) die(`File not found: ${filePath}`);

  const code    = fs.readFileSync(filePath, 'utf8');
  const lang    = langFromFile(filePath);
  const problem = findProblem(filePath);

  if (mode === 'run') {
    if (!problem.sampleTestCase) die('No sample test cases available for this problem.');
    process.stdout.write(`Running sample tests for: ${problem.title} ...\n\n`);
    const result = await runTests(problem.titleSlug, code, lang, problem.number, problem.sampleTestCase);
    process.stdout.write(formatRunResult(result) + '\n');
  } else {
    process.stdout.write(`Submitting: ${problem.title} ...\n\n`);
    const result = await submitSolution(problem.titleSlug, code, lang, problem.number);
    process.stdout.write(formatSubmitResult(result) + '\n');
  }
}

main().catch(e => { process.stderr.write(e.message + '\n'); process.exit(1); });
