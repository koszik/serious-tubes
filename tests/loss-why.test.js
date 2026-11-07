// The loss explainer: where a customer's loss comes from at its worst hour (each pipe and router its traffic crosses,
// the Great Firewall, sessions lost with their other half, an attack on top).
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');

const text = (ev) => ev("(document.querySelector('#modal')||document.body).textContent.replace(/\\s+/g,' ')");

test('a full link is named as the cause, with what it drops and how much of the customer crosses it', () => {
  const { ev, errors } = load();
  // Frankfurt's only way out is a 100G wave to Amsterdam's transit; a 400G host fills it.
  ev("ACT.start({});if(UI.pendGame)ACT.pitchSkip();S.cash=1e9;S.lvl=4;S.nextFail=S.nextEvent=1e9;ACT.buildPop({city:'ams'});S.pops.ams.rgen=RG_TOP;ACT.buyTransit({city:'ams',net:'cog',tier:4});UI.pending={a:'fra',b:'ams'};ACT.buildLink({tier:1});closeModal();for(const l of S.links)l.ready=0;S.transit=S.transit.filter(t=>t.city!=='fra');S.pops.fra.rgen=RG_TOP");
  ev("S.biz.push({id:'h',type:'host',name:'Big Host',city:'fra',bw:400,rate:10,mood:80,since:0,reqs:[]});compute()");
  const W = JSON.parse(ev("(()=>{const W=lossWhy(S.biz.find(b=>b.id==='h'));return JSON.stringify({loss:W.loss,rows:W.rows.map(r=>({n:lossName(r.key,R.dp.NE),part:r.part,l:r.l,share:r.share}))});})()"));
  assert.ok(W.loss > 0.3, `it loses a lot (${W.loss})`);
  assert.equal(W.rows[0].n, 'Link Frankfurt → Amsterdam', 'the full wave first');
  assert.ok(W.rows[0].part > W.loss * 0.7, 'and it explains most of it');
  assert.ok(Math.abs(W.rows.reduce((a, r) => a + r.part, 0) - W.loss) < 0.005, 'the parts add up to the loss');
  assert.ok(ev("custPipes(S.biz.find(b=>b.id==='h'))").includes('lossWhy'), 'its port view has the button');
  ev("ACT.lossWhy({id:'h'})");
  assert.match(text(ev), /Where the loss comes from.*Link Frankfurt → Amsterdam.*drops \d+% of what crosses it/);
  assert.deepEqual(errors, []);
});

test('under attack, the explainer adds what the attack costs, and names who is behind the Great Firewall', () => {
  const { ev, errors } = load();
  ev("ACT.start({});if(UI.pendGame)ACT.pitchSkip();S.cash=1e9;S.lvl=4;S.nextFail=S.nextEvent=1e9;ACT.launchBB({city:'fra'});S.pops.fra.bb.d=40;ACT.buyTransit({city:'fra',net:'cog',tier:1})");
  ev("S.pops.fra.rgen=RG_TOP;S.biz.push({id:'g',type:'game',name:'Lag Lords',city:'fra',bw:10,rate:100,mood:80,since:0,reqs:[]});compute()");
  ev("for(const c of ['ams','nyc'])ACT.buildPop({city:c});UI.pending={a:'fra',b:'ams'};ACT.buildLink({tier:1});UI.pending={a:'ams',b:'nyc'};ACT.buildLink({tier:1});closeModal();S.pops.fra.rgen=S.pops.nyc.rgen=S.pops.ams.rgen=RG_TOP;S.links[0].tier=5;S.transit[0].tier=5;ACT.buyTransit({city:'nyc',net:'cog',tier:2});S.scrubs=[{city:'ams',tier:0},{city:'nyc',tier:1}];S.scrubMode='always';compute()");
  ev("S.ev.ddos={id:'zz',city:'fra',tgt:'g',vec:'http',gbps:550,start:S.day,until:S.day+2,bh:false};compute()");
  ev("ACT.lossWhy({id:'g'})");
  assert.match(text(ev), /Under attack, on top.*\d+% more is lost because of the attack/);
  // Its traffic with China's networks crosses the border wherever it is handed over; the row says with whom.
  assert.match(text(ev), /The Great Firewall.*networks in mainland China \([^)]+\) crosses the border, wherever you hand it over/);
  assert.deepEqual(errors, []);
});
