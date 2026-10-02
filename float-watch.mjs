#!/usr/bin/env node
// float-watch.mjs — the ML leg + the organ law of the float. stdlib only.
//
// tick     — after every agent tick: FETCH every roster branch (git is the only observation
//            surface), verify EVERY published receipt chain from genesis (fail-closed: a
//            broken chain halts the float), cross-check lesson citations, taught-by citations
//            (the cited foreign git tip must be an ancestor of the branch it NAMES; cited
//            foreign chain tip must exist in that branch's chain — no laundering),
//            cross-check state.json dials, then compute WHY-RATE + pin regressions for every
//            quilt and SELECT the next exchange prompt from the fixed menu by simple scoring
//            (the ML selection is receipted, never silent).
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
  chainVerifyEntries, chainTipOf, metrics, MENU, selectPrompt, AGENTS, counterpartsOf,
} from './float-lib.mjs';

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
// Fleet law (session 3): a taught-by cites ONE branch — cites.foreignBranch names it, and
// the citation is verified against THAT branch (ancestor + chain membership), never against
// a hard-coded counterpart. Citing an unpublished branch, an unknown branch, or SELF is
// refused — no laundering, no self-citation.
function crossChecks(cwd, agent, st, tips, published, chainHashes) {
  const errs = [];
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
    const cited = String(cites.foreignBranch ?? '').replace(/^float\//, '');
    if (!AGENTS.includes(cited)) { errs.push(`TAUGHTBY_CITE_BRANCH_UNKNOWN ${c.id}: ${cites.foreignBranch}`); continue; }
    if (cited === agent) { errs.push(`TAUGHTBY_CITE_SELF ${c.id}: cites ${cites.foreignBranch}`); continue; }
    if (!published[cited]) { errs.push(`TAUGHTBY_CITE_UNPUBLISHED ${c.id}: ${cites.foreignBranch} not published`); continue; }
    if (!gitOk(cwd, 'merge-base', '--is-ancestor', cites.gitTip, tips[cited]))
      errs.push(`TAUGHTBY_CITE_NOT_ANCESTOR ${c.id}: ${cites.gitTip} not on ${cited}'s branch`);
    if (!chainHashes[cited].has(cites.chainTip))
      errs.push(`TAUGHTBY_CITE_CHAIN_TIP_UNKNOWN ${c.id}: ${cites.chainTip} not in ${cited}'s chain`);
    // (iii) the taught-by cell's own receipt object must be a real chain entry
    const e = st.chain.find(x => x.ref === `cells/${c.id}.json`);
    if (!e) errs.push(`TAUGHTBY_NO_CHAIN_ENTRY ${c.id}`);
    else if (!c.receipt || c.receipt.hash !== e.hash) errs.push(`TAUGHTBY_RECEIPT_MISMATCH ${c.id}`);
    // (iv) no half-materialized citations: an unsubstituted placeholder ({{FOREIGN_*}} or a
    // per-peer {{ALPHA_*}}/{{BETA_*}}/{{GAMMA_*}} namespace) in a published cell is a
    // template that never met the fetch it claims to describe
    if (/\{\{[A-Z][A-Z0-9]*_/.test(JSON.stringify(c)))
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

  // THE ORGAN LAW: every published chain re-derived from genesis, every tick, fail-closed.
  const errs = [];
  for (const a of AGENTS) {
    if (published[a] && !st[a].v.ok) errs.push(`${a}: ${st[a].v.error} @seq ${st[a].v.at} (${st[a].v.detail})`);
  }
  const chainHashes = {};
  for (const a of AGENTS) chainHashes[a] = published[a] ? new Set(st[a].chain.map(e => e.hash)) : new Set();
  if (!errs.length) {
    for (const a of AGENTS) {
      if (!published[a]) continue;
      errs.push(...crossChecks(repoDir, a, st[a], tips, published, chainHashes));
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
  // Fleet generalization: the counterpart is a MAP of peers. Per-peer why-deltas and new
  // cells are tracked separately; the menu inputs are the MAX delta (some peer rising —
  // M1's trigger) and the SUM of new cells (total unread surface). Two-agent behavior is
  // the degenerate case (one peer → max = sum = the old numbers).
  const trajFile = path.join(runsDir, 'watch-trajectory.json');
  const traj = fs.existsSync(trajFile) ? readJson(trajFile) : {};
  traj[agent] = traj[agent] ?? { foreign: null };
  // legacy trajectory (sessions 1–2): foreign was ONE counterpart's {rate, cells} — key it
  // under that peer (roster order makes counterpartsOf(agent)[0] the legacy counterpart).
  if (traj[agent].foreign && !traj[agent].foreign.peers) {
    const legacyPeer = counterpartsOf(agent)[0];
    traj[agent] = { foreign: { peers: { [legacyPeer]: traj[agent].foreign } } };
  }
  const fPeers = {};
  const detail = {};
  let maxDelta = 0, sumNew = 0;
  for (const p of counterpartsOf(agent)) {
    fPeers[p] = published[p] ? { rate: st[p].m.whyRate, cells: st[p].m.cells } : { rate: null, cells: 0 };
    const prev = traj[agent].foreign?.peers?.[p] ?? null;
    const delta = (prev && prev.rate != null && fPeers[p].rate != null) ? RATE(fPeers[p].rate - prev.rate) : 0;
    const fNew = prev ? Math.max(0, fPeers[p].cells - prev.cells) : 0;
    detail[p] = { whyDelta: delta, newCells: fNew };
    if (delta > maxDelta) maxDelta = delta;
    sumNew += fNew;
  }
  const sel = selectPrompt({
    foreignWhyDelta: maxDelta, foreignNewCells: sumNew,
    ownRegressions: m.regressions, ownWhyRate: m.whyRate,
  });
  const prow = {
    n: readJsonl(path.join(runsDir, 'prompts.jsonl')).length + 1,
    agent, tick: Number(tickN), phase,
    foreignWhyDelta: maxDelta, foreignNewCells: sumNew, foreignPeers: detail,
    ownWhyRate: m.whyRate, ownRegressions: m.regressions,
    scores: sel.scores, chosen: sel.chosen, prompt: MENU[sel.chosen],
  };
  appendJsonl(path.join(runsDir, 'prompts.jsonl'), prow);
  traj[agent] = { foreign: { peers: fPeers } };
  writeJson(trajFile, traj);

  const chainDesc = AGENTS.map(a =>
    `${a} ${published[a] ? st[a].v.count + ' @' + st[a].v.tip.slice(0, 7) : 'unpublished'}`).join(', ');
  console.log(`[float-watch] tick ${tickN} (${agent} ${phase}): ${AGENTS.length} chains ok from genesis `+
    `(${chainDesc}) · ` +
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
