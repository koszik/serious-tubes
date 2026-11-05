const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');

function setup(ev) {
  ev("ACT.start({});S.cash=1e9;S.lvl=6;S.nextFail=S.nextEvent=1e9;for(const g of GOALS)S.done[g.id]=0;for(const c of ['nyc','lon','ams'])ACT.buildPop({city:c});for(const c in S.pops)S.pops[c].rgen=3");
  ev("UI.via='hibx';openLinkModal('lon','nyc');ACT.buildLink({tier:1});closeModal();UI.via=null;openLinkModal('fra','ams');ACT.buildLink({tier:1});closeModal()");
  ev("ACT.launchBB({city:'lon'});S.pops.lon.bb.d=100;ACT.launchBB({city:'ams'});S.pops.ams.bb.d=100");
}

test('broadband backhauled to transit far away is slow, and slow is bad service', () => {
  const { ev, errors } = load();
  setup(ev);
  ev("ACT.buyTransit({city:'nyc',net:'cog',tier:1});ACT.buyTransit({city:'fra',net:'cog',tier:1});compute()");
  // London's only way out is transit in New York: everything is delivered, and it is all too slow
  assert.ok(ev('R.citySrv.lon/R.cityDem.lon') > 0.95, 'delivered');
  assert.ok(ev('R.latFar.lon.ms') > 50, `${ev('R.latFar.lon.ms')} ms round trip`);
  assert.equal(ev('R.latFar.lon.to'), 'nyc');
  // Traffic for networks near London crosses the Atlantic twice: far over 50 ms, bad service; American ones lose nothing.
  assert.ok(ev("sfOf(R,'lon')") < 0.6, 'over 50 ms counts as bad service');
  // Amsterdam goes out in Frankfurt, a few hundred kilometres away: fine
  assert.equal(ev('R.latF.ams'), undefined);
  assert.ok(ev("sfOf(R,'ams')") > 0.95);
  // the panel and the NOC say so
  ev("UI.sel={type:'city',id:'lon'};UI.tab='up';renderPanel()");
  assert.match(ev("document.getElementById('panelBody').textContent"), /backhauled to transit in New York/);
  ev("UI.sel=null;UI.left='noc';UI.leftOpen=true;renderLeft()");
  assert.match(ev("document.getElementById('left').textContent"), /Routing quality.*London: traffic to .* \(\d+% of it\) takes \d+ ms longer than it needs, in at .* and out at New York/s);
  // bad service costs customers and money: broadband shrinks instead of growing
  const d0 = ev('S.pops.lon.bb.d'), a0 = ev('S.pops.ams.bb.d');
  for (let i = 0; i < 20; i++) ev('dayTick()');
  assert.ok(ev('S.pops.lon.bb.d') < d0, 'London churns');
  assert.ok(ev('S.pops.ams.bb.d') >= a0, 'Amsterdam does not');
  // local transit fixes it
  ev("ACT.buyTransit({city:'lon',net:'cog',tier:1});compute()");
  // (a sliver of American content still comes in at New York: the far network's hot potato)
  assert.ok((ev('R.latF.lon') ?? 1) > 0.995);
  assert.ok(ev("sfOf(R,'lon')") > 0.95);
  assert.deepEqual(errors, []);
});

test('the penalty is on a curve, and any far exit is slow, peering too; traffic that leaves near home is not', () => {
  const { ev, errors } = load();
  assert.equal(ev('latLoss(15)'), 0);
  assert.equal(ev('latLoss(20)'), 0);
  assert.ok(Math.abs(ev('latLoss(35)') - 0.1) < 1e-9);
  assert.ok(Math.abs(ev('latLoss(50)') - 0.2) < 1e-9);
  assert.equal(ev('latLoss(51)'), 0.5);
  setup(ev);
  // London reaches open networks over peering in New York: no transit, but just as far, so just as slow
  ev("const x=ixIdsIn('nyc')[0];ACT.buyIx({city:x,tier:1,signed:true});ACT.rs({city:x});compute()");
  assert.ok(ev("Object.keys(R.netEg).some(n=>R.netEg[n].ix>0)"), 'traffic over the IX');
  assert.ok(ev('R.latF.lon') < 0.9);
  // Amsterdam leaves in Frankfurt, next door: no penalty at all
  ev("ACT.buyTransit({city:'fra',net:'cog',tier:1});compute()");
  assert.equal(ev('R.latF.ams'), undefined);
  assert.deepEqual(errors, []);
});

test('the slow-city warning box does not restyle the yellow progress bars', () => {
  const { ev, errors } = load();
  // .bar.warn is the yellow bar; the latency box once used a plain .warn class and padded every yellow bar
  const st = JSON.parse(ev(`(()=>{const b=document.createElement('div');b.className='bar warn';const w=document.createElement('div');w.className='latwarn';document.body.append(b,w);
    const a=getComputedStyle(b),c=getComputedStyle(w);return JSON.stringify({bar:a.paddingTop+a.paddingLeft,box:c.paddingTop});})()`));
  assert.ok(!st.bar || st.bar === '0px0px', `yellow bars have no padding (${st.bar})`);
  assert.equal(st.box, '8px', 'the warning box keeps its own');
  assert.deepEqual(errors, []);
});
