#!/usr/bin/env node
// The smoke check: about ten seconds that catch what would otherwise fail dozens of suites minutes later. A syntax
// error in any script or test, a page that does not assemble or boot, a day that throws, and NaN, "undefined" or an
// unfilled {placeholder} on the main screens, on a new game and on the big-network fixture. `npm test` runs it first.
//
//   npm run test:smoke
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const t0 = performance.now();
const bad = [];

// 1. Every script and test compiles (as the CommonJS module it is).
const js = (d) => fs.readdirSync(path.join(root, d), { withFileTypes: true }).flatMap((e) =>
  e.isDirectory() ? js(path.join(d, e.name)) : e.name.endsWith('.js') ? [path.join(d, e.name)] : []);
for (const f of [...js('scripts'), ...js('tests')]) {
  const src = fs.readFileSync(path.join(root, f), 'utf8').replace(/^#!.*/, '');
  try { vm.compileFunction(src, ['exports', 'require', 'module', '__filename', '__dirname'], { filename: f }); } catch (e) { bad.push(`${f}: ${e.message}`); }
}

// 2. The page assembles and boots; a new game and the big network play a day; the main screens read cleanly.
if (!bad.length) {
  const { load } = require('../tests/harness');
  const SCREENS = ['hud', 'panelBody', 'leftBody', 'modalCard', 'dashCard', 'bankCard', 'toasts'];
  const tour = (who, ev, steps) => {
    for (const [label, src] of steps) {
      try { ev(src); } catch (e) { bad.push(`${who}, ${label}: ${e.message}`); continue; }
      const txt = ev(`${JSON.stringify(SCREENS)}.map(i=>{const e=document.getElementById(i);return e?e.textContent:''}).join('\\n')`);
      for (const m of txt.match(/[^\n]{0,40}(\{[a-z]\w*\}|undefined|NaN)[^\n]{0,40}/g) || []) bad.push(`${who}, ${label}: "${m.trim()}"`);
    }
  };
  const panels = (c) => [...['cust', 'up', 'peer', 'links'].map((t) => [`panel ${t}`, `selectCity('${c}');ACT.tab({t:'${t}'})`]),
    ...['goals', 'deals', 'noc', 'nets'].map((t) => [`left ${t}`, `ACT.leftTab({t:'${t}'})`]),
    ['dashboard', "ACT.dash({});for(const k of DTABS)ACT.dashTab({k});ACT.dashClose()"], ['bank', 'ACT.bank();ACT.bankClose()']];
  {
    const { ev, errors } = load();
    tour('new game', ev, [['start', "ACT.start({});S.cash=1e8;S.lvl=6;ACT.launchBB({city:'fra'});ACT.buyTransit({city:'fra',net:'cog',tier:1});ACT.buildPop({city:'ams'});compute()"],
      ['days', 'for(let i=0;i<5;i++)dayTick()'], ...panels('fra')]);
    for (const e of errors) bad.push(`new game: ${e}`);
  }
  {
    const { ev, errors } = load({ seed: 777 });
    const save = fs.readFileSync(path.join(root, 'tests', 'fixtures', 'big-network.json'), 'utf8');
    tour('big network', ev, [['load', `S=migrate(JSON.parse(${JSON.stringify(save)}));UI.started=true;UI.pitched=true;UI.speed=0;closeModal();compute()`],
      ['day', 'dayTick()'], ...panels(Object.keys(JSON.parse(save).pops)[0])]);
    for (const e of errors) bad.push(`big network: ${e}`);
  }
}

const s = ((performance.now() - t0) / 1000).toFixed(1);
if (bad.length) { console.error(`✗ smoke check failed in ${s} s:\n  ` + [...new Set(bad)].slice(0, 30).join('\n  ')); process.exit(1); }
console.log(`✓ smoke check passed in ${s} s`);
