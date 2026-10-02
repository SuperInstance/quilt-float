#!/usr/bin/env node
// test/directive-schema.test.mjs — the E_DIRECTIVE_SCHEMA gate's unit test (L21).
//
// Law under test: a directive missing bodyMd (either body) REFUSES pre-tick with the
// missing field NAMED; a complete directive passes. The end-to-end case runs agent.mjs
// itself against a throwaway clone and asserts the refusal happened BEFORE any mutation
// (no receipts/ created) — the tick-3 death must be structurally impossible now.
//
// Run: node test/directive-schema.test.mjs   (from the orchestrator dir; stdlib only)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { validateDirective } from '../float-lib.mjs';

const ROOT = path.dirname(new URL(import.meta.url).pathname);
const ORCH = path.resolve(ROOT, '..');
const DIRECTIVES = path.join(ORCH, 'runs', 'directives');

let failures = 0;
const ok = (cond, label) => {
  if (cond) console.log(`  PASS  ${label}`);
  else { console.error(`  FAIL  ${label}`); failures++; }
};
const clone = (d) => JSON.parse(JSON.stringify(d));

console.log('# 1. a directive missing lesson.bodyMd refuses pre-tick, field named');
const seed = JSON.parse(fs.readFileSync(path.join(DIRECTIVES, 'alpha-seed.json'), 'utf8'));
const ex = JSON.parse(fs.readFileSync(path.join(DIRECTIVES, 'alpha-round-1.json'), 'utf8'));
const noBody = clone(ex);
delete noBody.lesson.bodyMd;
const r1 = validateDirective(noBody);
ok(r1.ok === false, 'validation fails on missing lesson.bodyMd');
ok(r1.error === 'E_DIRECTIVE_SCHEMA', `named error E_DIRECTIVE_SCHEMA (got ${r1.error})`);
ok(/missing field: lesson\.bodyMd/.test(r1.detail), `detail names lesson.bodyMd (got: ${r1.detail})`);

console.log('# 2. a directive missing taughtBy.bodyMd refuses too (same crash class)');
const noTbBody = clone(ex);
delete noTbBody.taughtBy.bodyMd;
const r2 = validateDirective(noTbBody);
ok(r2.ok === false && r2.error === 'E_DIRECTIVE_SCHEMA', 'validation fails on missing taughtBy.bodyMd');
ok(/missing field: taughtBy\.bodyMd/.test(r2.detail), `detail names taughtBy.bodyMd (got: ${r2.detail})`);

console.log('# 3. empty-string bodyMd refuses (non-empty-string law, not mere presence)');
const emptyBody = clone(ex);
emptyBody.lesson.bodyMd = '   ';
const r3 = validateDirective(emptyBody);
ok(r3.ok === false && /bad field: lesson\.bodyMd/.test(r3.detail), 'whitespace-only lesson.bodyMd refused');

console.log('# 4. a complete directive passes');
ok(validateDirective(clone(ex)).ok === true, 'complete exchange directive passes');
ok(validateDirective(clone(seed)).ok === true, 'complete seed directive passes');

console.log('# 4b. a lesson is authored BLIND — foreign placeholders in lesson strings refuse');
const blind = clone(ex);
blind.lesson.bodyMd = 'after the fetch I saw {{FOREIGN_GIT_TIP}} ...';
const r4b = validateDirective(blind);
ok(r4b.ok === false && r4b.error === 'E_DIRECTIVE_SCHEMA', 'lesson with {{FOREIGN_*}} placeholder refused');
ok(/lesson\.bodyMd/.test(r4b.detail), `detail names lesson.bodyMd (got: ${r4b.detail})`);

console.log('# 5. every shipped directive passes the gate (the live pack is sealed-valid)');
for (const f of fs.readdirSync(DIRECTIVES).filter(f => f.endsWith('.json')).sort()) {
  const d = JSON.parse(fs.readFileSync(path.join(DIRECTIVES, f), 'utf8'));
  const r = validateDirective(d);
  ok(r.ok === true, `${f} passes${r.ok ? '' : ` — ${r.detail}`}`);
}

console.log('# 6. end-to-end: agent.mjs refuses pre-tick, BEFORE any mutation');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'float-schema-test-'));
const badFile = path.join(tmp, 'bad-directive.json');
fs.writeFileSync(badFile, JSON.stringify(noBody, null, 2));
const tmpClone = path.join(tmp, 'clone');
const tmpRuns = path.join(tmp, 'runs');
fs.mkdirSync(tmpClone, { recursive: true });
const run = spawnSync('node', [path.join(ORCH, 'agent.mjs'), 'tick', tmpClone, badFile, tmpRuns], {
  encoding: 'utf8', cwd: ORCH,
});
ok(run.status === 2, `exit code 2 on malformed directive (got ${run.status})`);
ok(/E_DIRECTIVE_SCHEMA/.test(run.stderr), 'stderr carries the named error');
ok(/lesson\.bodyMd/.test(run.stderr), 'stderr names the missing field');
ok(!fs.existsSync(path.join(tmpClone, 'receipts')), 'no mutation: receipts/ never created');
ok(!fs.existsSync(path.join(tmpClone, 'lessons')) && !fs.existsSync(path.join(tmpClone, 'cells')),
  'no mutation: lessons/ and cells/ never created');
ok(!fs.existsSync(path.join(tmpRuns, 'logs')), 'no mutation: no tick log flushed');
fs.rmSync(tmp, { recursive: true, force: true });

console.log(failures === 0 ? '\nALL GREEN — the tick-3 death class is structurally refused pre-tick.' : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
