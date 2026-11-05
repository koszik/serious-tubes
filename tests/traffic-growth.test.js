// Traffic grows, prices fall: traffic per subscriber +15% a year while broadband revenue per subscriber stays flat,
// transit and exchange ports 15% cheaper a year, and an access network that costs a share of what homes pay.
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');

const start = (ev, city = 'fra') => {
  ev(`ACT.start({});S.cash=1e9;S.nextFail=S.nextEvent=1e9;ACT.launchBB({city:'${city}'});S.pops['${city}'].bb.d=100;compute()`);
};
const near = (a, b, tol = 1e-6) => Math.abs(a - b) <= tol * Math.max(1, Math.abs(b));

test('on day 0 nothing moves; a year later the same homes send 15% more for the same money', () => {
  const { ev, errors } = load();
  start(ev);
  assert.equal(ev('trafG()'), 1);
  assert.equal(ev("eyeRate('fra')"), ev('EYE_RATE'));
  const eye0 = ev('R.cityEye.fra'), rev0 = ev("R.cityEye.fra*eyeRate('fra')");
  ev('S.day=365;compute()');
  assert.ok(near(ev('R.cityEye.fra'), eye0 * 1.15), 'traffic +15%');
  assert.ok(near(ev("R.cityEye.fra*eyeRate('fra')"), rev0), 'same revenue at full service');
  assert.ok(near(ev("eyeRate('fra')"), ev('EYE_RATE') / 1.15));
  assert.match(ev("cityPanel('fra')"), /Traffic per home grows 15% a year/);
  assert.deepEqual(errors, []);
});

test('subscribers still stop at the city ceiling', () => {
  const { ev, errors } = load();
  start(ev);
  ev("ACT.buyTransit({city:'fra',net:'cog',tier:3});S.pops.fra.bb.d=eyeP('fra');S.day=800;compute()");
  assert.ok(ev("R.cityEye.fra>eyeP('fra')*1.3"), 'their traffic is above the day-0 ceiling');
  ev('for(let i=0;i<20;i++)dayTick()');
  assert.ok(ev("S.pops.fra.bb.d<=eyeP('fra')+1e-6"), 'subscribers, not traffic, are capped');
  assert.deepEqual(errors, []);
});

test('a full city on a fixed port loses subscribers as their traffic grows', () => {
  const { ev, errors } = load();
  ev("ACT.start({});S.cash=1e9;S.nextFail=S.nextEvent=1e9;ACT.launchBB({city:'fra'});ACT.buyTransit({city:'fra',net:'cog',tier:1});S.pops.fra.bb.d=90;compute()");
  for (let i = 0; i < 60; i++) ev('dayTick()');
  const y1 = ev('S.pops.fra.bb.d'), r1 = ev('R.rev.eyeballs');
  for (let i = 0; i < 365 * 3; i++) ev('dayTick()');
  assert.ok(ev('S.pops.fra.bb.d') < y1 * 0.8, `subscribers fall (${ev('S.pops.fra.bb.d')} from ${y1})`);
  assert.ok(ev('R.rev.eyeballs') < r1 * 0.8, 'and so does broadband revenue');
  assert.deepEqual(errors, []);
});

test('transit and exchange ports get 15% cheaper a year, never below a fifth', () => {
  const { ev, errors } = load();
  ev("ACT.start({});S.cash=1e9;ACT.buyTransit({city:'fra',net:'cog',tier:1});compute()");
  const t = (d) => JSON.parse(ev(`S.day=${d};JSON.stringify([transitMo(S.transit[0],50),ixPortMo(ixIdsIn('fra')[0],1),tmoOf(1),transitPerG(NET.cog,'fra')])`));
  const a = t(0), b = t(365), z = t(365 * 30);
  b.forEach((v, i) => assert.ok(Math.abs(v / a[i] - 0.85) < 0.01, `item ${i}: ${v} vs ${a[i]}`));
  z.forEach((v, i) => assert.ok(Math.abs(v / a[i] - 0.2) < 0.01, `item ${i} floors at 20%`));
  // The order of sellers does not change.
  const order = (d) => ev(`S.day=${d};NETS.filter(n=>sellsAt(n,'fra')).sort((a,b)=>transitPerG(a,'fra')-transitPerG(b,'fra')).map(n=>n.id).join()`);
  assert.equal(order(0), order(900));
  assert.deepEqual(errors, []);
});

test('the access network costs 55% of broadband revenue, 20% in Korea, nothing extra in Australia', () => {
  const { ev, errors } = load();
  start(ev);
  ev("ACT.buildPop({city:'icn'});ACT.launchBB({city:'icn'});ACT.buildPop({city:'syd'});ACT.launchBB({city:'syd'});compute()");
  const full = (c) => ev(`R.cityEye.${c}*eyeRate('${c}')`);
  assert.ok(near(ev('R.cost.access'), full('fra') * 0.55 + full('icn') * 0.2, 1e-9));
  assert.equal(ev("accessOf('syd')"), 0, 'Sydney pays the wholesale network instead');
  ev("ACT.dash({});UI.dtab='overview';renderDash()");
  assert.match(ev("document.getElementById('dashCard').textContent"), /Access network \(last mile, home routers, support\)/);
  assert.deepEqual(errors, []);
});

test('an old save starts growing on the day it loads', () => {
  const { ev, errors } = load();
  start(ev);
  ev('S.day=2000;compute()');
  const x = ev("(()=>{const s=JSON.parse(JSON.stringify(S));delete s.trafD0;S=migrate(s);compute();return S.trafD0;})()");
  assert.equal(x, 2000);
  assert.equal(ev('trafG()'), 1, 'its traffic is unchanged on load');
  ev("const s=JSON.parse(JSON.stringify(S));s.trafD0=5000;S=migrate(s)");
  assert.equal(ev('S.trafD0'), 2000, 'never after today');
  assert.equal(ev("(newGame('x','fra'),S.trafD0)"), 0);
  assert.deepEqual(errors, []);
});
