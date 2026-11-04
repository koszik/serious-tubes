// Every port shows both directions on one line with its loss, and folds out its day and every flow: transit, PNIs,
// exchanges, a network's cache boxes together, and each customer's own port. Ports running hot say which way and the loss.
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');

function net(ev) {
  ev("ACT.start({});S.cash=1e10;S.lvl=13;S.nextFail=S.nextEvent=1e9;for(const g of GOALS)S.done[g.id]=0;S.pops.fra.rgen=RG_TOP;ACT.launchBB({city:'fra'});S.pops.fra.bb.d=300");
  ev("ACT.buyTransit({city:'fra',net:'cog',tier:2});ACT.buyIx({city:'fra',tier:2,signed:true});ACT.rs({city:'fra'})");
  ev("S.caches.push({id:'c1',city:'fra',net:'nfx',site:'a'},{id:'c2',city:'fra',net:'nfx',site:'a'})");
  ev("S.biz.push({id:'h1',type:'host',name:'Webby',city:'fra',bw:40,rate:100,mood:100,since:0,reqs:[]},{id:'h2',type:'host',name:'Pagey',city:'fra',bw:10,rate:100,mood:100,since:0,reqs:[]},{id:'d1',type:'dia',name:'Officey',city:'fra',bw:20,rate:100,mood:100,since:0,reqs:[]});compute()");
}
const panel = (ev) => ev("document.getElementById('panelBody').textContent");

test('a transit port folds out its day and its flows; folded, it is one line and two thin bars', () => {
  const { ev, errors, dom } = load();
  net(ev);
  dom.window.innerWidth = 360;
  ev("selectCity('fra');ACT.tab({t:'up'})");
  const t = ev('S.transit[0].id');
  assert.match(panel(ev), /↓ .* · ↑ /);
  assert.match(panel(ev), /Today and every flow/);
  assert.doesNotMatch(panel(ev), /See every flow/, 'folded away');
  assert.ok(ev("document.querySelectorAll('#panelBody .bar2').length") >= 1);
  ev(`ACT.pipeFold({key:'t:${t}'})`);
  assert.match(panel(ev), /See every flow/);
  assert.ok(ev("document.querySelectorAll('#panelBody svg.g24').length") >= 1, 'the day chart');
  assert.deepEqual(errors, []);
});

test('a network’s cache boxes show as one port, and their flows add up to the boxes’ pipes', () => {
  const { ev, errors } = load();
  net(ev);
  ev("selectCity('fra');ACT.tab({t:'peer'});ACT.pipeFold({key:'cg:fra|nfx'})");
  assert.match(panel(ev), /See every flow/);
  const r = JSON.parse(ev(`(()=>{const ps=['c1','c2'].map(id=>pipeOfExit('c',id)),F=flowsWhat('cg','fra|nfx').rows(20),s=[0,0];for(const x of F.rows)s[x.p]+=x.g;
    return JSON.stringify({s,off:[0,1].map(k=>ps.reduce((a,p)=>a+pipeAt(p[k],20).off,0))});})()`));
  for (let i = 0; i < 2; i++) assert.ok(Math.abs(r.s[i] - r.off[i]) < 1e-6 * (1 + r.off[i]), JSON.stringify(r));
  ev("ACT.flowsOpen({k:'cg',id:'fra|nfx'})");
  assert.match(ev("document.getElementById('modalCard').textContent"), /Open Couch · Frankfurt/);
  assert.deepEqual(errors, []);
});

test('a customer’s own port: its share of its group, the day against its port, and its own flows', () => {
  const { ev, errors } = load();
  net(ev);
  const d = JSON.parse(ev("(()=>{const a=custDay(S.biz[0]),b=custDay(S.biz[1]);return JSON.stringify({a:[Math.max(...a.tx),Math.max(...a.rx)],b:[Math.max(...b.tx),Math.max(...b.rx)],sh:[a.sh,b.sh]});})()"));
  assert.ok(Math.abs(d.sh[0] - 0.8) < 1e-9 && Math.abs(d.sh[1] - 0.2) < 1e-9, 'shares go by port size');
  assert.ok(d.a[1] > d.a[0], 'a host sends more than it receives');
  assert.ok(d.a[1] <= 40 + 1e-9 && Math.abs(d.a[1] / d.b[1] - 4) < 1e-6, JSON.stringify(d));
  // Its flows at an hour add up to its day at that hour.
  const f = JSON.parse(ev("(()=>{const b=S.biz[0],D=custDay(b),F=custFlowRows(b,20),s=[0,0];for(const x of F.rows)s[x.p]+=x.g;return JSON.stringify({s,d:[D.rx[20],D.tx[20]],n:F.rows.length});})()"));
  for (let i = 0; i < 2; i++) assert.ok(Math.abs(f.s[i] - f.d[i]) < 1e-6 * (1 + f.d[i]), JSON.stringify(f));
  assert.ok(f.n > 5);
  ev("selectCity('fra');ACT.tab({t:'cust'})");
  ev("ACT.pipeFold({key:'b:h1'})");
  assert.match(panel(ev), /See every flow/);
  ev("ACT.flowsOpen({k:'b',id:'h1'})");
  const txt = ev("document.getElementById('modalCard').textContent");
  assert.match(txt, /Webby · Frankfurt/);
  assert.match(txt, /Out \(tx\)|In \(rx\)/);
  assert.deepEqual(errors, []);
});

test('ports running hot say which way and how much they drop, worst loss first', () => {
  const { ev, errors } = load();
  net(ev);
  ev("S.ixp={};S.rs={};S.caches=[];S.pops.fra.bb.d=800;compute()");
  const h = JSON.parse(ev("JSON.stringify(hotPorts().map(x=>({k:x.k,dir:x.dir,loss:x.loss})))"));
  const t = h.find((x) => x.k === 't');
  assert.ok(t, JSON.stringify(h));
  assert.equal(t.dir, 'rx', 'downloads fill the way in');
  assert.ok(t.loss > 0.1, `loss ${t.loss}`);
  ev("ACT.leftTab({t:'noc'})");
  assert.match(ev("document.getElementById('leftBody').textContent"), /In \(rx\) \d+% full · \d+% loss/);
  assert.deepEqual(errors, []);
});

test('the connections list and the traffic tab show each direction on its own', () => {
  const { ev, errors, dom } = load();
  net(ev);
  ev("ACT.dash();ACT.dashTab({k:'conn'})");
  const head = ev("[...document.querySelectorAll('#dash table.tbl thead th')].map(x=>x.textContent).join('|')");
  assert.match(head, /Capacity\|In \(rx\)\|Out \(tx\)/);
  const t = JSON.parse(ev("JSON.stringify(conns().find(r=>r.k==='t').q)"));
  const p = JSON.parse(ev("JSON.stringify(pipePeak(pipeOfExit('t',S.transit[0].id)))"));
  assert.deepEqual(t, p, 'the same numbers as the port itself');
  assert.ok(t.rx > t.tx, 'downloads');
  ev("ACT.connSort({k:'tx'})");
  assert.deepEqual(errors, []);
  // Traffic: what each network sends you and what you send it, at the peak hour; a host's audience pulls the other way.
  ev("ACT.dashTab({k:'traffic'})");
  assert.match(ev("[...document.querySelectorAll('#dash table.tbl thead th')].map(x=>x.textContent).join('|')"), /In \(rx\).*\|Out \(tx\)/);
  const io = JSON.parse(ev("(()=>{const N=engNetIO(R.dp);let i=0,o=0;for(let j=0;j<NETS.length;j++){i+=N.I[j];o+=N.O[j];}return JSON.stringify({i,o,cm:N.O[NETS.findIndex(n=>n.id==='cmc')]});})()"));
  assert.ok(io.i > io.o && io.o > 0, JSON.stringify(io));
  dom.window.innerWidth = 360;
  ev("ACT.dashTab({k:'conn'})");
  assert.match(ev("document.getElementById('dash').textContent"), /↓ .* · ↑ /);
  assert.deepEqual(errors, []);
});

test('the overview charts traffic by way in and by way out; Connections has each port’s preference', () => {
  const { ev, errors } = load();
  net(ev);
  ev('dayTick();dayTick();dayTick()');
  const g = JSON.parse(ev("JSON.stringify({i:R.egT,o:R.egO,h:S.hist[S.hist.length-1]})"));
  assert.ok(g.i.t > g.o.t && g.o.t > 0, 'more comes in over transit than goes out');
  assert.equal(g.h.ot, +g.o.t.toFixed(2), 'kept day by day');
  ev("ACT.dash()");
  const txt = ev("document.getElementById('dash').textContent");
  assert.match(txt, /Traffic by way in/);
  assert.match(txt, /Traffic by way out/);
  ev("ACT.dashTab({k:'conn'})");
  assert.match(ev("document.getElementById('dash').textContent"), /Prefer.*Normal.*Backup only/);
  const t = ev('S.transit[0].id');
  assert.ok(ev(`[...document.querySelectorAll('#dash [data-act="setPref"]')].some(b=>JSON.parse(b.dataset.args).id==='${t}')`));
  ev(`ACT.setPref({kind:'t',id:'${t}',v:'high'})`);
  assert.match(ev("document.getElementById('dash').textContent"), /local-pref 150/);
  assert.deepEqual(errors, []);
});
