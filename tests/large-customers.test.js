// Large IP customers pay the local transit market, haggled, plus only what their dear destinations cost; small ones
// keep a premium. The price blends between 40G and 400G and never rises with size.
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');

test('from 400G a customer pays the haggled market, up to 40G the list price', () => {
  const { ev, errors } = load();
  ev('ACT.start({})');
  for (const c of ['fra', 'cpt', 'syd', 'sin']) {
    const [lo, hi] = JSON.parse(ev(`JSON.stringify(ipBand('${c}'))`));
    const cheap = ev(`Math.min(...NETS.filter(n=>!n.cn&&sellsAt(n,'${c}')).map(n=>transitPerG(n,'${c}',false)))`);
    assert.ok(Math.abs(lo - 0.9 * cheap) < 0.01 && hi >= lo, `${c}: ${lo}–${hi}`);
    for (const t of ['isp', 'gpu', 'cgame', 'metav']) {
      const d = ev(`dstCost(BIZ_T.${t},'${c}',${(lo + hi) / 2})`);
      assert.ok(d >= 1 && d < 1.5, `${t} in ${c}: destinations ×${d}`);
      assert.ok(Math.abs(ev(`ipPrice(BIZ_T.${t},800,'${c}',0)`) - lo * d) < 0.02, `${t} in ${c}: a hard haggler pays the bottom`);
      assert.ok(Math.abs(ev(`ipPrice(BIZ_T.${t},800,'${c}',1)`) - hi * d) < 0.02, `${t} in ${c}: an easy one the median`);
      assert.equal(ev(`ipPrice(BIZ_T.${t},40,'${c}',0)`), ev(`ipRate(BIZ_T.${t},40,'${c}')`));
      // Through the blend the price per Gbps only falls.
      let prev = Infinity;
      for (const bw of [40, 60, 100, 200, 300, 400, 800]) {
        const p = ev(`ipPrice(BIZ_T.${t},${bw},'${c}',0.5)`);
        assert.ok(p <= prev + 0.01, `${t} in ${c} at ${bw}G: $${p} after $${prev}`);
        prev = p;
      }
    }
  }
  // Overfit Analytics: 800G of GPU traffic in Cape Town no longer pays nearly four times transit.
  const fit = ev("ipPrice(BIZ_T.gpu,800,'cpt',0.5)*reqMul(BIZ_T.gpu,800,['metro','netchill'])");
  assert.ok(fit < 140 && fit > 90, `$${fit}/Gbps`);
  assert.deepEqual(errors, []);
});

test('China raises a large customer’s price; wishes only raise a small one’s', () => {
  const { ev, errors } = load();
  ev('ACT.start({})');
  const rel = (c) => ev(`(()=>{const [lo,hi]=ipBand('${c}');return ipPrice(BIZ_T.cgame,3200,'${c}',0.5)/((lo+hi)/2);})()`);
  assert.ok(rel('hkg') > rel('sin') + 0.15, `Hong Kong ${rel('hkg')} against Singapore ${rel('sin')}`);
  assert.equal(ev("reqMul(BIZ_T.gpu,800,['metro','netchill'])"), 1);
  assert.ok(Math.abs(ev("reqMul(BIZ_T.host,20,['metro','netchill'])") - 1.35) < 1e-9);
  assert.ok(Math.abs(ev("reqMul(BIZ_T.l2vpn,800,['diverse'])") - 1.25) < 1e-9, 'circuits keep their extras');
  assert.deepEqual(errors, []);
});

test('each large customer haggles its own way, keeps it when it signs and renews, and saves keep it sane', () => {
  const { ev, errors } = load();
  ev('ACT.start({})');
  const hs = JSON.parse(ev("JSON.stringify(Array.from({length:4000},(_,i)=>ipHaggle('Big '+i)))"));
  const m = hs.reduce((a, b) => a + b, 0) / hs.length;
  assert.ok(Math.abs(m - 0.5) < 0.02 && hs.every((h) => h >= 0 && h <= 1), `mean ${m}`);
  assert.ok(hs.filter((h) => h < 0.2).length > 100 && hs.filter((h) => h > 0.8).length > 100, 'some haggle hard, some barely');
  assert.equal(ev("ipHg(BIZ_T.dia,'x')"), undefined, 'small-only types never draw');
  ev("S.cash=1e7;S.pops.fra.rgen=RG_TOP;ACT.buyTransit({city:'fra',net:'cog',tier:2});S.offers.push({id:'o1',city:'fra',city2:null,name:'Big',type:'gpu',bw:800,rate:ipPrice(BIZ_T.gpu,800,'fra',0.1),hg:0.1,reqs:[],exp:S.day+30});ACT.accept({id:'o1'})");
  assert.equal(ev("S.biz.find(b=>b.id==='o1').hg"), 0.1);
  assert.equal(ev("listRate(S.biz.find(b=>b.id==='o1'))"), ev("ipPrice(BIZ_T.gpu,800,'fra',0.1)"));
  ev("const x=JSON.parse(JSON.stringify(S));x.biz.find(b=>b.id==='o1').hg='lots';x.biz.push({...x.biz.find(b=>b.id==='o1'),id:'o2',hg:7});S=migrate(x)");
  assert.equal(ev("S.biz.find(b=>b.id==='o1').hg"), 0.5);
  assert.equal(ev("S.biz.find(b=>b.id==='o2').hg"), 1);
  assert.deepEqual(errors, []);
});
