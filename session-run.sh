#!/usr/bin/env bash
# session-run.sh — the float session driver. Two local agent processes, one shared repo,
# no shared working tree: the only thing that crosses between them is git commits.
# After every agent tick, float-watch verifies both chains from genesis and selects the
# next exchange prompt from the fixed menu (the ML leg, receipted to runs/prompts.jsonl).
set -euo pipefail
cd "$(dirname "$0")"

R="$PWD"
A="$R/../agents/alpha"
B="$R/../agents/beta"
RUN="$R/runs"
W="node $R/float-watch.mjs"
AG="node $R/agent.mjs"

echo "== float session: SuperInstance/quilt-float =="
echo "== tick 1: alpha seeds its quilt (wave-66/67 lineage) =="
node "$R/agent.mjs" tick "$A" "$RUN/directives/alpha-seed.json" "$RUN"
$W tick --agent alpha --phase seed --tick 1 --runs "$RUN"

echo "== tick 2: beta seeds its quilt (wave-68/69 lineage) =="
node "$R/agent.mjs" tick "$B" "$RUN/directives/beta-seed.json" "$RUN"
$W tick --agent beta --phase seed --tick 2 --runs "$RUN"

echo "== tick 3: alpha exchange 1 (menu: M2) =="
node "$R/agent.mjs" tick "$A" "$RUN/directives/alpha-round-1.json" "$RUN"
$W tick --agent alpha --phase taught-by --tick 3 --runs "$RUN"

echo "== tick 4: beta exchange 1 (menu: M2) =="
node "$R/agent.mjs" tick "$B" "$RUN/directives/beta-round-1.json" "$RUN"
$W tick --agent beta --phase taught-by --tick 4 --runs "$RUN"

echo "== tick 5: alpha exchange 2 (menu: M3) =="
node "$R/agent.mjs" tick "$A" "$RUN/directives/alpha-round-2.json" "$RUN"
$W tick --agent alpha --phase taught-by --tick 5 --runs "$RUN"

echo "== tick 6: beta exchange 2 (menu: M1) =="
node "$R/agent.mjs" tick "$B" "$RUN/directives/beta-round-2.json" "$RUN"
$W tick --agent beta --phase taught-by --tick 6 --runs "$RUN"

echo "== tick 7: alpha exchange 3 (menu: M1) =="
node "$R/agent.mjs" tick "$A" "$RUN/directives/alpha-round-3.json" "$RUN"
$W tick --agent alpha --phase taught-by --tick 7 --runs "$RUN"

echo "== tick 8: beta exchange 3 (menu: M1) =="
node "$R/agent.mjs" tick "$B" "$RUN/directives/beta-round-3.json" "$RUN"
$W tick --agent beta --phase taught-by --tick 8 --runs "$RUN"

echo "== session complete: recording tick table =="
$W finalize --runs "$RUN"
echo "== done =="
