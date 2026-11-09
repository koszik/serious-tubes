// "Why this mood?": the day's happiness change, test by test, from the same moodParts() the daily update applies.
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');

function net(ev) {
  ev("ACT.start({});if(UI.pendGame)ACT.pitchSkip();S.cash=1e9;S.lvl=6;S.nextFail=S.nextEvent=1e9;for(const g of GOALS)S.done[g.id]=0;S.pops.fra.rgen=RG_TOP;ACT.buyTransit({city:'fra',net:'cog',tier:2})");
  ev("S.biz.push({id:'h',type:'host',name:'Happy Host',city:'fra',bw:5,rate:100,mood:100,since:-99,reqs:[]},{id:'s',type:'host',name:'Sad Host',city:'fra',bw:5,rate:100,mood:50,since:-99,reqs:['nocog']});S.day=100;compute()");
}

test('the explainer and the daily update agree, test by test', () => {
  const { ev, errors } = load();
  net(ev);
  const M = JSON.parse(ev("JSON.stringify(moodParts(S.biz.find(b=>b.id==='s')))"));
  assert.equal(M.ok, false, 'its requirement (no Cogentle) is not met');
  assert.equal(M.parts.find((p) => p.k === 'reqs').ok, false);
  const before = ev("S.biz.find(b=>b.id==='s').mood");
  ev('dayTick()');
  const after = ev("S.biz.find(b=>b.id==='s').mood");
  assert.ok(Math.abs(after - before - M.delta) < 1e-9, `the day moved it by ${after - before}, the explainer said ${M.delta}`);
  assert.deepEqual(errors, []);
});

test('the button shows on an unhappy customer, not on a happy one at 100; the modal lists the tests', () => {
  const { ev, errors } = load();
  net(ev);
  assert.equal(ev("moodBtn(S.biz.find(b=>b.id==='h'))"), '');
  assert.match(ev("moodBtn(S.biz.find(b=>b.id==='s'))"), /moodWhy/);
  ev("selectCity('fra');UI.tab='cust';renderPanel()");
  assert.match(ev('document.body.textContent'), /Why this mood\?/, 'in the city panel');
  ev("ACT.moodWhy({id:'s'})");
  const t = ev("document.querySelector('#modal').textContent.replace(/\\s+/g,' ')");
  assert.match(t, /Why this mood.*Sad Host/);
  assert.match(t, /a day: it gains only when every test below passes/);
  assert.match(t, /✅ Service/);
  assert.match(t, /❌ Its requirements/);
  assert.match(t, /Latency/);
  assert.deepEqual(errors, []);
});
