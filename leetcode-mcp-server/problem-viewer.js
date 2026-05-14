#!/usr/bin/env node
'use strict';

// Interactive problem viewer — runs in the bottom-right tmux pane
// Usage: node problem-viewer.js <problem-id>
// Keys (normal): j/k arrows=scroll  d/u=half-page  g/G=top/bottom
//                h=hints popup  t=tests popup  r=run  s=submit  m=mark  q=quit
// Keys (popup):  j/k arrows=scroll  d/u=half-page  Esc/q=close

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const PROBLEMS_FILE = path.join(process.env.HOME, '.leetcode', 'problems.json');
const PROGRESS_FILE = path.join(process.env.HOME, '.leetcode', 'progress.json');
const CLI_SUBMIT    = path.join(__dirname, 'cli-submit.js');

// ── ANSI ──────────────────────────────────────────────────────────────────────

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

function stripAnsi(s) { return s.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, ''); }

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

// ── Word-wrap plain text to fit a given column width ─────────────────────────

function wordWrap(text, maxW) {
  if (text.length <= maxW) return [text];
  const words = text.split(' ');
  const lines = [];
  let cur = '';
  for (const w of words) {
    const candidate = cur ? cur + ' ' + w : w;
    if (candidate.length <= maxW) { cur = candidate; }
    else { if (cur) lines.push(cur); cur = w; }
  }
  if (cur) lines.push(cur);
  return lines.length ? lines : [text];
}

// ── Main content (description pane) ──────────────────────────────────────────

function buildLines(problem, progress) {
  const w = process.stdout.columns - 4;
  const hr = `  ${GRAY}${'─'.repeat(Math.max(w, 20))}${R}`;
  const solved = progress?.solved?.[problem.id];
  const diffColor = DIFF_COLOR[problem.difficulty] || WHITE;

  const lines = [];

  // header
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

  // description
  for (const line of cleanHtml(problem.description).split('\n')) {
    lines.push('  ' + line);
  }
  lines.push('');

  // hints / tests prompts (content lives in popups)
  if (problem.hints?.length > 0) {
    lines.push(`  ${DIM}${problem.hints.length} hint(s) available — press ${CYAN}h${R}${DIM} to open${R}`);
    lines.push('');
  }
  if (problem.sampleTestCase) {
    lines.push(`  ${DIM}Sample test cases — press ${CYAN}t${R}${DIM} to open${R}`);
    lines.push('');
  }

  return lines;
}

// ── Background renderer ───────────────────────────────────────────────────────

function renderBackground(lines, scrollOffset, problem) {
  const height = process.stdout.rows;
  const contentRows = height - 2;
  const out = ['\x1b[?25l'];

  for (let i = 0; i < contentRows; i++) {
    out.push(`\x1b[${i + 1};1H\x1b[2K`);
    const line = lines[scrollOffset + i];
    if (line !== undefined) out.push(line);
  }

  // divider
  out.push(`\x1b[${height - 1};1H\x1b[2K${GRAY}${'─'.repeat(process.stdout.columns)}${R}`);

  // footer
  const hasHints = problem.hints?.length > 0;
  const hasTests = !!problem.sampleTestCase;
  const footer =
    `  ` +
    (hasHints ? `${CYAN}[h]${R} hints  ` : '') +
    (hasTests ? `${CYAN}[t]${R} tests  ` : '') +
    `${GREEN}[r]${R} run  ${GREEN}[s]${R} submit  ` +
    `${YELLOW}[m]${R} mark  ` +
    `${DIM}[g/G] top/btm  [q] quit${R}` +
    `  ${GRAY}${scrollOffset + 1}/${lines.length}${R}`;
  out.push(`\x1b[${height};1H\x1b[2K${footer}`);

  process.stdout.write(out.join(''));
  return lines.length;
}

// ── Popup ─────────────────────────────────────────────────────────────────────

function popupDims() {
  const termH = process.stdout.rows;
  const termW = process.stdout.columns;
  const popW    = Math.min(Math.max(Math.floor(termW * 0.75), 52), 92);
  const innerW  = popW - 4;            // 1 border + 1 pad each side
  const innerH  = Math.max(6, Math.floor(termH * 0.6));
  const popH    = innerH + 3;          // top border + innerH + footer + bottom border
  const left    = Math.max(1, Math.floor((termW - popW) / 2) + 1);
  const top     = Math.max(1, Math.floor((termH - popH) / 2) + 1);
  return { popW, innerW, innerH, popH, left, top };
}

function drawPopup(popup) {
  const { popW, innerW, innerH, popH, left, top } = popupDims();
  const maxScroll = Math.max(0, popup.lines.length - innerH);
  const visible   = popup.lines.slice(popup.scroll, popup.scroll + innerH);
  const out = [];

  // top border with centred title
  const titleStr  = ` ${BOLD}${WHITE}${popup.title}${R}${WHITE} `;
  const titleLen  = ` ${popup.title} `.length;
  const dashes    = popW - 2 - titleLen;
  const leftD     = Math.floor(dashes / 2);
  const rightD    = dashes - leftD;
  out.push(`\x1b[${top};${left}H${WHITE}┌${'─'.repeat(leftD)}${titleStr}${'─'.repeat(rightD)}┐${R}`);

  // content rows
  for (let i = 0; i < innerH; i++) {
    const row = top + 1 + i;
    const text = i < visible.length ? visible[i] : '';
    const visLen = stripAnsi(text).length;
    const pad  = ' '.repeat(Math.max(0, innerW - visLen));
    out.push(`\x1b[${row};${left}H${WHITE}│${R} ${text}${pad} ${WHITE}│${R}`);
  }

  // footer row
  const scrollNote = maxScroll > 0 ? `  ${GRAY}${popup.scroll + 1}/${popup.lines.length}${R}` : '';
  const footerText = `${DIM}[j/k ↑↓] scroll  [d/u] half-page  [Esc/q] close${R}${scrollNote}`;
  const footerLen  = stripAnsi(footerText).length;
  const footerPad  = ' '.repeat(Math.max(0, innerW - footerLen));
  const footerRow  = top + 1 + innerH;
  out.push(`\x1b[${footerRow};${left}H${WHITE}│${R} ${footerText}${footerPad} ${WHITE}│${R}`);

  // bottom border
  out.push(`\x1b[${footerRow + 1};${left}H${WHITE}└${'─'.repeat(popW - 2)}┘${R}`);

  process.stdout.write(out.join(''));
}

function buildHintLines(problem, innerW) {
  const lines = [];
  problem.hints.forEach((hint, i) => {
    const prefix = `${GRAY}${i + 1}.${R} `;
    const prefixLen = `${i + 1}. `.length;
    const wrapped = wordWrap(hint, innerW - prefixLen);
    lines.push(prefix + wrapped[0]);
    for (let j = 1; j < wrapped.length; j++) {
      lines.push(' '.repeat(prefixLen) + wrapped[j]);
    }
    lines.push('');
  });
  return lines;
}

function buildTestLines(problem) {
  return problem.sampleTestCase
    .split('\n')
    .map(l => `${GRAY}${l}${R}`);
}

// ── Run / submit ──────────────────────────────────────────────────────────────

function runAction(mode) {
  process.stdout.write('\x1b[?25h\x1b[2J\x1b[H');
  process.stdin.setRawMode(false);
  try {
    execFileSync(process.execPath, [CLI_SUBMIT, mode], { stdio: 'inherit' });
  } catch { /* error output already shown */ }
  process.stdout.write(`\n${DIM}  Press any key to return...${R}`);
  process.stdin.setRawMode(true);
  return new Promise(resolve => process.stdin.once('data', resolve));
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const problemId = process.argv[2];

  if (!fs.existsSync(PROBLEMS_FILE)) {
    process.stdout.write('Problems database not found. Run: npm run scrape\n');
    await new Promise(() => {});
    return;
  }

  const db = JSON.parse(fs.readFileSync(PROBLEMS_FILE, 'utf8'));
  const problem = problemId ? db.problems.find(p => p.id === problemId) : null;

  if (!problem) {
    process.stdout.write(`\x1b[2J\x1b[H\n  ${DIM}No problem loaded.${R}\n`);
    await new Promise(() => {});
    return;
  }

  function loadProgress() {
    if (!fs.existsSync(PROGRESS_FILE)) return { solved: {} };
    return JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8'));
  }

  let scrollOffset = 0;
  const popup = { active: false, title: '', lines: [], scroll: 0 };

  function redraw() {
    const lines    = buildLines(problem, loadProgress());
    const maxScroll = Math.max(0, lines.length - (process.stdout.rows - 2));
    if (scrollOffset > maxScroll) scrollOffset = maxScroll;
    renderBackground(lines, scrollOffset, problem);
    if (popup.active) drawPopup(popup);
  }

  process.stdout.write('\x1b[2J');
  process.stdout.on('resize', redraw);
  redraw();

  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.setEncoding('utf8');

  function openPopup(title, lines) {
    popup.active = true;
    popup.title  = title;
    popup.lines  = lines;
    popup.scroll = 0;
    drawPopup(popup);
  }

  function closePopup() {
    popup.active = false;
    process.stdout.write('\x1b[2J');
    redraw();
  }

  process.stdin.on('data', async key => {
    // ── popup mode ────────────────────────────────────────────────────────────
    if (popup.active) {
      const { innerH } = popupDims();
      const maxScroll  = Math.max(0, popup.lines.length - innerH);
      const half       = Math.max(1, Math.floor(innerH / 2));

      if (key === '\x1b' || key === 'q' || key === '\x03') {
        closePopup();
      } else if (key === 'j' || key === '\x1b[B') {
        popup.scroll = Math.min(popup.scroll + 1, maxScroll); drawPopup(popup);
      } else if (key === 'k' || key === '\x1b[A') {
        popup.scroll = Math.max(0, popup.scroll - 1); drawPopup(popup);
      } else if (key === 'd' || key === '\x04') {
        popup.scroll = Math.min(popup.scroll + half, maxScroll); drawPopup(popup);
      } else if (key === 'u' || key === '\x15') {
        popup.scroll = Math.max(0, popup.scroll - half); drawPopup(popup);
      } else if (key === 'g') {
        popup.scroll = 0; drawPopup(popup);
      } else if (key === 'G') {
        popup.scroll = maxScroll; drawPopup(popup);
      }
      return;
    }

    // ── normal mode ───────────────────────────────────────────────────────────
    const lines     = buildLines(problem, loadProgress());
    const maxScroll = Math.max(0, lines.length - (process.stdout.rows - 2));
    const half      = Math.max(1, Math.floor((process.stdout.rows - 2) / 2));

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
          openPopup('Hints', buildHintLines(problem, popupDims().innerW));
        }
        break;
      case 't':
        if (problem.sampleTestCase) {
          openPopup('Sample Tests', buildTestLines(problem));
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
  process.stdout.write('\x1b[?25h');
  console.error(e.message);
  process.exit(1);
});
