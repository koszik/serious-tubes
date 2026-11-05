---
name: write-tests
description: Write deterministic jsdom tests for Series of Tubes features and fixes in tests/*.test.js.
---

# Writing tests

Tests use `node:test` and `tests/harness.js`, which assembles the game page from `src/`
(once per test file) and loads it in jsdom with the animation loop off, a seeded `Math.random` and a recording fake canvas.
Code runs inside the page through `ev()`.

## Pattern

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');

test('what the player should see happen', () => {
  const { ev, errors } = load();
  ev("ACT.start({});S.cash=1e8;for(const g of GOALS)S.done[g.id]=0;ACT.launchBB({city:'fra'})");
  ev("ACT.buyTransit({city:'fra',net:'cog',tier:1});compute()");
  assert.ok(ev("R.served") > 0);
  assert.deepEqual(errors, []);   // always: no page errors
});
```

## Where to put it

Pick the suite by topic: `game` (core loop), `build`, `persist` (save/import/migrate),
`services` (customers), `peering`, `issues` (GitHub issue regressions, name them
`#NN …`), `regions`, `modes` (scenarios, sandbox, weekly), `i18n`, `pages` (hosting).
For a new feature, prefer a new file named after it (`tests/route-servers.test.js`): every
`tests/*.test.js` runs on its own (`scripts/test.js`), and a file of your own never conflicts
with someone else's tests. Appending to the big suites (`issues`, `regions`) is where
pull requests collide. Run one file with `npm test -- tests/route-servers.test.js` (picked files skip the smoke check).

## Rules

- **Text in assertions:** match what the player sees (`/Ready in about 3 days/`), or compare with
  `ev("tr('pnis.ready_in_about_n_days',{n:3})")`. Tests run the source page, where labels are readable;
  the shipped page (ids instead of labels) is covered by `tests/pages.test.js`.
- **Deterministic.** Never rely on luck. Use the default seed, `window.__reseed(n)`,
  or set state directly (`S.day=…`, `S.ev.x=…`).
- **Force a specific random failure or event** by patching the picker:
  ```js
  ev("eval('('+fireFailure.toString().replace('const e=pick(opts);',\"const e='crash';\")+')')()");
  ```
  Check the current source for the exact `pick` line first (`grep -rn "function fireFailure" src/game`); it may differ.
- **Drive the game through `ACT`** like a player would, then `compute()` or `dayTick()`.
- **Saves:** for persistence changes, round-trip `JSON.stringify(S)` through
  `parseSave()`/`migrate()`, and test that an *old* save without the new field still loads.
- **UI:** render with `renderAll()` and query `dom.window.document`; check phone
  layouts by setting `window.innerWidth = 390` before rendering.
- **Keep a test under about 30 s.** A test is the smallest piece that can run on its own, so the slowest one is the
  floor of every full run. Loop over cases with one `test()` per case (or per group that starts from the fixture),
  not one test with a long loop inside. A file over a minute gets `// @parts N` in its first lines and
  `const test = require('./harness').parts(require('node:test'));`: the runner starts it as N processes, each with
  every Nth test in the order they are written, so put the heavy ones where they land in different parts. Tests in
  such a file must not depend on each other (each loads its own page).

## The testing routine

A full run is a few minutes of every core; use it once, at the end.

1. **While working, run what the change touches**, by name: the suites of the feature, its neighbours and the ones
   the change obviously reaches (`npm test -- tests/routing-quality.test.js tests/latency.test.js`). For a change to
   routing or the day tick add `route-cache`, `gameplay-rules` and the feature's own suite; for text add `i18n`
   and `node scripts/i18n-check.js`; for actions add `mcp-commands`. One to two minutes, not seven.
2. **`npm run test:smoke`** (about 10 s) whenever in doubt: every script and test compiles, the page boots, a new
   game and the big network play a day, and the main screens show no `NaN`, `undefined` or `{placeholder}`.
3. **`npm test` once when the work is done.** It runs the smoke check first and stops there if it fails, then every
   file, longest first, with marked files in parts. The whole suite must pass, not just the new test.
4. Do not rerun the full suite to check one fix: rerun the failing files, then the full suite once more at the end.
5. After adding or growing slow tests, `npm run test:timings` refreshes `tests/durations.json`, which orders the run
   and balances CI's four shards (`npm test -- --shard 2/4 --list` shows a shard's files and parts).
