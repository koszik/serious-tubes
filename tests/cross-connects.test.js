// Cross-connects: every port to another network and each end of a wave or fiber pair is a fiber patch the building
// charges for, once to install and then monthly, the same for any speed: by region, half as much again at the big
// hubs, nothing monthly in cheaper markets. Remote ports, your own exchange, VXCs and caches pay none.
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');

const start = (ev) => ev("ACT.start({});S.cash=1e9;S.lvl=13;S.nextFail=S.nextEvent=1e9;for(const g of GOALS)S.done[g.id]=0;S.pops.fra.rgen=RG_TOP;compute()");

test('the fee follows the city: region, hub, cheaper market', () => {
  const { ev, errors } = load();
  start(ev);
  const mo = (c) => ev(`xcMo('${c}')`);
  assert.equal(mo('fra'), 180, 'a European hub');
  assert.equal(mo('ash'), 375, 'an American hub');
  assert.equal(mo('sin'), 300, 'an Asian hub');
  assert.equal(mo('jnb'), 120, 'Johannesburg');
  for (const c of ['sao', 'del', 'bom']) assert.equal(mo(c), 0, `${c}: a cheaper market`);
  assert.ok(ev("xcNrc('sao')") > 0, 'where the install is still paid once');
  assert.ok(mo('ash') > mo('fra'));
  assert.deepEqual(errors, []);
});

test('transit, exchange, PNI and fabric ports pay one patch each, a LAG one per member, all in one cost line', () => {
  const { ev, errors } = load();
  start(ev);
  const xc = () => ev('R.cost.xc||0'), c = ev("xcMo('fra')");
  ev("ACT.buyTransit({city:'fra',net:'cog',tier:1});compute()");
  assert.equal(xc(), c);
  const t0 = ev('R.cost.transit');
  ev("ACT.lagT({id:S.transit[0].id,d:1});compute()");
  assert.equal(xc(), 2 * c, 'a LAG member is another patch');
  ev("ACT.buyIx({city:'fra',tier:1,signed:true});compute()");
  assert.equal(xc(), 3 * c);
  ev("S.pni.push({id:'p',city:'fra',net:'ggl',tier:1,n:1});compute()");
  assert.equal(xc(), 4 * c);
  assert.equal(ev('R.cost.pni'), 0, 'a free peer bills nothing but its patch');
  ev("S.pni.push({id:'q',city:'fra',net:'ggl',tier:5,n:1});compute()");
  assert.equal(xc(), 5 * c, 'a 3.2T PNI pays the same patch as a 100G one');
  const f = ev("FABS.find(f=>f.cities.includes('fra')).id");
  ev(`ACT.buyNni({city:'fra',prov:'${f}',tier:0});compute()`);
  assert.equal(xc(), 6 * c, 'a fabric port too');
  assert.ok(Math.abs(ev("transitMo(S.transit[0],R.p95[S.transit[0].id])") - ev('R.cost.transit')) < 1e-6 && t0 > 0, 'the transit line is the transit bill only');
  ev("ACT.dash({});UI.dtab='overview';renderDash()");
  assert.match(ev("document.getElementById('dashCard').textContent"), /Cross-connects \(fiber patches/);
  assert.deepEqual(errors, []);
});

test('installing a patch is paid once: transit, a LAG member, a PNI, a fabric port', () => {
  const { ev, errors } = load();
  start(ev);
  const n = ev("xcNrc('fra')"), spent = (code) => { const c0 = ev('S.cash'); ev(code); return c0 - ev('S.cash'); };
  assert.equal(spent("ACT.buyTransit({city:'fra',net:'cog',tier:1})"), ev('PORT[1].setup') + n);
  assert.equal(spent("ACT.buyTransit({city:'fra',net:'cog',tier:2})"), ev('PORT[2].setup'), 'an upgrade keeps its patch');
  assert.equal(spent("ACT.lagT({id:S.transit[0].id,d:1})"), ev('PORT[2].setup') + n);
  assert.equal(ev("pniQuote('fra','ggl',1).cost"), ev('1500+PORT[1].setup/2') + n, 'a new PNI');
  const f = ev("FABS.find(f=>f.cities.includes('fra')).id");
  assert.equal(spent(`ACT.buyNni({city:'fra',prov:'${f}',tier:0})`), ev('NNI[0].mo') + n, 'a fabric port');
  assert.deepEqual(errors, []);
});

test('links: a patch at each end of a wave, per lit pair on dark fiber, the ring of a second site; none for a VXC', () => {
  const { ev, errors } = load();
  start(ev);
  ev("ACT.buildPop({city:'ams'});S.pops.ams.rgen=RG_TOP");
  const both = ev("xcMo('fra')+xcMo('ams')");
  const c0 = ev('S.cash');
  ev("UI.via=null;UI.lmode='wave';openLinkModal('fra','ams');ACT.buildLink({tier:1});closeModal();compute()");
  const wave = ev("S.links[0]");
  assert.equal(ev('R.cost.xc'), both, 'a wave: one patch at each end');
  assert.equal(c0 - ev('S.cash'), ev('S.links[0].mo') + ev("xcNrc('fra')+xcNrc('ams')"), 'installed with the first month');
  ev("S.links.push({id:'own',a:'fra',b:'ams',kind:'df',own:true,sys:'roadm',ch:['zr4','zr4'],pairs:2,km:400,sub:false,mo:0,trench:'t',cut:0,day:0,ready:0});compute()");
  assert.equal(ev('R.cost.xc'), 3 * both, 'two lit pairs: two patches at each end, whatever they carry');
  ev("S.links.push({id:'v',a:'fra',b:'ams',kind:'vxc',prov:'x',vt:0,km:400,sub:false,mo:100,cut:0,day:0});compute()");
  assert.equal(ev('R.cost.xc'), 3 * both, 'a VXC rides the fabric port');
  ev("ACT.addSite({city:'fra'});compute()");
  assert.equal(ev('R.cost.xc'), 3 * both + 2 * ev("xcMo('fra')"), 'the ring: one patch in each building');
  assert.ok(wave);
  assert.deepEqual(errors, []);
});

test('remote ports and your own exchange pay none; the POP page and every quote show the fee', () => {
  const { ev, errors } = load();
  start(ev);
  ev("const r=remoteCities().find(c=>ixName(c)&&!S.pops[c]);window.__r=r;if(r)ACT.buyIx({city:r,tier:0,signed:true});compute()");
  assert.equal(ev('R.cost.xc||0'), 0, 'a remote port is the reseller’s patch');
  ev("selectCity('fra');ACT.tab({t:'up'})");
  assert.match(ev("cityPanel('fra')"), /Cross-connects in Frankfurt: \$250 to install and \$180\/mo each/);
  assert.match(ev("cityPanel('sao')"), /Cross-connects in São Paulo have no monthly fee, only \$200 to install/);
  ev("ACT.tab({t:'up'})");
  const up = ev("document.getElementById('panelBody').textContent");
  assert.match(up, /100G \$1\.8k \+ \$580\/mo/, 'a transit quote includes it: $1,500 + $250 to install, $400 + $180 a month');
  assert.deepEqual(errors, []);
});
