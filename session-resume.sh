#!/usr/bin/env bash
# session-resume.sh — resume driver for a float session that died mid-exchange.
# Mirrors the bottom half of session-run.sh (ticks 3–8 + finalize) with two additions
# per L21: (0) every directive is schema-validated pre-tick by agent.mjs itself
# (E_DIRECTIVE_SCHEMA, fail-closed), and the pack is unit-tested first; (1) after
# finalize, replay re-derives the whole tick table from genesis off the pushed branches
# and the determinism check (recorded == replay, byte-equal) runs here.
#
# Precondition (receipted in runs/float-session-1.md): the dead lane's partial-tick
# residue is snapshotted under snapshots/ and the agent tree is reset to its branch tip.
set -euo pipefail
cd "$(dirname "$0")"

R="$PWD"
RUN="$R/runs"
W="node $R/float-watch.mjs"

echo "== float resume: validate the exchange before the tick (L21) =="
node "$R/test/directive-schema.test.mjs"

echo "== tick 3: alpha exchange 1 (menu: M2) =="
node "$R/agent.mjs" tick "$R/../agents/alpha" "$RUN/directives/alpha-round-1.json" "$RUN"
$W tick --agent alpha --phase taught-by --tick 3 --runs "$RUN"

echo "== tick 4: beta exchange 1 (menu: M2) =="
node "$R/agent.mjs" tick "$R/../agents/beta" "$RUN/directives/beta-round-1.json" "$RUN"
$W tick --agent beta --phase taught-by --tick 4 --runs "$RUN"

echo "== tick 5: alpha exchange 2 (menu: M3) =="
node "$R/agent.mjs" tick "$R/../agents/alpha" "$RUN/directives/alpha-round-2.json" "$RUN"
$W tick --agent alpha --phase taught-by --tick 5 --runs "$RUN"

echo "== tick 6: beta exchange 2 (menu: M1) =="
node "$R/agent.mjs" tick "$R/../agents/beta" "$RUN/directives/beta-round-2.json" "$RUN"
$W tick --agent beta --phase taught-by --tick 6 --runs "$RUN"

echo "== tick 7: alpha exchange 3 (menu: M1) =="
node "$R/agent.mjs" tick "$R/../agents/alpha" "$RUN/directives/alpha-round-3.json" "$RUN"
$W tick --agent alpha --phase taught-by --tick 7 --runs "$RUN"

echo "== tick 8: beta exchange 3 (menu: M1) =="
node "$R/agent.mjs" tick "$R/../agents/beta" "$RUN/directives/beta-round-3.json" "$RUN"
$W tick --agent beta --phase taught-by --tick 8 --runs "$RUN"

echo "== session complete: recording tick table =="
$W finalize --runs "$RUN"

echo "== determinism check: replay from genesis off the pushed branches =="
$W replay --runs "$RUN" --out "$RUN/replay-tips.json"
if cmp -s "$RUN/session-tips.json" "$RUN/replay-tips.json"; then
  echo "== determinism: recorded == replay (byte-equal) — the synchrony primitive held =="
else
  echo "== DETERMINISM FAILURE: recorded != replay — inspect $RUN/{session,replay}-tips.json ==" >&2
  exit 1
fi
echo "== done =="
