#!/usr/bin/env node
// float-watch.mjs — the ML leg + the organ law of the float. stdlib only.
//
// tick     — after every agent tick: FETCH both branches (git is the only observation
//            surface), verify BOTH receipt chains from genesis (fail-closed: a broken
//            chain halts the float), cross-check lesson citations, taught-by citations
//            (cited foreign git tip must be an ancestor of the foreign branch; cited
//            foreign chain tip must exist in the foreign chain — no laundering foreign
//            claims), cross-check state.json dials, then compute WHY-RATE + pin
//            regressions for both quilts and SELECT the next exchange prompt from the
//            fixed menu by simple scoring (the ML selection is receipted, never silent).
// finalize — assemble the recorded tick table (runs/session-tips.json) from the live
//            per-tick rows (runs/session-ticks.jsonl).
// replay   — re-derive the ENTIRE tick table from genesis off the pushed branches alone
//            (every commit, every chain hash recomputed) → runs/replay-tips.json.
//            Byte-equal to the recorded table = the determinism check.
// verify-chain-file — walk one chain file from genesis (negative tests / fixtures).
//
// Usage:
//   node float-watch.mjs tick    --agent A --phase P --tick N --runs DIR   (cwd = a clone)
//   node float-watch.mjs finalize --runs DIR
//   node float-watch.mjs replay   --runs DIR --out runs/replay-tips.json   (cwd = a clone)
//   node float-watch.mjs verify-chain-file --file F --agent A
import fs from 'node:fs';
import path from 'node:path';
import {
  RATE, REDACT, git, gitOk, readJson, writeJson, readJsonl, appendJsonl,
  chainVerifyEntries, chainTipOf, metrics, MENU, selectPrompt,
} from './float-lib.mjs';

const AGENTS = ['alpha', 'beta'];
const argv = process.argv.slice(2);
const arg = (name, dflt) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : dflt;
};
const cmd = argv[0];
const halt = (msg) => {
  console.error(`FLOAT-HALT: ${msg}`);
  process.exit(1);
};

// Read one agent's whole published state at a git tip, through git only.
function stateAtTip(cwd, tip, agent) {
  const chainTxt = git(cwd, 'show', `${tip}:receipts/chain.jsonl`);
  const chain = chainTxt.split('\n').map(s => s.trim()).filter(Boolean).map(l => JSON.parse(l));
  const v = chainVerifyEntries(chain, agent);
  const names = git(cwd, 'ls-tree', '--name-only', `${tip}:cells`).trim().split('\n').filter(Boolean).sort();
  const cells = names.map(n => JSON.parse(git(cwd, 'show', `${tip}:cells/${n}`)));
  const m = metrics(cells);
  let state = null;
  try { state = JSON.parse(git(cwd, 'show', `${tip}:state.json`)); } catch { /* pre-state commits */ }
  return { tip, chain, v, cells, m, state };
}

// The organ-law cross-checks: nothing a quilt cites may exist only in its imagination.
function crossChecks(cwd, agent, st, otherTip, otherChainHashes) {
  const errs = [];
  const other = agent === 'alpha' ? 'beta' : 'alpha';
  // (i) lesson files carry the receipt chain in-file (prev-tip → tip must match the chain)
  for (const e of st.chain) {
    if (!e.ref.startsWith('lessons/')) continue;
    let md = '';
    try { md = git(cwd, 'show', `${st.tip}:${e.ref}`); }
    catch { errs.push(`LESSON_FILE_MISSING ${e.ref} @${st.tip.slice(0, 7)}`); continue; }
    if (!md.includes(`prev-receipt-tip: ${e.prev}`)) errs.push(`LESSON_CITE_PREV ${e.ref}: expected ${e.prev}`);
    if (!md.includes(`receipt-tip: ${e.hash}`)) errs.push(`LESSON_CITE_TIP ${e.ref}: expected ${e.hash}`);
  }
  // (ii) taught-by cells: foreign citations must be real (no laundering foreign claims)
  for (const c of st.cells) {
    if (c.kind !== 'taught-by') continue;
    const cites = c.cites ?? {};
    if (!cites.gitTip || !cites.chainTip) { errs.push(`TAUGHTBY_UNCITED ${c.id}`); continue; }
    if (!gitOk(cwd, 'merge-base', '--is-ancestor', cites.gitTip, otherTip))
      errs.push(`TAUGHTBY_CITE_NOT_ANCESTOR ${c.id}: ${cites.gitTip} not on ${other}'s branch`);
    if (!otherChainHashes.has(cites.chainTip))
      errs.push(`TAUGHTBY_CITE_CHAIN_TIP_UNKNOWN ${c.id}: ${cites.chainTip} not in ${other}'s chain`);
    // (iii) the taught-by cell's own receipt object must be a real chain entry
    const e = st.chain.find(x => x.ref === `cells/${c.id}.json`);
    if (!e) errs.push(`TAUGHTBY_NO_CHAIN_ENTRY ${c.id}`);
    else if (!c.receipt || c.receipt.hash !== e.hash) errs.push(`TAUGHTBY_RECEIPT_MISMATCH ${c.id}`);
    // (iv) no half-materialized citations: an unsubstituted {{FOREIGN_*}} placeholder in a
    // published cell is a template that never met the fetch it claims to describe
    if (JSON.stringify(c).includes('{{FOREIGN_'))
      errs.push(`TAUGHTBY_TEMPLATE_LEAK ${c.id}: unpublished placeholder in published cell`);
  }
  // (v) state.json dials must not lie
  if (st.state) {
    const s = st.state;
    if (s.chainTip !== st.v.tip) errs.push(`STATE_CHAIN_TIP_LIE: ${s.chainTip} != ${st.v.tip}`);
    for (const k of ['cells', 'whys', 'whyRate', 'regressions']) {
      if (s[k] !== st.m[k]) errs.push(`STATE_${k.toUpperCase()}_LIE: ${s[k]} != ${st.m[k]}`);
    }
  }
  return errs;
}

if (cmd === 'tick') {
  const runsDir = arg('--runs', 'runs');
  const agent = arg('--agent');
  const phase = arg('--phase');
  const tickN = arg('--tick');
  const repoDir = process.cwd();
  if (!agent || !phase || !tickN) halt('tick needs --agent --phase --tick');

  // A branch that does not exist yet is not a broken chain — the medium starts empty.
  // (The organ law applies to what has been published; unpublished = unverified = untrusted,
  // and the prompt selection treats the counterpart as absent.)
  const tips = {};
  const published = {};
  for (const a of AGENTS) {
    try {
      git(repoDir, 'fetch', 'origin', `float/${a}`);
      tips[a] = git(repoDir, 'rev-parse', `origin/float/${a}`).trim();
      published[a] = true;
    } catch {
      published[a] = false;
    }
  }
  const st = {};
  for (const a of AGENTS) if (published[a]) st[a] = stateAtTip(repoDir, tips[a], a);

  // THE ORGAN LAW: both published chains re-derived from genesis, every tick, fail-closed.
  const errs = [];
  for (const a of AGENTS) {
    if (published[a] && !st[a].v.ok) errs.push(`${a}: ${st[a].v.error} @seq ${st[a].v.at} (${st[a].v.detail})`);
  }
  if (!errs.length) {
    for (const a of AGENTS) {
      if (!published[a]) continue;
      const o = a === 'alpha' ? 'beta' : 'alpha';
      const otherHashes = published[o] ? new Set(st[o].chain.map(e => e.hash)) : new Set();
      errs.push(...crossChecks(repoDir, a, st[a], published[o] ? tips[o] : tips[a], otherHashes, published[o]));
    }
  }
  if (errs.length) {
    writeJson(path.join(runsDir, 'HALT.json'), {
      at: new Date().toISOString(), tick: tickN, agent, phase, errors: errs,
      tips, chainTips: Object.fromEntries(AGENTS.map(a => [a, published[a] ? st[a].v.tip : null])),
    });
    halt(errs.join('; '));
  }

  const m = st[agent].m;
  const row = {
    n: readJsonl(path.join(runsDir, 'session-ticks.jsonl')).length + 1,
    tick: Number(tickN), agent, phase, commit: tips[agent],
    chainTip: st[agent].v.tip,
    cells: m.cells, whys: m.whys, whyRate: m.whyRate, regressions: m.regressions,
    verdict: 'ok',
  };
  appendJsonl(path.join(runsDir, 'session-ticks.jsonl'), row);

  // ---- the ML selection: score the fixed menu for THIS agent's next exchange ----
  const other = agent === 'alpha' ? 'beta' : 'alpha';
  const trajFile = path.join(runsDir, 'watch-trajectory.json');
  const traj = fs.existsSync(trajFile) ? readJson(trajFile) : {};
  traj[agent] = traj[agent] ?? { foreign: null };
  const fNow = published[other]
    ? { rate: st[other].m.whyRate, cells: st[other].m.cells }
    : { rate: null, cells: 0 };
  const prevF = traj[agent].foreign;
  const delta = (prevF && prevF.rate != null && fNow.rate != null) ? RATE(fNow.rate - prevF.rate) : 0;
  const fNew = (prevF && prevF.rate != null) ? Math.max(0, fNow.cells - prevF.cells) : 0;
  const sel = selectPrompt({
    foreignWhyDelta: delta, foreignNewCells: fNew,
    ownRegressions: m.regressions, ownWhyRate: m.whyRate,
  });
  const prow = {
    n: readJsonl(path.join(runsDir, 'prompts.jsonl')).length + 1,
    agent, tick: Number(tickN), phase,
    foreignWhyDelta: delta, foreignNewCells: fNew,
    ownWhyRate: m.whyRate, ownRegressions: m.regressions,
    scores: sel.scores, chosen: sel.chosen, prompt: MENU[sel.chosen],
  };
  appendJsonl(path.join(runsDir, 'prompts.jsonl'), prow);
  traj[agent].foreign = fNow;
  writeJson(trajFile, traj);

  const otherDesc = published[other]
    ? `${other} ${st[other].v.count} entries @${st[other].v.tip.slice(0, 7)}`
    : `${other} UNPUBLISHED (medium starts empty)`;
  console.log(`[float-watch] tick ${tickN} (${agent} ${phase}): chains ok from genesis ` +
    `(alpha ${published.alpha ? st.alpha.v.count + ' @' + st.alpha.v.tip.slice(0, 7) : 'unpublished'}, ` +
    `beta ${published.beta ? st.beta.v.count + ' @' + st.beta.v.tip.slice(0, 7) : 'unpublished'}) · ` +
    `${agent} quilt: ${m.cells} cells, why-rate ${m.whyRate}, regressions ${m.regressions} · ` +
    `menu: M1=${sel.scores.M1} M2=${sel.scores.M2} M3=${sel.scores.M3} → ${sel.chosen}`);
  process.exit(0);
}

if (cmd === 'finalize') {
  const runsDir = arg('--runs', 'runs');
  const rows = readJsonl(path.join(runsDir, 'session-ticks.jsonl'));
  const out = {};
  for (const a of AGENTS) {
    const mine = rows.filter(r => r.agent === a);
    const last = mine[mine.length - 1];
    out[a] = {
      quiltTip: last.commit, chainTip: last.chainTip,
      ticks: mine.map(r => ({
        commit: r.commit, chainTip: r.chainTip,
        cells: r.cells, whys: r.whys, whyRate: r.whyRate, regressions: r.regressions,
      })),
    };
  }
  const file = path.join(runsDir, 'session-tips.json');
  fs.writeFileSync(file, JSON.stringify(out) + '\n');
  console.log(`[float-watch] recorded tick table → ${file}`);
  process.exit(0);
}

if (cmd === 'replay') {
  const runsDir = arg('--runs', 'runs');
  const repoDir = process.cwd();
  const out = {};
  for (const a of AGENTS) {
    const revs = git(repoDir, 'rev-list', '--reverse', `origin/float/${a}`).trim().split('\n').filter(Boolean);
    const ticks = [];
    let finalV = null;
    let lastQuiltRev = null;
    for (const rev of revs) {
      // pre-quilt commits (branch bootstrap, e.g. the initial README commit) carry no
      // receipt chain — skip the LEADING prefix of them; a chain-less rev AFTER the
      // quilt started is a structure break, not a prefix — refuse it.
      if (!gitOk(repoDir, 'cat-file', '-e', `${rev}:receipts/chain.jsonl`)) {
        if (lastQuiltRev !== null) halt(`${a} @${rev.slice(0, 7)}: receipts/chain.jsonl missing after quilt started — replay refuses`);
        continue;
      }
      lastQuiltRev = rev;
      const st = stateAtTip(repoDir, rev, a);
      if (!st.v.ok) halt(`${a} @${rev.slice(0, 7)}: ${st.v.error} @seq ${st.v.at} (${st.v.detail}) — replay refuses`);
      // checkpoint commits = the same ones the live watcher rowed: the top chain entry
      // is a 'seed' or 'taught-by' action (structural, not positional — no hard-coded shape)
      const top = st.chain[st.chain.length - 1];
      if (top.kind === 'seed' || top.kind === 'taught-by') {
        ticks.push({
          commit: rev, chainTip: st.v.tip,
          cells: st.m.cells, whys: st.m.whys, whyRate: st.m.whyRate, regressions: st.m.regressions,
        });
      }
      finalV = st.v;
    }
    if (!lastQuiltRev) halt(`${a}: no quilt commits (no receipts/chain.jsonl) on origin/float/${a} — replay refuses`);
    out[a] = { quiltTip: lastQuiltRev, chainTip: finalV.tip, ticks };
  }
  const file = arg('--out', path.join(runsDir, 'replay-tips.json'));
  fs.writeFileSync(file, JSON.stringify(out) + '\n');
  console.log(`[float-watch] re-derived tick table from genesis → ${file}`);
  process.exit(0);
}

if (cmd === 'verify-chain-file') {
  const file = arg('--file');
  const agent = arg('--agent');
  const { readChain } = await import('./float-lib.mjs');
  const entries = readChain(file);
  const v = chainVerifyEntries(entries, agent);
  if (!v.ok) halt(`${v.error} @seq ${v.at} (${v.detail})`);
  console.log(`chain ok: ${v.count} entries, tip ${v.tip}`);
  process.exit(0);
}

console.error('usage: float-watch.mjs <tick|finalize|replay|verify-chain-file> ...');
process.exit(64);
