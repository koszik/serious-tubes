// The game's design rules (.claude/skills/gameplay-rules/SKILL.md): one test per rule id, on the live data.
// A rule may only be broken by an entry in EXCEPTIONS below, with its reason. Never delete a check to make it pass.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');
const { load } = require('./harness');

// Every exception names what breaks the rule and why. One per line, sorted within each rule.
const EXCEPTIONS = {
  // W2: countries with fewer than two consumer networks of their own, because real life has fewer.
  W2: {
    CU: 'Cuba has one state operator (ETECSA); Cubacel is its own mobile brand',
    DJ: 'Djibouti Telecom is the monopoly for homes and phones',
    GL: 'Greenland has one operator (Tusass), for homes, phones and the cables',
    MH: 'the Marshall Islands have one telco (NTA)',
    PN: 'Pitcairn has no network at all: land your own cable (#124)',
    SH: 'St Helena has one operator (Sure South Atlantic)',
  },
  // W3: cities nobody sells transit in.
  W3: {
    ivc: 'Invercargill waits for its AI campus; nobody sells transit there yet',
    pcn: 'Pitcairn: no cable, no network, land your own (#124)',
    prr: 'Prince Rupert is a remote town with no carrier in it',
    sre: "Sucre has no exchange or carrier facility: Bolivia's transit is bought in La Paz",
    stg: 'Stuttgart is the Only Spätzle-IX scenario city: peering only, by design (#114)',
    yfb: 'Iqaluit has no fiber, only satellite: land your own cable (the real plan runs from Nuuk)',
    yyj: 'Victoria buys from Telus and Rogers, consumer networks only in the game: link it from Vancouver',
  },
  // N3: networks in no founding Tier 1's customer cone. Old saves need PNIs with the founding five for Tier 1,
  // so anyone outside their cones has to be peered with directly.
  N3: {
    abb: 'Australians buy only from Australian carriers (#148)',
    atl: 'transit-free in India',
    bcd: 'transit-free in Canada',
    blg: 'Australian, buys from Telstraya (#148)',
    btt: 'transit-free incumbent',
    cht: 'transit-free in Taiwan',
    clr: 'America Movil, transit-free across Latin America',
    cmb: 'China (#59): reached through the Chinese carriers',
    cmc: 'transit-free incumbent',
    cos: 'Greek incumbent, peers for its own reach',
    ctc: 'China (#59)',
    cun: 'China (#59)',
    cxc: 'buys from Spectre-um, which is transit-free',
    drz: 'a transit-free Tier 2',
    etc: 'Cuba: buys from Sparkly Seabone, a Tier 1 only for games since 1.12',
    ets: 'transit-free in the Gulf',
    ftr: 'buys from Very-Zone, which is transit-free',
    inp: 'Australian, buys from Toilet Paper Group (#148)',
    jio: 'transit-free in India',
    kdi: 'transit-free in Japan',
    ktt: 'Korea: sender pays, peer with it yourself',
    lgu: 'Korea: sender pays',
    lnt: 'Australian (#148)',
    lpt: 'Australian (#148)',
    meo: 'Portuguese incumbent, peers for its own reach',
    mgf: 'Russia: buys from Rostelecomedy (#70)',
    npt: 'Australian (#148)',
    ert: 'Russia: buys from Rostelecomedy (#70)',
    opt: 'Australian, buys from SingTell (#148)',
    pnt: 'Australian (#148)',
    rtc: 'Russia (#70)',
    sel: 'Russia: a Moscow hoster behind Rostelecomedy (#70)',
    sgt: 'a transit-free Tier 2',
    skb: 'Korea: sender pays',
    spc: 'transit-free incumbent',
    stb: 'satellite: peers for its own reach',
    stc: 'transit-free in Saudi Arabia',
    teg: 'owns the land crossing; transit-free',
    tim: 'buys from Sparkly Seabone, a Tier 1 only for games since 1.12',
    tmt: 'buys from Sparkly Seabone, a Tier 1 only for games since 1.12',
    tmx: 'transit-free in Mexico',
    tmy: 'Malaysian incumbent, peers for its own reach',
    tpr: 'Australian (#148)',
    tsf: 'Indonesian incumbent, peers for its own reach',
    tsy: 'Australian, transit-free (#148)',
    ttk: 'transit-free in Turkey',
    ups: 'European cable group, peers for its own reach',
    vdp: 'a transit-free Tier 2',
    viv: 'transit-free in Brazil',
    vzn: 'transit-free incumbent',
  },
  // N7: an exchange port where the network has no PoP.
  N7: {
    'spl:hba': 'Speedyloop reaches Hobart’s exchange over its own backhaul but sells no transit there',
  },
  // M3: subsystems that annoy the player but read no rule.
  M3: {},
};

// The real names the puns are based on. No network, cable, exchange, data center, router or optic may be called one.
const REAL_NAMES = [
  // Tier 1s and carriers
  'AT&T', 'Bell Aliant', 'BICS', 'Cogent', 'GTT', 'Hurricane Electric', 'Level 3', 'Level3', 'Liquid', 'Liquid Intelligent Technologies', 'Lumen', 'Northwestel', 'NTT', 'Orange', 'PCCW', 'SaskTel', 'Seacom', 'Singtel', 'Sparkle', 'Tata', 'Tata Communications', 'Telia', 'Telxius', 'Tusass', 'Vodafone', 'Zayo',
  // content and clouds
  'Akamai', 'Alibaba Cloud', 'Amazon', 'Amazon Web Services', 'AWS', 'Baidu', 'ByteDance', 'Cloudflare', 'Facebook', 'Fastly', 'Google', 'Mercado Libre', 'Meta', 'Microsoft', 'Netflix', 'Tencent', 'TikTok', 'VK', 'VKontakte', 'Yandex',
  // hosters
  'Afrihost', 'Contabo', 'DigitalOcean', 'E2E Networks', 'Exabytes', 'Hetzner', 'Leaseweb', 'Linode', 'Locaweb', 'OVH', 'OVHcloud', 'Rackspace', 'Sakura Internet', 'Scaleway', 'Selectel', 'VentraIP', 'Vultr',
  // eyeballs and incumbents
  ', ', 'A1', 'A1 Telekom Austria', 'Airtel', 'AIS', 'Algérie Télécom', 'Altibox', 'Altice', 'America Movil', 'Angola Cables', 'Antel', 'ASTCA', 'Aussie Broadband', 'Belize Telemedia', 'Bell', 'Bell Canada', 'Belong', 'Bemobile', 'Brisanet', 'BT', 'BTC', 'Cable & Wireless', 'Cable Bahamas', 'Guyana Telephone & Telegraph', 'L", ', 'Natcom', 'SMART', 'Speednet', 'Telesur',
  // exchanges and data centers
  'AMS-IX', 'Any2', 'BCIX', 'CoreSite', 'DANIX', 'DE-CIX', 'DigiCo', 'Digital Realty', 'Equinix', 'France-IX', 'GREX', 'HIX', 'Interxion', 'iseek', 'IX.br', 'IXP-HN', 'JPIX', 'LINX', 'NAPAfrica', 'NetIX', 'NEXTDC', 'NIX', 'NL-ix', 'SIX', 'SKNIX', 'SUR-IX', 'SVGIX', 'Telehouse',
  // cables
  '2Africa', 'Amitié', 'BDSNi', 'CARCIP', 'Darwin-Jakarta-Singapore Cable', 'Deep Blue One', 'Dunant', 'Eastern Caribbean Fiber System', 'EllaLink', 'Equiano', 'Fibralink', 'Grace Hopper', 'Greenland Connect', 'Greenland Connect North', 'Hibernia Express', 'Jupiter', 'MAREA', 'North West Cable System', 'PEACE', 'SEA-ME-WE 6', 'SG-SCS', 'Southern Caribbean Fiber', 'X-Link',
  // cable ships, their operators and maintenance clubs
  'ACMA', 'ASEAN Explorer', 'ASEAN Protector', 'ASEAN Restorer', 'Cable Innovator', 'Cable Retriever', 'Global Marine', 'Léon Thévenin', 'MECMA', 'Orange Marine', 'Pierre de Fermat', 'René Descartes', 'SEAIOCMA', 'Sophie Germain', 'Sovereign', 'Wave Sentinel', 'Yokohama Zone',
  // vendors
  'Arista', 'Brocade', 'Ciena', 'Cisco', 'Extreme Networks', 'Huawei', 'Infinera', 'Juniper', 'MikroTik', 'Nokia',
];

const { ev, errors } = load();
ev('ACT.start({})');
const J = (s) => JSON.parse(ev(`JSON.stringify(${s})`));
const country = (cc) => { try { return new Intl.DisplayNames(['en'], { type: 'region' }).of(cc); } catch (e) { return cc; } };
const fail = (id, bad, fix) => assert.deepEqual(bad, [], `${id}: ${bad.join('; ')}. ${fix}`);
const ex = (id, k) => Object.prototype.hasOwnProperty.call(EXCEPTIONS[id] || {}, k);

// ---------- World ----------

test('W1: every city has a country code, a region and real coordinates', () => {
  const bad = J(`CITIES.filter(c=>!/^[A-Z]{2}$/.test(c.cc||'')||!['AM','SA','EU','AS','OC','AF'].includes(c.reg)||!(Math.abs(c.lat)<=90&&Math.abs(c.lon)<=180&&CITY_LL[c.id])||!c.land).map(c=>c.id+' ('+c.name+')')`);
  fail('W1', bad, 'give it cc (ISO 3166-1 alpha-2; territories have their own), reg, land and an entry in CITY_LL');
});

test('W2: every country on the map has at least two consumer networks of its own', () => {
  // "Own": the network names the country in its home markets (cc) and has a PoP there. Consumer networks are the
  // eyeballs, and the Tier 1 and Tier 2 incumbents (Doitsche, Tangerine) that sell to homes and phones there.
  const rows = J(`(()=>{const cs={};for(const c of CITIES)if(!c.off)(cs[c.cc]=cs[c.cc]||[]).push(c.id);
    return Object.keys(cs).sort().map(cc=>[cc,NETS.filter(n=>n.type!=='cdn'&&[].concat(n.cc||[]).includes(cc)&&n.pops.some(p=>CITY[p].cc===cc)).map(n=>n.name)]);})()`);
  const bad = rows.filter(([cc, own]) => own.length < 2 && !ex('W2', cc))
    .map(([cc, own]) => `${country(cc)} (${cc}) has ${own.length} own eyeball network${own.length === 1 ? '' : 's'}${own.length ? ': ' + own.join(', ') : ''}`);
  fail('W2', bad, 'add a real operator of that country (src/game/30-networks/32-homegrown-eyeballs.js) or list it in EXCEPTIONS with a reason');
  const stale = Object.keys(EXCEPTIONS.W2).filter((cc) => (rows.find((r) => r[0] === cc) || [cc, [1, 2]])[1].length >= 2);
  assert.deepEqual(stale, [], 'W2: these exceptions are no longer needed; remove them');
  // a network's home markets are places it really is
  const homeless = J(`NETS.filter(n=>n.cc).flatMap(n=>[].concat(n.cc).filter(cc=>!n.pops.some(p=>CITY[p].cc===cc)).map(cc=>n.name+' has no PoP in '+cc))`);
  fail('W2', homeless, 'a home market (cc) needs a PoP in that country');
});

test('W3: every city can buy transit from someone, or is a documented exception', () => {
  const bad = J(`CITIES.filter(c=>!c.off&&!NETS.some(n=>sellsAt(n,c.id))).map(c=>c.id)`).filter((c) => !ex('W3', c));
  fail('W3', bad, 'give a carrier a PoP there (with a price) or list the city in EXCEPTIONS with a reason');
});

test('W4: cables are consistent: real cities, two distinct ends, a length and unique ids', () => {
  const bad = J(`CABLE_PAIRS.filter(p=>!CITY[p.a]||!CITY[p.b]||p.a===p.b||!(p.km>0)||!CAB[p.cid]).map(p=>p.cid+':'+p.a+'-'+p.b)`);
  fail('W4', bad, 'fix the cable pair in src/game/20-world/60-cables.js');
  const ids = J('CABLES.map(c=>c.id)');
  assert.equal(new Set(ids).size, ids.length, 'W4: cable ids are unique');
  fail('W4', J("CABLES.filter(c=>!c.name||!c.pairs||!c.pairs.length).map(c=>c.id)"), 'every cable has a name and at least one landing pair');
});

test('W5: every island city can be reached: it shares its land, has a cable, or a beach to land one', () => {
  const bad = J(`CITIES.filter(c=>!c.off&&!CITIES.some(o=>o!==c&&!o.off&&(o.land===c.land||o.land2===c.land||c.land2===o.land))&&!landing(c.id)).map(c=>c.id)`);
  fail('W5', bad, 'land a cable there or give it beach:true');
});

test('W6: internet latency follows the cables, within 15% of measured RTTs, and never transits Russia or mainland China', () => {
  const g = load(), bad = [];
  g.ev('ACT.start({})');
  for (const [a, b, real] of [['lon', 'nyc', 72], ['fra', 'sin', 155], ['lon', 'tok', 220], ['ams', 'hkg', 185], ['lax', 'tok', 105], ['lon', 'syd', 270]]) {
    const r = g.ev(`2*worldMs(CIDX.${a},CIDX.${b})`);
    if (Math.abs(r / real - 1) > 0.15) bad.push(`${a}-${b} ${Math.round(r)} ms against ${real}`);
  }
  if (g.ev("latMaxOf('lon','tok')") < g.ev("bestBuildMs('lon','tok')")) bad.push('a latency customer asks for less than anyone could build');
  fail('W6', bad, 'fix the cable catalog (a missing or mislaid cable), not the factors');
  assert.deepEqual(g.errors, []);
});

// ---------- Networks ----------

test('N1: network ids and ASNs are unique, ASNs are valid', () => {
  const ids = J('NETS.map(n=>n.id)'), asns = J('NETS.map(n=>n.asn)');
  fail('N1', ids.filter((x, i) => ids.indexOf(x) !== i), 'network ids must be unique');
  fail('N1', asns.filter((x, i) => asns.indexOf(x) !== i).map(String), 'ASNs must be unique');
  fail('N1', J("NETS.filter(n=>!Number.isInteger(n.asn)||n.asn<1||n.asn>4294967294||n.asn>=64512&&n.asn<=65534).map(n=>n.id)"), 'use the real, public ASN');
});

test('N2: names are puns: no network, cable, exchange, data center, router, optic or cable ship carries a real name', () => {
  const norm = (s) => String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[’`]/g, "'").replace(/\s+/g, ' ').trim();
  const real = new Set(REAL_NAMES.map(norm));
  const names = J(`[...NETS.map(n=>['network',n.name]),...CABLES.map(c=>['cable',c.name]),...XIX.map(x=>['exchange',x.name]),
    ...CITIES.flatMap(c=>[['exchange',c.ix],['data center',c.dc],['data center',c.dc2]]),...RG.map(r=>['router',r.n]),...Object.values(OPT).map(o=>['optic',o.n]),...Object.values(SEAT_ROUTES).flat().map(r=>['cable',r[2]]),...SHIPS.map(x=>['cable ship',x.n]),...LAY_SHIPS.map(n=>['cable ship',n]),...Object.values(SHIP_CLUBS).map(c=>['maintenance club',c.n])].filter(x=>x[1])`);
  fail('N2', names.filter(([, n]) => real.has(norm(n))).map(([k, n]) => `${k} “${n}” is a real name`), 'find a pun');
  fail('N2', names.filter(([, n]) => /-ish\b/i.test(n)).map(([k, n]) => `${k} “${n}”`), 'no lazy -ish names: find a real pun, or keep the plain word');
});

test('N3: every network sits in a founding Tier 1’s customer cone, or is a documented island', () => {
  // The founding five (t1Need() of the oldest saves): every save can reach a network in their cones by peering with them.
  const out = J(`NETS.filter(n=>n.type!=='t1'&&n.type!=='cdn'&&!['lvl','ntt','tly','cog','tat'].some(t=>CONE_S[t].has(n.id))).map(n=>n.id)`);
  fail('N3', out.filter((id) => !ex('N3', id)).map((id) => `${id} (${ev(`NET.${id}.name`)})`), 'give it a realistic upstream (up) in a founding Tier 1’s cone, or list it in EXCEPTIONS with a reason');
  fail('N3', Object.keys(EXCEPTIONS.N3).filter((id) => !out.includes(id)), 'these exceptions are no longer needed; remove them');
  fail('N3', J("NETS.filter(n=>(n.up||[]).some(u=>!NET[u]||NET[u].type==='cdn'||NET[u].type==='host'||u===n.id)).map(n=>n.id)"), 'an upstream is another network that exists and sells transit, never content');
});

test('N4: no upstream cycles', () => {
  const bad = J(`(()=>{const o=[];for(const n of NETS){const seen=new Set(),q=(n.up||[]).slice();while(q.length){const u=q.pop();if(u===n.id){o.push(n.id);break;}if(seen.has(u))continue;seen.add(u);q.push(...((NET[u]||{}).up||[]));}}return o;})()`);
  fail('N4', bad, 'a network cannot buy transit from its own customers');
});

test('N5: traffic shares are sane', () => {
  fail('N5', J("NETS.filter(n=>!(n.share>0&&n.share<0.2)).map(n=>n.id)"), 'every share is positive and below 20%');
  for (const t of ['NSH', 'NSH_CN', 'NSH_RU', 'NSH_KRX']) {
    assert.ok(Math.abs(ev(`Object.values(${t}).reduce((a,b)=>a+b,0)`) - 1) < 1e-9, `N5: ${t} sums to 1`);
    fail('N5', J(`Object.entries(${t}).filter(([k,v])=>!NET[k]||!(v>=0)).map(([k])=>k)`), `${t} only holds real networks, never negative`);
  }
  // the content giants carry the traffic, eyeballs mostly ask for it
  assert.ok(ev("NETS.filter(n=>n.type==='cdn').reduce((a,n)=>a+NSH[n.id],0)") > 0.3, 'N5: content is at least 30% of traffic');
});

test('N6: every network has a type, a peering policy and a translated blurb', () => {
  fail('N6', J(`NETS.filter(n=>!['t1','t2','cdn','host','eye'].includes(n.type)||!['open','selective','restrictive','paid'].includes(n.pol)||!n.blurb||!n.col).map(n=>n.id)`), 'set type, pol, col and blurb:tr(...)');
  fail('N6', J("NETS.filter(n=>n.pol==='selective'&&!(n.minIx>=1&&n.minPni>=1)).map(n=>n.id)"), 'selective networks state minIx and minPni');
  fail('N6', J("NETS.filter(n=>n.type==='t1'||n.type==='t2'?!(n.price>0):false).map(n=>n.id)"), 'carriers have a transit price');
});

test('N7: presence is real: PoPs are cities, exchange ports only where the network is', () => {
  fail('N7', J("NETS.filter(n=>!n.pops.length||n.pops.some(c=>!CITY[c])||new Set(n.pops).size!==n.pops.length).map(n=>n.id)"), 'PoPs are real, distinct city ids');
  const bad = J(`NETS.filter(n=>Array.isArray(n.ix)).flatMap(n=>n.ix.filter(c=>!XIXM[c]&&(!CITY[c]||!CITY[c].ix||!n.pops.includes(c))).map(c=>n.id+':'+c))`).filter((k) => !ex('N7', k));
  fail('N7', bad, 'an exchange port needs an exchange in that city and a PoP there');
});

// ---------- Modes and rules ----------

test('M1: On-call is the classic game: the default rules, and what old saves load as', () => {
  assert.deepEqual(J("(({preset,mods,...r})=>r)(makeRules('oncall'))"), J("(({mods,...r})=>{for(const k of RULE_LATE)delete r[k];return r;})(RULE_DEF)"), 'M1: On-call is RULE_DEF');
  assert.deepEqual(J("(()=>{const o=S.rules;S.rules=makeRules('oncall');const v=Object.keys(RULE_OK).map(rule);S.rules=o;return v;})()"), J("Object.keys(RULE_OK).map(k=>RULE_DEF[k])"), 'M1: and plays as RULE_DEF');
  assert.equal(ev("(()=>{const o=S.rules;delete S.rules;const p=rulePreset();S.rules=o;return p;})()"), 'oncall', 'M1: no rules means On-call');
  // the seeded On-call games are the rest of the suite (tests/game.test.js, tests/rules.test.js); they must stay green
});

test('M2: presets are ordered: Best Effort never harsher than Change Freeze, Change Freeze never harsher than On-call, BGP at 3 a.m. never gentler', () => {
  const P = J('PRESETS'), C = J('CHAOS'), D = J('RULE_DEF'), lead = { quick: 0, real: 1 }, v = (p, k) => P[p][k] !== undefined ? P[p][k] : D[k];
  assert.ok(C[P.soft.chaos].m <= C[P.freeze.chaos].m && C[P.freeze.chaos].m <= C[P.oncall.chaos].m && C[P.oncall.chaos].m <= C[P.bgp.chaos].m, 'M2: chaos');
  assert.ok(lead[P.soft.lead] <= lead[P.freeze.lead] && lead[P.freeze.lead] <= lead[P.oncall.lead] && lead[P.oncall.lead] <= lead[P.bgp.lead], 'M2: lead times');
  assert.ok((!P.soft.market || P.freeze.market) && (!P.freeze.market || P.oncall.market), 'M2: market');
  // The softenings only Best Effort has: every other Normal preset keeps the classic game's.
  for (const k of ['sea', 'confs', 'broke', 'moods', 'pnis']) for (const p of ['freeze', 'oncall', 'bgp']) assert.equal(v(p, k), D[k], `M2: ${p} keeps ${k}`);
  assert.deepEqual(['sea', 'confs', 'broke', 'moods', 'pnis'].map((k) => v('soft', k)), ['timer', false, 'rescue', 'patient', 'instant'], 'M2: Best Effort softens them all');
  assert.ok(P.bgp.market && P.bgp.money === 'normal' && P.bgp.gates === 'ladder', 'M2: BGP keeps every hardship');
  // seeded: the same network for a year under each preset
  const n = {};
  for (const p of ['soft', 'freeze', 'oncall', 'bgp']) {
    const g = load();
    g.ev(`beginGame('Order','fra',${JSON.stringify({ mode: 'normal', preset: p })});if(UI.pendGame)ACT.pitchSkip();S.cash=1e9;ACT.launchBB({city:'fra'});ACT.buyTransit({city:'fra',net:'cog',tier:1});__reseed(4242);for(let i=0;i<360;i++)dayTick()`);
    n[p] = g.ev('S.inc.length+S.stats.survived+(S.stats.incidents||0)');
    assert.deepEqual(g.errors, []);
  }
  assert.ok(n.soft <= n.freeze && n.freeze <= n.oncall && n.oncall <= n.bgp, `M2: incidents in a year: soft ${n.soft}, freeze ${n.freeze}, on-call ${n.oncall}, bgp ${n.bgp}`);
});

test('M3: every subsystem that can annoy the player reads a rule', () => {
  // [function, what it must read]
  const reads = [['dayPost', 'chaosMul()'], ['fireEvent', "rule('market')"], ['ddosTick', 'ddosOff()'],
    ['soldOut', "rule('market')"], ['hwMul', "rule('market')"], ['leadDays', "rule('lead')"], ['pniLead', 'leadDays'],
    ['dfBuildDays', 'leadDays'], ['dayPre', "rule('clock')"], ['snub', "rule('market')"], ['fireFailure', 'shipsOn()'],
    ['upcomingConfs', 'confsOn()'], ['pniLead', 'pniNow()'], ['dayPost', "rule('broke')"], ['moodEase', "rule('moods')"], ['toast', 'quietOn()']];
  fail('M3', reads.filter(([f, r]) => !ev(`typeof ${f}==='function'&&${f}.toString().includes(${JSON.stringify(r)})`)).map(([f, r]) => `${f}() does not read ${r}`), 'gate it on the ruleset (src/game/40-progress/30-rules.js)');
  // and in play: no chaos and no market means a quiet year
  const g = load();
  g.ev("beginGame('Quiet','fra',{mode:'normal',preset:'oncall'});if(UI.pendGame)ACT.pitchSkip();S.rules=makeRules('oncall',{chaos:'none',market:false});S.cash=1e9;ACT.launchBB({city:'fra'});ACT.buyTransit({city:'fra',net:'cog',tier:1});ACT.buyIx({city:'fra',tier:1,signed:true});for(let i=0;i<360;i++)dayTick()");
  assert.equal(g.ev('S.inc.length+(S.stats.incidents||0)'), 0, 'M3: nothing breaks without chaos');
  assert.equal(g.ev("hwMul('rt')"), 1, 'M3: no hardware inflation without the market');
  assert.equal(g.ev("CITIES.slice(0,40).some(c=>soldOut('fra',c.id,1))"), false, 'M3: no sold-out routes without the market');
  assert.deepEqual(g.errors, []);
  assert.ok(Object.keys(EXCEPTIONS.M3).every((f) => ev(`typeof ${f}==='function'`)), 'M3: exceptions name real functions');
});

test('M4: scenarios and the weekly challenge always run On-call', () => {
  const g = load();
  const bad = [];
  for (const id of g.ev('JSON.stringify(SCN.map(x=>x.id))') && JSON.parse(g.ev('JSON.stringify(SCN.map(x=>x.id))'))) {
    g.ev(`beginGame('S','${id}'==='weekly'?'fra':SCN.find(x=>x.id==='${id}').city,{mode:'normal',preset:'bgp',rules:{chaos:'spicy'},scn:SCN.find(x=>x.id==='${id}')});if(UI.pendGame)ACT.pitchSkip()`);
    if (g.ev('S.rules.preset') !== 'oncall' || g.ev("rule('chaos')") !== 'normal') bad.push(id);
  }
  g.ev("ACT.startWeekly({sure:1});if(UI.pendGame)ACT.pitchSkip()");
  if (g.ev('S.scn&&S.scn.id') !== 'weekly' || g.ev('S.rules.preset') !== 'oncall') bad.push('weekly');
  fail('M4', bad, 'beginGame() must give scenarios On-call plus their own S.scn.rules');
  assert.deepEqual(g.errors, []);
});

test('M5: Sandbox has no locked feature', () => {
  const g = load();
  g.ev("beginGame('Box','fra',{mode:'sandbox'});if(UI.pendGame)ACT.pitchSkip()");
  assert.equal(g.ev('gatesOpen()'), true, 'M5: gates open');
  assert.equal(g.ev('lvl()'), g.ev('LEVELS.length'), 'M5: every level unlocked');
  assert.equal(g.ev('cabOpen()'), true, 'M5: own subsea cables');
  assert.equal(g.ev("rule('money')"), 'infinite', 'M5: money');
  assert.deepEqual(g.errors, []);
});

// ---------- Content ----------

test('C1: every scenario has a goal its card checks, and none is won on day 0', () => {
  const g = load();
  const ids = JSON.parse(g.ev('JSON.stringify(SCN.map(x=>x.id))'));
  assert.equal(new Set(ids).size, ids.length, 'C1: scenario ids are unique');
  const bad = [];
  for (const id of ids) {
    g.ev(`ACT.startScn({id:'${id}',sure:1});if(UI.pendGame)ACT.pitchSkip()`);
    const def = `SCN.find(x=>x.id==='${id}')`;
    if (!g.ev(`!!(${def}.n&&${def}.d&&${def}.goal&&typeof ${def}.ok==='function'&&${def}.days>0&&CITY[${def}.city])`)) bad.push(id + ': incomplete definition');
    if (g.ev(`(()=>{try{return !!${def}.ok();}catch(e){return false;}})()`)) bad.push(id + ': won on day 0');
    if (!g.ev(`typeof SCN_PROG['${id}']==='function'&&scnProg().items.length>0`)) bad.push(id + ': no progress card (SCN_PROG)');
  }
  // The published weekly scenarios too: each committed week starts, has its goal type's card, and needs play.
  const wdir = path.join(__dirname, '..', 'site', 'scenarios', 'weekly');
  for (const f of fs.readdirSync(wdir).filter((x) => /^\d{4}-W\d{2}\.json$/.test(x))) {
    const j = fs.readFileSync(path.join(wdir, f), 'utf8'), id = 'weekly ' + f.slice(0, -5);
    if (!g.ev(`wsBegin(${j},'S')`)) { bad.push(id + ': the game rejects it'); continue; }
    g.ev('if(UI.pendGame)ACT.pitchSkip();closeModal();compute()');
    if (g.ev('wsOk()')) bad.push(id + ': won on day 0');
    if (!g.ev('scnProg().items.length>0&&!!scnName()&&!!wsGoalTxt(S.scn.wk)')) bad.push(id + ': no progress card or goal');
    if (g.ev('S.rules.preset') !== 'oncall') bad.push(id + ': not On-call (M4)');
  }
  fail('C1', bad, 'give it n, d, goal, ok(), days, a city and a SCN_PROG entry; its goal must need play');
  assert.deepEqual(g.errors, []);
});

test('C2: every puzzle has a 1-star and a 3-star reference solution (tests/puzzles.test.js)', () => {
  const src = fs.readFileSync(path.join(__dirname, 'puzzles.test.js'), 'utf8');
  const refs = [...src.matchAll(/^\s{2}([a-z0-9]+): \{ one: .*three: /gm)].map((m) => m[1]);
  fail('C2', J('PZ.map(p=>p.id)').filter((id) => !refs.includes(id)), 'add its reference solutions to REF in tests/puzzles.test.js (that suite builds and scores them)');
});

test('C3: every player-facing string is translated in every language', () => {
  const out = execFileSync(process.execPath, [path.join(__dirname, '..', 'scripts', 'i18n-check.js')], { encoding: 'utf8' });
  assert.match(out, /en\.js: \d+ labels, 0 problems/, 'C3: ' + out);
  const langs = out.split('\n').filter((l) => /^[a-z]{2}\.js: \d+ missing/.test(l));
  assert.ok(langs.length >= 5, 'C3: every language is checked');
  fail('C3', langs.filter((l) => !/0 missing, 0 unused, 0 broken/.test(l)), 'run node scripts/i18n-add.js (add-strings skill)');
});

// ---------- Fun and fairness ----------

test('F1: new players get a gentle start: nothing breaks for 45 days, no sold-out routes for 90, no hardware inflation for 180', () => {
  const g = load();
  g.ev("beginGame('New','fra',{mode:'normal',preset:'oncall'});if(UI.pendGame)ACT.pitchSkip()");
  assert.ok(g.ev('S.nextFail') >= 45 && g.ev('S.nextEvent') >= 40, 'F1: first outage after day 45, first event after day 40');
  // the first events are only good news or harmless (a viral hit, a price change, a grant)
  const opts = JSON.parse(g.ev(`(()=>{let o=null;const f=eval('('+fireEvent.toString().replace('const e=pick(opts);','o=opts.slice();return;')+')');S.day=45;f();return JSON.stringify(o);})()`));
  fail('F1', opts.filter((e) => !['viral', 'price', 'grant'].includes(e)), 'no bad events before day 50');
  assert.equal(g.ev("(()=>{for(let d=0;d<90;d++){S.day=d;if(CITIES.some(c=>soldOut('fra',c.id,1)))return true;}return false;})()"), false, 'F1: nothing sold out in the first 90 days');
  assert.equal(g.ev("(()=>{S.day=180;return hwMul('rt');})()"), 1, 'F1: hardware prices hold for 180 days');
  // customers get 15 days before a bad day costs them mood
  g.ev("S.day=10;S.biz=[{id:'b1',city:'fra',city2:null,reqs:[],name:'X',type:'host',bw:5,rate:100,mood:80,since:5}];compute();dayTick()");
  assert.ok(g.ev("(S.biz[0]||{mood:0}).mood") >= 80, 'F1: no mood loss in a customer’s first 15 days');
  assert.deepEqual(g.errors, []);
});

test('F2: a simple build in a start city makes money within three months on On-call', () => {
  // Reference build: launch broadband, the cheapest 100G transit in town, and a port with a route server where there is an exchange.
  const bad = [];
  for (const city of ['fra', 'nyc', 'sin', 'jnb']) {
    const g = load();
    g.ev(`beginGame('Ref','${city}',{mode:'normal',preset:'oncall'});if(UI.pendGame)ACT.pitchSkip()`);
    g.ev(`(()=>{const c='${city}',n=NETS.filter(n=>sellsAt(n,c)).sort((a,b)=>a.price*netMult(a,c)-b.price*netMult(b,c))[0];
      ACT.launchBB({city:c});ACT.buyTransit({city:c,net:n.id,tier:1});if(ixName(c)){ACT.buyIx({city:c,tier:1,signed:true});ACT.rs({city:c});}})()`);
    let month = 0;
    for (let m = 1; m <= 3 && !month; m++) { g.ev('for(let i=0;i<30;i++)dayTick()'); if (g.ev('R.revMo-R.costMo') > 0) month = m; }
    if (!month || g.ev('S.lost')) bad.push(`${city}: still losing money after 3 months (${Math.round(g.ev('R.revMo-R.costMo'))}/mo)`);
    assert.deepEqual(g.errors, []);
  }
  fail('F2', bad, 'a balance change made the start too hard; fix the balance, or argue for a new N in the gameplay-rules skill');
});

test('F3: a specialist path only brings customers you can already serve', () => {
  const g = load();
  g.ev("ACT.start({});S.cash=1e9;S.lvl=1;for(const c of ['nyc','chi','ash'])S.pops[c]=S.pops[c]||{day:0,bb:null,boost:0,down:0,routers:1,gen:false,rgen:0}");
  g.ev("S.links.push({id:'w',a:'nyc',b:'chi',kind:'wave',tier:2,km:kmBetween('nyc','chi'),cut:0,mo:0},{id:'d',a:'chi',b:'ash',kind:'df',own:true,sys:'roadm',ch:['zr4','zr4','zr4','zr4'],km:kmBetween('chi','ash'),sub:false,cable:null,mo:0,trench:'d',cut:0,day:0,ready:0,spares:false},{id:'e',a:'nyc',b:'ash',kind:'df',own:true,sys:'roadm',ch:['zr4'],km:kmBetween('nyc','ash'),sub:false,cable:null,mo:0,trench:'e',cut:0,day:0,ready:0,spares:false});compute()");
  const Jg = (x) => JSON.parse(g.ev(`JSON.stringify(${x})`));
  const sp = Jg('spots()');
  assert.ok(sp.length > 0, 'F3: the reference network is spotted');
  const bad = [];
  for (const s of sp) {
    const T = Jg(`BIZ_T.${s.t}`);
    if (!(T.lv > 1)) bad.push(`${s.t} needs no spotting at level 1`);
    if (![s.a, s.b].filter(Boolean).every((c) => g.ev(`!!S.pops['${c}']`))) bad.push(`${s.t} names a city without a POP`);
    if (s.k === 'lat' && !(g.ev(`bestLat('${s.a}','${s.b}')<=latMaxOf('${s.a}','${s.b}')`))) bad.push(`${s.t} ${s.a}–${s.b} is too slow`);
    if (s.k === 'df' && !(s.n >= T.opts[0] * 0.75)) bad.push(`${s.t} ${s.a}–${s.b} asks for far more than the fiber carries`);
  }
  fail('F3', bad, 'spots0() must only name what the network can serve, or nearly');
  assert.deepEqual(g.errors, []);
});

test('F4: the chaos monkey only visits On-call and BGP at 3 a.m., late, for 120 to 240 days, instead of the ordinary failures', () => {
  for (const preset of ['freeze', 'oncall', 'bgp']) {
    const g = load();
    g.ev(`beginGame('Monkey','fra',{mode:'normal',preset:'${preset}'});if(UI.pendGame)ACT.pitchSkip()`);
    g.ev("S.cash=1e9;S.lvl=4;for(const c of ['ams','lon','par'])ACT.buildPop({city:c});for(const [a,b] of [['fra','ams'],['ams','lon'],['lon','par'],['par','fra']]){UI.pending={a,b};ACT.buildLink({tier:1});}closeModal()");
    g.ev('for(let i=0;i<2;i++)dayTick()');
    if (preset === 'freeze') { assert.equal(g.ev('mkElig()'), false, 'F4: never in Change Freeze'); continue; }
    assert.ok(g.ev('S.monkey.next') >= 180, 'F4: not before day 180');
    g.ev('S.monkey.next=S.day;dayTick();S.nextFail=S.day');
    const len = g.ev('S.monkey.until-S.monkey.start');
    assert.ok(len >= 120 && len <= 240, `F4: a visit of ${len} days`);
    g.ev('for(let i=0;i<40;i++)dayTick()');
    assert.ok(g.ev('S.nextFail') <= g.ev('S.day'), 'F4: no ordinary failure fired during the visit');
    assert.ok(g.ev("S.inc.filter(i=>i.type==='cut').every(i=>i.until-i.start<=(rule('chaos')==='spicy'?11:7))"), 'F4: snips heal within a week (spicy stretches by half)');
    assert.deepEqual(g.errors, []);
  }
  const g = load();
  g.ev("beginGame('Monkey','fra',{mode:'normal',preset:'oncall'});if(UI.pendGame)ACT.pitchSkip();S.mode='sandbox'");
  assert.equal(g.ev('mkElig()'), false, 'F4: never in Sandbox');
});

test('F5: rented capacity never outgrows the route\'s market (#203)', () => {
  const g = load();
  g.ev("ACT.start({});if(UI.pendGame)ACT.pitchSkip();S.cash=1e9;S.lvl=4;S.biz=[];S.offers=[];for(const c of ['jed','gdx'])ACT.buildPop({city:c})");
  g.ev("S.links.push({id:'f',a:'jed',b:'gdx',kind:'df',own:true,sys:'roadm',ch:[],km:9089,ready:0,day:0,cut:0,mo:1,trench:'own:f',pairs:1});compute();__reseed(5);ACT.listFiber({id:'f',w:120,p:1})");
  g.ev('for(let d=0;d<1500;d++){brTick();if(d%7===0)spawnOffer();}for(const o of S.offers.filter(o=>o.link===\'f\'))ACT.accept({id:o.id})');
  assert.ok(g.ev("brSold('jed','gdx')") <= g.ev("brMarket('jed','gdx')"), 'F5: no more than the route wants');
  assert.deepEqual(g.errors, []);
});

// D1–D4: DDoS as networks see it (#242). tests/ddos-model.test.js plays each one in detail.
const ddFra = (ev) => ev("ACT.start({});if(UI.pendGame)ACT.pitchSkip();S.cash=1e9;S.lvl=4;S.nextFail=1e9;S.nextEvent=1e9;ACT.launchBB({city:'fra'});S.pops.fra.bb.d=40;ACT.buyTransit({city:'fra',net:'cog',tier:1});S.pops.fra.rgen=RG.findIndex(r=>r.fsN===8);S.biz.push({id:'g',type:'game',name:'G',city:'fra',bw:10,rate:1,mood:80,since:0,reqs:[]},{id:'d',type:'dia',name:'D',city:'fra',bw:5,rate:1,mood:80,since:0,reqs:[]});compute()");
const ddHit = (ev, g) => ev(`S.ev.ddos={id:'x',city:'fra',tgt:'g',vec:'dns',gbps:${g},start:S.day,until:S.day+2,bh:false};compute()`);
test('F6: a circuit pays a markup on what its capacity leases for, and bigger customers pay less per Gbps', () => {
  const g = load();
  g.ev("ACT.start({})");
  const routes = "[['fra','ams'],['nyc','lon'],['sin','syd'],['jnb','lag']]";
  const under = g.ev(`Object.entries(BIZ_T).filter(([t,T])=>T.l2&&!T.sdwan).flatMap(([t,T])=>${routes}.flatMap(([a,b])=>T.opts.filter(bw=>bw*l2Rate(T,a,b,bw)<capMo(a,b,bw)*1.19).map(bw=>t+' '+bw+'G '+a+'-'+b))).join(', ')`);
  assert.equal(under, '', 'F6: priced at least 1.2× its lease');
  const up = g.ev(`Object.entries(BIZ_T).filter(([t,T])=>!T.fiber&&!T.event&&T.opts.length>1).filter(([t,T])=>{const a=T.opts[0],b=T.opts[T.opts.length-1],r=bw=>T.sdwan?siteMo(T,bw)/bw:T.l2?l2Rate(T,'fra','ams',bw):ipRate(T,bw);return !(r(b)<r(a));}).map(([t])=>t).join()`);
  assert.equal(up, '', 'F6: less per Gbps at the largest size');
});

test('F7: high-markup customers sign only tight SLAs, and every SLA rebate is capped', () => {
  const g = load();
  g.ev("ACT.start({})");
  const loose = g.ev("[...SLA_TOP].filter(t=>slasOf(t).includes('std')).join()");
  assert.equal(loose, '', 'F7: no Standard SLA for a high-markup customer');
  assert.deepEqual(JSON.parse(g.ev("JSON.stringify(Object.values(SLA).map(L=>L.cap))")), [1, 3, 12], 'F7: rebates capped at 1×, 3× and 12× a month');
  assert.equal(g.ev("Object.keys(BIZ_T).filter(t=>!BIZ_T[t].event&&!slasOf(t).length).join()"), '', 'F7: every contract has a level');
});

test('F8: customers keep asking: offers every few days, requests from signed customers, contracts with a term', () => {
  const g = load(), bad = [];
  g.ev("ACT.start({});S.nextFail=S.nextEvent=1e9;S.lvl=1");
  const offers = g.ev('(()=>{S.offers=[];let c=0;for(let d=100;d<300;d++){S.day=d;const k=S.offers.length;offerTick(d);if(S.offers.length>k){c++;S.offers=[];}}return c;})()');
  if (offers < 35) bad.push(`only ${offers} offers in 200 days at level 1`);
  g.ev("ACT.buildPop({city:'ams'});for(let i=0;i<40;i++)S.biz.push({id:'c'+i,city:'fra',city2:'ams',name:'C'+i,type:'l2vpn',bw:10,rate:50,reqs:[],mood:100,since:0,end:1e9})");
  const rqs = g.ev('(()=>{let c=0;for(let d=300;d<665;d++){S.day=d;rqTick(d);c+=S.offers.filter(o=>o.rq).length;S.offers=[];}return c;})()');
  if (rqs < 10) bad.push(`only ${rqs} requests from 40 customers in a year`);
  const noTerm = g.ev("Object.keys(BIZ_T).filter(t=>{const T=BIZ_T[t];return !T.event&&!T.cap&&!T.fiber&&!termOf(t,'x');}).join()");
  if (noTerm) bad.push(`no term: ${noTerm}`);
  fail('F8', bad, 'customers must keep coming and asking, or the game goes quiet again');
  assert.deepEqual(g.errors, []);
});

test('F9: traffic per subscriber grows 15% a year for the same money, transit and IX ports fall 15% a year', () => {
  const g = load(), bad = [];
  g.ev("ACT.start({});S.day=365");
  const [tg, te, er] = JSON.parse(g.ev("JSON.stringify([trafG(),transitEro(),eyeRate('fra')/EYE_RATE])"));
  if (Math.abs(tg - 1.15) > 1e-9) bad.push(`traffic ×${tg} a year`);
  if (Math.abs(te - 0.85) > 1e-9) bad.push(`transit ×${te} a year`);
  if (Math.abs(er * tg - 1) > 1e-9) bad.push('broadband revenue per subscriber moved');
  if (g.ev('ACCESS') < 0.5 || g.ev('ACCESS') > 0.7) bad.push(`access network ${g.ev('ACCESS')} of revenue, not 50–70%`);
  fail('F9', bad, 'a network that never adds capacity must shrink, as real ones do');
  assert.deepEqual(g.errors, []);
});

test('F10: a network left alone makes a bounded amount of money', () => {
  // The F2 reference build in Frankfurt, untouched for 12 game years.
  const g = load();
  g.ev("beginGame('Ref','fra',{mode:'normal',preset:'oncall'});if(UI.pendGame)ACT.pitchSkip()");
  g.ev("(()=>{const c='fra',n=NETS.filter(n=>sellsAt(n,c)).sort((a,b)=>a.price*netMult(a,c)-b.price*netMult(b,c))[0];ACT.launchBB({city:c});ACT.buyTransit({city:c,net:n.id,tier:1});ACT.buyIx({city:c,tier:1,signed:true});ACT.rs({city:c});})()");
  let best = 0, total = 0, last = 0;
  for (let m = 1; m <= 144; m++) { g.ev('for(let i=0;i<30;i++){dayTick();closeModal();}'); last = g.ev('R.revMo-R.costMo'); best = Math.max(best, last); total += last; }
  const bad = [];
  if (last > best * 0.05) bad.push(`still making ${Math.round(last)}/mo after 12 years (best ${Math.round(best)})`);
  if (total > 500000) bad.push(`made ${Math.round(total)} in total`);
  fail('F10', bad, 'idling at 8x must not turn into unlimited money: check traffic growth, the access cost and transit erosion');
  assert.deepEqual(g.errors, []);
});

test('F11: every connection to another network pays one cross-connect per fiber patch, whatever its speed', () => {
  const g = load(), bad = [];
  g.ev("ACT.start({});S.cash=1e9;S.lvl=13;S.pops.fra.rgen=RG_TOP;compute()");
  const xc = (code) => g.ev(`(()=>{const s=JSON.stringify(S);${code};compute();const v=R.cost.xc||0;S=JSON.parse(s);compute();return v;})()`);
  const small = xc("S.pni.push({id:'a',city:'fra',net:'ggl',tier:0,n:1})"), big = xc("S.pni.push({id:'a',city:'fra',net:'ggl',tier:5,n:1})");
  if (small !== big || !small) bad.push(`a 10G PNI pays ${small}, a 3.2T one ${big}`);
  if (xc("S.pni.push({id:'a',city:'fra',net:'ggl',tier:1,n:3})") !== 3 * small) bad.push('a LAG pays per member');
  if (g.ev("xcMo('sao')") !== 0 || !(g.ev("xcMo('ash')") > g.ev("xcMo('fra')"))) bad.push('cheaper markets free, US hubs dearest');
  for (const [k, code] of [['transit', "S.transit.push({id:'t',city:'fra',net:'cog',tier:1})"], ['IX', "S.ixp.fra=1"], ['fabric', "S.nni.push({id:'n',city:'fra',prov:FABS.find(f=>f.cities.includes('fra')).id,tier:0})"]])
    if (xc(code) !== small) bad.push(`a ${k} port does not pay one patch`);
  fail('F11', bad, 'a cross-connect is a fiber patch: one per port or LAG member and per end of a wave or lit pair, priced by the building');
  assert.deepEqual(g.errors, []);
});

test('F13: peering pays as it really does', () => {
  const g = load();
  g.ev('ACT.start({})');
  const bad = [];
  const cheapest = (c) => g.ev(`Math.min(...NETS.filter(n=>sellsAt(n,'${c}')).map(n=>transitPerG(n,'${c}',false)))`);
  const fra = cheapest('fra');
  if (fra < 25 || fra > 40) bad.push(`the cheapest transit in Frankfurt is $${fra.toFixed(1)}/Gbps, not real ($25–40)`);
  const ix = g.ev("ixPortMo('fra',1)+xcMo('fra')") / fra, pni = g.ev("xcMo('fra')") / fra;
  if (ix < 25 || ix > 50) bad.push(`a 100G IX port pays for itself at ${Math.round(ix)} Gbps, not 25–50`);
  if (pni >= 10) bad.push(`a settlement-free PNI pays from ${Math.round(pni)} Gbps, not under 10`);
  // Up to 40G customers pay a premium over transit; from 400G the haggled market, times their dear destinations only.
  for (const c of ['fra', 'nyc', 'sin', 'jnb', 'sao', 'syd', 'bom']) {
    const t = cheapest(c), [lo, hi] = JSON.parse(g.ev(`JSON.stringify(ipBand('${c}'))`));
    if (lo < 0.9 * t - 0.01 || hi < lo) bad.push(`the large-customer band in ${c} is ${lo.toFixed(0)}–${hi.toFixed(0)} against $${t.toFixed(0)} of transit`);
    for (const [k, small, big, d] of JSON.parse(g.ev(`JSON.stringify(Object.entries(BIZ_T).filter(([k,T])=>T.rate>0).map(([k,T])=>[k,ipPrice(T,Math.min(IP_S,T.opts[T.opts.length-1]),'${c}',0),ipPrice(T,IP_L,'${c}',1),dstCost(T,'${c}',(${lo}+${hi})/2)]))`))) {
      if (small < 1.2 * t) bad.push(`${k} in ${c} pays $${small}/Gbps at 40G against $${t.toFixed(0)} of transit`);
      if (big > hi * d + 0.01) bad.push(`${k} in ${c} pays $${big}/Gbps at 400G, above the market ($${hi.toFixed(0)} × ${d.toFixed(2)} for its destinations)`);
    }
  }
  fail('F13', bad, 'transit, exchange ports and what customers pay must stay on one scale');
  assert.deepEqual(g.errors, []);
});

test('F12: a customer is judged on the extra round trip its routing adds, both ways, against its type', () => {
  const g = load(), bad = [];
  g.ev("ACT.start({});S.cash=1e9;S.lvl=13;S.nextFail=S.nextEvent=1e9;for(const x of GOALS)S.done[x.id]=0;for(const c of ['fra','mad'])(S.pops[c]||ACT.buildPop({city:c}),S.pops[c].rgen=RG_TOP);UI.via=null;UI.lmode='wave';openLinkModal('fra','mad');ACT.buildLink({tier:2});closeModal();for(const l of S.links)l.ready=0;ACT.buyTransit({city:'mad',net:'cog',tier:2});S.biz.push({id:'g',city:'fra',city2:null,name:'G',type:'game',bw:5,rate:100,reqs:[],mood:100,since:-99});S.day=100;compute()");
  const far = g.ev('R.rq.g.ms');
  if (!(far > g.ev("latTol('game')"))) bad.push(`a gamer behind a Madrid exit is only ${far} ms over`);
  g.ev("ACT.buyTransit({city:'fra',net:'cog',tier:2});compute()");
  if (!(g.ev('R.rq.g.ms') < far / 3)) bad.push('local transit does not fix it');
  if (Object.values(g.ev('LAT_TOL')).some((v) => !(v >= 10 && v <= 50))) bad.push('tolerances outside 10–50 ms');
  if (g.ev('RQ_BAD') !== 0.05) bad.push('a customer minds latency from 5% of its traffic, like loss');
  fail('F12', bad, 'routing quality: in where the far network hands over, out where you send it, against a handoff where the customer is');
  assert.deepEqual(g.errors, []);
});

test('F14: leased capacity comes on a term; short term costs, leaving early pays out', () => {
  const g = load(), bad = [];
  const T = g.ev('TERMS');
  if (!(T.m.mul >= 3 && T.m.nrc >= 3)) bad.push('a rolling month is not dear enough');
  if (T.y1.mul !== 1 || T.y1.n !== 12) bad.push('a year is not the list price');
  if (!(T.y3.mul < 1 && T.y3.nrc === 0 && T.y3.n === 36)) bad.push('three years is not cheaper with no install');
  g.ev("ACT.start({});S.cash=1e9;S.lvl=6;S.nextFail=S.nextEvent=1e9;for(const x of GOALS)S.done[x.id]=0;S.pops.fra.rgen=RG_TOP;ACT.buyTransit({city:'fra',net:'cog',tier:2,term:'y1'});S.day+=60");
  const t = 'S.transit.find(x=>x.city==="fra")';
  if (g.ev(`supFee(${t},1000)`) !== 10000) bad.push('leaving a year after two months does not pay the ten left');
  if (g.ev(`supFee({term:'m',tEnd:S.day+30},1000)`) !== 0) bad.push('a rolling month is not free to leave');
  if (g.ev('supMul({})') !== 1 || g.ev('supFee({},1000)') !== 0) bad.push('an old purchase does not keep its price and leave free');
  fail('F14', bad, 'supplier terms: short term is dear, a term discounts the market, leaving early pays out');
  assert.deepEqual(g.errors, []);
});

test('D1: attack sizes come from the world, never from your network', () => {
  const g = load();
  ddFra(g.ev);
  g.ev('S.day=400');
  const draw = () => g.ev("__reseed(8);JSON.stringify(Array.from({length:500},()=>ddosSize({tgt:'d'})))");
  const a = draw();
  g.ev('S.pops.fra.bb.d*=10;compute()');
  assert.equal(draw(), a, 'D1: ten times the subscribers, the same attacks');
  assert.ok(Math.max(...JSON.parse(a)) <= g.ev('DD_REC'), 'D1: never past the record');
  g.ev('S.day=10');
  assert.ok(Math.max(...JSON.parse(g.ev("__reseed(8);JSON.stringify(Array.from({length:500},()=>ddosSize({tgt:'d'})))"))) <= 2 * g.ev('ddMaxPort()'), 'D1: early floods stay within twice your biggest port');
  assert.deepEqual(g.errors, []);
});
test('D2: a full port slows everyone on it', () => {
  const g = load();
  ddFra(g.ev);
  ddHit(g.ev, 200);
  assert.equal(g.ev('R.ddos[0].full'), 1, 'D2: the port is full');
  assert.ok(g.ev("bizSf(S.biz.find(b=>b.id==='d'),linkIds())") < 0.9, 'D2: the bystander loses traffic');
  // Another island (a POP with its own transit, no link to Frankfurt) does not announce the target, so it takes none.
  g.ev("ACT.buildPop({city:'nyc'});S.pops.nyc.rgen=RG_TOP;ACT.buyTransit({city:'nyc',net:'cog',tier:2});compute()");
  assert.equal(g.ev("[...R.ddos[0].ports.keys()].some(e=>e.city==='nyc')"), false, 'D2: only the target\'s island takes the flood');
  assert.deepEqual(g.errors, []);
});
test('D3: only upstream tools keep a flood off your ports; Flowspec and scrubbing work behind them', () => {
  const g = load();
  ddFra(g.ev);
  ddHit(g.ev, 200);
  assert.ok(g.ev('R.ddos[0].fs') > 0 && g.ev('R.ddos[0].full') === 1, 'D3: Flowspec drops what got in, the port stays full');
  assert.deepEqual(JSON.parse(g.ev('JSON.stringify(R.fsUse.fra)')), { used: 1, cap: 8 }, 'D3: one rule of the router\'s own eight');
  g.ev("S.transit[0].clean=true;compute()");
  assert.equal(g.ev('R.ddos[0].full'), 0, 'D3: a clean pipe scrubs upstream');
  g.ev("S.transit[0].clean=false;S.scrubs=[{city:'fra',tier:1}];S.scrubMode='always';compute()");
  assert.equal(g.ev('R.ddos[0].full'), 1, 'D3: an engaged center is behind the port, which stays full');
  assert.ok(g.ev('R.ddos[0].cleaned') > 0, 'D3: and cleans what gets through it');
  assert.deepEqual(g.errors, []);
});
test('D4: RTBH costs only the target', () => {
  const g = load();
  ddFra(g.ev);
  ddHit(g.ev, 200);
  g.ev("ACT.rtbh({id:'x'})");
  assert.equal(g.ev("bizSf(S.biz.find(b=>b.id==='g'),linkIds())"), 0, 'D4: the target is dark');
  assert.ok(g.ev("bizSf(S.biz.find(b=>b.id==='d'),linkIds())") >= 0.97, 'D4: everyone else is saved');
  g.ev('S.ev.ddos.until=S.day;dayTick()');
  assert.equal(g.ev('S.stats.ddosSac'), 1, 'D4: sacrificed, not held');
  assert.equal(g.ev('S.stats.ddosOk||0'), 0);
  assert.deepEqual(g.errors, []);
});

test('D5: Flowspec filters at the edge first; scrubbing takes only what the edge cannot, and moves the target rather than doubling it', () => {
  const g = load(), bad = [];
  g.ev("ACT.start({});S.cash=1e9;S.lvl=13;S.nextFail=S.nextEvent=1e9;for(const x of GOALS)S.done[x.id]=0;S.pops.fra.rgen=RG_TOP;ACT.launchBB({city:'fra'});S.pops.fra.bb.d=100;ACT.buyTransit({city:'fra',net:'cog',tier:2});ACT.buildPop({city:'ams'});S.pops.ams.rgen=RG_TOP;ACT.buyTransit({city:'ams',net:'ntt',tier:2});UI.via=null;UI.lmode='wave';openLinkModal('fra','ams');ACT.buildLink({tier:2});closeModal();for(const l of S.links)l.ready=0;ACT.buildScrub({city:'ams',tier:1});S.day=60;compute()");
  const run = (vec) => { g.ev(`S.ev.ddos={id:'x',city:'fra',tgt:'bb:fra',vec:'${vec}',gbps:20,until:S.day+2,bh:false,start:S.day,carpet:false,sf0:1};compute()`); return JSON.parse(g.ev("(()=>{const m=ddosReport(S.ev.ddos);return JSON.stringify({edge:m.edge,pulled:m.pulled});})()")); };
  if (!run('dns').edge) bad.push('a filterable flood the edge can take went to scrubbing');
  const a = run('ack');
  if (a.edge || !(a.pulled > 0)) bad.push('a flood with no signature was not scrubbed');
  if (!g.ev("(R.haul||[]).every(q=>q.h===1)")) bad.push('clean traffic is hauled on top of the target’s own');
  g.ev("S.pops.ams.down=S.day+5;compute()");
  if (g.ev("ddosReport(S.ev.ddos).pulled") > 0) bad.push('a center that is down still pulls the flood');
  fail('D5', bad, 'Flowspec first at the edge; a diversion is an announcement at live centers');
  assert.deepEqual(g.errors, []);
});

// The routing engine (docs/specs/network-engine.md).
const eStart = (g) => g.ev("ACT.start({});S.cash=1e10;S.lvl=13;S.nextFail=S.nextEvent=1e9;for(const g of GOALS)S.done[g.id]=0;S.pops.fra.rgen=RG_TOP;S.pops.fra.routers=4");
test('E1: routing never sees capacity: a full exit drops while another stands idle', () => {
  const g = load();
  eStart(g);
  g.ev("ACT.launchBB({city:'fra'});S.pops.fra.bb.d=300;ACT.buildPop({city:'ams'});S.pops.ams.rgen=RG_TOP;UI.via=null;UI.lmode='wave';openLinkModal('fra','ams');ACT.buildLink({tier:3});closeModal()");
  g.ev("ACT.buyTransit({city:'fra',net:'cog',tier:1});ACT.buyTransit({city:'ams',net:'cog',tier:3});compute()");
  const out = JSON.parse(g.ev("JSON.stringify(S.transit.map(t=>R.useTd[t.id].tx))")), lost = g.ev("R.lossX['t:'+S.transit[0].id]");
  assert.ok(lost > 0 && out[1] < out[0] * 0.2, `E1: Frankfurt's own port fills and drops (${lost}), Amsterdam's waits (${out})`);
  assert.deepEqual(g.errors, []);
});
test('E2: every customer type has a traffic class, every class a day that peaks at 1', () => {
  assert.equal(ev("Object.keys(BIZ_T).filter(k=>!BIZ_T[k].fiber&&!TRAFFIC[CLASS_OF[k]]).join()"), '', 'E2: a class for every type');
  assert.equal(ev("Object.values(TRAFFIC).every(c=>SHAPE[c.shape]&&SHAPE[c.shape].length===24&&Math.max(...SHAPE[c.shape])===1)"), true, 'E2: 24 hours, peak 1');
});
test('E3: every live link and every port is two pipes', () => {
  const g = load();
  eStart(g);
  g.ev("ACT.launchBB({city:'fra'});ACT.buildPop({city:'ams'});S.pops.ams.rgen=RG_TOP;UI.via=null;openLinkModal('fra','ams');ACT.buildLink({tier:1});closeModal();ACT.buyTransit({city:'fra',net:'cog',tier:1});ACT.buyIx({city:'fra',tier:1,signed:true});compute()");
  assert.equal(g.ev("S.links.every(l=>linkDown(l)||(pipeOfLink(l)||[]).length===2&&(R.ldir[l.id]||[]).length===2)"), true, 'E3: links');
  assert.equal(g.ev("S.transit.every(t=>(pipeOfExit('t',t.id)||[]).length===2)&&Object.keys(S.ixp).every(x=>(pipeOfExit('ix',x)||[]).length===2)"), true, 'E3: ports');
  g.ev("selectLink(S.links[0].id)");
  assert.match(g.ev("document.getElementById('panelBody').textContent"), /Frankfurt → Amsterdam.*Amsterdam → Frankfurt/s, 'E3: both directions are shown');
  assert.deepEqual(g.errors, []);
});
test('E4: every network has an origin in a known region', () => {
  assert.equal(ev("NETS.filter(n=>!(ORIG_BY_NET[n.id]||[]).length||ORIG_BY_NET[n.id].some(o=>!REGIONS.includes(o.reg)||!CITY[o.anchor])).map(n=>n.id).join()"), '', 'E4');
});
test('E5: a new network starts with nothing configured', () => {
  const g = load();
  eStart(g);
  assert.equal(g.ev('JSON.stringify(S.pol)'), JSON.stringify({ tags: [], on: {}, rules: [], qos: [], mp: {} }), 'E5');
  assert.equal(g.ev('S.engV'), 3, 'E5: and is on the current engine');
});
test('E6: islands reach each other over the internet, with nothing to switch on', () => {
  const g = load();
  eStart(g);
  g.ev("ACT.buildPop({city:'lon'});ACT.launchBB({city:'lon'});ACT.buildPop({city:'nyc'});for(const c of ['lon','nyc'])S.pops[c].rgen=RG_TOP;S.transit=[];ACT.buyTransit({city:'lon',net:'cog',tier:1});ACT.buyTransit({city:'nyc',net:'cog',tier:1})");
  g.ev("S.biz.push({id:'h',type:'host',name:'Host',city:'nyc',bw:50,rate:60,reqs:[],mood:100,since:0});compute()");
  const toLon = () => g.ev("(()=>{let x=0;const dp=R.dp;for(let t=0;t<dp.IF.length;t++)if(dp.IO[t]===-1-CIDX.lon)x+=dp.DO[dp.IF[t]];return x;})()");
  assert.ok(toLon() > 0, 'E6: over the internet');
  assert.deepEqual(g.errors, []);
});

test('E7: users fetch from CDNs, clouds and hosters, not from other ISPs; every region hosts', () => {
  const m = J("(()=>{const A=dstShares('home',NSH),t={};NETS.forEach((n,j)=>{const r=netRole(n);t[r]=(t[r]||0)+A[j];});return t;})()");
  assert.ok(m.cdn + m.cloud >= 0.6, `E7: CDNs and clouds carry most of it (${(m.cdn + m.cloud).toFixed(3)})`);
  assert.ok(m.host >= 0.06 && m.host <= 0.18, `E7: hosters a slice (${m.host.toFixed(3)})`);
  assert.ok(m.eye <= 0.06, `E7: other ISPs' users a sliver (${m.eye.toFixed(3)})`);
  assert.ok(m.t1 + m.t2 <= 0.1, `E7: carriers serve little (${(m.t1 + m.t2).toFixed(3)})`);
  const tr = J("(()=>{const A=dstShares('training',NSH);return NETS.filter((n,j)=>A[j]>0&&!['cloud','host'].includes(netRole(n))).map(n=>n.id);})()");
  fail('E7', tr, 'training pulls from clouds and hosters only');
  fail('E7', J("REGIONS.filter(r=>r!=='cn'&&!ORIGINS.some(o=>NET[o.net].type==='host'&&o.content>0&&o.reg===r))"), 'every region (China aside) has a hoster with servers there');
  fail('E7', J("NETS.filter(n=>n.type==='host'&&(!(n.up||[]).length||!Array.isArray(n.ix)||n.cc)).map(n=>n.id)"), 'a hoster buys transit, lists its exchanges and has no home market');
});
test('E8: content is served from the network’s server nearest the user', () => {
  fail('E8', J("ORIGINS.filter(o=>!o.sv.length||o.sv.some(c=>!CITIES[c])).map(o=>o.net+'/'+o.reg)"), 'every origin has servers in real cities');
  const s = J("CITIES[srvOf(nearO(NETS.findIndex(n=>n.id==='nfx'),CIDX.par),CIDX.par)].id");
  assert.equal(s, 'par', 'E8: NetChill serves Paris from Paris');
});

test('no page errors while checking the rules', () => {
  assert.deepEqual(errors, []);
});
