// The internet's latency between cities follows the cables, and latency customers ask for what can really be built.
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');

// Typical measured round trips, ms (public city-to-city latency tables).
const REAL = [['lon', 'nyc', 72], ['lax', 'tok', 105], ['sjc', 'sin', 170], ['fra', 'sin', 155], ['nyc', 'sin', 240], ['lon', 'syd', 270],
  ['fra', 'bom', 115], ['lon', 'jnb', 160], ['mia', 'sao', 115], ['ams', 'hkg', 185], ['lon', 'tok', 220], ['sin', 'syd', 92]];

test('round trips between cities land within 15% of measured ones', () => {
  const { ev, errors } = load();
  ev('ACT.start({})');
  const bad = [];
  for (const [a, b, real] of REAL) {
    const r = ev(`2*worldMs(CIDX.${a},CIDX.${b})`);
    if (Math.abs(r / real - 1) > 0.15) bad.push(`${a}-${b}: ${Math.round(r)} ms against ${real}`);
    assert.ok(Math.abs(ev(`worldMs(CIDX.${a},CIDX.${b})-worldMs(CIDX.${b},CIDX.${a})`)) < 1, `${a}-${b} symmetric`);
  }
  assert.deepEqual(bad, []);
  // A few remote outposts have no path on the map and fall back to a straight 1.6x line; everywhere else has one.
  assert.ok(ev('CITIES.every((c,i)=>worldMs(CIDX.lon,i)<Infinity)'), 'every city has a latency');
  assert.ok(ev('CITIES.filter((c,i)=>!(wlRow(CIDX.lon,WL_LAND)[i]<Infinity)).length') <= 6, 'only a handful of outposts are off the map');
  assert.deepEqual(errors, []);
});

test('international paths do not cross Russia or mainland China; domestic ones may', () => {
  const { ev, errors } = load();
  ev('ACT.start({})');
  // London–Tokyo by sea or by the US: far longer than the straight line over Siberia.
  assert.ok(ev('2*worldMs(CIDX.lon,CIDX.tok)') > 1.5 * ev('2*kmI(CIDX.lon,CIDX.tok)*1.3/200'));
  // Moscow–Vladivostok goes across Russia.
  assert.ok(ev('worldMs(CIDX.mos,CIDX.vvo)') < 1.5 * ev('kmI(CIDX.mos,CIDX.vvo)*WL_LAND/200'));
  assert.deepEqual(errors, []);
});

test('latency customers ask for the best you could build, plus 15%, and it can be met', () => {
  const { ev, errors } = load();
  ev('ACT.start({})');
  for (const [a, b] of [['nyc', 'lon'], ['nyc', 'chi'], ['lon', 'tok'], ['tok', 'sin'], ['fra', 'lon']]) {
    const best = ev(`bestBuildMs('${a}','${b}')`), ask = ev(`latMaxOf('${a}','${b}')`);
    assert.ok(Math.abs(ask - best * 1.15) < 0.06, `${a}-${b}: asks ${ask} for a best of ${best}`);
    assert.ok(best <= ev(`worldMs(CIDX.${a},CIDX.${b})`) + 1e-9, `${a}-${b}: a build can beat the internet`);
  }
  // The old straight-line ask from London to Tokyo was faster than any real route.
  assert.ok(ev("latMaxOf('lon','tok')") > ev("kmBetween('lon','tok')/200*1.35"));
  assert.ok(ev("bestBuildMs('nyc','lon')") > 24 && ev("bestBuildMs('nyc','lon')") < 32, 'New York–London: about the fastest cable');
  assert.deepEqual(errors, []);
});
