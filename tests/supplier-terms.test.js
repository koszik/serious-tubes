// Supplier contract terms: waves, fabric circuits, transit and exchange ports are leased on a rolling month (3× the
// price and install), a year (list) or three years (0.75×, no install); leaving a term early pays out the months left;
// the price still follows the market; purchases from before terms keep their price and leave free.
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');

function net(ev) {
  ev("ACT.start({});if(UI.pendGame)ACT.pitchSkip();S.cash=1e9;S.lvl=6;S.nextFail=S.nextEvent=1e9;for(const g of GOALS)S.done[g.id]=0;S.pops.fra.rgen=RG_TOP;ACT.buildPop({city:'ams'});S.pops.ams.rgen=RG_TOP;compute()");
}
const wave = (ev, term) => ev(`(()=>{const n=S.links.length;UI.pending={a:'fra',b:'ams'};UI.via=null;UI.route=null;openLinkModal('fra','ams');ACT.buildLink({tier:1,term:'${term}'});closeModal();return S.links.length>n?S.links[S.links.length-1].id:null;})()`);

test('a wave costs 3× month to month, list for a year, 0.75× for three, with the install to match', () => {
  const { ev, errors } = load();
  net(ev);
  const base = ev("Math.round(waveMo(kmBetween('fra','ams'),false,1)*waveRoute('fra','ams',1,false).wm)");
  const got = {};
  for (const k of ['m', 'y1', 'y3']) {
    const cash = ev('S.cash');
    const id = wave(ev, k);
    assert.ok(id, `a ${k} wave`);
    got[k] = { mo: ev(`S.links.find(l=>l.id==='${id}').mo`), paid: cash - ev('S.cash'), end: ev(`S.links.find(l=>l.id==='${id}').tEnd-S.day`) };
    ev(`S.links=S.links.filter(l=>l.id!=='${id}');compute()`);
  }
  assert.equal(got.m.mo, base * 3);
  assert.equal(got.y1.mo, base);
  assert.equal(got.y3.mo, Math.round(base * 0.75));
  assert.ok(got.m.paid > got.y1.paid && got.y1.paid > got.y3.paid, JSON.stringify(got));
  assert.equal(got.y1.end, 360);
  assert.equal(got.y3.end, 1080);
  assert.deepEqual(errors, []);
});

test('leaving a term early pays the months left; a rolling month and an ended term leave free', () => {
  const { ev, errors } = load();
  net(ev);
  const id = wave(ev, 'y1');
  const mo = ev(`S.links.find(l=>l.id==='${id}').mo`);
  ev('S.day+=95');
  assert.equal(ev(`supLeft(S.links.find(l=>l.id==='${id}'))`), 9);
  let cash = ev('S.cash');
  ev(`ACT.rmLink({id:'${id}'})`);
  assert.match(ev('document.body.textContent'), new RegExp('Really cancel\\? Pay'), 'the confirm step names the fee');
  ev(`ACT.rmLink({id:'${id}'})`);
  assert.equal(cash - ev('S.cash'), 9 * mo, 'nine months paid out');
  // Rolling: free.
  const r = wave(ev, 'm');
  cash = ev('S.cash');
  ev(`ACT.rmLink({id:'${r}'});ACT.rmLink({id:'${r}'})`);
  assert.equal(ev('S.cash'), cash);
  // A year that has run out: free.
  const e = wave(ev, 'y1');
  ev('S.day+=400');
  cash = ev('S.cash');
  ev(`ACT.rmLink({id:'${e}'});ACT.rmLink({id:'${e}'})`);
  assert.equal(ev('S.cash'), cash);
  assert.deepEqual(errors, []);
});

test('transit: the term scales the port and the Gbps, follows the market down, and pays out a LAG member', () => {
  const { ev, errors } = load();
  net(ev);
  ev("ACT.buyTransit({city:'fra',net:'cog',tier:2,term:'y3'});ACT.buyTransit({city:'ams',net:'cog',tier:2,term:'y1'});compute()");
  const y3 = ev("(()=>{const t=S.transit.find(x=>x.city==='fra');return transitMo(t,0);})()");
  const list = ev("(()=>{const t=S.transit.find(x=>x.city==='fra');return transitMo({...t,term:undefined},0);})()");
  assert.ok(Math.abs(y3 - list * 0.75) < 1, `three years is a quarter off (${y3} vs ${list})`);
  ev('S.day+=365');
  const later = ev("(()=>{const t=S.transit.find(x=>x.city==='fra');return transitMo(t,0);})()");
  assert.ok(later < y3 * 0.9, `and still gets cheaper with the market (${later} from ${y3})`);
  // A LAG member removed early pays out its share.
  ev("ACT.lagT({id:S.transit.find(x=>x.city==='ams').id,d:1})");
  const cash = ev('S.cash');
  ev("ACT.lagT({id:S.transit.find(x=>x.city==='ams').id,d:-1})");
  assert.equal(ev('S.cash'), cash, 'its year has run out: free');
  ev("S.transit.find(x=>x.city==='ams').tEnd=S.day+200;ACT.lagT({id:S.transit.find(x=>x.city==='ams').id,d:1})");
  const c2 = ev('S.cash');
  ev("ACT.lagT({id:S.transit.find(x=>x.city==='ams').id,d:-1})");
  assert.ok(c2 - ev('S.cash') > 0, 'within its year: paid out');
  assert.deepEqual(errors, []);
});

test('an upgrade keeps the end date; signing a longer term reprices from today', () => {
  const { ev, errors } = load();
  net(ev);
  const id = wave(ev, 'y1');
  const end = ev(`S.links.find(l=>l.id==='${id}').tEnd`);
  ev(`S.day+=30;ACT.upLink({id:'${id}',tier:2})`);
  const l = JSON.parse(ev(`JSON.stringify(S.links.find(l=>l.id==='${id}'))`));
  assert.equal(l.tier, 2);
  assert.equal(l.tEnd, end, 'co-terminous');
  assert.equal(l.mo, ev('Math.round(waveMo(kmBetween("fra","ams"),false,2)*' + l.mult + ')'));
  ev(`ACT.supTerm({kind:'link',id:'${id}',term:'y3'})`);
  const l3 = JSON.parse(ev(`JSON.stringify(S.links.find(l=>l.id==='${id}'))`));
  assert.equal(l3.term, 'y3');
  assert.equal(l3.tEnd, ev('S.day') + 1080);
  assert.equal(l3.mo, Math.round(l.mo * 0.75));
  ev(`ACT.supTerm({kind:'link',id:'${id}',term:'y1'})`);
  assert.equal(ev(`S.links.find(l=>l.id==='${id}').term`), 'y3', 'a shorter term cannot replace a longer one');
  assert.deepEqual(errors, []);
});

test('exchange ports and closing a POP pay their terms out too', () => {
  const { ev, errors } = load();
  net(ev);
  ev("ACT.buyIx({city:'ams',tier:2,term:'y3'});compute()");
  assert.equal(ev("S.ixTerm.ams.term"), 'y3');
  const port = ev("ixPortMo('ams',2)");
  assert.equal(ev("ixMo('ams')"), port * 0.75);
  ev("ACT.buyTransit({city:'ams',net:'cog',tier:2,term:'y1'});compute()");
  const im = JSON.parse(ev("JSON.stringify(decomImpact(['ams']))"));
  assert.ok(im.sup > port * 0.75 * 30, `the port's three years and the transit's year (${im.sup})`);
  const cash = ev('S.cash');
  ev("decommission(['ams'])");
  assert.ok(cash - ev('S.cash') >= im.sup);
  assert.equal(ev("S.ixTerm.ams"), undefined);
  assert.deepEqual(errors, []);
});

test('an old save keeps every price and leaves free; saved terms are checked', () => {
  const { ev, errors } = load();
  net(ev);
  const id = wave(ev, 'y1');
  ev("ACT.buyTransit({city:'fra',net:'cog',tier:2,term:'y3'});ACT.buyIx({city:'ams',tier:1,term:'y3'})");
  // Strip the terms, as a save from before them would be.
  ev(`(()=>{const x=JSON.parse(JSON.stringify(S));for(const l of x.links){delete l.term;delete l.tEnd;}for(const t of x.transit){delete t.term;delete t.tEnd;}delete x.ixTerm;S=migrate(x);compute();})()`);
  assert.equal(ev(`supMul(S.links.find(l=>l.id==='${id}'))`), 1);
  assert.equal(ev(`supLeft(S.links.find(l=>l.id==='${id}'))`), 0);
  assert.deepEqual(JSON.parse(ev('JSON.stringify(S.ixTerm)')), {});
  // Junk in a save is repaired.
  ev(`(()=>{const x=JSON.parse(JSON.stringify(S));x.links[0].term='forever';x.links[0].tEnd='x';x.transit[0].term='y1';x.transit[0].tEnd='nope';x.ixTerm={ams:{term:'y9'},zzz:{term:'y1',tEnd:5}};S=migrate(x);})()`);
  assert.equal(ev('S.links[0].term'), undefined);
  assert.equal(ev('S.transit[0].tEnd'), 0);
  assert.deepEqual(JSON.parse(ev('JSON.stringify(S.ixTerm)')), {});
  assert.deepEqual(errors, []);
});
