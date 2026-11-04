// Where traffic comes from: each class fetches from the networks that really serve it, hosters exist in every region,
// and content is served from the server nearest the user, so it enters at the port nearest that server.
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');

function parLon(ev) {
  ev("ACT.start({});S.cash=1e10;S.lvl=13;S.nextFail=S.nextEvent=1e9;for(const g of GOALS)S.done[g.id]=0;ACT.buildPop({city:'par'});S.pops.par.rgen=RG_TOP;ACT.launchBB({city:'par'});S.pops.par.bb.d=300");
  ev("ACT.buildPop({city:'lon'});S.pops.lon.rgen=RG_TOP;UI.via=null;UI.lmode='wave';openLinkModal('par','lon');ACT.buildLink({tier:2});closeModal()");
  ev("ACT.buyTransit({city:'par',net:'cog',tier:2});ACT.buyTransit({city:'lon',net:'cog',tier:2});compute()");
}
// What Paris users get from network id, per transit port (Gbps in, at the port's busy hour).
const byPort = (ev, id) => JSON.parse(ev(`JSON.stringify(Object.fromEntries(S.transit.map(t=>{let g=0;for(const r of engFlowRows(R.dp,pipeOfExit('t',t.id)).rows)if(r.dir==='in'&&r.o>=0&&ORIGINS[r.o].net==='${id}'&&R.dp.epCity[r.ep]==='par')g+=r.g;return [t.city,g];})))`));

test('home users fetch from CDNs, clouds and hosters; other ISPs and carriers are slivers', () => {
  const { ev, errors } = load();
  parLon(ev);
  const m = JSON.parse(ev("(()=>{const dp=R.dp,t={},tot={v:0};for(let i=0;i<dp.IJ.length;i++){if(dp.IJ[i]<0||dp.epCity[dp.IE[i]]!=='par'||dp.epK[dp.IE[i]]!=='pop')continue;const r=netRole(NETS[dp.IJ[i]]);t[r]=(t[r]||0)+dp.IV[i];tot.v+=dp.IV[i];}for(const k in t)t[k]/=tot.v;return JSON.stringify(t);})()"));
  assert.ok(m.cdn + m.cloud >= 0.6, JSON.stringify(m));
  assert.ok(m.host >= 0.06 && m.host <= 0.18, JSON.stringify(m));
  assert.ok(m.eye <= 0.06, JSON.stringify(m));
  assert.deepEqual(errors, []);
});

test('a GPU customer trains on clouds and hosters, never on NetChill', () => {
  const { ev, errors } = load();
  parLon(ev);
  ev("S.biz.push({id:'gp',type:'gpu',name:'Tensor Toaster',city:'par',bw:40,rate:100,mood:100,since:0,reqs:[]});compute()");
  const roles = JSON.parse(ev("JSON.stringify([...new Set((()=>{const dp=R.dp,o=[];for(let i=0;i<dp.IJ.length;i++)if(dp.epK[dp.IE[i]]==='grp'&&dp.epCls[dp.IE[i]]==='training'&&dp.IJ[i]>=0)o.push(netRole(NETS[dp.IJ[i]]));return o;})())].sort())"));
  assert.deepEqual(roles, ['cloud', 'host']);
  assert.deepEqual(errors, []);
});

test('content enters at the port nearest its server: NetChill for Paris comes in at Paris', () => {
  const { ev, errors } = load();
  parLon(ev);
  const g = byPort(ev, 'nfx');
  assert.ok(g.par > 10, `Paris port ${g.par}`);
  assert.equal(g.lon, 0, 'nothing for Paris rides in through London and over the backbone');
  // The flows window and the looking glass name the server's city.
  ev("ACT.flowsOpen({k:'t',id:S.transit[0].id})");
  assert.match(ev("document.getElementById('modalCard').textContent"), /NetChill · eu-west \(Paris\)/);
  ev("ACT.lg({city:'par',net:'nfx'})");
  assert.match(ev("document.getElementById('modalCard').textContent"), /near Paris/);
  assert.equal(ev("engLookingGlass('par','nfx').inb.find(r=>r.why==='inbest').e.city"), 'par');
  assert.deepEqual(errors, []);
});

test('a flood exactly filling a port still starves the traffic behind it', () => {
  // 0/0 in the priority queue once let best effort through untouched when the junk filled the port to the bit.
  const { ev, errors } = load();
  ev("ACT.start({});S.cash=1e9;S.lvl=4;S.nextFail=1e9;S.nextEvent=1e9;ACT.launchBB({city:'fra'});S.pops.fra.bb.d=40;ACT.buyTransit({city:'fra',net:'cog',tier:1});compute()");
  // Sizes a few rounding steps either side of 300G: some leave the port a hair over full, some a hair under.
  const worst = ev("(()=>{let w=0,g=300;for(let k=0;k<40;k++){S.ev.ddos={id:'a1',city:'fra',tgt:null,vec:'dns',gbps:g,start:S.day,until:S.day+2,bh:false};compute();w=Math.max(w,R.psf.fra);g+=g*Number.EPSILON;}return w;})()");
  assert.ok(worst < 0.05, `home users kept ${worst}`);
  assert.deepEqual(errors, []);
});
