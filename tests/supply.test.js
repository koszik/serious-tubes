const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');

function setup(ev) {
  ev("ACT.start({});S.cash=1e9;S.lvl=6;S.nextFail=S.nextEvent=1e9;for(const g of GOALS)S.done[g.id]=0;compute()");
}

test('hardware gets dearer over the years, gently, and only for new purchases', () => {
  const { ev, errors } = load();
  setup(ev);
  const o = ev('Object.keys(OPT)[0]');
  const at = d => JSON.parse(ev(`S.day=${d};JSON.stringify([optCost('${o}'),routerCost(1),dfBuildCost(500),ownCabCost(5000)])`));
  const d0 = at(0);
  assert.deepEqual(at(180), d0, 'nothing changes in the first six months');
  const y1 = at(180 + 365);
  assert.ok(y1.every((v, i) => Math.abs(v / d0[i] - 1.04) < 0.01), `+4% a year (${y1} vs ${d0})`);
  const late = at(180 + 365 * 30);
  assert.ok(late.every((v, i) => Math.abs(v / d0[i] - 1.3) < 0.01), 'capped at +30%');
  // what you already own costs what it cost: monthly bills do not move
  ev("S.day=0;ACT.buyTransit({city:'fra',net:'cog',tier:1});compute()");
  const mo = ev('R.costMo');
  // (transit itself gets cheaper over the years; with that clock held still, the bill is exactly the same)
  ev('S.day=180+365*5;compute()');
  assert.ok(ev('R.costMo') < mo, 'transit erodes');
  ev('S.trafD0=S.day;compute()');
  assert.equal(ev('R.costMo'), mo);
  assert.deepEqual(errors, []);
});

test('shortages hit one kind of hardware for a month or two; spares and a price lock soften them', () => {
  const { ev, errors } = load();
  setup(ev);
  const o = ev('Object.keys(OPT)[0]');
  ev('S.day=200');
  const calm = JSON.parse(ev(`JSON.stringify([optCost('${o}'),routerCost(1),dfBuildCost(500)])`));
  // a spare bought in calm times is already paid for
  ev(`ACT.buySpare({o:'${o}'})`);
  assert.equal(ev(`spareN('${o}')`), 1);
  ev("Math.random=()=>0;hwShockStart()");
  assert.equal(ev('S.hw.shock.k'), 'opt');
  const n = ev('S.hw.shock.until-S.day');
  assert.ok(n >= 45 && n <= 75, `a month or two (${n} days)`);
  assert.equal(ev(`optCost('${o}')`), Math.round(ev(`OPT['${o}'].cost*hwTrend(S.day)*1.5`)));
  assert.equal(ev('routerCost(1)'), calm[1], 'only optics');
  assert.match(ev("document.getElementById('toasts').textContent"), /Laser shortage/);
  // the NOC shows it, and a lock costs double during a shortage
  ev("UI.sel=null;UI.left='noc';UI.leftOpen=true;renderLeft()");
  assert.match(ev("document.getElementById('left').textContent"), /Supply chain[\s\S]*Optics \+50%/);
  const dear = ev('hwLockCost()');
  ev('S.hw.shock.until=S.day');
  assert.equal(ev('hwLockCost()') * 2, dear);
  // a lock keeps today's prices for a year, whatever happens
  const cash = ev('S.cash');
  ev('ACT.hwLock()');
  assert.equal(cash - ev('S.cash'), ev('hwLockCost()'));
  ev("S.day+=100;Math.random=()=>0.4;hwShockStart()");
  assert.equal(ev('S.hw.shock.k'), 'rt');
  assert.equal(ev('routerCost(1)'), calm[1], 'locked through a chip shortage');
  assert.equal(ev("S.day+=300;dfBuildCost(500)"), Math.round((25000 + 500 * 120) * ev('hwTrend(S.day)')), 'and then it runs out');
  // events: only after six months, and never two shortages at once
  ev("S.day=100;S.hw={}");
  assert.equal(ev("(()=>{const o=[];if(S.day>HW_FREE&&!hwShock())o.push(1);return o.length})()"), 0);
  assert.deepEqual(errors, []);
});

test('saves: shortages and locks survive, garbage is repaired', () => {
  const { ev, errors } = load();
  setup(ev);
  ev("S.hw={shock:{k:'opt',until:'90',mul:9},lock:{until:400,mul:'x'}};window.__a=JSON.parse(JSON.stringify(S));sanitize(__a)");
  assert.deepEqual(JSON.parse(ev('JSON.stringify(__a.hw)')), { shock: { k: 'opt', until: 90, mul: 2 }, lock: { until: 400, mul: 1 } });
  ev("S.hw={shock:{k:'nope'}};window.__b=JSON.parse(JSON.stringify(S));sanitize(__b);window.__c=JSON.parse(JSON.stringify(S));delete __c.hw;sanitize(__c)");
  assert.equal(ev('JSON.stringify(__b.hw)'), '{}');
  assert.equal(ev('JSON.stringify(__c.hw)'), '{}', 'old saves get an empty supply chain');
  assert.deepEqual(errors, []);
});
