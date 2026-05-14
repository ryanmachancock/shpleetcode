'use strict';

const fs = require('fs');
const path = require('path');

const CONFIG_FILE = path.join(process.env.HOME, '.leetcode', 'config.json');

function loadAuth() {
  if (!fs.existsSync(CONFIG_FILE)) {
    throw new Error('LeetCode auth not configured. Run: ./start-leetcode --setup-auth');
  }
  const config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
  if (!config.leetcodeSession || !config.csrfToken) {
    throw new Error('LeetCode auth incomplete. Run: ./start-leetcode --setup-auth');
  }
  return { session: config.leetcodeSession, csrf: config.csrfToken };
}

async function apiRequest(method, url, body, auth) {
  const headers = {
    'Cookie': `LEETCODE_SESSION=${auth.session}; csrftoken=${auth.csrf}`,
    'X-CSRFToken': auth.csrf,
    'Content-Type': 'application/json',
    'Referer': 'https://leetcode.com/',
    'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36',
    'X-Requested-With': 'XMLHttpRequest',
  };

  const res = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }

  if (res.status === 403) {
    throw new Error('Auth failed (403). Session may be expired — re-run: ./start-leetcode --setup-auth');
  }
  if (res.status === 429) {
    throw new Error('Rate limited by LeetCode (429). Wait a moment and try again.');
  }
  if (res.status !== 200) {
    const msg = typeof data === 'string' ? data : JSON.stringify(data);
    throw new Error(`LeetCode API error ${res.status}: ${msg}`);
  }

  return data;
}

async function poll(checkId, auth, maxMs = 30000) {
  const url = `https://leetcode.com/submissions/detail/${checkId}/check/`;
  const deadline = Date.now() + maxMs;

  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 1500));
    const data = await apiRequest('GET', url, null, auth);
    const state = data.state;
    if (state !== 'STARTED' && state !== 'PENDING') return data;
  }

  throw new Error('Timed out waiting for LeetCode result (30s)');
}

async function runTests(slug, code, lang, questionId, dataInput) {
  const auth = loadAuth();
  const data = await apiRequest('POST',
    `https://leetcode.com/problems/${slug}/interpret_solution/`,
    { lang, question_id: String(questionId), typed_code: code, data_input: dataInput },
    auth
  );
  return poll(data.interpret_id, auth);
}

async function submitSolution(slug, code, lang, questionId) {
  const auth = loadAuth();
  const data = await apiRequest('POST',
    `https://leetcode.com/problems/${slug}/submit/`,
    { lang, question_id: String(questionId), typed_code: code },
    auth
  );
  return poll(data.submission_id, auth);
}

function formatRunResult(result) {
  if (result.compile_error || result.full_compile_error) {
    return `Compile Error:\n${result.full_compile_error || result.compile_error}`;
  }
  if (result.runtime_error || result.full_runtime_error) {
    return `Runtime Error:\n${result.full_runtime_error || result.runtime_error}`;
  }

  const answers = result.code_answer || [];
  const expected = result.expected_code_answer || [];
  const total = answers.length;
  let correct = 0;
  const lines = [];

  for (let i = 0; i < total; i++) {
    const ok = answers[i] === expected[i];
    if (ok) correct++;
    lines.push(`Test ${i + 1}: ${ok ? 'PASS' : 'FAIL'}`);
    if (!ok) {
      lines.push(`  Expected: ${expected[i]}`);
      lines.push(`  Got:      ${answers[i]}`);
    }
  }

  const summary = `${correct}/${total} sample tests passed`;
  return [summary, '', ...lines].join('\n');
}

function formatSubmitResult(result) {
  const status = result.status_msg || 'Unknown';

  if (result.compile_error || result.full_compile_error) {
    return `Compile Error:\n${result.full_compile_error || result.compile_error}`;
  }
  if (result.runtime_error || result.full_runtime_error) {
    const test = result.total_correct != null
      ? ` (failed test ${result.total_correct + 1}/${result.total_testcases})`
      : '';
    return `Runtime Error${test}:\n${result.full_runtime_error || result.runtime_error}`;
  }

  if (result.status_code === 10) {
    return [
      `Accepted — ${result.total_correct}/${result.total_testcases} tests passed`,
      `Runtime: ${result.status_runtime}`,
      `Memory:  ${result.status_memory}`,
    ].join('\n');
  }

  const lines = [`${status} — ${result.total_correct}/${result.total_testcases} tests passed`];
  if (result.last_testcase) {
    lines.push('', 'Failed test input:', result.last_testcase);
  }
  if (result.expected_output != null) lines.push(`Expected: ${result.expected_output}`);
  if (result.code_output != null)    lines.push(`Got:      ${result.code_output}`);

  return lines.join('\n');
}

const LANG_MAP = { '.java': 'java', '.py': 'python3', '.cpp': 'cpp', '.js': 'javascript' };

function langFromFile(filePath) {
  const ext = path.extname(filePath);
  return LANG_MAP[ext] || 'java';
}

module.exports = { loadAuth, runTests, submitSolution, formatRunResult, formatSubmitResult, langFromFile };
