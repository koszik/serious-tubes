// Customers who keep asking: offers every few days, requests from signed customers (an upgrade, a new requirement, a
// stricter SLA, a new site), and contracts with a term that renew, ask for a discount or end.
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');

function net(ev) {
  ev("ACT.start({});S.cash=1e9;S.lvl=13;S.nextFail=S.nextEvent=1e9;for(const g of GOALS)S.done[g.id]=0;S.pops.fra.rgen=RG_TOP;ACT.buildPop({city:'ams'});S.pops.ams.rgen=RG_TOP");
  ev("UI.via=null;UI.lmode='wave';openLinkModal('fra','ams');ACT.buildLink({tier:2});closeModal();for(const l of S.links)l.ready=0;compute()");
}
const sign = (ev, id, type, bw, city2 = 'ams') => {
  ev(`S.offers.push({id:'${id}',city:'fra',city2:${BIZ(type) ? `'${city2}'` : 'null'},name:'${id}',type:'${type}',bw:${bw},rate:BIZ_T.${type}.l2?l2Rate(BIZ_T.${type},'fra','${city2}',${bw}):ipRate(BIZ_T.${type},${bw}),reqs:[],exp:S.day+30});ACT.accept({id:'${id}'})`);
  ev(`S.biz.find(b=>b.id==='${id}').since=S.day-PROV_D`);
};
const BIZ = (t) => ['l2vpn', 'hft', 'hyper', 'sdwan'].includes(t);
const biz = (ev, id) => JSON.parse(ev(`JSON.stringify(S.biz.find(b=>b.id==='${id}')||null)`));
const rq = (ev, id, k) => ev(`(()=>{const b=S.biz.find(b=>b.id==='${id}');let o=null;for(let i=0;i<200&&!o;i++){o=rqMake(b);if(o&&o.rq.k!=='${k}')o=null;}if(!o)return null;S.offers.push(o);return o.id;})()`);

test('offers come every few days, up to a cap that grows with the network', () => {
  const { ev, errors } = load();
  ev("ACT.start({});S.nextFail=S.nextEvent=1e9;S.offers=[]");
  assert.equal(ev('offerMax()'), 4);
  // The first month is calm: at most one new offer every five days.
  let n = 0;
  for (let d = 1; d < 30; d++) { const k = ev('S.offers.length'); ev(`S.day=${d};offerTick(${d})`); if (ev('S.offers.length') > k) { n++; assert.ok(ev(`S.offD===${d}`)); } }
  assert.ok(n >= 3 && n <= 6, `${n} offers in the first month`);
  // After that, about one every four days at level 1, never past the cap.
  ev('S.offers=[];S.day=100');
  let m = 0;
  for (let d = 100; d < 160; d++) { ev(`S.day=${d};offerTick(${d});const o=S.offers.pop();if(o)S.offers.push(o)`); m = Math.max(m, ev('S.offers.length')); ev('if(S.offers.length>=offerMax())S.offers=[]'); }
  assert.ok(m <= 4, 'never past the cap');
  assert.ok(ev('(()=>{S.offers=[];let c=0;for(let d=200;d<400;d++){S.day=d;const k=S.offers.length;offerTick(d);if(S.offers.length>k){c++;S.offers=[];}}return c;})()') > 35, 'about 50 in 200 days');
  assert.deepEqual(errors, []);
});

test('an upgrade is bigger in total and cheaper per Gbps, and needs the ports', () => {
  const { ev, errors } = load();
  net(ev);
  sign(ev, 'v', 'l2vpn', 10);
  const before = biz(ev, 'v'), id = rq(ev, 'v', 'up');
  const o = JSON.parse(ev(`JSON.stringify(S.offers.find(o=>o.id==='${id}'))`));
  assert.equal(o.bw, 40);
  ev(`ACT.accept({id:'${id}'})`);
  const after = biz(ev, 'v');
  assert.equal(after.bw, 40);
  assert.ok(after.bw * after.rate > before.bw * before.rate && after.rate < before.rate, 'more in total, less per Gbps');
  assert.equal(ev(`S.offers.some(o=>o.id==='${id}')`), false);
  // A router with no free ports refuses it (a 400G upgrade takes four 100G ports).
  const id2 = rq(ev, 'v', 'up');ev(`S.offers.find(o=>o.id==='${id2}').bw=400`);
  ev("S.pops.fra.rgen=0;const pm=portsMax;portsMax=(c,...a)=>c==='fra'?portsUsed(c):pm(c,...a)");
  ev(`ACT.accept({id:'${id2}'})`);
  assert.equal(biz(ev, 'v').bw, 40, 'not without free ports');
  assert.deepEqual(errors, []);
});

test('a new requirement pays its bonus and gets a grace to build; a stricter SLA pays more', () => {
  const { ev, errors } = load();
  net(ev);
  sign(ev, 'v', 'l2vpn', 10);
  const r0 = biz(ev, 'v').rate, id = rq(ev, 'v', 'req'), add = ev(`S.offers.find(o=>o.id==='${id}').add`);
  ev(`ACT.accept({id:'${id}'})`);
  const b = biz(ev, 'v');
  assert.ok(b.reqs.includes(add));
  assert.equal(b.rate, Math.round(r0 * (1 + ev(`REQS['${add}'].bonus`)) * 100) / 100);
  assert.equal(b.rqG, ev('S.day+PROV_D'));
  const s = rq(ev, 'v', 'sla');
  assert.equal(ev(`S.offers.find(o=>o.id==='${s}').sla`), 'prem');
  ev(`ACT.accept({id:'${s}'})`);
  assert.equal(biz(ev, 'v').sla, 'prem');
  assert.equal(biz(ev, 'v').rate, Math.round(b.rate * 1.3 * 100) / 100);
  assert.deepEqual(errors, []);
});

test('a new site needs a POP there', () => {
  const { ev, errors } = load();
  net(ev);
  ev("S.offers.push({id:'w',city:'fra',city2:null,sites:['fra','ams'],name:'w',type:'sdwan',bw:2,rate:perG(siteMo(BIZ_T.sdwan,2)*2,2),reqs:[],exp:S.day+30});ACT.accept({id:'w'})");
  ev("S.biz[0].since=S.day-PROV_D");
  const id = rq(ev, 'w', 'site'), city = ev(`S.offers.find(o=>o.id==='${id}').add`), r0 = biz(ev, 'w').rate;
  if (ev(`!!S.pops['${city}']`)) ev(`delete S.pops['${city}']`);
  ev(`ACT.accept({id:'${id}'})`);
  assert.equal(biz(ev, 'w').sites.length, 2, 'not without a POP');
  ev(`ACT.buildPop({city:'${city}'});ACT.accept({id:'${id}'})`);
  assert.deepEqual(biz(ev, 'w').sites, ['fra', 'ams', city]);
  assert.equal(biz(ev, 'w').rate, Math.round(r0 * 3 / 2 * 100) / 100);
  assert.deepEqual(errors, []);
});

test('saying no costs happiness, ignoring costs more, and both are remembered', () => {
  const { ev, errors } = load();
  net(ev);
  sign(ev, 'v', 'l2vpn', 10);
  const a = rq(ev, 'v', 'up');
  ev(`ACT.decline({id:'${a}'})`);
  assert.equal(biz(ev, 'v').mood, 100 - 5);
  const b = rq(ev, 'v', 'up');
  ev(`S.offers.find(o=>o.id==='${b}').exp=S.day;rqExpire(S.day)`);
  assert.equal(biz(ev, 'v').mood, 100 - 5 - 8);
  assert.equal(ev("rqRecent(S.biz[0])"), 2);
  // A request whose customer has gone is dropped.
  const c = rq(ev, 'v', 'up');
  ev(`S.biz=[];rqExpire(S.day)`);
  assert.equal(ev(`S.offers.some(o=>o.id==='${c}')`), false);
  assert.deepEqual(errors, []);
});

test('contracts end: happy renews by itself, lukewarm wants 15% off, unhappy leaves unless kept', () => {
  const { ev, errors } = load();
  net(ev);
  for (const [id, mood] of [['h', 90], ['m', 55], ['u', 20], ['x', 90]]) { sign(ev, id, 'l2vpn', 10); ev(`const b=S.biz.find(b=>b.id==='${id}');b.mood=${mood};b.end=S.day+RENEW_D`); }
  assert.equal(ev("termOf('l2vpn','h')") % 12, 0);
  ev("S.biz.find(b=>b.id==='x').rqx=[S.day,S.day,S.day,S.day,S.day,S.day]");
  ev('rqTick(S.day)');
  const card = (id) => JSON.parse(ev(`JSON.stringify(S.offers.find(o=>o.rq&&o.rq.id==='${id}'))`));
  const list = (id) => ev(`listRate(S.biz.find(b=>b.id==='${id}'),${card(id).bw})`);
  assert.equal(card('h').rate, list('h'), 'today’s price');
  assert.equal(card('m').rate, Math.round(list('m') * 0.85 * 100) / 100);
  assert.equal(card('u').rate, Math.round(list('u') * 0.7 * 100) / 100);
  assert.equal(ev("S.biz.find(b=>b.id==='x').rnw.p"), 0.3, 'six ignored requests make a happy customer unhappy');
  // Keep the unhappy one at 30% off; do nothing about the others.
  const end = biz(ev, 'u').end;
  ev(`ACT.accept({id:'${card('u').id}'})`);
  assert.equal(biz(ev, 'u').end, end + ev("termOf('l2vpn','u')") * 30);
  ev(`S.day=${end};rqTick(S.day)`);
  assert.ok(biz(ev, 'h'), 'the happy one rolled over');
  assert.equal(biz(ev, 'h').end, end + ev("termOf('l2vpn','h')") * 30);
  assert.equal(biz(ev, 'm'), null, 'the lukewarm one left');
  assert.equal(biz(ev, 'x'), null);
  assert.ok(biz(ev, 'u'), 'kept');
  assert.deepEqual(errors, []);
});

test('the price function matches new offers, and the intern only takes requests that fit', () => {
  const { ev, errors } = load();
  net(ev);
  const o = JSON.parse(ev("(()=>{for(let i=0;i<500;i++){S.offers=[];spawnOffer();const o=S.offers.find(o=>o.type==='l2vpn'||o.type==='dia');if(o)return JSON.stringify(o);}return 'null';})()"));
  assert.ok(Math.abs(ev(`listRate(offerCustomer(${JSON.stringify(o)}))`) - o.rate) <= 0.01 * o.rate + 1, 'renewals and new offers share one price');
  sign(ev, 'v', 'l2vpn', 10);
  const up = rq(ev, 'v', 'up');
  ev(`ACT.accept({id:'${up}',auto:true})`);
  assert.equal(biz(ev, 'v').bw, 40, 'an upgrade the network carries');
  const site = rq(ev, 'v', 'req');
  const add = ev(`S.offers.find(o=>o.id==='${site}').add`);
  ev(`ACT.accept({id:'${site}',auto:true})`);
  assert.equal(biz(ev, 'v').reqs.includes(add), ev(`REQS['${add}'].ok({...S.biz[0],reqs:['${add}']})`), 'a new requirement only when it is already met');
  assert.deepEqual(errors, []);
});

test('saves: old contracts get an end within a year, bad request fields are repaired', () => {
  const { ev, errors } = load();
  net(ev);
  sign(ev, 'v', 'l2vpn', 10);
  const id = rq(ev, 'v', 'up');
  ev("const x=JSON.parse(JSON.stringify(S));delete x.biz[0].end;x.biz[0].rqx='x';x.biz[0].rnw={a:'yes',p:9};x.offers.push({id:'bad',rq:{k:'nope',id:'v'},city:'fra',name:'b',type:'dia',bw:1,rate:1,reqs:[],exp:S.day+5});delete x.offD;S=migrate(x)");
  const b = biz(ev, 'v');
  assert.ok(b.end > ev('S.day') + 30 && b.end <= ev('S.day') + 31 + 365);
  assert.deepEqual([b.rqx, b.rnw], [[], { a: 1, p: 0.3 }]);
  assert.equal(ev("S.offers.find(o=>o.id==='bad').rq"), undefined, 'an unknown kind becomes a plain offer');
  assert.ok(ev(`S.offers.find(o=>o.id==='${id}').rq.k==='up'`));
  assert.equal(ev('S.offD'), -99);
  assert.deepEqual(errors, []);
});

test('the Deals list puts your customers first, on a phone too', () => {
  const { ev, errors, dom } = load();
  net(ev);
  dom.window.innerWidth = 360;
  sign(ev, 'v', 'l2vpn', 10);
  rq(ev, 'v', 'up');
  ev("S.offers.push({id:'n',city:'fra',city2:null,name:'Newbie',type:'dia',bw:1,rate:600,reqs:[],exp:S.day+2})");
  ev("UI.left='deals';UI.leftOpen=true;renderLeft()");
  const t = ev("document.getElementById('leftBody').textContent");
  assert.match(t, /Your customers ask.*Upgrade 10\.0 Gbps → 40\.0 Gbps.*Saying no costs 5 happiness.*New customers.*Newbie.*12-month contract/s);
  assert.match(ev("document.getElementById('leftBody').innerHTML"), /color:var\(--bad\);font-weight:700">2d left/);
  assert.deepEqual(errors, []);
});
