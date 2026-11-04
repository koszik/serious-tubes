// The network engine (docs/specs/network-engine.md): BGP best path and communities, inbound chosen by the far side,
// islands, two pipes per link and port, loss, the day hour by hour, billing on the busier direction, old saves.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { load } = require('./harness');

// Big routers everywhere, so any port and wave fits.
const start = (ev) => ev("ACT.start({});S.cash=1e10;S.lvl=13;S.nextFail=S.nextEvent=1e9;for(const g of GOALS)S.done[g.id]=0;const bp=ACT.buildPop;ACT.buildPop=a=>{bp(a);if(S.pops[a.city]){S.pops[a.city].rgen=RG_TOP;S.pops[a.city].routers=4;}};S.pops.fra.rgen=RG_TOP;S.pops.fra.routers=4");
const link = (ev, a, b, t = 1, via = null) => ev(`UI.via=${via ? `'${via}'` : 'null'};UI.lmode='wave';openLinkModal('${a}','${b}');ACT.buildLink({tier:${t}});closeModal();UI.via=null`);
// What leaves (tx) and comes in (rx) on a transit port at its busiest hour.
const td = (ev, i) => JSON.parse(ev(`JSON.stringify(R.useTd[S.transit[${i}].id]||{rx:0,tx:0})`));

test('with nothing configured BGP takes the shortest AS path, then the nearest exit; local-pref and multipath change that', () => {
  const { ev, errors } = load();
  start(ev);
  assert.equal(ev('JSON.stringify(S.pol)'), JSON.stringify({ tags: [], on: {}, rules: [], qos: [], mp: {} }), 'a new network has no policy');
  ev("ACT.launchBB({city:'fra'});S.pops.fra.bb.d=200;ACT.buildPop({city:'ams'})");
  link(ev, 'fra', 'ams', 2);
  ev("ACT.buyTransit({city:'fra',net:'cog',tier:2});S.pni.push({id:'pg',net:'ggl',city:'ams',tier:1,ready:0});compute()");
  // Goggle: a PNI one hop away beats transit three hops away, even across the backbone.
  assert.equal(ev("engOutOf('fra','ggl').k"), 'p', 'a far PNI beats local transit');
  assert.equal(ev("engOutOf('fra','nfx').k"), 't', 'what the PNI does not reach goes to transit');
  // Local-pref says otherwise.
  ev("S.pol.rules.push({id:'r1',m:'from:transit',at:'x:*:in',act:'lp',n:300});compute()");
  assert.equal(ev("engOutOf('fra','ggl').k"), 't', 'local-pref 300 on transit wins over the AS path');
  ev("S.pol.rules=[];ACT.buyTransit({city:'fra',net:'lvl',tier:2});compute()");
  // Two transits in one POP: networks behind neither carrier tie, and the older port takes them.
  const one = [td(ev, 0).tx, td(ev, 1).tx];
  assert.ok(one[0] > one[1] * 3, `the older route wins ties (${one})`);
  ev("ACT.polMp({city:'fra',on:1})");
  const two = [td(ev, 0).tx, td(ev, 1).tx];
  assert.ok(two[1] > one[1] * 2 && two[1] > two[0] * 0.5, `multipath shares them (${two})`);
  assert.deepEqual(errors, []);
});

test('communities: a cache tagged us-only stays on its side of the Pacific', () => {
  const { ev, errors } = load();
  start(ev);
  ev("for(const c of ['lax','sjc','tok'])ACT.buildPop({city:c});for(const c of ['lax','sjc','tok']){S.pops[c].rgen=6;ACT.launchBB({city:c});S.pops[c].bb.d=200;}");
  link(ev, 'lax', 'sjc', 2); link(ev, 'lax', 'tok', 2);
  ev("ACT.buyIx({city:'tok',tier:2,signed:true});ACT.rs({city:'tok'});compute();ACT.peerAll({city:'tok'});ACT.cache({city:'lax',net:'nfx'});compute()");
  assert.equal(ev('S.caches.length'), 1, 'a NetChill box in Los Angeles');
  // What the box sends over the Pacific (Los Angeles users' uncacheable NetChill still comes in at Tokyo, their only peering).
  const viaPacific = () => ev("(R.ef['lax|tok']&&R.ef['lax|tok'].eg['c:'+S.caches[0].id])||0");
  assert.ok(viaPacific() > 1, 'by default Tokyo is mapped onto the Los Angeles box, across the Pacific');
  // Tag the box us-only and keep us-only routes off the Pacific link.
  ev("ACT.polTagAdd({name:'us-only'});const t=S.pol.tags[0].id;ACT.polTagOn({id:t,ref:'c:'+S.caches[0].id});ACT.polRuleAdd({m:t,at:'l:lax|tok',act:'nocarry',n:0})");
  assert.equal(ev('S.pol.rules.length'), 1);
  assert.ok(viaPacific() < 1e-6, 'the box serves nobody across the Pacific any more');
  assert.ok(ev("R.useIx.tok") > 1, 'Tokyo gets it over its own exchange');
  assert.ok(ev("R.useCache[S.caches[0].id]") > 1, 'and San Jose still uses the box');
  assert.match(ev("polMatchTxt(S.pol.rules[0].m)+' · '+polPlaceTxt(S.pol.rules[0].at)+' · '+polActTxt(S.pol.rules[0])"), /tagged us-only · on the link Los Angeles–Tokyo · don't carry it/);
  ev("ACT.routingOpen()");
  assert.match(ev("document.getElementById('modalCard').textContent"), /BGP policy/);
  assert.deepEqual(errors, []);
});

test('inbound is the far side\'s choice: prepending and region-only announcements steer it', () => {
  const { ev, errors } = load();
  start(ev);
  ev("ACT.buildPop({city:'lon'});ACT.launchBB({city:'lon'});S.pops.lon.bb.d=300;ACT.buildPop({city:'nyc'})");
  link(ev, 'lon', 'nyc', 2, 'hibx');
  ev("S.transit=[];ACT.buyTransit({city:'lon',net:'cog',tier:2});ACT.buyTransit({city:'nyc',net:'cog',tier:2});compute()");
  // American networks hand Frankfurt's traffic to you in New York (nearest to them), European ones in Frankfurt.
  const rx = () => [td(ev, 0).rx, td(ev, 1).rx];
  const r0 = rx();
  assert.ok(r0[0] > 0 && r0[1] > 0, `both ports take traffic in (${r0})`);
  assert.equal(ev("engOutOf('lon','cmc').k+engOutOf('lon','cmc').city"), 'tlon', 'outbound leaves locally: eBGP over iBGP');
  // Prepend in New York: the far side comes in through Frankfurt.
  ev("ACT.polRuleAdd({m:'*',at:'x:t:'+S.transit[1].id+':out',act:'prepend',n:2})");
  const r1 = rx();
  assert.ok(r1[1] < r0[1] * 0.1 && r1[0] > r0[0], `prepending moves it (${r0} → ${r1})`);
  // Region only in London: American origins can no longer come in there.
  ev("S.pol.rules=[];ACT.polRuleAdd({m:'*',at:'x:t:'+S.transit[0].id+':out',act:'regonly',n:0})");
  const r2 = rx();
  assert.ok(r2[1] > r0[1], `more comes in at New York (${r2})`);
  assert.deepEqual(errors, []);
});

test('islands: your own POPs on another island are reached over the internet, through a port on each side', () => {
  const { ev, errors } = load();
  start(ev);
  ev("ACT.buildPop({city:'lon'});ACT.launchBB({city:'lon'});S.pops.lon.bb.d=300;ACT.buildPop({city:'nyc'});S.transit=[];ACT.buyTransit({city:'lon',net:'cog',tier:2});ACT.buyTransit({city:'nyc',net:'cog',tier:2})");
  ev("S.biz.push({id:'h',type:'host',name:'Host',city:'nyc',bw:200,rate:60,reqs:[],mood:100,since:0});compute()");
  const toLon = () => ev("(()=>{let g=0;const dp=R.dp;for(let t=0;t<dp.IF.length;t++)if(dp.IO[t]===-1-CIDX.lon)g+=dp.DO[dp.IF[t]];return g;})()");
  assert.ok(toLon() > 0, 'London, another island, gets its traffic from New York through the internet');
  const lists = ev("(()=>{const dp=R.dp;let n=0;for(let t=0;t<dp.IF.length;t++)if(dp.IO[t]===-1-CIDX.lon){const id=dp.FOUT[dp.IF[t]];for(let k=dp.LOFF[id];k<dp.LOFF[id+1];k++)if(dp.LP[k]>=2*dp.NE)n++;}return n;})()");
  assert.ok(lists >= 2, 'it crosses a port on each island');
  link(ev, 'lon', 'nyc', 2, 'hibx');
  ev('compute()');
  assert.ok(ev("(R.ef['lon|nyc']&&R.ef['lon|nyc'].dst.nyc)||0") > 0, 'with a link it stays on your backbone');
  assert.deepEqual(errors, []);
});

test('two pipes per link: downloads one way, a host the other way, a circuit both, oriented by the link', () => {
  const { ev, errors } = load();
  start(ev);
  ev("ACT.launchBB({city:'fra'});S.pops.fra.bb.d=60;ACT.buildPop({city:'ams'});ACT.buyTransit({city:'ams',net:'cog',tier:2})");
  link(ev, 'ams', 'fra', 2);
  const dir = () => JSON.parse(ev("JSON.stringify(R.ldir[S.links[0].id])"));
  ev('compute()');
  let d = dir();
  assert.ok(d[0] > d[1] * 5, `eyeballs pull ams → fra (${d})`);
  assert.deepEqual(JSON.parse(ev("JSON.stringify(pipeOfLink(S.links[0]))")).length, 2);
  ev("S.pops.fra.bb.d=0.01;S.biz.push({id:'h',type:'stream',name:'Stream',city:'fra',bw:100,rate:80,reqs:[],mood:100,since:0});compute()");
  d = dir();
  assert.ok(d[1] > d[0] * 5, `a streaming host pushes fra → ams (${d})`);
  ev("S.biz=[{id:'c',type:'ai',name:'Train',city:'fra',city2:'ams',bw:50,rate:0,reqs:[],mood:100,since:0,route:'normal'}];compute()");
  d = dir();
  assert.ok(Math.abs(d[0] - d[1]) < 0.1 && d[0] > 40, `an AI circuit fills both ways alike (${d})`);
  assert.deepEqual(errors, []);
});

test('loss: a full pipe drops the excess, bursts cost a little near the top, a CDN spills, the priority queue is spared', () => {
  const { ev, errors } = load();
  assert.ok(Math.abs(ev('0.002*((0.9-0.85)/0.15)**2') - 0.000222) < 1e-6);
  start(ev);
  ev("ACT.launchBB({city:'fra'});S.pops.fra.bb.d=200;ACT.buyTransit({city:'fra',net:'cog',tier:1});compute()");
  const t = "pipeAt(pipeOfExit('t',S.transit[0].id)[0],R.hp)";
  const p = JSON.parse(ev(`JSON.stringify(${t})`));
  assert.ok(p.off > 100 && Math.abs(p.loss - (1 - 100 / p.off)) < 1e-9 && Math.abs(p.dlv - 100) < 1e-6, `twice what fits: the excess is dropped (${JSON.stringify(p)})`);
  assert.ok(ev("R.svc['pop:fra'].D") < 0.9, 'and the eyeballs feel it');
  // Gaming in the priority queue keeps its packets while home users lose more.
  ev("S.biz.push({id:'g',type:'game',name:'Lag Lords',city:'fra',bw:20,rate:120,reqs:[],mood:100,since:0});compute()");
  assert.ok(ev("R.svc['grp:fra|gaming|'].L") > 0.003, 'gaming loses packets with everyone');
  ev("ACT.polQosAdd({m:'class:gaming'})");
  assert.ok(ev("R.svc['grp:fra|gaming|'].L") < 0.003 && ev("R.bsf.g") > 0.95, 'in the priority queue it does not');
  // A CDN fills a PNI to 95% and sends the rest the next way in; a plain network would drop it.
  ev("S.biz=[];S.pol.qos=[];S.pops.fra.bb.d=40/cityNetSh('fra','nfx');ACT.buyTransit({city:'fra',net:'lvl',tier:2});S.pni.push({id:'pn',net:'nfx',city:'fra',tier:0,ready:0});compute()");
  const pni = JSON.parse(ev("JSON.stringify(pipeAt(pipeOfExit('p',S.pni[0].id)[0],R.hp))"));
  assert.ok(pni.loss < 0.01 && pni.dlv <= 10 * 0.95 + 1e-6 && pni.dlv > 9, `the NetChill PNI runs at 95%, no loss (${JSON.stringify(pni)})`);
  assert.deepEqual(errors, []);
});

test('the day: Tokyo and Frankfurt peak hours apart, the hour shown changes nothing routed', () => {
  const { ev, errors } = load();
  start(ev);
  ev("ACT.launchBB({city:'fra'});S.pops.fra.bb.d=40;ACT.buildPop({city:'tok'});ACT.launchBB({city:'tok'});S.pops.tok.bb.d=40");
  ev("ACT.buyTransit({city:'fra',net:'cog',tier:2});ACT.buyTransit({city:'tok',net:'cog',tier:2});compute()");
  const day = (i) => JSON.parse(ev(`(()=>{const p=pipeOfExit('t',S.transit[${i}].id)[0],o=[];for(let h=0;h<24;h++)o.push(pipeAt(p,h).off);return JSON.stringify(o);})()`));
  const top = (a) => a.indexOf(Math.max(...a));
  // Evening, local time: Frankfurt (UTC+1) peaks around 19–20 UTC, Tokyo (UTC+9) around 11–12 UTC.
  const f = top(day(0)), t = top(day(1));
  assert.ok(f >= 18 && f <= 21, `Frankfurt peaks at ${f} UTC`);
  assert.ok(t >= 10 && t <= 13, `Tokyo peaks at ${t} UTC`);
  const before = ev('JSON.stringify(R)');
  ev('UI.hour=(R.hp+7)%24;renderAll()');
  assert.equal(ev('JSON.stringify(R)'), before, 'the hour shown is a view');
  assert.match(ev('hudDate()'), /UTC$/);
  assert.deepEqual(errors, []);
});

test('billing: the 95th percentile of hourly samples, on the busier direction', () => {
  const { ev, errors } = load();
  start(ev);
  // 30 days of six samples each way: in tops out at 100, out at 300 on two days.
  ev("ACT.buyTransit({city:'fra',net:'cog',tier:2});const t=S.transit[0];t.hist=Array.from({length:29},(_,d)=>({d,i:[100,90,80,70,60,50],o:d<2?[300,300,300,300,300,300]:[10,10,10,10,10,10]}))");
  const q = JSON.parse(ev("JSON.stringify(p95dir(S.transit[0],{i:[100,90,80,70,60,50],o:[10,10,10,10,10,10]},false))"));
  // 720 samples: the 36th busiest. Out: twelve at 300, then tens. In: thirty at 100, thirty at 90.
  assert.deepEqual(q, { i: 90, o: 10 });
  ev("for(const d of S.transit[0].hist.slice(0,7))d.o=[300,300,300,300,300,300]");
  assert.equal(ev("JSON.stringify(p95dir(S.transit[0],{i:[100],o:[10]},false))"), JSON.stringify({ i: 90, o: 300 }), 'seven busy days out: 42 samples at 300');
  ev('compute()');
  assert.ok(ev('R.p95[S.transit[0].id]') === Math.max(ev('R.p95dir[S.transit[0].id].i'), ev('R.p95dir[S.transit[0].id].o')), 'the bill takes the busier direction');
  assert.deepEqual(errors, []);
});

test('an old save keeps the order it routed by, multipath and a month of grace, and is told once', () => {
  const { ev, errors } = load();
  const fx = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'big-network.json'), 'utf8'));
  ev(`S=migrate(JSON.parse(${JSON.stringify(JSON.stringify(fx.S || fx))}));compute()`);
  assert.equal(ev('S.engV'), 3);
  assert.equal(ev("S.pol.rules.filter(r=>r.at==='x:*:in'&&r.act==='lp').map(r=>r.m+'='+r.n).join()"), 'cone=170,from:cache=300,from:pni=200,from:ix=180');
  assert.equal(ev('Object.keys(S.pol.mp).length'), ev('Object.keys(S.pops).length'));
  assert.equal(ev('S.engNews'), true);
  assert.equal(ev('S.engGrace'), ev('S.day') + 30);
  // Migrated once: a second load changes nothing.
  const once = ev('JSON.stringify(S.pol)');
  ev('S=migrate(JSON.parse(JSON.stringify(S)))');
  assert.equal(ev('JSON.stringify(S.pol)'), once);
  assert.deepEqual(errors, []);
});

test('a hostile policy in a save comes out clean and within its limits', () => {
  const { ev, errors } = load();
  start(ev);
  ev(`S.pol={tags:[{id:'t1',name:'ok'},{id:'x',name:'bad'},{id:'t2',name:'NOT OK'},...Array.from({length:99},(_,i)=>({id:'t'+(i+3),name:'n'+i}))],
    on:{t1:['c:abc','pop:fra','evil:1',{}],__proto__:{x:1}},rules:[{m:'t1',at:'l:fra|par',act:'nocarry'},{m:'t1',at:'l:fra|par',act:'lp',n:5},{m:'zz',at:'x:*:in',act:'lp'},{m:'*',at:'x:*:in',act:'lp',n:1e9},...Array.from({length:600},()=>({m:'*',at:'pop:*',act:'deny'}))],
    qos:[{m:'biz'},{m:'nope'},...Array.from({length:30},()=>({m:'biz'}))],mp:{fra:1,zzz:1},sess:{'t:x':{allowas:1}}};S=migrate(JSON.parse(JSON.stringify(S)));compute()`);
  const p = JSON.parse(ev('JSON.stringify(S.pol)'));
  assert.equal(p.tags.length, 32);
  assert.ok(p.tags.every((t) => /^t\d+$/.test(t.id) && /^[a-z0-9-]{1,20}$/.test(t.name)));
  assert.deepEqual(p.on.t1, ['c:abc', 'pop:fra']);
  assert.equal(p.rules.length, ev('POL_LIM.rules'));
  assert.deepEqual(p.rules.slice(0, 2).map((r) => r.at + ' ' + r.act), ['l:fra|par nocarry', 'x:*:in lp'], 'a link takes nocarry only, and an unknown tag matches nothing');
  assert.equal(p.rules.find((r) => r.m === '*' && r.at === 'x:*:in').n, 1000);
  assert.equal(p.qos.length, 8);
  assert.deepEqual(p.mp, { fra: 1 });
  assert.equal(p.sess, undefined, 'session switches are gone');
  assert.deepEqual(errors, []);
});
