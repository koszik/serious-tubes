// What customers pay: a markup on what their capacity leases for on its route and size (cheaper per Gbps the bigger
// it is), and IP customers less per Gbps the more they buy.
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');

const start = (ev) => ev("ACT.start({});S.nextFail=S.nextEvent=1e9");
const mo = (ev, t, a, b, bw) => ev(`${bw}*l2Rate(BIZ_T.${t},'${a}','${b}',${bw})`);

test('a hyperscaler pays about a wave, a trading firm many times one', () => {
  const { ev, errors } = load();
  start(ev);
  const hyper = mo(ev, 'hyper', 'fra', 'ams', 6400);
  assert.ok(hyper > 15000 && hyper < 45000, `6.4T Frankfurt–Amsterdam: $${hyper}`);
  const wave = ev("capMo('nyc','lon',10)"), hft = mo(ev, 'hft', 'nyc', 'lon', 10);
  assert.ok(hft >= 5 * wave * 0.99, `10G New York–London: $${hft} against a $${Math.round(wave)} wave`);
  // Every circuit pays more than its capacity leases for, so a leased build never loses money on the price alone.
  const cheap = ev(`Object.entries(BIZ_T).filter(([t,T])=>T.l2&&!T.sdwan).filter(([t,T])=>T.opts.some(bw=>bw*l2Rate(T,'fra','ams',bw)<capMo('fra','ams',bw)*1.19)).map(([t])=>t).join()`);
  assert.equal(cheap, '');
  assert.deepEqual(errors, []);
});

test('every customer pays less per Gbps the bigger it is', () => {
  const { ev, errors } = load();
  start(ev);
  const up = ev(`Object.entries(BIZ_T).filter(([t,T])=>!T.fiber&&!T.event&&T.opts.length>1).filter(([t,T])=>{const a=T.opts[0],b=T.opts[T.opts.length-1];
    const r=bw=>T.sdwan?siteMo(T,bw)/bw:T.l2?l2Rate(T,'nyc','chi',bw):ipRate(T,bw);return !(r(b)<r(a));}).map(([t])=>t).join()`);
  assert.equal(up, '');
  assert.equal(ev("ipRate(BIZ_T.dia,1)"), 600, 'the list price at the smallest size');
  const ev3 = ev('eventFee(3200,7,90)');
  assert.ok(ev3 > 150000 && ev3 < 400000, `a 3.2T week-long event: $${ev3}`);
  assert.deepEqual(errors, []);
});

test('new offers use the new prices; signed contracts keep theirs', () => {
  const { ev, errors } = load();
  start(ev);
  ev("S.lvl=4;for(const c of ['nyc','chi','ash'])S.pops[c]=S.pops[c]||{day:0,bb:null,boost:0,down:0,routers:1,gen:false,rgen:0};compute()");
  const o = JSON.parse(ev("(()=>{for(let i=0;i<500;i++){S.offers=[];spawnOffer();const o=S.offers.find(o=>o.type==='l2vpn');if(o)return JSON.stringify(o);}return 'null';})()"));
  assert.ok(o, 'an l2vpn offer');
  const bonus = ev(`1+${JSON.stringify(o.reqs)}.reduce((a,k)=>a+REQS[k].bonus,0)`);
  assert.ok(Math.abs(o.rate - ev(`l2Rate(BIZ_T.l2vpn,'${o.city}','${o.city2}',${o.bw})`) * bonus) <= 1, 'priced from its route');
  ev("S.biz.push({id:'old',city:'fra',city2:'ams',name:'Old Hyper',type:'hyper',bw:6400,rate:90,reqs:[],mood:100,since:0});S=migrate(JSON.parse(JSON.stringify(S)));compute()");
  assert.equal(ev("bizMo(S.biz.find(b=>b.id==='old'))"), 576000, 'a signed contract is a signed contract');
  assert.equal(ev("slaOf(S.biz.find(b=>b.id==='old'))"), 'std', 'and an old one is Standard');
  assert.deepEqual(errors, []);
});
