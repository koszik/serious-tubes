// Routing quality: each customer's round trip, in where the far network hands its traffic over and out where you send
// it, against a handoff in its own city; over its type's tolerance it loses happiness, and the NOC says what fixes it.
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');

// Frankfurt customers whose only way out is transit in Madrid, over a wave.
function far(ev) {
  ev("ACT.start({});S.cash=1e9;S.lvl=13;S.nextFail=S.nextEvent=1e9;for(const g of GOALS)S.done[g.id]=0;for(const c of ['fra','mad'])(S.pops[c]||ACT.buildPop({city:c}),S.pops[c].rgen=RG_TOP)");
  ev("UI.via=null;UI.lmode='wave';openLinkModal('fra','mad');ACT.buildLink({tier:2});closeModal();for(const l of S.links)l.ready=0;ACT.buyTransit({city:'mad',net:'cog',tier:2})");
  ev("S.biz.push({id:'g',city:'fra',city2:null,name:'Fragger',type:'game',bw:5,rate:100,reqs:[],mood:100,since:-99},{id:'d',city:'fra',city2:null,name:'Office',type:'isp',bw:100,rate:15,reqs:[],mood:100,since:-99});S.day=100;compute()");
}

test('a customer whose traffic goes through a far exit has extra round trip; a local exit removes it', () => {
  const { ev, errors } = load();
  far(ev);
  const q = JSON.parse(ev('JSON.stringify(R.rq.g)'));
  assert.ok(q.ms > 10, `${q.ms} ms extra`);
  assert.equal(q.outC, 'mad');
  ev("ACT.buyTransit({city:'fra',net:'cog',tier:2});compute()");
  assert.ok(ev('R.rq.g.ms') < q.ms / 3, 'local transit fixes most of it');
  assert.deepEqual(errors, []);
});

test('only customers that care lose happiness, and the NOC says why', () => {
  const { ev, errors } = load();
  far(ev);
  const ms = ev('R.rq.g.ms');
  assert.ok(ms > ev('latTol("game")') && ev('R.rq.d.ms') < ev('latTol("isp")'), `${ms} ms: over a gamer’s 10; the ISP's ${ev('R.rq.d.ms')} is under its 50`);
  ev('for(let i=0;i<5;i++)dayTick()');
  assert.ok(ev("S.biz.find(b=>b.id==='g').mood") < 100, 'the game servers notice');
  assert.equal(ev("S.biz.find(b=>b.id==='d').mood"), 100, 'the downstream ISP does not');
  assert.match(ev("bizWhy(S.biz.find(b=>b.id==='g')).join(' ')"), /Fragger: traffic to .* \(\d+% of it\) takes \d+ ms longer than it needs/);
  ev("UI.left='noc';UI.leftOpen=true;renderLeft()");
  assert.match(ev("document.getElementById('left').textContent"), /Routing quality.*Fragger.*notices from 10 ms.*(Needs a connection nearer|Fixable with routing)/s);
  assert.deepEqual(errors, []);
});

test('the notice comes once, then not again within a month; saves keep the day', () => {
  const { ev, errors } = load();
  far(ev);
  ev('UI.toasts=[];rtqNotice(S.day)');
  const day = ev("S.biz.find(b=>b.id==='g').latW");
  assert.equal(day, ev('S.day'));
  ev('S.day+=10;rtqNotice(S.day)');
  assert.equal(ev("S.biz.find(b=>b.id==='g').latW"), day, 'not again within 30 days');
  ev("const x=JSON.parse(JSON.stringify(S));x.biz[0].latW='x';S=migrate(x)");
  assert.equal(ev('S.biz[0].latW'), 0);
  assert.deepEqual(errors, []);
});

test('a single-city build hands everything off locally: no extra round trip', () => {
  const { ev, errors } = load();
  ev("ACT.start({});S.cash=1e9;S.lvl=13;S.pops.fra.rgen=RG_TOP;ACT.launchBB({city:'fra'});ACT.buyTransit({city:'fra',net:'cog',tier:1});S.biz.push({id:'g',city:'fra',city2:null,name:'G',type:'game',bw:10,rate:100,reqs:[],mood:100,since:0});compute()");
  assert.ok(ev('R.rq.g.ms') < 1 && ev('R.rqC.fra.ms') < 1);
  assert.deepEqual(errors, []);
});

// Istanbul, London and Paris served by a NetChill cache in Los Angeles: a slow far network is judged on its own,
// not averaged away with the traffic that leaves at home, and the warning names the flows behind it.
test('one far network served from a distant cache is flagged in every city it slows, and listed', () => {
  const { ev, errors } = load();
  ev("ACT.start({});S.cash=1e9;S.lvl=13;S.nextFail=S.nextEvent=1e9;for(const g of GOALS)S.done[g.id]=0;for(const c of ['ist','lon','par','nyc','lax'])(S.pops[c]||ACT.buildPop({city:c}),S.pops[c].rgen=RG_TOP)");
  ev("UI.lmode='wave';UI.via=null;for(const [a,b] of [['ist','par'],['par','lon'],['nyc','lax']]){openLinkModal(a,b);ACT.buildLink({tier:3});closeModal()};UI.via='hibx';openLinkModal('lon','nyc');ACT.buildLink({tier:3});closeModal();UI.via=null;for(const l of S.links)l.ready=0");
  ev("for(const c of ['ist','lon','par'])ACT.launchBB({city:c}),S.pops[c].bb.d=100;for(const c of ['ist','lon','par','lax'])ACT.buyTransit({city:c,net:'cog',tier:3});S.day=100;R.demTo.nfx=99;ACT.cache({city:'lax',net:'nfx'});compute()");
  for (const c of ['ist', 'lon', 'par']) {
    const q = JSON.parse(ev(`JSON.stringify(R.rqC.${c})`));
    assert.equal(q.net, 'nfx', c);
    assert.ok(q.rt >= q.ms - 1e-9, `${c}: the round trip includes the extra`);
    assert.ok(q.ms > 80 && q.share > 0.1 && q.share < 0.3, `${c}: NetChill's own ${Math.round(q.ms)} ms on ${Math.round(q.share * 100)}% of the traffic`);
  }
  ev("UI.left='noc';UI.leftOpen=true;renderLeft()");
  const noc = ev("document.getElementById('left').textContent");
  for (const c of ['Istanbul', 'London', 'Paris']) assert.match(noc, new RegExp(`${c}: traffic from NetChill \\(\\d+% of it\\) takes \\d+ ms longer than it needs, served from your cache in Los Angeles`));
  assert.doesNotMatch(noc, /out at \./);
  // The warning chip opens the flows behind it.
  ev("selectCity('ist');ACT.latOpen({city:'ist'})");
  assert.match(ev("document.querySelector('.ph').textContent"), /slow routes, up to \+\d+ ms.*NetChill: \d+% of the traffic, \d+ ms round trip \(\+\d+ ms\), from your cache in Los Angeles/s);
  // The chip, the list and the NOC give the same numbers: the traffic-weighted extra for each network.
  assert.match(ev("document.querySelector('.ph').textContent"), new RegExp(`up to \\+${Math.round(ev('R.rqC.ist.ms'))} ms`));
  ev("ACT.latOpen({city:'ist'})");
  assert.equal(ev("!!document.querySelector('.ph .latflows')"), false, 'and closes it again');
  assert.deepEqual(errors, []);
});

test('a slow-routes warning from many small networks lists them instead of nothing', () => {
  const { ev, errors } = load();
  ev("ACT.start({});if(UI.pendGame)ACT.pitchSkip();compute()");
  const li = ev("(()=>{R.rqC.fra={ms:0,flows:[]};R.latFar.fra={to:'ams',k:'t',g:5,ms:83,rt:90,share:0.04};return latFlows('fra');})()");
  assert.match(li, /Many small networks: 4% of the traffic, 90 ms round trip \(\+83 ms\), handed over in Amsterdam/);
  assert.deepEqual(errors, []);
});
