#!/usr/bin/env node

// Simple markdown renderer with ANSI colors for terminal
const fs = require('fs');

const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
};

function wrapText(text, width = 70) {
  const lines = [];
  const paragraphs = text.split('\n');

  paragraphs.forEach(para => {
    if (para.trim() === '') {
      lines.push('');
      return;
    }

    // Don't wrap headers, horizontal rules, or short lines
    if (para.startsWith('#') || para.startsWith('─') || para.startsWith('=') || para.length <= width) {
      lines.push(para);
      return;
    }

    const words = para.split(' ');
    let currentLine = '';

    words.forEach(word => {
      // Strip ANSI codes for length calculation
      const stripAnsi = (str) => str.replace(/\x1b\[[0-9;]*m/g, '');

      if (stripAnsi(currentLine + ' ' + word).length <= width) {
        currentLine += (currentLine ? ' ' : '') + word;
      } else {
        if (currentLine) lines.push(currentLine);
        currentLine = word;
      }
    });

    if (currentLine) lines.push(currentLine);
  });

  return lines.join('\n');
}

function renderMarkdown(text) {
  let output = text
    // H1 headers
    .replace(/^# (.+)$/gm, `\n${colors.bold}${colors.cyan}$1${colors.reset}\n${'='.repeat(60)}\n`)
    // H2 headers
    .replace(/^## (.+)$/gm, `\n${colors.bold}${colors.blue}$1${colors.reset}\n${'-'.repeat(40)}\n`)
    // Bold text
    .replace(/\*\*(.+?)\*\*/g, `${colors.bold}$1${colors.reset}`)
    // Horizontal rules
    .replace(/^---+$/gm, colors.dim + '─'.repeat(60) + colors.reset)
    // Links (show URL after text)
    .replace(/\[(.+?)\]\((.+?)\)/g, `${colors.cyan}$1${colors.reset} ${colors.dim}($2)${colors.reset}`)
    // Code blocks (inline)
    .replace(/`(.+?)`/g, `${colors.yellow}$1${colors.reset}`)
    // Lists
    .replace(/^- (.+)$/gm, `  ${colors.green}•${colors.reset} $1`);

  return wrapText(output, 110);
}

const filepath = process.argv[2];
if (!filepath) {
  console.error('Usage: render-markdown.js <file.md>');
  process.exit(1);
}

const content = fs.readFileSync(filepath, 'utf8');
console.log(renderMarkdown(content));
