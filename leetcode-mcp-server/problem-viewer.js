#!/usr/bin/env node
'use strict';

// Interactive problem viewer — replaces the nvim -R pane
// Usage: node problem-viewer.js <problem-id>
// Keys: j/k or arrows=scroll, d/u=half-page, g/G=top/bottom,
//       h=hints, t=tests, r=run, s=submit, m=mark, q=quit

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const PROBLEMS_FILE = path.join(process.env.HOME, '.leetcode', 'problems.json');
const PROGRESS_FILE = path.join(process.env.HOME, '.leetcode', 'progress.json');
const CURRENT_FILE  = path.join(process.env.HOME, '.leetcode', '.current-file');
const CLI_SUBMIT    = path.join(__dirname, 'cli-submit.js');

// ── ANSI helpers ──────────────────────────────────────────────────────────────

const R      = '\x1b[0m';
const BOLD   = '\x1b[1m';
const DIM    = '\x1b[2m';
const GREEN  = '\x1b[32m';
const YELLOW = '\x1b[33m';
const RED    = '\x1b[31m';
const CYAN   = '\x1b[36m';
const GRAY   = '\x1b[90m';
const WHITE  = '\x1b[97m';

const DIFF_COLOR = { Easy: GREEN, Medium: YELLOW, Hard: RED };

function stripAnsi(s) { return s.replace(/\x1b\[[0-9;]*m/g, ''); }

// ── HTML cleaning ─────────────────────────────────────────────────────────────

function cleanHtml(html) {
  if (!html) return '';
  return html
    .replace(/<sup>(.*?)<\/sup>/g, '^$1')
    .replace(/<sub>(.*?)<\/sub>/g, '_($1)')
    .replace(/<code>(.*?)<\/code>/g, `${CYAN}$1${R}`)
    .replace(/<strong>(.*?)<\/strong>/g, `${BOLD}$1${R}`)
    .replace(/<em>(.*?)<\/em>/g, `${DIM}$1${R}`)
    .replace(/<li>/g, `\n  ${GRAY}•${R} `)
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
}

// ── Content builder ───────────────────────────────────────────────────────────

function buildLines(problem, progress, showHints, showTests) {
  const w = process.stdout.columns - 4;
  const hr = `  ${GRAY}${'─'.repeat(Math.max(w, 20))}${R}`;
  const solved = progress?.solved?.[problem.id];
  const diffColor = DIFF_COLOR[problem.difficulty] || WHITE;

  const lines = [];

  // ── header
  lines.push('');
  lines.push(`  ${BOLD}${WHITE}${problem.title}${R}`);
  lines.push(
    `  ${diffColor}${problem.difficulty}${R}` +
    `  ${GRAY}${problem.category}${R}` +
    (solved ? `  ${GREEN}${BOLD}✓ solved${R}` : `  ${DIM}○ unsolved${R}`)
  );
  lines.push(`  ${GRAY}${problem.leetcodeUrl}${R}`);
  lines.push('');
  lines.push(hr);
  lines.push('');

  // ── description
  const desc = cleanHtml(problem.description);
  for (const line of desc.split('\n')) {
    lines.push('  ' + line);
  }
  lines.push('');

  // ── hints
  if (problem.hints?.length > 0) {
    if (showHints) {
      lines.push(`  ${BOLD}${CYAN}Hints${R}`);
      lines.push(hr);
      problem.hints.forEach((hint, i) => {
        lines.push(`  ${GRAY}${i + 1}.${R} ${hint}`);
      });
      lines.push('');
    } else {
      lines.push(`  ${DIM}${problem.hints.length} hint(s) — press ${CYAN}h${R}${DIM} to reveal${R}`);
      lines.push('');
    }
  }

  // ── sample test cases
  if (problem.sampleTestCase) {
    if (showTests) {
      lines.push(`  ${BOLD}${CYAN}Sample Test Cases${R}`);
      lines.push(hr);
      for (const line of problem.sampleTestCase.split('\n')) {
        lines.push(`  ${GRAY}${line}${R}`);
      }
      lines.push('');
    } else {
      lines.push(`  ${DIM}Sample tests hidden — press ${CYAN}t${R}${DIM} to show${R}`);
      lines.push('');
    }
  }

  return lines;
}

// ── Renderer ──────────────────────────────────────────────────────────────────

function render(problem, progress, scrollOffset, showHints, showTests) {
  const height = process.stdout.rows;
  const contentRows = height - 2; // reserve 2 for footer

  const lines = buildLines(problem, progress, showHints, showTests);
  const out = ['\x1b[?25l']; // hide cursor

  for (let i = 0; i < contentRows; i++) {
    out.push(`\x1b[${i + 1};1H\x1b[2K`);
    const line = lines[scrollOffset + i];
    if (line !== undefined) out.push(line);
  }

  // divider
  const divider = `${GRAY}${'─'.repeat(process.stdout.columns)}${R}`;
  out.push(`\x1b[${height - 1};1H\x1b[2K${divider}`);

  // footer
  const hKey = problem.hints?.length > 0
    ? (showHints ? `${CYAN}[h]${R} hide hints  ` : `${CYAN}[h]${R} hints  `)
    : '';
  const tKey = problem.sampleTestCase
    ? (showTests ? `${CYAN}[t]${R} hide tests  ` : `${CYAN}[t]${R} tests  `)
    : '';
  const scrollInfo = `${GRAY}${scrollOffset + 1}/${lines.length}${R}`;
  const footer =
    `  ${hKey}${tKey}` +
    `${GREEN}[r]${R} run  ${GREEN}[s]${R} submit  ` +
    `${YELLOW}[m]${R} mark  ` +
    `${DIM}[g/G] top/btm  [q] quit${R}  ${scrollInfo}`;
  out.push(`\x1b[${height};1H\x1b[2K${footer}`);

  process.stdout.write(out.join(''));
  return lines.length;
}

// ── Run / submit action ───────────────────────────────────────────────────────

function runAction(mode) {
  process.stdout.write('\x1b[?25h\x1b[2J\x1b[H'); // show cursor, clear
  process.stdin.setRawMode(false);

  try {
    execFileSync(process.execPath, [CLI_SUBMIT, mode], { stdio: 'inherit' });
  } catch { /* non-zero exit is fine — output already shown */ }

  process.stdout.write(`\n${DIM}  Press any key to return...${R}`);
  process.stdin.setRawMode(true);

  return new Promise(resolve => process.stdin.once('data', resolve));
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const problemId = process.argv[2];

  if (!fs.existsSync(PROBLEMS_FILE)) {
    process.stdout.write('Problems database not found. Run: npm run scrape\n');
    await new Promise(() => {}); // keep pane open
    return;
  }

  const db = JSON.parse(fs.readFileSync(PROBLEMS_FILE, 'utf8'));
  const problem = problemId
    ? db.problems.find(p => p.id === problemId)
    : null;

  if (!problem) {
    process.stdout.write(`\x1b[2J\x1b[H\n  ${DIM}No problem loaded.${R}\n`);
    await new Promise(() => {});
    return;
  }

  let scrollOffset = 0;
  let showHints    = false;
  let showTests    = false;

  function loadProgress() {
    if (!fs.existsSync(PROGRESS_FILE)) return { solved: {} };
    return JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8'));
  }

  function redraw() {
    const totalLines = render(problem, loadProgress(), scrollOffset, showHints, showTests);
    const maxScroll = Math.max(0, totalLines - (process.stdout.rows - 2));
    if (scrollOffset > maxScroll) { scrollOffset = maxScroll; render(problem, loadProgress(), scrollOffset, showHints, showTests); }
  }

  process.stdout.write('\x1b[2J'); // clear screen once
  process.stdout.on('resize', redraw);
  redraw();

  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.setEncoding('utf8');

  process.stdin.on('data', async key => {
    const totalLines = buildLines(problem, loadProgress(), showHints, showTests).length;
    const maxScroll  = Math.max(0, totalLines - (process.stdout.rows - 2));
    const half       = Math.max(1, Math.floor((process.stdout.rows - 2) / 2));

    switch (key) {
      case 'q': case '\x03':
        process.stdout.write('\x1b[?25h\x1b[2J\x1b[H');
        process.exit(0);
        break;
      case 'j': case '\x1b[B':
        scrollOffset = Math.min(scrollOffset + 1, maxScroll); redraw(); break;
      case 'k': case '\x1b[A':
        scrollOffset = Math.max(0, scrollOffset - 1); redraw(); break;
      case 'd': case '\x04':
        scrollOffset = Math.min(scrollOffset + half, maxScroll); redraw(); break;
      case 'u': case '\x15':
        scrollOffset = Math.max(0, scrollOffset - half); redraw(); break;
      case 'g':
        scrollOffset = 0; redraw(); break;
      case 'G':
        scrollOffset = maxScroll; redraw(); break;
      case 'h':
        if (problem.hints?.length > 0) {
          showHints = !showHints;
          if (showHints) {
            // Scroll so the Hints header lands near the top of the visible area
            const preHints = buildLines(problem, loadProgress(), false, showTests).length - 2;
            scrollOffset = Math.max(0, preHints - 2);
          }
          redraw();
        }
        break;
      case 't':
        if (problem.sampleTestCase) {
          showTests = !showTests;
          if (showTests) {
            // Scroll so the Test Cases header lands near the top of the visible area
            const preTests = buildLines(problem, loadProgress(), showHints, false).length - 2;
            scrollOffset = Math.max(0, preTests - 2);
          }
          redraw();
        }
        break;
      case 'r':
        await runAction('run');
        process.stdout.write('\x1b[2J');
        redraw();
        break;
      case 's':
        await runAction('submit');
        process.stdout.write('\x1b[2J');
        redraw();
        break;
      case 'm': {
        const prog = loadProgress();
        if (!prog.solved) prog.solved = {};
        prog.solved[problem.id] = { solvedAt: new Date().toISOString(), notes: '' };
        fs.writeFileSync(PROGRESS_FILE, JSON.stringify(prog, null, 2));
        redraw();
        break;
      }
    }
  });
}

main().catch(e => {
  process.stdout.write('\x1b[?25h'); // restore cursor on crash
  console.error(e.message);
  process.exit(1);
});
