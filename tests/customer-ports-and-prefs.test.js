// Customers take router ports and show in Connections; a port's Prefer / Backup and the Routing window's rules are one
// setting (rules in S.pol), shown with the local-pref they set.
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');

function net(ev) {
  ev("ACT.start({});S.cash=1e10;S.lvl=13;S.nextFail=S.nextEvent=1e9;for(const g of GOALS)S.done[g.id]=0;S.pops.fra.rgen=RG_TOP;ACT.launchBB({city:'fra'});S.pops.fra.bb.d=100");
  ev("ACT.buyTransit({city:'fra',net:'cog',tier:2});ACT.buyTransit({city:'fra',net:'lvl',tier:2});compute()");
}
const rules = (ev) => JSON.parse(ev("JSON.stringify(S.pol.rules.map(r=>[r.m,r.at,r.act,r.n]))"));

test('Prefer and Backup on a port are rules the Routing window shows, and its numbers show on the port', () => {
  const { ev, errors } = load();
  net(ev);
  const t = ev('S.transit[0].id');
  ev(`ACT.setPref({kind:'t',id:'${t}',v:'high'})`);
  assert.deepEqual(rules(ev), [['*', `x:t:${t}:in`, 'lp', 150]]);
  assert.equal(ev('S.transit[0].pref'), undefined, 'nothing kept on the port itself');
  assert.equal(ev(`engLookingGlass('fra','ggl').out.find(r=>r.e.id==='${t}').lp`), 150);
  ev(`ACT.setPref({kind:'t',id:'${t}',v:'low'})`);
  assert.deepEqual(rules(ev), [['*', `x:t:${t}:in`, 'lp', 20], ['*', `x:t:${t}:out`, 'prepend', 3]]);
  // The Routing window sets any number: the port reads it back.
  ev(`S.pol.rules[0].n=300;after();selectCity('fra');ACT.tab({t:'up'})`);
  assert.equal(ev(`exPref('t','${t}')`), 'high');
  assert.match(ev("document.getElementById('panelBody').textContent"), /local-pref 300/);
  ev(`ACT.setPref({kind:'t',id:'${t}',v:'normal'})`);
  assert.deepEqual(rules(ev), []);
  // Prefer lands above what the network's port-wide rules give, so it wins.
  ev("S.pol.rules.push({id:'r50',m:'from:pni',at:'x:*:in',act:'lp',n:200})");
  ev(`ACT.setPref({kind:'t',id:'${t}',v:'high'})`);
  assert.equal(ev(`portPref('t:${t}').lp`), 250);
  assert.deepEqual(errors, []);
});

test('an old save’s Prefer and Backup become rules when it loads', () => {
  const { ev, errors } = load();
  net(ev);
  ev("ACT.buyIx({city:'fra',tier:1,signed:true})");
  ev("const s=JSON.parse(JSON.stringify(S));s.transit[0].pref='high';s.transit[1].pref='low';s.ixPref={fra:'low'};S=migrate(s);compute()");
  assert.equal(ev("exPref('t',S.transit[0].id)"), 'high');
  assert.equal(ev("exPref('t',S.transit[1].id)"), 'low');
  assert.equal(ev("exPref('ix','fra')"), 'low');
  assert.equal(ev("S.transit.some(t=>'pref' in t)||Object.keys(S.ixPref).length>0"), false);
  assert.ok(ev(`polSanitize(S.pol).rules.length`) === ev('S.pol.rules.length'), 'and they survive sanitize');
  assert.deepEqual(errors, []);
});

test('customers take router ports at every site, and a full router turns an offer away', () => {
  const { ev, errors } = load();
  net(ev);
  const u0 = ev("portsUsed('fra')");
  ev("S.biz.push({id:'b1',type:'dia',name:'Small Co',city:'fra',bw:5,rate:100,mood:100,since:0,reqs:[]},{id:'b2',type:'host',name:'Big Host',city:'fra',bw:400,rate:100,mood:100,since:0,reqs:[]})");
  const pg = ev("portG(S.pops.fra.rgen||0)");
  assert.equal(ev("portsUsed('fra')"), u0 + 0.25 + Math.ceil(400 / pg), 'a breakout for 10G and below, whole ports above');
  // A circuit takes a port at both ends.
  ev("ACT.buildPop({city:'ams'});S.biz.push({id:'c1',type:'l2vpn',name:'Wire',city:'fra',city2:'ams',bw:40,rate:100,mood:100,since:0,reqs:[],route:'normal'})");
  assert.ok(ev("bizPorts(S.biz.find(b=>b.id==='c1'),'ams')") >= 1);
  // Fill the router: the next offer cannot sign.
  ev("S.pops.fra.routers=1;const m=portsMax('fra');while(portsUsed('fra')<m)S.biz.push({id:uid(),type:'dia',name:'Filler',city:'fra',bw:5,rate:1,mood:100,since:0,reqs:[]})");
  ev("S.offers.push({id:'o1',type:'dia',name:'Late Co',city:'fra',bw:20,rate:100,reqs:[],exp:S.day+30});ACT.accept({id:'o1'})");
  assert.equal(ev("S.biz.some(b=>b.name==='Late Co')"), false);
  assert.equal(ev("S.offers.some(o=>o.id==='o1')"), true, 'the offer waits');
  assert.deepEqual(errors, []);
});

test('customers show in Connections with their port, what they carry each way and what they bring in', () => {
  const { ev, errors } = load();
  net(ev);
  ev("S.biz.push({id:'b2',type:'host',name:'Big Host',city:'fra',bw:100,rate:100,mood:100,since:0,reqs:[]});compute()");
  const r = JSON.parse(ev("JSON.stringify(conns().find(r=>r.k==='b'))"));
  assert.equal(r.name, 'Big Host');
  assert.equal(r.cap, 100);
  assert.ok(r.q.rx > r.q.tx, 'a host sends more than it gets');
  assert.ok(r.rev && r.mo > 0);
  ev("ACT.dash();ACT.dashTab({k:'conn'});ACT.connF({f:'k',v:'b'})");
  const txt = ev("document.getElementById('dash').textContent");
  assert.match(txt, /Big Host/);
  assert.match(txt, /\+\$/);
  ev("ACT.goConn({city:'fra',k:'b'})");
  assert.equal(ev('UI.tab'), 'cust');
  assert.deepEqual(errors, []);
});
