// The looking glass (show route, both ways) and the flows window for links and ports.
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');

function net(ev) {
  ev("ACT.start({});S.cash=1e10;S.lvl=13;S.nextFail=S.nextEvent=1e9;for(const g of GOALS)S.done[g.id]=0;S.pops.fra.rgen=RG_TOP;ACT.launchBB({city:'fra'});S.pops.fra.bb.d=200");
  ev("ACT.buildPop({city:'ams'});S.pops.ams.rgen=RG_TOP;UI.via=null;UI.lmode='wave';openLinkModal('fra','ams');ACT.buildLink({tier:2});closeModal()");
  ev("ACT.buyTransit({city:'fra',net:'cog',tier:2});ACT.buyTransit({city:'ams',net:'lvl',tier:2});S.pni.push({id:'pg',net:'ggl',city:'ams',tier:1,ready:0});ACT.buyIx({city:'ams',tier:2,signed:true});ACT.rs({city:'ams'});compute()");
}

test('show route: every route, best first, with what decided each, and the way back in', () => {
  const { ev, errors } = load();
  net(ev);
  const L = JSON.parse(ev("JSON.stringify((({out,inb,used})=>({out:out.map(r=>[r.e.k,r.e.city,r.lp,r.as,r.why,r.path.join(' ')]),inb:inb.map(r=>[r.e.k,r.why]),used}))(engLookingGlass('fra','ggl')))"));
  assert.deepEqual(L.out[0].slice(0, 5), ['p', 'ams', 100, 1, 'best'], 'the PNI: one AS hop, even across the backbone');
  assert.ok(L.out.slice(1).every((r) => r[4] !== 'best'), 'one best path');
  assert.ok(L.out.some((r) => r[0] === 't' && r[4] === 'as'), 'transit loses on AS path');
  assert.match(L.out[0][5], /^AS\d+ AS15169$|^AS\d+ AS\d+$/, 'the AS path, from you');
  assert.equal(L.used.k, 'p', 'it is what routing uses');
  assert.equal(L.inb[0][1], 'inbest', 'and the way back in');
  // Local-pref on transit: now transit wins, and the PNI says why it lost.
  ev("ACT.polRuleAdd({m:'from:transit',at:'x:*:in',act:'lp',n:300})");
  const W = JSON.parse(ev("JSON.stringify(engLookingGlass('fra','ggl').out.map(r=>[r.e.k,r.why]))"));
  assert.equal(W[0][0], 't');
  assert.deepEqual(W.find((r) => r[0] === 'p'), ['p', 'lp']);
  ev("ACT.lg({city:'fra',net:'ggl'})");
  const txt = ev("document.getElementById('modalCard').textContent");
  assert.match(txt, /show route/);
  assert.match(txt, /lower local-pref/);
  assert.match(txt, /How Goggle sends traffic to Frankfurt/);
  assert.deepEqual(errors, []);
});

test('the looking glass agrees with routing for every network it reaches', () => {
  const { ev, errors } = load();
  net(ev);
  const bad = ev(`NETS.filter(n=>{const L=engLookingGlass('fra',n.id);if(!L||!L.used)return false;const b=L.out.find(r=>r.why==='best');return !b||b.e.k!==L.used.k||String(b.e.id)!==String(L.used.id);}).map(n=>n.id).join()`);
  assert.equal(bad, '');
  assert.deepEqual(errors, []);
});

test('every flow on a link or a port: far end, the port it crosses, the endpoint, and it adds up', () => {
  const { ev, errors, dom } = load();
  net(ev);
  // A link: what each flow puts on each direction adds up to what the pipe is offered at that hour.
  const r = JSON.parse(ev(`(()=>{const l=S.links[0],p=pipeOfLink(l),F=engFlowRows(R.dp,p);const s=[0,0];for(const x of F.rows)s[x.p]+=x.g;
    return JSON.stringify({s,off:p.map(q=>pipeAt(q,F.h).off),n:F.rows.length,dirs:[...new Set(F.rows.map(x=>x.dir))]});})()`));
  assert.ok(r.n > 10, `${r.n} flows`);
  for (let i = 0; i < 2; i++) assert.ok(Math.abs(r.s[i] - r.off[i]) < 1e-6 * (1 + r.off[i]), `pipe ${i}: ${r.s[i]} of ${r.off[i]}`);
  assert.deepEqual(r.dirs.sort(), ['in', 'out']);
  dom.window.innerWidth = 360;
  ev("selectLink(S.links[0].id)");
  assert.match(ev("document.getElementById('panelBody').textContent"), /See every flow/);
  ev("ACT.flowsOpen({k:'link',id:S.links[0].id})");
  let txt = ev("document.getElementById('modalCard').textContent");
  assert.match(txt, /Every flow/);
  assert.match(txt, /→ .* → /, 'from, through, to');
  ev("ACT.flowsSet({p:1})");
  assert.ok(ev("[...document.querySelectorAll('#modalCard .row .meta')].every(m=>m.textContent.startsWith('Amsterdam → Frankfurt'))"), 'one direction');
  // A transit port: what comes in there and what leaves.
  ev("ACT.flowsOpen({k:'t',id:S.transit[0].id})");
  txt = ev("document.getElementById('modalCard').textContent");
  assert.match(txt, /In \(rx\)/);
  assert.match(txt, /Cogentle transit · Frankfurt/);
  assert.ok(ev("[...document.querySelectorAll('#modalCard .row')].length") > 5);
  assert.deepEqual(errors, []);
});
