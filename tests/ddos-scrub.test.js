// Flowspec first, scrubbing for what the edge cannot take: a diversion moves the target's inbound traffic to the
// centers (announced there) instead of hauling it twice; a center that is down pulls nothing; the card reports what
// the attack itself did, against the target's service just before it.
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');

function net(ev, setup = '') {
  ev("ACT.start({});S.cash=1e9;S.lvl=13;S.nextFail=S.nextEvent=1e9;for(const g of GOALS)S.done[g.id]=0;S.pops.fra.rgen=RG_TOP;ACT.launchBB({city:'fra'});S.pops.fra.bb.d=100;ACT.buyTransit({city:'fra',net:'cog',tier:2});ACT.buildPop({city:'ams'});S.pops.ams.rgen=RG_TOP;ACT.buyTransit({city:'ams',net:'ntt',tier:2})");
  ev("UI.via=null;UI.lmode='wave';openLinkModal('fra','ams');ACT.buildLink({tier:2});closeModal();for(const l of S.links)l.ready=0;S.day=60;compute()");
  ev(setup + ';compute()');
}
const attack = (ev, vec, g, tgt = "'bb:fra'") => ev(`S.ev.ddos={id:'x',city:'fra',tgt:${tgt},vec:'${vec}',gbps:${g},until:S.day+2,bh:false,start:S.day,carpet:false,sf0:ddosBase('fra',${tgt})};compute()`);
const rep = (ev) => JSON.parse(ev("(()=>{const m=ddosReport(S.ev.ddos);return JSON.stringify({edge:m.edge,why:m.why&&m.why.k,eng:m.eng,pulled:m.pulled,cleaned:m.cleaned,fs:m.fs});})()"));
const card = (ev) => ev("ddosOne(S.ev.ddos).replace(/<[^>]+>/g,' ').replace(/\\s+/g,' ')");
const use = (ev, c) => ev(`R.useT[S.transit.find(t=>t.city==='${c}').id]||0`);

test('a flood Flowspec can filter is dropped at the edge, and the center is not engaged', () => {
  const { ev, errors } = load();
  net(ev, "ACT.buildScrub({city:'ams',tier:1})");
  attack(ev, 'dns', 20);
  const m = rep(ev);
  assert.equal(m.edge, true);
  assert.equal(m.pulled, 0);
  assert.ok(m.fs > 15, 'Flowspec dropped it');
  assert.match(card(ev), /Flowspec drops .* Scrubbing not needed: the edge filtered it/);
  assert.deepEqual(errors, []);
});

test('what the edge cannot take goes to scrubbing, and the card says why', () => {
  for (const [label, setup, vec, why, line] of [
    ['no signature', '', 'ack', 'sig', /no signature for ACK flood/],
    ['no Flowspec router', 'S.pops.fra.rgen=0;S.pops.ams.rgen=0', 'dns', 'router', /No Flowspec router in (Frankfurt|Amsterdam)/],
    ['a port would fill', "for(const t of S.transit)t.tier=0", 'dns', 'port', /would fill a port in/],
  ]) {
    const { ev, errors } = load();
    net(ev, "ACT.buildScrub({city:'ams',tier:1});" + setup);
    attack(ev, vec, label === 'a port would fill' ? 40 : 20);
    const m = rep(ev);
    assert.equal(m.edge, false, label);
    assert.equal(m.why, why, label);
    assert.ok(m.pulled > 0 && Math.abs(m.cleaned - m.pulled) < 1e-6, `${label}: scrubbed`);
    assert.match(card(ev), line, label);
    assert.deepEqual(errors, []);
  }
});

test('a diversion moves the target’s inbound traffic to the center: carried once, not twice', () => {
  const { ev, errors } = load();
  net(ev, "ACT.buildScrub({city:'ams',tier:1})");
  const fra0 = use(ev, 'fra'), ams0 = use(ev, 'ams');
  attack(ev, 'ack', 20);
  assert.ok(use(ev, 'fra') < fra0 * 0.3, `Frankfurt’s own transit carries little of it now (${use(ev, 'fra')} from ${fra0})`);
  assert.ok(use(ev, 'ams') > ams0 + fra0 * 0.7, 'it comes in at Amsterdam, where the center announces it');
  const wave = ev("R.load[S.links[0].id]||0");
  assert.ok(wave < fra0 * 1.3, `the wave home carries it once (${wave})`);
  assert.equal(ev('(R.haul||[]).every(q=>q.h===1)'), true);
  assert.match(card(ev), /detour via Amsterdam/);
  assert.deepEqual(errors, []);
});

test('a diverted business customer moves alone: its neighbours keep their own way in', () => {
  const { ev, errors } = load();
  net(ev, "ACT.buildScrub({city:'ams',tier:1});S.biz.push({id:'a',city:'fra',city2:null,name:'A',type:'host',bw:20,rate:60,reqs:[],mood:100,since:0},{id:'b',city:'fra',city2:null,name:'B',type:'host',bw:20,rate:60,reqs:[],mood:100,since:0})");
  attack(ev, 'ack', 10, "'a'");
  const groups = JSON.parse(ev("JSON.stringify(R.dp.epM.map((m,i)=>[m,R.dp.epCity[i]]).filter(x=>x[0]&&(x[0].includes('a')||x[0].includes('b'))))"));
  assert.ok(groups.some(([m]) => m.length === 1 && m[0] === 'a'), 'the target has an endpoint of its own');
  assert.ok(groups.some(([m]) => m.includes('b') && !m.includes('a')), 'its neighbour stays where it was');
  assert.deepEqual(errors, []);
});

test('a center that is down pulls nothing: the flood takes the normal path', () => {
  const { ev, errors } = load();
  net(ev, "ACT.buildScrub({city:'ams',tier:1});S.pops.ams.down=S.day+5");
  attack(ev, 'ack', 20);
  const m = rep(ev);
  assert.deepEqual([m.eng, m.pulled], [0, 0]);
  assert.ok(ev('ddosHit(S.ev.ddos)') > 0.9, 'not dark');
  assert.match(card(ev), /Scrubbing center down \(Amsterdam\): the flood takes the normal path/);
  assert.deepEqual(errors, []);
});

test('the card judges the attack, not a city already short of capacity; so does the DDoS SLA', () => {
  const { ev, errors } = load();
  net(ev, "ACT.buildScrub({city:'ams',tier:1});S.biz.push({id:'p',city:'fra',city2:null,name:'Protected',type:'scrub',bw:5,rate:900,reqs:[],mood:100,since:0})");
  attack(ev, 'ack', 10, "'p'");
  ev("S.ev.ddos.sf0=0.6");
  ev("const f=bizSfOf;bizSfOf=()=>0.6;window.__f=f");
  assert.ok(ev('ddosSf(S.ev.ddos)') < 0.7 && ev('ddosHit(S.ev.ddos)') > 0.97, 'the city is at 60%, the attack cost nothing');
  assert.match(card(ev), /Held: nobody notices .*Protected was already at 60% before the attack/);
  // The day's DDoS-protection SLA check pays out on ddosHit, not on the city's service.
  const cash = ev('S.cash'), d = ev('S.day');
  ev('dayTick()');
  assert.ok(ev(`S.cash>${cash}-SLA_PEN+1`) && ev("!(S.ev.ddos&&(S.ev.ddos.sla||[]).includes('p'))"), 'no DDoS SLA penalty for congestion it already had');
  assert.ok(d >= 0);
  ev("bizSfOf=window.__f");
  // Saves: the baseline is kept and checked.
  ev("const x=JSON.parse(JSON.stringify(S));x.ev.ddos.sf0='x';S=migrate(x)");
  assert.equal(ev('S.ev.ddos.sf0'), 1);
  assert.deepEqual(errors, []);
});
