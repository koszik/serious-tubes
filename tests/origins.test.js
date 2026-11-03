// Regions, timezones, origins and traffic classes: the static data the engine runs on (docs/specs/network-engine.md §3).
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');

test('every city has a region and a timezone, and the zones follow the sun or the country', () => {
  const { ev, errors } = load();
  assert.equal(ev('CITIES.filter(c=>!REGIONS.includes(c.rg)||!Number.isFinite(c.tz)).length'), 0);
  assert.deepEqual(ev('JSON.stringify([tzOf("tok"),tzOf("pek"),tzOf("bom"),tzOf("lax"),tzOf("nyc"),tzOf("fra"),tzOf("mad")])'), '[9,8,5.5,-8,-5,1,1]');
  assert.deepEqual(ev('JSON.stringify(["lax","den","chi","nyc","tor","lon","fra","sin","syd"].map(regionOf))'),
    '["us-west","us-west","us-central","us-east","ca","eu-west","eu-central","ap-southeast","oceania"]');
  assert.equal(ev('REGIONS.join()'), ev('REGIONS.slice().sort().join()'), 'sorted');
  // Noon UTC is 21:00 in Tokyo and 17:30 in Mumbai (half-hour zones round down).
  assert.equal(ev('locH(12,tzOf("tok"))'), 21);
  assert.equal(ev('locH(12,tzOf("bom"))'), 17);
  assert.equal(ev('locH(2,tzOf("lax"))'), 18);
  assert.deepEqual(errors, []);
});

test('every network has origins, weighted by what it serves and where its users are', () => {
  const { ev, errors } = load();
  assert.equal(ev('NETS.filter(n=>!(ORIG_BY_NET[n.id]||[]).length).length'), 0);
  const n = ev('ORIGINS.length');
  assert.ok(n >= 300 && n <= 800, `${n} origins`);
  assert.equal(ev('ORIGINS.every((o,i)=>o.i===i&&CITY[o.anchor]&&o.ci===CIDX[o.anchor]&&o.tz===CITY[o.anchor].tz&&REGIONS.includes(o.reg))'), true);
  // Weights add back up to the network's share, by type.
  assert.equal(ev(`NETS.filter(n=>{const L=ORIG_BY_NET[n.id],c=L.reduce((a,o)=>a+o.content,0),u=L.reduce((a,o)=>a+o.users,0);
    return Math.abs(c-(n.share||0)*ORIG_CW[n.type])>1e-9||Math.abs(u-(n.share||0)*ORIG_UW[n.type])>1e-9;}).map(n=>n.id).join()`), '');
  assert.equal(ev("ORIGINS.filter(o=>NET[o.net].type==='cdn'&&o.users>0).length"), 0, 'CDNs have no eyeballs');
  // A big CDN serves from many regions; an American eyeball network lives in the US.
  assert.ok(ev('ORIG_BY_NET.nfx.length') >= 8);
  assert.equal(ev("ORIG_BY_NET.cmc.every(o=>o.reg.startsWith('us-'))"), true);
  const again = load().ev('JSON.stringify(ORIGINS)');
  assert.equal(ev('JSON.stringify(ORIGINS)'), again, 'the same on every load');
  assert.deepEqual(errors, []);
});

test('every customer type has a traffic class, and every shape is a day long', () => {
  const { ev, errors } = load();
  assert.equal(ev('Object.keys(BIZ_T).filter(k=>!BIZ_T[k].fiber&&!TRAFFIC[CLASS_OF[k]]).join()'), '');
  assert.equal(ev('Object.keys(CLASS_OF).filter(k=>!BIZ_T[k]).join()'), '', 'no stale types');
  assert.equal(ev('Object.values(SHAPE).every(a=>a.length===24&&Math.max(...a)===1&&Math.min(...a)>=0)'), true);
  assert.equal(ev('Object.values(TRAFFIC).every(c=>SHAPE[c.shape]&&Math.max(c.in,c.out)===1)'), true);
  // Tokyo's evening peak is around 11–12 UTC; a backup in Frankfurt runs 01–05 local (00–04 UTC); training never sleeps.
  const peakUtc = ev("(()=>{const s=SHAPE.home;let b=0,h0=0;for(let h=0;h<24;h++){const v=s[locH(h,tzOf('tok'))];if(v>b){b=v;h0=h;}}return h0;})()");
  assert.ok(peakUtc >= 11 && peakUtc <= 12, `Tokyo peaks at ${peakUtc} UTC`);
  assert.equal(ev("[...Array(24).keys()].filter(h=>SHAPE.night[locH(h,tzOf('fra'))]===1).join()"), '0,1,2,3,4');
  assert.equal(ev("new Set(SHAPE[TRAFFIC.training.shape]).size"), 1);
  assert.equal(ev("shapeOf({type:'mars',id:'m1'}).filter(v=>v===1).length"), 3, 'three passes a day');
  assert.deepEqual(errors, []);
});
