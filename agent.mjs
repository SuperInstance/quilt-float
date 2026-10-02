#!/usr/bin/env node
// agent.mjs — one float agent. tick = commit. THE MEDIUM IS GIT: this process reads its
// counterpart ONLY through `git fetch` of the counterpart's remote branch — never through
// the filesystem, never through a shared working tree. Its own quilt is its branch.
//
// Usage: node agent.mjs tick <cloneDir> <directiveJson> <runsDir>
//
// One tick (exchange form) performs the loop from two-git-agents-design.md §3, made git-only:
//   (a) append a lesson to its own quilt (lessons/NNN.md, receipt chain in-file: prev-tip sha)
//   (b) commit + push
//   (c) git fetch the counterpart's branch
//   (d) diff the foreign quilt against memory/foreign.json (its memory of it)
//   (e) write a taught-by cell if (and only if, asserted against the directive's expectations)
//       the foreign lesson changes its own belief — citing the foreign git tip + chain tip
//   (f) commit + push
// Every committed action gets one receipt-chain entry (the shared clock). The watcher runs
// after each tick (driven by session-run.sh) and its prompt is asserted by the NEXT directive.
import fs from 'node:fs';
import path from 'node:path';
import {
  sha256, nowIso, REDACT, git, writeJson, readJson,
  chainFile, readChain, chainTipOf, chainAppend, metricsOfDir, appendJsonl,
  validateDirective, AGENTS, counterpartsOf,
} from './float-lib.mjs';

const [, , cmd, cloneDir, directivePath, runsDir] = process.argv;
if (cmd !== 'tick' || !cloneDir || !directivePath || !runsDir) {
  console.error('usage: node agent.mjs tick <cloneDir> <directiveJson> <runsDir>');
  process.exit(64);
}

const fail = (msg) => { console.error(`AGENT-ABORT: ${msg}`); process.exit(2); };
const log = [];
const L = (s = '') => log.push(s);

const d = readJson(directivePath);

// ---- 0. L21: validate the exchange BEFORE the tick — fail-closed, named error, no mutation ----
// Chain integrity and schema completeness are DIFFERENT laws (session 1, tick 3: the chain
// accepted a dangling entry while the tick died on lesson.bodyMd). Refuse here, pre-tick,
// naming the missing field — nothing below this line runs on a malformed directive.
const schema = validateDirective(d);
if (!schema.ok) {
  fail(`E_DIRECTIVE_SCHEMA: directive ${path.basename(directivePath)} refused pre-tick — ${schema.detail}`);
}
L(`directive schema: ok (validated pre-tick, E_DIRECTIVE_SCHEMA gate)`);
L('');

const agent = d.agent;
// session-3 fleet law: an agent's counterparts are ALL other roster members. Every
// exchange reads every foreign quilt (fetch + memory diff each); the taught-by binds to
// exactly ONE of them (citations name the branch they cite).
const peers = counterpartsOf(agent);
const branch = `float/${agent}`;
const logPath = path.join(runsDir, 'logs', `${d.tickLabel}.log`);

L(`# tick ${d.tickLabel} — agent ${agent} (${d.kind})`);
L(`directive: ${path.relative(process.cwd(), directivePath)}`);
L(`clock: ${nowIso()}`);
L('');

// ---- 0. menu obedience: the directive must follow the prompt the watcher selected ----
if (d.expectedPrompt) {
  const { readJsonl } = await import('./float-lib.mjs');
  const mine = readJsonl(path.join(runsDir, 'prompts.jsonl')).filter(p => p.agent === agent);
  const last = mine[mine.length - 1];
  if (!last || last.chosen !== d.expectedPrompt) {
    fail(`STALE-DIRECTIVE: menu selected ${last ? last.chosen : 'nothing'} for ${agent}, directive expected ${d.expectedPrompt}`);
  }
  L(`menu obedience: watcher selected ${last.chosen} for ${agent} (scores M1=${last.scores.M1} M2=${last.scores.M2} M3=${last.scores.M3}) — directive obeys ✓`);
  L(`prompt: "${last.prompt}"`);
  L('');
}

// ---- 1. (a) append a lesson to its own quilt, receipt chain in-file ----
const les = d.lesson;
const lessonRel = `lessons/${String(les.n).padStart(3, '0')}-${les.slug}.md`;
const e1 = chainAppend(cloneDir, agent, {
  kind: d.kind === 'seed' ? 'seed' : 'lesson', ref: lessonRel, ts: nowIso(),
});
L(`receipt-chain +1: seq=${e1.seq} kind=${e1.kind} ref=${e1.ref}`);
L(`  prev-receipt-tip: ${e1.prev}`);
L(`  receipt-tip:      ${e1.hash}`);
L('');

// resolve cells (pin verifications/refutations, why backfills) — additive edits only
for (const rc of d.resolveCells ?? []) {
  const p = path.join(cloneDir, 'cells', `${rc.id}.json`);
  if (!fs.existsSync(p)) fail(`RESOLVE-FAIL: cell ${rc.id} not in my quilt`);
  const cell = JSON.parse(fs.readFileSync(p, 'utf8'));
  Object.assign(cell, rc.patch);
  fs.writeFileSync(p, JSON.stringify(cell, null, 2) + '\n');
  L(`cell resolve: ${rc.id} — ${Object.keys(rc.patch).join(', ')} rewritten additively`);
}
if (d.resolveCells?.length) L('');

// materialize cells: seed cells on a seed tick, the lesson's own cell on an exchange tick
if (d.kind === 'seed') {
  for (const c of d.cells) {
    writeJson(path.join(cloneDir, 'cells', `${c.id}.json`), c);
    L(`cell seeded: ${c.id} (${c.why ? 'with why' : 'WHY-LESS protocol cell — staged work, to be earned'})`);
  }
} else {
  writeJson(path.join(cloneDir, 'cells', `${les.cellId}.json`), {
    id: les.cellId, kind: 'lesson-cell', lineage: les.lineage ?? null,
    claim: les.claim, evidence: les.evidence, why: les.why, pins: les.pins ?? [],
    lesson: lessonRel,
  });
  L(`cell materialized: ${les.cellId} ← ${lessonRel}`);
}
L('');

const receiptBlock = [
  '## receipt', '',
  `- kind: ${d.kind === 'seed' ? 'seed' : 'lesson'}`,
  `- agent: ${agent}`,
  `- prev-receipt-tip: ${e1.prev}`,
  `- receipt-tip: ${e1.hash}`,
  '',
].join('\n');
fs.mkdirSync(path.join(cloneDir, 'lessons'), { recursive: true });
fs.writeFileSync(path.join(cloneDir, lessonRel),
  `# Lesson ${String(les.n).padStart(3, '0')} — ${les.title}\n\nagent: ${agent}\n${les.lineage ? `lineage: ${les.lineage}\n` : ''}\n${les.bodyMd.trim()}\n\n${receiptBlock}`);
L(`lesson written: ${lessonRel} (receipt chain in-file: prev ${e1.prev.slice(0, 7)} → tip ${e1.hash.slice(0, 7)})`);

// state.json — the agent's own published dials (chain tip + metrics + foreign memory).
// Fleet memory shape: { peers: { <name>: {gitTip, chainTip, cellsSeen, cells, whyRate} } }.
// Legacy single-counterpart files (sessions 1–2) migrate INSIDE the first fleet tick that
// touches them — cellsSeen preserved byte-for-byte, migration receipted in the tick log.
const m1 = metricsOfDir(cloneDir);
const seedForeign = { gitTip: null, chainTip: null, cellsSeen: {}, cells: 0, whyRate: null };
const memFile = path.join(cloneDir, 'memory', 'foreign.json');
let mem;
if (d.kind === 'seed') {
  mem = { peers: Object.fromEntries(peers.map(p => [p, { ...seedForeign }])) };
  writeJson(memFile, mem);
} else {
  const raw = fs.existsSync(memFile) ? readJson(memFile) : null;
  if (raw && raw.peers) mem = raw;
  else if (raw) {
    // pre-fleet shape: one counterpart's state at the top level — key it under that peer.
    // counterpartsOf(agent)[0] is the legacy single counterpart (roster order: gamma last).
    const legacyPeer = counterpartsOf(agent)[0];
    mem = { peers: { [legacyPeer]: raw } };
    L(`memory migrated: single-counterpart shape → keyed by peer (${legacyPeer}) — cellsSeen preserved verbatim`);
    L('');
  } else mem = { peers: {} };
}
const foreignSummary = () => Object.fromEntries(Object.entries(mem.peers).map(([p, v]) =>
  [p, { gitTip: v.gitTip, chainTip: v.chainTip, cells: v.cells, whyRate: v.whyRate }]));
writeJson(path.join(cloneDir, 'state.json'), {
  agent, branch, chainTip: e1.hash, ...m1,
  lessons: fs.readdirSync(path.join(cloneDir, 'lessons')).filter(f => f.endsWith('.md')).length,
  foreign: foreignSummary(), updatedAt: nowIso(),
});

// ---- 2. (b) commit + push ----
git(cloneDir, 'add', '-A', '.');
const msg1 = d.kind === 'seed'
  ? `${agent}: seed quilt — ${d.lineageLabel} (${d.cells.length} cells + lesson 001)`
  : `${agent}: lesson ${les.n} — ${les.title} (chain ${e1.hash.slice(0, 7)})`;
git(cloneDir, 'commit', '-q', '-m', msg1);
const push1 = REDACT(git(cloneDir, 'push', 'origin', branch));
const myTip1 = git(cloneDir, 'rev-parse', 'HEAD').trim();
L('');
L(`commit: ${msg1}`);
L(`quilt tip (git): ${myTip1}`);
L(`push → ${branch}:`);
L(push1.trim());
L('');

// ---- exchange-only: fetch EVERY foreign quilt, diff against per-peer memory, taught-by ----
if (d.kind === 'exchange') {
  // (c) fetch each peer's branch — the ONLY reading channel, once per peer
  const seen = {}; // peer → { fetchOut, fTip, fCells, fSeen, fChainTip, newIds, changedIds, got }
  for (const p of peers) {
    const pBranch = `float/${p}`;
    const fetchOut = REDACT(git(cloneDir, 'fetch', 'origin', pBranch));
    const fTip = git(cloneDir, 'rev-parse', `origin/${pBranch}`).trim();
    L(`(c) fetch ${pBranch}:`);
    L(fetchOut.trim());
    L(`foreign git tip (${p}): ${fTip}`);
    L('');

    // (d) diff the foreign quilt against THIS peer's memory
    const fNames = git(cloneDir, 'ls-tree', '--name-only', `${fTip}:cells`).trim().split('\n').filter(Boolean).sort();
    const fCells = fNames.map(n => JSON.parse(git(cloneDir, 'show', `${fTip}:cells/${n}`)));
    const fSeen = {};
    for (const c of fCells) fSeen[c.id] = sha256(JSON.stringify(c));
    const pmem = mem.peers[p] ?? { cellsSeen: {}, gitTip: null };
    const newIds = Object.keys(fSeen).filter(id => !(id in pmem.cellsSeen)).sort();
    const changedIds = Object.keys(fSeen).filter(id => (id in pmem.cellsSeen) && pmem.cellsSeen[id] !== fSeen[id]).sort();
    L(`(d) memory diff (${p}) — memory pinned at git tip ${pmem.gitTip ?? '∅'} (${Object.keys(pmem.cellsSeen).length} cells seen):`);
    L(`  new:     [${newIds.join(', ') || 'none'}]`);
    L(`  changed: [${changedIds.join(', ') || 'none'}]`);

    const fChainText = git(cloneDir, 'show', `${fTip}:receipts/chain.jsonl`);
    const fChain = fChainText.split('\n').map(s => s.trim()).filter(Boolean).map(l => JSON.parse(l));
    const fChainTip = chainTipOf(fChain);
    const fCellMap = Object.fromEntries(fCells.map(c => [c.id, c]));
    for (const id of [...newIds, ...changedIds]) {
      const c = fCellMap[id];
      L(`  ${id}: "${(c.claim ?? '').slice(0, 110)}${(c.claim ?? '').length > 110 ? '…' : ''}"`);
    }
    L(`foreign chain tip (${p}): ${fChainTip} (${fChain.length} entries)`);
    L('');
    seen[p] = { fetchOut, fTip, fCells, fSeen, fChainTip, newIds, changedIds, got: [...new Set([...newIds, ...changedIds])].sort() };
  }

  // fail-closed: the authored reaction must match what the fetch actually saw — the union
  // across peers (a fleet tick reads a MAP of quilts; the expectation covers the union)
  const exp = d.taughtBy.expect.newCellIds.slice().sort();
  const got = [...new Set(peers.flatMap(p => seen[p].got))].sort();
  for (const id of exp) {
    if (!got.includes(id)) fail(`EXPECT-FAIL: directive expected foreign cell ${id} to be new/changed; fetch says otherwise — authored cognition is stale, aborting fail-closed`);
  }
  L(`expect ✓: authored reaction matches the fetch (new/changed union = ${got.join(', ') || '∅ — steady-state read'})`);
  L('');

  // (e) taught-by cell — binds to ONE peer (tb.peer; legacy default = the sole counterpart,
  // which fails closed here the moment the roster outgrows two: ambiguity never guesses)
  const tb = d.taughtBy;
  const tbPeer = tb.peer ?? (peers.length === 1 ? peers[0] : null);
  if (!tbPeer || !seen[tbPeer]) fail(`E_TAUGHTBY_PEER_REQUIRED: taught-by must name the branch it cites (peer ∈ [${peers.join(', ')}])`);
  const ps = seen[tbPeer];
  const diffTextOf = (p) => seen[p].got.map(id => `- ${id} (${seen[p].newIds.includes(id) ? 'new' : 'changed'})`).join('\n');
  const diffText = diffTextOf(tbPeer);
  // Materialize EVERY placeholder in EVERY taught-by string (attempt-1 lesson). Fleet
  // generalization: the placeholder namespace is PER-BRANCH — {{<PEER>_GIT_TIP}} etc. cite
  // that peer's real tip; the legacy {{FOREIGN_*}} aliases bind to the taught-by's own peer.
  const subst = (s0) => {
    let out = String(s0);
    for (const p of peers) {
      const up = p.toUpperCase();
      out = out
        .replaceAll(`{{${up}_GIT_TIP}}`, seen[p].fTip)
        .replaceAll(`{{${up}_GIT_TIP_SHORT}}`, seen[p].fTip.slice(0, 7))
        .replaceAll(`{{${up}_CHAIN_TIP}}`, seen[p].fChainTip)
        .replaceAll(`{{${up}_NEW_CELLS}}`, diffTextOf(p))
        .replaceAll(`{{${up}_DIFF}}`, diffTextOf(p));
    }
    const up = tbPeer.toUpperCase();
    return out
      .replaceAll('{{FOREIGN_GIT_TIP}}', ps.fTip)
      .replaceAll('{{FOREIGN_GIT_TIP_SHORT}}', ps.fTip.slice(0, 7))
      .replaceAll('{{FOREIGN_CHAIN_TIP}}', ps.fChainTip)
      .replaceAll('{{FOREIGN_NEW_CELLS}}', diffText)
      .replaceAll('{{FOREIGN_DIFF}}', diffText);
  };
  const body = subst(tb.bodyMd);
  const tbRel = `cells/${tb.cellId}.json`;
  const tbCell = {
    id: tb.cellId, kind: 'taught-by', target: subst(tb.target), verdict: tb.verdict,
    claim: subst(tb.claim), evidence: subst(tb.evidence), why: subst(tb.why),
    pins: (tb.pins ?? []).map(p => ({ ...p, name: subst(p.name ?? ''), how: subst(p.how ?? '') })),
    cites: { foreignBranch: `float/${tbPeer}`, gitTip: ps.fTip, chainTip: ps.fChainTip, cells: ps.got },
  };
  const e2 = chainAppend(cloneDir, agent, { kind: 'taught-by', ref: tbRel, ts: nowIso() });
  tbCell.receipt = { seq: e2.seq, prev: e2.prev, hash: e2.hash };
  writeJson(path.join(cloneDir, tbRel), tbCell);
  L(`(e) taught-by cell: ${tbRel} — verdict ${tb.verdict.toUpperCase()} on ${tb.target} (peer ${tbPeer})`);
  L(`    cites: float/${tbPeer}@${ps.fTip} (chain ${ps.fChainTip.slice(0, 7)})`);
  L(`receipt-chain +1: seq=${e2.seq} kind=taught-by ref=${tbRel}`);
  L(`  prev-receipt-tip: ${e2.prev}`);
  L(`  receipt-tip:      ${e2.hash}`);
  L('');

  // memory + state refresh per peer, then (f) commit + push
  for (const p of peers) {
    const sp = seen[p];
    const fWhy = sp.fCells.filter(c => typeof c.why === 'string' && c.why.trim()).length;
    mem.peers[p] = {
      gitTip: sp.fTip, chainTip: sp.fChainTip, cellsSeen: sp.fSeen,
      cells: sp.fCells.length,
      whyRate: sp.fCells.length ? Math.round((fWhy / sp.fCells.length) * 10000) / 10000 : 0,
    };
  }
  writeJson(path.join(cloneDir, 'memory', 'foreign.json'), mem);
  const m2 = metricsOfDir(cloneDir);
  writeJson(path.join(cloneDir, 'state.json'), {
    agent, branch, chainTip: e2.hash, ...m2,
    lessons: fs.readdirSync(path.join(cloneDir, 'lessons')).filter(f => f.endsWith('.md')).length,
    foreign: foreignSummary(),
    updatedAt: nowIso(),
  });

  git(cloneDir, 'add', '-A', '.');
  const msg2 = `${agent}: taught-by ${tb.cellId} — ${tb.verdict} ${tb.target} (cites ${tbPeer}@${ps.fTip.slice(0, 7)})`;
  git(cloneDir, 'commit', '-q', '-m', msg2);
  const push2 = REDACT(git(cloneDir, 'push', 'origin', branch));
  const myTip2 = git(cloneDir, 'rev-parse', 'HEAD').trim();
  L(`(f) commit: ${msg2}`);
  L(`quilt tip (git): ${myTip2}`);
  L(`push → ${branch}:`);
  L(push2.trim());
}

fs.mkdirSync(path.dirname(logPath), { recursive: true });
fs.writeFileSync(logPath, log.join('\n') + '\n');
console.log(`[agent ${agent}] tick ${d.tickLabel} complete → ${path.basename(logPath)}`);
