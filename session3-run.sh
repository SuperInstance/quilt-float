#!/usr/bin/env bash
# session3-run.sh — the third agent joins the float (wave-73, lane 73-g).
# Mirrors the L21 discipline: the unit test pack runs FIRST, then gamma's seed tick (the
# join recipe: branch float/gamma + one seed directive tick), then SIX exchange ticks
# (2 per agent × 3 agents — every exchange fetches BOTH foreign quilts; the taught-by
# binds to the one branch it cites), then finalize and the byte-equal replay gate over
# THREE chains re-derived from genesis.
set -euo pipefail
cd "$(dirname "$0")"

R="$PWD"
RUN="$R/runs"
W="node $R/float-watch.mjs"

echo "== float session 3: validate the pack before any tick (L21) =="
node "$R/test/directive-schema.test.mjs"

echo "== tick 9: gamma seeds its quilt (wave-71/72 lineage) — the third agent joins =="
node "$R/agent.mjs" tick "$R/../agents/gamma" "$RUN/directives/gamma-seed.json" "$RUN"
$W tick --agent gamma --phase seed --tick 9 --runs "$RUN"

echo "== tick 10: alpha exchange 1 (reads beta + gamma) =="
node "$R/agent.mjs" tick "$R/../agents/alpha" "$RUN/directives/alpha-round-4.json" "$RUN"
$W tick --agent alpha --phase taught-by --tick 10 --runs "$RUN"

echo "== tick 11: beta exchange 1 (reads alpha + gamma) =="
node "$R/agent.mjs" tick "$R/../agents/beta" "$RUN/directives/beta-round-4.json" "$RUN"
$W tick --agent beta --phase taught-by --tick 11 --runs "$RUN"

echo "== tick 12: gamma exchange 1 (reads alpha + beta) =="
node "$R/agent.mjs" tick "$R/../agents/gamma" "$RUN/directives/gamma-round-1.json" "$RUN"
$W tick --agent gamma --phase taught-by --tick 12 --runs "$RUN"

echo "== tick 13: alpha exchange 2 (graduates alpha-T3's pin by its own condition) =="
node "$R/agent.mjs" tick "$R/../agents/alpha" "$RUN/directives/alpha-round-5.json" "$RUN"
$W tick --agent alpha --phase taught-by --tick 13 --runs "$RUN"

echo "== tick 14: gamma exchange 2 (graduates gamma-005 by the loop's receipts) =="
node "$R/agent.mjs" tick "$R/../agents/gamma" "$RUN/directives/gamma-round-2.json" "$RUN"
$W tick --agent gamma --phase taught-by --tick 14 --runs "$RUN"

echo "== tick 15: beta exchange 2 (the graduation audit) =="
node "$R/agent.mjs" tick "$R/../agents/beta" "$RUN/directives/beta-round-5.json" "$RUN"
$W tick --agent beta --phase taught-by --tick 15 --runs "$RUN"

echo "== session complete: recording tick table =="
$W finalize --runs "$RUN"

echo "== determinism check: THREE chains replayed from genesis off the pushed branches =="
$W replay --runs "$RUN" --out "$RUN/replay-tips.json"
if cmp -s "$RUN/session-tips.json" "$RUN/replay-tips.json"; then
  echo "== determinism: recorded == replay (byte-equal) — three chains, one clock =="
else
  echo "== DETERMINISM FAILURE: recorded != replay — inspect $RUN/{session,replay}-tips.json ==" >&2
  exit 1
fi
echo "== done =="
