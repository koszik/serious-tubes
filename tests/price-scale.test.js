// One price scale: transit at real prices (so peering pays), broadband as the network's share of the subscription, IP
// customers priced on their city's transit market, and an old save credited once for the change.
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');

const build = "ACT.start({});S.cash=1e6;S.pops.fra.rgen=RG_TOP;ACT.launchBB({city:'fra'});S.pops.fra.bb.d=100;ACT.buyTransit({city:'fra',net:'cog',tier:2});ACT.buyTransit({city:'fra',net:'lvl',tier:1});S.day=60;compute()";

test('an old save is credited once for the new prices; a new game is not', () => {
  const { ev, errors } = load();
  ev(build);
  assert.equal(ev('S.px'), 1);
  const c0 = ev('S.cash');
  ev('S.nextFail=S.nextEvent=1e9;dayTick()');
  const daily = c0 - ev('S.cash');
  assert.ok(daily < 2e4, 'a new game gets no credit');
  // The same network from a save that predates the scale, carrying a downstream ISP on an old contract: its traffic
  // now costs ten times as much in transit while its rate stays. (Broadband alone comes out ahead: no credit.)
  assert.equal(ev("(()=>{const x=JSON.parse(JSON.stringify(S));delete x.px;S=migrate(x);compute();return pxCredit();})()"), 0, 'broadband alone is better off');
  ev("const x=JSON.parse(JSON.stringify(S));delete x.px;delete x.pxOld;x.biz.push({id:'w',city:'fra',city2:null,name:'Wholesale',type:'isp',bw:300,rate:15,reqs:[],mood:100,since:0});S=migrate(x);compute()");
  assert.equal(ev('S.pxOld'), 1);
  const owed = ev('pxCredit()'), c1 = ev('S.cash');
  assert.ok(owed > 5000, `six months of the difference (${owed})`);
  ev("window.__g=-1;const _p=pxCredit;pxCredit=()=>(window.__g=_p());dayTick()");
  const paid = ev('__g');
  assert.ok(paid > 5000 && Math.abs(paid - owed) < owed * 0.2, `credited on the next day (${paid})`);
  assert.ok(ev('S.cash') - c1 > paid - daily - 1000, 'into the cash');
  assert.equal(ev('S.pxOld'), 0);
  const c2 = ev('S.cash');
  ev('dayTick()');
  assert.ok(ev('S.cash') < c2 + 1000, 'and only once');
  // Saves keep the flags sane.
  ev("const y=JSON.parse(JSON.stringify(S));y.pxOld='x';S=migrate(y)");
  assert.equal(ev('S.pxOld'), 0);
  assert.deepEqual(errors, []);
});

test('transit in Frankfurt is at real prices, and an exchange port pays for itself in tens of Gbps', () => {
  const { ev, errors } = load();
  ev('ACT.start({})');
  assert.ok(ev("transitPerG(NET.cog,'fra',false)") >= 25 && ev("transitPerG(NET.lvl,'fra',false)") <= 100, 'Cogentle about $30, a tier 1 under $100');
  // A 100G port at the exchange plus its patch, against what the same Gbps cost over the cheapest transit.
  const even = ev("(ixPortMo('fra',1)+xcMo('fra'))/transitPerG(NET.cog,'fra',false)");
  assert.ok(even > 25 && even < 50, `${Math.round(even)} Gbps`);
  assert.deepEqual(errors, []);
});

test('IP customers pay on their city’s transit market, and above it', () => {
  const { ev, errors } = load();
  ev('ACT.start({})');
  assert.equal(ev("ipMkt('fra')"), 1);
  assert.ok(ev("ipMkt('jnb')") > 2 && ev("ipMkt('syd')") > 2, 'Johannesburg and Sydney transit is dear, and so is what you sell there');
  for (const c of ['fra', 'jnb', 'syd']) {
    const r = ev(`ipRate(BIZ_T.isp,800,'${c}')`), t = ev(`Math.min(...NETS.filter(n=>sellsAt(n,'${c}')).map(n=>transitPerG(n,'${c}',false)))`);
    assert.ok(r > t, `a downstream ISP in ${c} pays $${r} against $${Math.round(t)} of transit`);
  }
  assert.deepEqual(errors, []);
});
