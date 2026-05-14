#!/usr/bin/env node
// fzf preview script — called by select_problem() in start-leetcode
// Env vars: PROBLEMS_FILE, PROBLEM_ID

const fs = require('fs');

const db = JSON.parse(fs.readFileSync(process.env.PROBLEMS_FILE, 'utf8'));
const p = db.problems.find(x => x.id === process.env.PROBLEM_ID);

if (!p) process.exit(0);

const cleanHtml = html => {
  if (!html) return '';
  return html
    .replace(/<sup>(.*?)<\/sup>/g, '^$1')
    .replace(/<sub>(.*?)<\/sub>/g, '_($1)')
    .replace(/<code>(.*?)<\/code>/g, '`$1`')
    .replace(/<strong>(.*?)<\/strong>/g, '**$1**')
    .replace(/<em>(.*?)<\/em>/g, '*$1*')
    .replace(/<li>/g, '\n- ')
    .replace(/<\/li>/g, '')
    .replace(/<\/?(ul|ol|p|div|span|pre|blockquote)[^>]*>/g, '\n')
    .replace(/<br\s*\/?>/g, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
};

const desc = cleanHtml(p.description);

console.log('# ' + p.title);
console.log('');
console.log('**Difficulty:** ' + p.difficulty + '  |  **Category:** ' + p.category);
console.log('**LeetCode:** ' + p.leetcodeUrl);
console.log('');
console.log(desc.substring(0, 800));
