// float-lib.mjs — the shared deterministic instrument for the quilt-float prototype.
// stdlib only (node:crypto, node:fs, node:child_process). No network here; network is git.
//
// Laws this library encodes:
//   1. RECEIPT CHAIN = the shared clock. One append-only sha256-chained entry per committed
//      action; the tip is the synchrony primitive (two-git-agents-design.md §4 @ 5e00a5b).
//      hash = sha256([agent, prev, seq, ts, kind, ref].join('|')), genesis prev = 'GENESIS'.
//   2. CELL = {id, claim, evidence, why, pins[]}. WHY-RATE = fraction of cells carrying a why.
//      Pin statuses: verified | refuted | claimed | provisional. REGRESSION = status 'claimed'
//      (asserted without evidence). 'provisional' asserts WITH evidence and a stated
//      generalization condition; 'refuted' is a resolved discovery, not a regression.
//   3. MENU = the fixed exchange-prompt menu the watcher scores after every tick.
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

export const sha256 = (s) => createHash('sha256').update(s, 'utf8').digest('hex');
export const nowIso = () => new Date().toISOString();
export const RATE = (r) => Math.round(r * 10000) / 10000;

// Never let a tokenized remote URL reach a log.
export const REDACT = (s) => String(s).replace(/https:\/\/[^@\s]+@/g, 'https://[REDACTED]@');

export function git(cwd, ...args) {
  return execFileSync('git', args, {
    cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
  });
}
export function gitOk(cwd, ...args) {
  try { git(cwd, ...args); return true; } catch { return false; }
}

export const writeJson = (file, obj) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(obj, null, 2) + '\n');
};
export const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
export function readJsonl(file) {
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, 'utf8').split('\n').map(s => s.trim()).filter(Boolean).map(l => JSON.parse(l));
}
export function appendJsonl(file, obj) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.appendFileSync(file, JSON.stringify(obj) + '\n');
}

// ---------- 1. receipt chain ----------
export const chainFile = (dir) => path.join(dir, 'receipts', 'chain.jsonl');

export function readChainText(text) {
  return String(text).split('\n').map(s => s.trim()).filter(Boolean).map(l => JSON.parse(l));
}
export const readChain = (file) => readChainText(fs.readFileSync(file, 'utf8'));
export const chainTipOf = (entries) => entries.length ? entries[entries.length - 1].hash : 'GENESIS';

export const entryHash = (agent, prev, seq, ts, kind, ref) =>
  sha256([agent, prev, seq, ts, kind, ref].join('|'));

export function chainAppend(dir, agent, { kind, ref, ts }) {
  const file = chainFile(dir);
  const entries = fs.existsSync(file) ? readChain(file) : [];
  const prev = chainTipOf(entries);
  const seq = entries.length + 1;
  const e = { seq, ts, kind, ref, prev };
  e.hash = entryHash(agent, prev, seq, ts, kind, ref);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.appendFileSync(file, JSON.stringify(e) + '\n');
  return e;
}

export function chainVerifyEntries(entries, agent) {
  let prev = 'GENESIS';
  for (const [i, e] of entries.entries()) {
    if (e.seq !== i + 1) return { ok: false, error: 'CHAIN_SEQ_GAP', at: e.seq, detail: `expected seq ${i + 1}` };
    if (e.prev !== prev) return { ok: false, error: 'CHAIN_PREV_MISMATCH', at: e.seq, detail: `prev ${e.prev} != walking tip ${prev}` };
    const expect = entryHash(agent, prev, e.seq, e.ts, e.kind, e.ref);
    if (e.hash !== expect) return { ok: false, error: 'CHAIN_HASH_MISMATCH', at: e.seq, detail: `re-derived ${expect} != published ${e.hash}` };
    prev = e.hash;
  }
  return { ok: true, tip: prev, count: entries.length };
}

// ---------- 2. cells + metrics ----------
export function metrics(cells) {
  const n = cells.length;
  const whys = cells.filter(c => typeof c.why === 'string' && c.why.trim().length > 0).length;
  const whyRate = n ? RATE(whys / n) : 0;
  const regressions = cells.reduce((acc, c) =>
    acc + (Array.isArray(c.pins) ? c.pins.filter(p => p.status === 'claimed').length : 0), 0);
  return { cells: n, whys, whyRate, regressions };
}

export function readCellsDir(dir) {
  const cdir = path.join(dir, 'cells');
  if (!fs.existsSync(cdir)) return [];
  return fs.readdirSync(cdir).filter(f => f.endsWith('.json')).sort()
    .map(f => JSON.parse(fs.readFileSync(path.join(cdir, f), 'utf8')));
}
export const metricsOfDir = (dir) => metrics(readCellsDir(dir));

// ---------- 3. the fixed menu ----------
export const MENU = {
  M1: 'your counterpart\'s why-rate is rising — visit their newest cell and pin or refute it',
  M2: 'you carry unresolved pins — verify or refute them offline before claiming anything new',
  M3: 'extend your newest why into a general lesson for the next reader',
};

// Simple deterministic scoring. s1 = 10*foreignWhyDelta + 0.25*foreignNewCells
// (a rising counterpart is the strongest signal; new foreign cells make visiting cheap);
// s2 = own pin regressions (an own flaw is a claim waiting to be resolved);
// s3 = 0.2 flat baseline (+0.1 ceiling bonus when BOTH quilts are at the why-ceiling and flat).
// Tie-break priority: M2 > M1 > M3 (resolve own flaws before visiting; extend last).
export function selectPrompt({ foreignWhyDelta, foreignNewCells, ownRegressions, ownWhyRate }) {
  const s1 = RATE(10 * foreignWhyDelta + 0.25 * foreignNewCells);
  const s2 = ownRegressions;
  const s3 = RATE(0.2 + ((ownWhyRate === 1 && foreignWhyDelta <= 0) ? 0.1 : 0));
  const scores = { M1: s1, M2: s2, M3: s3 };
  let chosen = 'M3', best = -Infinity;
  for (const k of ['M2', 'M1', 'M3']) {
    if (scores[k] > best) { best = scores[k]; chosen = k; }
  }
  return { chosen, scores };
}
