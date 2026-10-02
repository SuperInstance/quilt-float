# quilt-float

Two git-agents float and teach each other — quilts as branches, lessons as commits, receipt-chain
tips as the synchrony primitive (wave-70 living slice of `docs/two-git-agents-design.md` @ 5e00a5b).

## What the float is

- **The medium is git.** Each agent owns a branch (`float/alpha`, `float/beta`). Its quilt lives
  there: `cells/*.json` ({id, claim, evidence, why, pins[]}), `lessons/NNN-*.md` (receipt chain
  in-file), `receipts/chain.jsonl` (append-only sha256 chain), `state.json` (published dials),
  `memory/foreign.json` (its memory of the counterpart). An agent reads its counterpart ONLY via
  `git fetch` — never the filesystem, never a shared working tree.
- **The receipt chain is the shared clock.** One append-only entry per committed action;
  `hash = sha256([agent, prev, seq, ts, kind, ref].join('|'))`, genesis `prev = 'GENESIS'`.
  The chain tip is what a tick cites and what the watcher re-derives — synchrony without a
  shared server, just two branches and a hash law.
- **Why-rate is the dial.** Fraction of cells carrying a `why`. A pin left `claimed`
  (asserted without evidence) is a regression; `provisional` asserts WITH evidence and a stated
  generalization condition; `refuted` is a resolved discovery, not a regression.

## The loop (one tick = one commit, driven by `session-run.sh`)

Seed form: materialize cells + lesson 001, append chain entry, commit, push.
Exchange form (agent.mjs a–f): (a) append own lesson → commit+push → (c) `git fetch` the
counterpart's branch → (d) diff the foreign quilt against `memory/foreign.json` → (e) write a
**taught-by cell** only if the foreign lesson actually changes a belief, citing the foreign git
tip + chain tip → (f) commit+push. Every committed action gets one chain entry.

After every tick the watcher (`float-watch.mjs`, stdlib only) runs fail-closed:

1. FETCH both branches (git is the only observation surface);
2. re-derive BOTH receipt chains from genesis — a broken chain halts the float;
3. cross-checks — lesson files must cite their own chain entry (prev-tip → tip in-file);
   taught-by cells' foreign citations must be real (foreign git tip an ancestor of the foreign
   branch; foreign chain tip present in the foreign chain — no laundering); state.json dials
   must not lie;
4. compute why-rate + regressions for both quilts and select the next exchange prompt from the
   fixed menu (M1 visit-counterpart / M2 resolve-own-pins / M3 extend-into-lesson) by
   deterministic scoring, receipted to `runs/prompts.jsonl` — the ML leg is never silent;
5. `finalize` records the tick table; `replay` re-derives the entire table from genesis off the
   pushed branches alone — **byte-equal to the recorded table is the determinism check**.

## Session 1 — ran and died; sealed 2026-10-02 (see runs/float-session-1.md)

- 2 sealed ticks: alpha seed `a05c09b0` and beta seed `0e165025`, both chains ok from genesis;
  why-rate 0.6 / 0.6; watcher chose M2 twice (both quilts carried 1 `claimed` pin).
- Tick 3 (alpha exchange 1) died mid-tick: `agent.mjs:108` — the exchange directive's `lesson`
  object has no `bodyMd` field (only `taughtBy.bodyMd` exists) → `les.bodyMd.trim()` TypeError.
  Residue: a dangling-but-hash-valid chain entry seq 2, one new cell, one patched cell — all
  uncommitted; preserved at `snapshots/float-alpha-partial-tick3/`.
- Chain re-derivation at seal: `replay` == recorded table, **byte-equal for both agents**.
- Tick count: alpha 1 sealed + 1 partial, beta 1 sealed — **no completed exchange ever occurred**;
  the first taught-by cell (alpha-T1, verdict extend on beta-001) is authored but unexchanged.
- Resume: reset alpha's tree to its tip, add `lesson.bodyMd` to the exchange directives (or teach
  agent.mjs to synthesize the body), re-run ticks 3–8 per session-run.sh, then `finalize`.

## How a third agent joins

Clone this repo, create a branch `float/<name>`, seed a quilt with one directive tick (cells/ +
lessons/001 + receipts/chain.jsonl starting `prev: "GENESIS"` + state.json) and push it — then
add `<name>` to `AGENTS` in `float-watch.mjs:31` so the watcher fetches and verifies the new
branch every tick; after that the float's laws apply to it exactly as to alpha and beta.

## File map

- `agent.mjs` — one agent, one tick (`node agent.mjs tick <cloneDir> <directive> <runsDir>`)
- `float-watch.mjs` — tick/finalize/replay/verify-chain-file (the ML leg + the organ law)
- `float-lib.mjs` — the shared deterministic instrument (chain, cells, metrics, menu)
- `session-run.sh` — the 8-tick session driver
- `runs/` — directives (1 seed + 3 exchanges per agent), live rows (session-ticks.jsonl,
  prompts.jsonl, watch-trajectory.json, session-tips.json), the seal-time replay
  (replay-tips.json), per-tick logs, the transcript + seal (`float-session-1.md`)
- `snapshots/` — both quilts byte-exact as of the last fetched tips
  (`float-alpha/` @ a05c09b0, `float-beta/` @ 0e165025) + the crashed tick's residue
  (`float-alpha-partial-tick3/`)
