#!/usr/bin/env node
// Runs every tests/*.test.js, each file in its own process, as many at once as the machine has cores. New test
// files are picked up on their own, so adding one never touches package.json (and never conflicts with someone
// else adding theirs).
//
//   npm test                                   everything
//   npm test -- tests/peering.test.js          just these files (other arguments go to node --test)
//   npm test -- --shard 2/4                    one of four parts of about equal time (CI runs the four at once)
//   npm test -- --shard 2/4 --list             which files that part holds, without running them
//   TEST_JOBS=1 npm test                       one file at a time, as it used to be
//   npm run test:smoke                         only the smoke check (about 10 s)
//   SKIP_SMOKE=1 npm test                      everything without the smoke check first
//
// A whole run (or a shard) starts with the smoke check (scripts/test-smoke.js): a broken page, a syntax error or a
// NaN on screen fails in seconds instead of after every suite. Files then start longest first, so the slow ones do
// not finish alone at the end. A file marked `// @parts N` in its first lines runs as N processes at once, each with
// every Nth test (tests/harness.js `parts()`): that is how one heavy file stops being the floor of a run.
// Parts are balanced by tests/durations.json, each file's typical seconds (refresh: npm run test:timings).
// A file missing from it counts as a typical one, so a stale list only makes the parts a little uneven.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.join(__dirname, '..');
const dir = path.join(root, 'tests');
const args = process.argv.slice(2);

const list = args.includes('--list');
const smokeOnly = args.includes('--smoke');
if (smokeOnly) args.splice(args.indexOf('--smoke'), 1);
if (list) args.splice(args.indexOf('--list'), 1);
let shard = null;
const si = args.indexOf('--shard');
if (si >= 0) {
  const m = /^(\d+)\/(\d+)$/.exec(args[si + 1] || '');
  if (!m || +m[1] < 1 || +m[1] > +m[2]) { console.error('--shard wants i/n, like 2/4'); process.exit(2); }
  shard = [+m[1], +m[2]];
  args.splice(si, 2);
}

// Files picked by hand run as they are named (and in parts, if marked); otherwise every tests/*.test.js.
const picked = args.filter((a) => a.endsWith('.test.js')).map((a) => path.relative(root, path.resolve(root, a)));
for (let k = args.length - 1; k >= 0; k--) if (args[k].endsWith('.test.js')) args.splice(k, 1);
const files = picked.length ? picked :
  fs.readdirSync(dir).filter((f) => f.endsWith('.test.js')).sort().map((f) => path.join('tests', f));

let dur = {};
try { dur = JSON.parse(fs.readFileSync(path.join(dir, 'durations.json'), 'utf8')); } catch (e) { /* none yet: by count */ }
const key = (f) => f.replace(/\\/g, '/');
// `// @parts N` near the top of a file: it runs as N pieces.
function nParts(f) {
  try { const m = /@parts (\d+)/.exec(fs.readFileSync(path.join(root, f), 'utf8').split('\n').slice(0, 8).join('\n')); return m ? Math.max(1, +m[1]) : 1; } catch (e) { return 1; }
}
// One item per process: a file, or one part of a file ({f, i, n}), each with its expected seconds.
const items = [];
for (const f of files) { const n = nParts(f); for (let i = 1; i <= n; i++) items.push({ f, i, n }); }
const known = files.map((f) => dur[key(f)]).filter((x) => x > 0).sort((a, b) => a - b);
const typical = known.length ? known[known.length >> 1] : 1;
const w = (it) => (dur[key(it.f)] > 0 ? dur[key(it.f)] : typical) / it.n;
const byLen = (list) => list.slice().sort((a, b) => w(b) - w(a) || a.f.localeCompare(b.f) || a.i - b.i);

// Longest first, each onto the part with the least so far: parts within a file's length of each other.
function part(list, i, n) {
  const load = Array(n).fill(0), out = Array.from({ length: n }, () => []);
  for (const it of byLen(list)) {
    let k = 0;
    for (let j = 1; j < n; j++) if (load[j] < load[k]) k = j;
    load[k] += w(it); out[k].push(it);
  }
  return out[i - 1];
}
let run = items;
if (shard && items.length) {
  run = part(items, shard[0], shard[1]);
  console.log(`# part ${shard[0]}/${shard[1]}: ${run.length} files and pieces`);
  if (list) { for (const it of byLen(run)) console.log(it.n > 1 ? `${it.f} (${it.i}/${it.n})` : it.f); process.exit(0); }
  // node --test with no files would run every test it can find: an empty part has nothing to do.
  if (!run.length) process.exit(0);
}
if (list) { for (const it of byLen(run)) console.log(it.n > 1 ? `${it.f} (${it.i}/${it.n})` : it.f); process.exit(0); }

// The smoke check first, on whole runs and shards (not when a few files are picked by hand).
if (smokeOnly || (!picked.length && !process.env.SKIP_SMOKE)) {
  const sm = spawnSync(process.execPath, [path.join(__dirname, 'test-smoke.js')], { stdio: 'inherit', cwd: root });
  if (sm.status) { console.error('# smoke check failed: fix it before the full run (SKIP_SMOKE=1 to run anyway)'); process.exit(sm.status || 1); }
  if (smokeOnly) process.exit(0);
}

// A part of a file is a small file of its own in a temporary folder that sets TEST_PART and loads the real one.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tubes-test-'));
const paths = byLen(run).map((it) => {
  if (it.n === 1) return it.f;
  const p = path.join(tmp, `${path.basename(it.f, '.test.js')}.part${it.i}of${it.n}.test.js`);
  fs.writeFileSync(p, `process.env.TEST_PART=${JSON.stringify(it.i + '/' + it.n)};require(${JSON.stringify(path.join(root, it.f))});\n`);
  return p;
});

const jobs = Math.max(1, parseInt(process.env.TEST_JOBS, 10) || os.availableParallelism());
const r = spawnSync(process.execPath, ['--test', `--test-concurrency=${jobs}`, ...args, ...paths], { stdio: 'inherit', cwd: root });
fs.rmSync(tmp, { recursive: true, force: true });
process.exit(r.status ?? 1);
