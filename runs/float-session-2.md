# float-session-2 — the first completed cross-agent taught-by cell + full transcript

Session: SuperInstance/quilt-float · two git-agents (alpha, beta) · the medium is git.
Resumed 2026-10-02 ~20:04Z by lane 71-a (principal asleep, autonomous) off the session-1
seal 339ba11 + the L21 instrument fix 970fa39 → e8d836d → 7fa70b2. Driver: session-resume.sh
(ticks 3–8 + finalize + byte-equal replay gate). 0 model calls — the exchange is rules-only.

Design lineage: docs/two-git-agents-design.md @ 5e00a5b · prior transcript runs/float-session-1.md.

## What the resume fixed (before any tick ran)

1. **lesson.bodyMd authored into all six exchange directives** (the tick-3 killer: the
   directives carried claim/evidence/why but no body; agent.mjs:108 dereferenced
   `les.bodyMd.trim()`). Real lesson bodies, engaging L17–L21, the live freeze, the twin
   notaries, and the wave-70 gradient.
2. **E_DIRECTIVE_SCHEMA — validate the exchange before the tick (L21).** `validateDirective`
   in float-lib.mjs; agent.mjs gates pre-tick, fail-closed, missing field NAMED, zero
   mutation (no receipts/, no lessons/, no cells/, no log on refusal). Kind-aware shapes:
   a SEED lesson is the lineage essay (claims live in cells); an EXCHANGE lesson carries
   cellId/claim/evidence/why/bodyMd. A lesson containing `{{FOREIGN_*}}` refuses: a lesson
   is authored blind — publish-before-read is a schema law.
3. **Unit test** test/directive-schema.test.mjs — 24/24 green: missing lesson.bodyMd →
   refuses with `missing field: lesson.bodyMd`; missing taughtBy.bodyMd → refuses;
   whitespace bodyMd → refuses; blind-lesson placeholder → refuses; every shipped directive
   passes; end-to-end agent.mjs refusal verified pre-mutation.
4. **Materialization law (7fa70b2, taught by attempt-1 below):** every taught-by string is
   placeholder-substituted now (claim/evidence/why/pins name+how/bodyMd), and the watcher
   halts on `TAUGHTBY_TEMPLATE_LEAK` — a published cell may not carry an unpublished template.

## Attempt-1 (aborted pre-transcript — residue preserved, nothing deleted)

Ticks 3–8 ran green (watcher: chains ok from genesis every tick; finalize == replay
byte-equal) — but the six taught-by cells' **evidence/pins prose shipped with unsubstituted
`{{FOREIGN_GIT_TIP_SHORT}}` templates** (agent.mjs substituted bodyMd only): a cell whose
evidence says "fetched float/beta @{{…}}" is a half-materialized citation, not a real one.
Aborted before writing this transcript; attempt-1 tips **alpha debca161** (chain 7 @ b53436e4),
**beta 27640c8f** (chain 7 @ fb65c2b6) preserved byte-exact at
`snapshots/float-alpha-session2-attempt1/` and `snapshots/float-beta-session2-attempt1/`
(git archive), live rows at `runs/session2-attempt1/`. Both branch tips were then
force-with-lease reset to the seed tips (a05c09b0 / 0e165025) and attempt-2 re-ran the
session on the fixed instrument. Session-1 precedent followed: snapshot, reset, re-run, receipt.

## Recorded tick table (runs/session-ticks.jsonl, attempt 2 — rows 1–2 sealed in session 1)

| n | tick | agent | phase | quilt tip | chain tip | cells | whys | why-rate | regressions | verdict |
|---|------|-------|-------|-----------|-----------|-------|------|----------|-------------|---------|
| 1 | 1 | alpha | seed | a05c09b09293ad23075b990fd488cfc6483e44cd | a07536117bec41b82a925b264b010810a743fcd4dfa7f6d7df2edb80b8c68f43 | 5 | 3 | 0.6 | 1 | ok |
| 2 | 2 | beta | seed | 0e1650251e0904766e2c99be883398592c664c46 | 5a5f0aceed833dddd33e91d992cfd04f062d1091d6c43d2521e9dca8c9efa871 | 5 | 3 | 0.6 | 1 | ok |
| 3 | 3 | alpha | taught-by | e61ecb2b5e15777fc5a83983e75f37b0997c739b (lesson d5e4028) | 69bdf4d7242d3f0b2a72c26fdba97cdc2034e55bb7fc742307ce89c53abcb42b | 7 | 5 | 0.7143 | 0 | ok |
| 4 | 4 | beta | taught-by | 3af8f5807cec29edb6bc24cf959f0a583902a362 (lesson cb7fb99) | 840c080e86476c3e0bdb660b28d438ed1d17c7411e8a666036e6747c97833197 | 7 | 5 | 0.7143 | 0 | ok |
| 5 | 5 | alpha | taught-by | 5ee0c09ac9b0d3ad114e368d0311700dec46e6be (lesson bc43b96) | 9c60af438672673be3d936ec1299c9859cbcab9a5845ef350d5ebeacc4151208 | 9 | 8 | 0.8889 | 0 | ok |
| 6 | 6 | beta | taught-by | 55c57dd886ebffe5ebe102f8bcf4af303f917985 (lesson 7576767) | ef1bccc5beb7935c1ae927b67895d208f4fae7a6187c8a6fb9127fe631179b09 | 9 | 8 | 0.8889 | 0 | ok |
| 7 | 7 | alpha | taught-by | 27063f679c9642e5dec8470fc523966f85102c31 (lesson ad0b243) | 7b95d7816a6a39d340bd78bffb8bbbd03065f7a030b3672ce4e5194d598dd4b9 | 11 | 11 | 1 | 0 | ok |
| 8 | 8 | beta | taught-by | 7273610009c97cbeb15e441198eedce29c5f8df4 (lesson ea4c488) | 174e5b01560a5a8c8b07e04e58258a62de61e07e961b4d4da1f1a57b4122983f | 11 | 11 | 1 | 0 | ok |

Final: alpha quilt 27063f67 (chain 7 @ 7b95d7816a6a39d340bd78bffb8bbbd03065f7a030b3672ce4e5194d598dd4b9),
beta quilt 72736100 (chain 7 @ 174e5b01560a5a8c8b07e04e58258a62de61e07e961b4d4da1f1a57b4122983f).
Why-rate: **0.6 → 1.0 both agents**; pin regressions: **1 → 0 both** (alpha-003's claimed
normalization pin resolved verified at tick 3; beta-003's environment pin resolved
refuted-as-claimed at tick 4). No HALT.json — the organ law never fired.

## Menu (the ML leg, receipted to runs/prompts.jsonl rows 3–8)

Every exchange directive's expectedPrompt matched the watcher's live selection (menu-obedience
✓ at all six): tick 3 M2 (own regressions) → tick 4 M2 → tick 5 M3 (why-ceiling not yet, all
else zero) → ticks 6–8 M1 (counterpart why-rate rising: deltas +0.1143 / +0.1746 / +0.1111,
2 new foreign cells each visit). Watcher chose; the directive obeyed; never the reverse.

## The per-tick transcript (one exchange = the full a–f loop)

- **tick 3 — alpha exchange 1 — THE FIRST COMPLETED CROSS-AGENT TAUGHT-BY CELL.**
  Schema gate: ok. Chain seq 2 (lesson 002-two-half-lives, prev a0753611 → tip 068fce84).
  alpha-003's normalization pin resolved claimed → verified (reading the 69-f delta's named
  tests). Pushed (d5e4028) BEFORE reading — publish-before-read held. Fetched float/beta
  @0e165025: memory diff new = [beta-001..005] (first look ever). Taught-by alpha-T1 (seq 3,
  tip 69bdf4d) — verdict **extend** on beta-001, citing float/beta@0e165025, chain 5a5f0ace.
- **tick 4 — beta exchange 1.** beta-003's environment pin resolved refuted-as-claimed (the
  LIVEFREEZE-1 records receipt verbatim-ness, not environment). Fetched float/alpha @e61ecb2:
  new = [alpha-001..005, alpha-L002, alpha-T1]. beta-T1 (seq 3, tip 840c080) — **agree** on
  alpha-003, extends into "the FUNCTION outlives the INCARNATION".
- **tick 5 — alpha exchange 2.** Lesson 003-witnesses-vs-executions (when reading a receipt
  suffices: exactly when it is fail-closed + named-error'd). alpha-004 earned its why ("new"
  is relative to memory). Fetched float/beta @3af8f58: new = [beta-L002, beta-T1]. alpha-T2
  (seq 5, tip 9c60af4) — **extend** on beta-003: the refutation leaves the freeze conditional.
- **tick 6 — beta exchange 2.** Lesson 003-environment-pinning (the freeze's missing half).
  beta-004 earned its why. Fetched float/alpha @5ee0c09: new = [alpha-L003, alpha-T2]. beta-T2
  (seq 5, tip ef1bccc) — **pin** (provisional) on alpha-T2's custody claim, method = the
  watcher's own re-derivation; registers **gap-convergence** (alpha named beta's hole from
  outside one round after beta refuted it from inside).
- **tick 7 — alpha exchange 3.** Lesson 004-evidence-branch-for-agents (L17 applied to the
  agents themselves; L21 closes the tick-3 wound). alpha-005 earned its why (publish-first
  produced two drafts, not one echo). Fetched float/beta @55c57dd: new = [beta-L003, beta-T2].
  alpha-T3 (seq 7, tip 7b95d78) — **pin** (provisional) on beta-T2's gap-convergence claim;
  the twin-notary shape now runs on CLAIMS.
- **tick 8 — beta exchange 3.** Lesson 004-why-less-cells-are-staged-work (L19's 68-a-r2
  sub-refinement applied to beta's own why-less cells; beta-005 earned its why — the citation
  tripwire never fired, and clean is a finding). Fetched float/alpha @27063f6: new =
  [alpha-L004, alpha-T3]. beta-T3 (seq 7, tip 174e5b0) — **agree** on alpha-T3, second witness
  on the gap-convergence provision.

## THE FIRST TAUGHT-BY CELL (cells/alpha-T1.json @ e61ecb2 — quoted in full)

```json
{
  "id": "alpha-T1",
  "kind": "taught-by",
  "target": "beta-001",
  "verdict": "extend",
  "claim": "beta-001 (remote-push-state-first) is my alpha-001 generalized from boot-time to death-time: one curl against the remote is the outside view of an evidence branch — the same push that saves the boot feeds the autopsy.",
  "evidence": "fetched float/beta @0e16502: beta-001's wave-68 triage sorted 3 dead lanes at one curl each; my lineage's 66-c died UNSORTED precisely because nothing was pushed — L19 works only where L17 held first",
  "why": "my belief changed: I held evidence-branch-first as a BOOT criterion; beta's triage data shows it is also the AUTOPSY criterion — the loop taught me my own law's second half",
  "pins": [{ "name": "beta-001 agrees with the wave-68 triage receipts", "status": "verified",
             "how": "beta-001's evidence field quotes the 68 receipts; consistent with L19 as I read it in the fleet lode" }],
  "cites": { "foreignBranch": "float/beta", "gitTip": "0e1650251e0904766e2c99be883398592c664c46",
             "chainTip": "5a5f0aceed833dddd33e91d992cfd04f062d1091d6c43d2521e9dca8c9efa871",
             "cells": ["beta-001", "beta-002", "beta-003", "beta-004", "beta-005"] },
  "receipt": { "seq": 3, "prev": "068fce8427b40b8dfd55c7b0d97553881dd28685f3df1576f68ae7bc26855cc9",
               "hash": "69bdf4d7242d3f0b2a72c26fdba97cdc2034e55bb7fc742307ce89c53abcb42b" }
}
```

Two-line form: **"beta-001 (remote-push-state-first) is my alpha-001 generalized from
boot-time to death-time: one curl against the remote is the outside view of an evidence
branch — the same push that saves the boot feeds the autopsy." / why: "my belief changed: I
held evidence-branch-first as a BOOT criterion; beta's triage data shows it is also the
AUTOPSY criterion — the loop taught me my own law's second half."**

The other five, one line each (full JSON on the branches):
- **beta-T1** (agree, alpha-003): "the FUNCTION outlives the INCARNATION — two notaries built 9h apart, one seal surviving three deaths; alpha-L002's two-half-lives explains why my beta-001 works."
- **alpha-T2** (extend, beta-003): "beta REFUTED its own claimed pin between my looks — the refutation leaves the freeze conditional; a freeze receipt without an environment hash cannot later distinguish staleness from tamper."
- **beta-T2** (pin, alpha-T2): "the re-derivation IS the verification — and alpha named my environment hole from the OUTSIDE one round after I refuted it from the INSIDE. Gap-convergence, registered."
- **alpha-T3** (pin, beta-T2): "Two witnesses, one claim — the twin-notary shape running on a defect instead of an organ. Provisional (n=1 session); it needs a second float session to graduate."
- **beta-T3** (agree, alpha-T3): "the pushed tip is simultaneously the evidence branch and the staged work; alpha's provisional gap-convergence pin now has a SECOND witness — the twin-notary shape applied to our own session."

## Verification receipts

- **Watcher after every tick:** both chains re-derived from GENESIS, ok, every tick
  (session-ticks.jsonl rows 1–8, verdict ok ×8); lesson citations in-file, taught-by foreign
  citations ancestors of the foreign branch, chain tips present in the foreign chain, no
  template leaks (TAUGHTBY_TEMPLATE_LEAK live), state.json dials truthful.
- **verify-chain-file** (independent walk): alpha 7 entries tip 7b95d781…; beta 7 entries tip
  174e5b01… — both ok.
- **THE DIVERGENCE CHECK (byte-equal from genesis after tick 8):** `finalize` (recorded from
  the live watcher rows) vs `replay` (the ENTIRE tick table re-derived from genesis off the
  pushed branches alone — every commit's chain recomputed, pre-quilt bootstrap revs skipped):
  `sha256(session-tips.json) == sha256(replay-tips.json) == e71791b1f0fea422af98dd204181e494d6375319046571b9c970e62e982c716c`,
  `cmp` clean — **recorded == replay, byte-equal**. The synchrony primitive held.
- **Unit test:** test/directive-schema.test.mjs — 24/24 green (re-run pre-session).

## Session 2 in one line

8 ticks sealed of 8 planned (2 in session 1 + 6 here); **6 taught-by cells exist** — the
quilts finally met; why-rate 0.6/0.6 → 1/1; regressions 1/1 → 0/0; two provisional pins
(custody-slowest, gap-convergence) planted with named generalization conditions for the next
session; both named PENDINGs (environment hash; arithmetic gradient leg) stayed honest.
