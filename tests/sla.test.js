// SLAs: a level chosen when signing, hours of lost service counted each day, rebates past the allowance up to the
// level's cap, a reroute blip unless fast reroute is on, and Strict customers who walk away after three bad months.
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');

function net(ev, links = 1) {
  ev("ACT.start({});S.cash=1e9;S.lvl=13;S.nextFail=S.nextEvent=1e9;for(const g of GOALS)S.done[g.id]=0;S.pops.fra.rgen=RG_TOP;ACT.buildPop({city:'ams'});S.pops.ams.rgen=RG_TOP");
  for (let i = 0; i < links; i++) ev("UI.via=null;UI.lmode='wave';openLinkModal('fra','ams');ACT.buildLink({tier:2});closeModal()");
  ev("for(const l of S.links)l.ready=0;compute()");
}
const offer = (ev, id, type, bw) => ev(`S.offers.push({id:'${id}',city:'fra',city2:'ams',name:'${id}',type:'${type}',bw:${bw},rate:l2Rate(BIZ_T.${type},'fra','ams',${bw}),reqs:[],latMax:${type === 'hft' ? 5 : 'null'},exp:S.day+30})`);
const biz = (ev, id) => JSON.parse(ev(`JSON.stringify(S.biz.find(b=>b.id==='${id}')||null)`));
// One day of SLA accounting on today's routing, for customers past their provisioning grace (unless told otherwise).
const day = (ev, fresh = false) => ev(`${fresh ? '' : 'for(const b of S.biz)b.since=Math.min(b.since,S.day-PROV_D);'}compute();slaTick(S.day)`);

test('signing picks a level its type offers, and a stricter level pays more', () => {
  const { ev, errors, dom } = load();
  net(ev);
  dom.window.innerWidth = 360;
  offer(ev, 'v', 'l2vpn', 10); offer(ev, 'h', 'hft', 1);
  ev("UI.left='deals';UI.leftOpen=true;renderLeft()");
  const btns = (id) => ev(`[...document.querySelectorAll('#leftBody [data-act="accept"]')].filter(b=>JSON.parse(b.dataset.args).id==='${id}').map(b=>JSON.parse(b.dataset.args).sla).join()`);
  assert.equal(btns('v'), 'std,prem,strict', 'one Accept per level');
  assert.equal(btns('h'), 'strict', 'a trading firm only signs Strict');
  assert.match(ev("document.getElementById('leftBody').textContent"), /Strict 99\.999%, rebates up to 12× a month/);
  const base = ev("S.offers.find(o=>o.id==='v').rate");
  ev("ACT.accept({id:'h',sla:'std'})");
  assert.equal(biz(ev, 'h'), null, 'a level it does not sign is refused');
  ev("ACT.accept({id:'v',sla:'strict'})");
  const v = biz(ev, 'v');
  assert.equal(v.sla, 'strict');
  assert.equal(v.rate, Math.round(base * 2 * 100) / 100);
  assert.deepEqual(errors, []);
});

test('a day with no path rebates Strict up to 12 months and Standard up to one', () => {
  const { ev, errors } = load();
  net(ev);
  offer(ev, 's', 'l2vpn', 10); offer(ev, 'n', 'l2vpn', 10);
  ev("ACT.accept({id:'s',sla:'strict'});ACT.accept({id:'n',sla:'std'})");
  day(ev);
  assert.equal(biz(ev, 's').dn || 0, 0, 'served: nothing down');
  const cash = ev('S.cash'), ms = ev("bizMo(S.biz.find(b=>b.id==='s'))"), mn = ev("bizMo(S.biz.find(b=>b.id==='n'))");
  ev('S.links[0].cut=S.day+5');
  day(ev);
  const s = biz(ev, 's'), n = biz(ev, 'n');
  assert.equal(s.dn, 1440, 'the whole day down');
  assert.ok(Math.abs(s.cr - 12 * ms) < 1, `Strict: ${s.cr} of ${12 * ms}`);
  assert.ok(Math.abs(n.cr - mn) < 1, `Standard: ${n.cr} of ${mn}`);
  assert.ok(Math.abs(cash - ev('S.cash') - s.cr - n.cr) < 1, 'paid from your cash');
  day(ev);
  assert.ok(Math.abs(biz(ev, 's').cr - 12 * ms) < 1, 'and no more than the cap that month');
  assert.match(ev("document.getElementById('toasts')?.textContent||''") + ev('JSON.stringify(UI.toasts||[])'), /SLA rebate/);
  assert.deepEqual(errors, []);
});

test('a cut that reroutes is a blip: it breaks Strict, not Standard, and fast reroute hides it', () => {
  const { ev, errors } = load();
  net(ev, 2);
  offer(ev, 's', 'l2vpn', 10); offer(ev, 'n', 'l2vpn', 10);
  ev("ACT.accept({id:'s',sla:'strict'});ACT.accept({id:'n',sla:'std'})");
  day(ev);
  ev('S.links[0].cut=S.day+5');
  day(ev);
  assert.equal(biz(ev, 's').dn, 3, 'three minutes while it reconverges');
  assert.ok(biz(ev, 's').cr > 0, 'over the 26 seconds Strict allows');
  assert.equal(biz(ev, 'n').cr || 0, 0, 'well inside Standard’s 43 minutes');
  day(ev);
  assert.equal(biz(ev, 's').dn, 3, 'once, when the link goes down');
  // With fast reroute the backup is ready before the cut.
  ev("S.links[0].cut=0");
  day(ev);
  ev("S.core={...(S.core||{}),run:2};delete S.core.legacy;S.links[0].cut=S.day+5");
  assert.ok(ev("coreFrr()"), "fast reroute on");
  day(ev);
  assert.equal(biz(ev, 's').dn, 3);
  assert.deepEqual(errors, []);
});

test('latency over the promise is down; the month starts afresh; three bad months and Strict walks', () => {
  const { ev, errors } = load();
  net(ev);
  offer(ev, 'h', 'hft', 1);
  ev("ACT.accept({id:'h',sla:'strict'});S.biz.find(b=>b.id==='h').latMax=0.01");
  day(ev);
  const h = biz(ev, 'h'), mon = ev('monthIdx(S.day)');
  assert.equal(h.dn, 1440, 'too slow all day is down all day');
  assert.deepEqual(h.brs, [mon], 'one broken month: it stays');
  // Two broken months behind it: the third makes it walk.
  ev(`const b=S.biz.find(b=>b.id==='h');b.brs=[${mon - 2},${mon - 1}];b.dnM=-1`);
  day(ev);
  assert.equal(biz(ev, 'h'), null, 'three broken months in a year');
  assert.deepEqual(errors, []);
});

test('the month rolls over, and the list shows what is used', () => {
  const { ev, errors } = load();
  net(ev);
  offer(ev, 'v', 'l2vpn', 10);
  ev("ACT.accept({id:'v',sla:'prem'})");
  ev("const b=S.biz.find(b=>b.id==='v');b.dnM=monthIdx(S.day)-1;b.dn=999;b.cr=5");
  day(ev);
  assert.deepEqual([biz(ev, 'v').dn, biz(ev, 'v').cr, biz(ev, 'v').dnM], [0, 0, ev('monthIdx(S.day)')]);
  ev("ACT.custOpen({})");
  assert.match(ev("document.getElementById('custSec').textContent"), /SLA Premium \(99\.99%\): 0 min down this month, 4 min allowed/);
  ev("const s=JSON.parse(JSON.stringify(S));s.biz[0].sla='bogus';s.biz[0].dn='x';S=migrate(s)");
  assert.deepEqual([ev("S.biz[0].sla===undefined"), ev("S.biz[0].dn"), ev("slaOf(S.biz[0])")], [true, 0, 'std']);
  assert.deepEqual(errors, []);
});

test('paid rebates show in the money view, the daily history and the Customers tab', () => {
  const { ev, errors } = load();
  net(ev);
  offer(ev, 's', 'l2vpn', 10);
  ev("ACT.accept({id:'s',sla:'strict'})");
  day(ev);
  ev("S.links[0].cut=S.day+5;S.hist=[{d:S.day,dem:1,srv:1,rev:1,cost:1}]");
  day(ev);
  const cr = biz(ev, 's').cr;
  assert.ok(cr > 0);
  assert.equal(ev('S.hist[S.hist.length-1].sla'), Math.round(cr), 'the day it was paid');
  assert.deepEqual(JSON.parse(ev("JSON.stringify(S.slaLog.map(x=>[x.id,x.sla,x.pay,x.dn]))")), [['s', 'strict', Math.round(cr), 1440]]);
  assert.equal(ev('slaMonth()'), cr);
  ev("S.hist.unshift({d:S.day-1,dem:1,srv:1,rev:1,cost:1});ACT.dash({});UI.dtab='overview';renderDash()");
  const dash = ev("document.getElementById('dashCard').textContent");
  assert.match(dash, /SLA rebates this month/);
  assert.match(dash, /SLA rebates per day/);
  ev("ACT.custOpen({})");
  assert.match(ev("document.getElementById('custSec').textContent"), /Recent SLA rebates.*s.*Strict · 24 h down that month/s);
  // Kept in the save, and checked when it loads.
  ev("const x=JSON.parse(JSON.stringify(S));x.slaLog.push({d:'x',sla:'bogus',pay:'1e999'},null);S=migrate(x)");
  assert.deepEqual(JSON.parse(ev("JSON.stringify(S.slaLog.map(x=>[x.sla,Number.isFinite(x.pay),Number.isFinite(x.d)]))")), [['strict', true, true], ['std', true, true]]);
  assert.deepEqual(errors, []);
});

test('no SLA while a new customer is still being provisioned', () => {
  const { ev, errors } = load();
  net(ev);
  offer(ev, 's', 'l2vpn', 10);
  ev("ACT.accept({id:'s',sla:'strict'});S.links[0].cut=S.day+30");
  const cash = ev('S.cash');
  day(ev, true);
  assert.deepEqual([biz(ev, 's').dn || 0, biz(ev, 's').cr || 0, ev('S.cash')], [0, 0, cash], 'nothing counted in the grace');
  ev('S.day+=PROV_D;S.biz[0].since=S.day-PROV_D');
  day(ev, true);
  assert.equal(biz(ev, 's').dn, 1440, 'counted from the day it ends');
  assert.deepEqual(errors, []);
});
