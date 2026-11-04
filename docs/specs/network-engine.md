# Spec: the network engine (BGP, rx/tx pipes, hourly traffic, packet loss)

Status: implemented (phases 1–6, see §17 for what was built differently and what is still open). Sections marked **(tunable)** hold balance numbers; they can
change during rebalancing without changing the logic.

## 0. Summary

| Today | With this spec |
| --- | --- |
| A link or port is one undirected pipe | Every link and port is **two pipes** (a→b / b→a, rx / tx), tracked and shown separately |
| Every endpoint's traffic is split by one share table | Each **traffic class** has its own destinations, in:out ratio and 24h shape |
| One snapshot per day | **24 hourly slices** per day, shaped by the initiator's local time |
| Routing tops up the next exit when one is full | Routing is **BGP and does not see capacity**; full pipes **drop** |
| Fixed ranking of exit kinds | Plain BGP best path; **communities and rules** set preference and reach |
| Served or unserved, nothing else | **Packet loss per pipe** and per flow, plus unmet demand |
| A network is one blob | A network is a set of **origins**, one per region (`NetChill / eu-west`) |

Decisions already taken:
- Metrics stay per link and the same in both directions; parallel links still balance automatically.
- A router is one scalar capacity that counts rx + tx.
- Routers start with nothing configured.
- QoS and priorities are set only by the player.
- Your own traffic and islands follow normal routing.
- Every day has the same shape (no weekdays).
- There are 19 regions.

Non-goals:
- per-direction IGP metrics;
- modelling each router of a POP;
- showing per-prefix routing tables;
- anything that needs a server (GitHub Pages only).

## 1. Glossary

| Term | Meaning |
| --- | --- |
| **Origin** | One network in one region: `{net, region, anchor city, tz, content, users}`. The far end of a flow. |
| **Endpoint** | Your side of a flow: a POP's eyeballs, or a group of your customers (§5.1). |
| **Flow** | Traffic between one endpoint and one origin (or two of your endpoints), of one class. It has an in-volume and an out-volume per hour. |
| **Class** | A traffic pattern (§3.3): its destinations, in:out ratio, 24h shape, peak utilisation, loss tolerance and whether it is elastic. |
| **Exit** | A place traffic leaves or enters your network: a transit port, an IX port, a PNI, an embedded cache. These are today's `E` entries. |
| **Route** | "Origin O can be reached through exit E", with its attributes: local-pref, AS-path length and communities. |
| **Community** | A label on a route. It is either automatic (`net:nfx`, `region:eu-west`…) or one of the player's **tags**. |
| **Rule** | `match → place → action` (§6.4). |
| **Pipe** | One direction of a link or of an exit port. It has a capacity, and an offered load, a carried load and a loss for every hour. |
| **Island** | A set of POPs joined by live links. Today's `COMP`/`NCOMP` from `rcGraph()`. |
| **Hour** | `h ∈ 0..23` in UTC. A city's local hour is `(h + tzOf(city)) mod 24`. |

## 2. Where the code goes

New files (each one with its own test; the `NN` prefixes follow the folder's order):

| File | Contents |
| --- | --- |
| `src/game/20-world/45-regions.js` | `REGIONS` (19 ids, sorted), `regionOf(city)`, `tzOf(city)`, `TZ_CC` overrides |
| `src/game/30-networks/50-origins.js` | `ORIGINS` (array), `ORIG_BY_NET[netId]`, `buildOrigins()` (runs at load, after `NSH` exists) |
| `src/game/40-progress/15-traffic.js` | `TRAFFIC` (class table), `SHAPE` (24-value arrays), `CLASS_OF[bizType]` |
| `src/game/80-simulation/31-policy.js` | community keys, `polRules()` (S.pol plus compiled RouteScript), rule matching |
| `src/game/80-simulation/32-control-plane.js` | routes, best path, views, inbound selection, islands → `CP` (the forwarding result) |
| `src/game/80-simulation/33-flows.js` | endpoints, destinations, flow columns |
| `src/game/80-simulation/34-data-plane.js` | pipes, incidence, the hourly loop: QoS, CDN spill, Auto-TE, loss, delivery |
| `src/game/80-simulation/35-day.js` | `computeDay()`: stitches 31–34 together, builds `R`, its accessors and the compatibility fields |
| `src/game/90-actions/62-policy.js` | actions: tags, rules, QoS, router and session switches |
| `src/game/94-dashboard/55-routing.js` | the Routing tab |
| `src/game/93-ui/15-pipes.js` | shared widgets: `pipeBars()`, `graph24()` |

Changed files:
- `30-compute.js`: `compute()` becomes a thin wrapper, `function compute(){computeDay();}`, so the ~50 callers keep working.
  The old routing loop is deleted in phase 3, when the new one replaces it.
- `40-billing.js`: p95 now takes both directions.
- `25-ddos-flood.js`: floods become flows.
- `29-route-cache.js`: the keys now include views and rules.
- `28-route-worker.js`: packs the new R.
- `50-sanitize.js`: `S.pol`, histories, migration.
- `80-new-game.js`: defaults.
- `88-days/10-day-tick.js`: the day works on aggregates.
- `99-loop.js`: the hour.
- `96-map/60-draw.js`: two lanes per link and the night shade.
- `93-ui/70-link-panels.js`, `93-ui/50-city-panel.js`, `93-ui/40-hud-and-panels.js`, `70-rules/80-hot-ports-and-rank.js`,
  `94-dashboard/60-dashboard.js`, `scripts/lib/mcp-page.js`, `scripts/lib/mcp-commands.js`.

All files share one top-level scope, and a file may only use top-level values from earlier files at load time. So
`buildOrigins()` runs from `50-origins.js` (after `40-traffic-shares.js`), and everything in `80-simulation/` runs at
call time only.

## 3. Static data

### 3.1 Regions and timezones (`45-regions.js`)
- `REGIONS = ['af-north','af-south','ap-east','ap-southeast','ca','cn','eu-central','eu-east','eu-north','eu-west','in','jp-kr','latam-north','latam-south','me','oceania','us-central','us-east','us-west']`.
- `regionOf(city)` is decided by `cc`, in this order:
  - `US` is split by longitude: `us-west` if `lon < −104`; `us-central` if `−104 ≤ lon < −87`; `us-east` otherwise. HI and AK go to `us-west`.
  - `CA` → `ca`.
  - The rest come from one table `REG_CC = {cc: region}`, which covers every `cc` in `CITIES`. For example: MX and Central America and the Caribbean → `latam-north`; South America → `latam-south`; GB IE FR BE NL LU ES PT → `eu-west`; DE AT CH IT CZ PL HU SK SI → `eu-central`; Nordics and the Baltics → `eu-north`; the rest of Europe, TR, UA → `eu-east`; the Gulf, IL, JO, IR → `me`; Maghreb and EG → `af-north`; the rest of Africa → `af-south`; IN PK BD LK NP → `in`; CN → `cn`; HK TW → `ap-east`; JP KR → `jp-kr`; the rest of Asia → `ap-southeast`; AU NZ and the Pacific → `oceania`.
  - A test checks that every city gets a region.
- `tzOf(city)`: `TZ_CC[cc]` if listed (CN 8, HK 8, TW 8, IN 5.5, AR −3, IS 0, ES 1 …); otherwise `Math.round(lon/15)`.
  - The local hour index is `Math.floor((h + tz + 24) % 24)`, so a half-hour offset rounds down.

### 3.2 Origins (`50-origins.js`)
Origins are built once at load from `NETS`, `CITIES` and `NSH`. They are never saved. Every network gets at least one.

**Content weight** (what the network serves), by `type`:

| `type` | cdn | host | t1 | t2 | eye |
| --- | --- | --- | --- | --- | --- |
| content weight | `share` | `share` | 0.5 × `share` | 0.5 × `share` | 0.1 × `share` |

It is spread across the regions of the network's `pops`, in proportion to Σ `CITY.P` of its pops in each region.

**Users weight** (how many eyeballs the network has), by `type`:

| `type` | eye | t2 | t1 | cdn | host |
| --- | --- | --- | --- | --- | --- |
| users weight | `share` | 0.3 × `share` | 0.1 × `share` | 0 | 0 |

It is spread across the regions of the network's **home countries** (`cc`; a string or an array), in proportion to Σ `CITY.P` of
the cities in those countries. A network with no `cc` uses its pops' countries. Long-tail networks are listed by `pops`
only, so they use their pops.

**Building the list:**
- **One origin per (net, region)** with weight > 0.
  - **Anchor:** the city with the largest `P` among the net's pops in that region. If it has none there, the largest-`P`
    city of its home countries in that region.
  - **Timezone:** the `tz` of the anchor.
- **Merge small origins:** any origin under 3% of its network's total weight is merged into that network's largest origin.
  - Expected size: about 400–700 origins.
  - Origins are ordered by net, then region, so their indices are stable.
- **Fields:** `{i, net, nj (index in NETS), reg, anchor, ci (CIDX of anchor), tz, content, users, sv}`. `sv` lists the
  city indices of the network's PoPs in the regions the origin stands for (its own and any merged into it); content is
  served from the one nearest the user (`srvOf(o, ci)`, §5.2), and `nearO()` picks the origin with that nearest server.
- **Regional share tables:** `NSH_CN`, `NSH_RU` and `NSH_KRX` stay. They say *which networks* an endpoint talks to; the
  origin choice comes after (§5.2).

### 3.3 Traffic classes (`15-traffic.js`) (tunable)
**Shapes:** `SHAPE[name]` has 24 values, one per *local* hour from 0 to 23, with a maximum of 1.

```
home    = [.45,.35,.25,.18,.15,.15,.20,.30,.40,.45,.50,.55,.60,.60,.60,.62,.68,.75,.85,.95,1,1,.90,.65]
evening = [.50,.40,.30,.20,.15,.12,.12,.15,.20,.25,.30,.35,.40,.40,.42,.45,.50,.60,.75,.90,1,1,1,.75]
office  = [.10,.08,.08,.08,.08,.10,.15,.35,.70,.90,1,1,.90,.95,1,.95,.85,.60,.35,.25,.20,.15,.12,.10]
flat    = 24 × 1
dci     = home × 0.3 + 0.7
night   = [.3,1,1,1,1,1,.3,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]
market  = 9..17 → 1, otherwise .05
fill    = [.6,.8,1,1,1,1,.8,.5,.3,.2,.2,.2,.2,.2,.2,.2,.2,.2,.2,.2,.2,.3,.4,.5]
```

**Class table.** `in` and `out` are seen from your network, per unit of offered traffic, and the larger of the two is 1.
"Whose hour" is the city whose local hour is fed to the shape.

| class | in | out | shape | whose hour | peakUtil | elastic | tol (loss) | destinations (§5.2) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `home` | 1 | .10 | home | endpoint | — (`bb.d` is the peak) | yes | .02 | `DST_W.home`, `pick:server` |
| `office` | 1 | .33 | office | endpoint | .6 | yes | .01 | `DST_W.office`, `pick:server` |
| `content` | .12 | 1 | evening | origin | .7 | yes | .02 | `audience` |
| `stream` | .05 | 1 | evening | origin | .7 | yes | .02 | `audience` |
| `gaming` | .67 | 1 | evening | origin | .6 | no | .003 | `audience` |
| `training` | 1 | .20 | flat | endpoint | .9 | yes | .03 | `DST_W.training`, `pick:server` |
| `fill` | 1 | .02 | fill | endpoint | — | yes | .05 | the cache's own network, `pick:server` |
| `dci` | 1 | 1 | flat (`hyper`: dci) | endpoint | .9 | no | .001 | `site` |
| `backup` | 0 | 1 | night | endpoint | .95 | yes | volume (§8.1) | `site` |
| `enterprise` | .5 | 1 | office | endpoint | .5 | no | .005 | `site` (toward the hub) |
| `special` | 1 | 1 | per type | endpoint | .5 | no | .005 | `site` |

**Destinations (`DST_W`).** A server class spreads its traffic over networks by `share × DST_W[class][role]`, renormalised,
where the role is `cloud` for networks flagged `cloud:true` and the `type` otherwise:

| class | cdn | cloud | host | t1 | t2 | eye |
| --- | --- | --- | --- | --- | --- | --- |
| `home` | 1 | 1 | 1 | .08 | .08 | .05 |
| `office` | .4 | 1 | .8 | .2 | .2 | 0 |
| `training` | 0 | 1 | .6 | 0 | 0 | 0 |

`home` under China's, Russia's and Korea's own tables keeps those tables as they are (their content lives in their
incumbents' data centers). Peering thresholds of selective eyeball networks are scaled by `EYE_PEER` (0.12) to match.

**`CLASS_OF` (`BIZ_T` type → class).** A test checks every key of `BIZ_T`.

| class | `BIZ_T` types |
| --- | --- |
| home | `isp`, `provedor` |
| office | `dia`, `fabip`, `scrub`, `edu` |
| content | `host`, `cgame`, `metav` |
| stream | `stream` |
| gaming | `game` |
| training | `gpu`, `ingest` |
| dci | `ai`, `aiwan`, `mtrain`, `agi`, `sov`, `hyper` |
| backup | `bulk` |
| enterprise | `sdwan`, `onramp`, `l2vpn`, `fabl2` |
| special | `hft` (shape `market`), `mars` (3 fixed hours a day picked by `hstr(b.id)`), `event` and `esport` (`evening`, only while `eventLive`) |
| none (fiber; no IP traffic, as today) | `wwave`, `dfpair`, `pairs` |

- `ingest` is `training`, but only while `eventLive`.
- L2 types (`BIZ_T[t].l2`) are point-to-point `site` flows. Everything else is IP.

## 4. State (S): new and changed fields

Every field gets a default in `newGame()`, is validated in `sanitize()` (as untrusted input), and is migrated once
behind the marker `s.engV` (the same pattern as `s.ltv`, `s.auV` and `s.calV` in `migrate()`).

```js
S.pol = {
  tags:  [{id:'t1', name:'us-only', v:110}],      // id 't'+n; name ≤ 20 chars, [a-z0-9-]; v 1..65535 (shown as ASN:v); at most 32 tags
  on:    {t1:['c:<cacheId>','pop:lax']},          // where a tag is attached: refs (below); at most 64 refs per tag
  rules: [{id:'r1', m:'t1', at:'l:lax|tok', act:'nocarry', n:0}],   // in order; at most 64 rules
  qos:   [{m:'class:gaming'}],                    // priority-queue matches, in order; at most 8
  mp:    {lax:1},                                 // POPs with BGP multipath on
  sess:  {'t:<transitId>':{allowas:1, dflt:1}}    // per-session switches
};
```

**Refs** (things a tag can be attached to): `t:<transit id>`, `p:<pni id>`, `ix:<ix id>`, `c:<cache id>`, `pop:<city>`,
`b:<customer id>`.

**Match `m`**: a tag id, or an automatic community key (§6.2).

**Places `at`:**

| Form | Place | Allowed `act` |
| --- | --- | --- |
| `x:<exit ref>:in` | an exit's import | `lp` (with `n` 0..1000), `deny` |
| `x:<exit ref>:out` | an exit's export | `noexp`, `prepend` (`n` 1..3), `regonly`, `blackhole` |
| `x:*:in`, `x:*:out` | every exit | the same as above |
| `l:<a\|b>` | a link pair (sorted key, as `edges`) | `nocarry` |
| `pop:<city>` | one POP | `lp` (`n`), `deny` |
| `pop:*` | every POP | the same |

**Presets in the UI:** prefer = `lp 200`, avoid = `lp 50`.

**`sanitize()` drops** any unknown tag id, ref, place, action or field, or any number out of range. It keeps the order
and truncates to the limits above.

**Histories:**
- `t.hist`, for transit: `[{d, i:[≤6 numbers, descending], o:[≤6]}]`, the last 30 days.
- `p.hist`, the same shape: only for PNIs with a per-G price (`NET[p.net].perG`).
- `S.hist` rows gain these fields: `pin`, `pout` (network in/out at the peak hour), `srvH` (served at the peak hour),
  `loss` (the worst hourly loss of any class, against its tolerance, as a ratio). `srv` and `dem` keep their meaning, at
  the peak hour.

**Migration (`if (s.engV !== 3)` in `migrate()`):**
1. An old `t.hist` of numbers `[v…]` becomes `[{d:s.day−k, i:[v], o:[v×0.1]}]`.
2. Exit-kind rules that copy the old ranking (as `x:*:in` `lp` rules matching `from:cache` 300, `from:pni` 200, `from:ix`
   180, `cone` 170; transit stays at 100). These go first in `S.pol.rules`.
3. Old preferences: `t.pref`, `p.pref` and `ixPref` set to `high` become an `x:<ref>:in` rule with `lp` = that exit kind's lp from step 2 + 50; `low` becomes `lp 20`.
   Then the old fields are deleted.
4. `protect customers` in a live RouteScript becomes `S.pol.qos = [{m:'biz'}]`. `biz` is an automatic key covering
   every class except `home`.
5. `S.pol.mp` gets every POP, because the old engine spread ECMP everywhere.
6. Set `s.engNews = true`: a one-time notice. For 30 days (`s.engGrace = s.day + 30`), loss does not lower mood or growth
   (§8.1), so an old network gets a month to adapt.
7. `s.engV = 3`.

**New games:** `S.pol` is empty: no tags, rules or QoS, multipath off, no session switches. `engV = 3`.

**Not saved:** origins, `R`, `CP`, the hour (`UI.hour`).

## 5. Flows (`33-flows.js`)

### 5.1 Endpoints
- **A POP's eyeballs:** `{kind:'pop', city, cls:'home', peak:p.bb.d × viral × golden…}`. The multipliers are the same
  ones as in today's `compute()` demand loop: `viral`, `php`, `golden`, Russian `ggl` throttle, `krroute`, `pmtud` and
  the `local` scenario rule.
- **Customer groups.** IP customers of the same class in the same city form one group: `{kind:'grp', city, cls,
  peak: Σ b.bw × peakUtil, members:[ids]}`. Their service is shared (§8.1).
- **L2 customers:** one endpoint each, `{kind:'l2', id, a:b.city, b:b.city2 or the sites, cls, peak: b.bw × peakUtil}`.
  An SD-WAN is a hub (`sites[0]`) with spokes, one flow per spoke.
- **Your users** (for audiences): each POP's eyeballs also act as a users weight, `bb.d × EYE_W`. `EYE_W = 1e-5` per
  Gbps (tunable), so a 1 Tbps POP weighs about as much as a 1% eyeball network.

### 5.2 Destinations
- **`nets:<table>` + `pick:server`** (home, office, training, fill).
  1. Take the networks of the table: `NSH` or the regional table for the endpoint. `nonEye` is NSH without `eye`
     networks, renormalised; `cdn` is only `type:'cdn'`.
  2. For each network `n` with share `s`, if it has content origins, use the one **nearest to the endpoint city** (by
     `kmBetween`): that is how CDN mapping works. A network with no content (a pure eye network) instead splits over
     its users origins by gravity, keeping the top 2.
  3. Flow volume = `peak × s`.
- **`audience`** (content, stream, gaming).
  1. Candidates: every origin with `users > 0`, plus your own POPs (users weight from §5.1, marked `own`).
  2. Each gets `w = users / (1 + km/3000)`.
  3. Keep the top 40 by `w` and renormalise. The rest goes to one extra flow, `rest`: a pseudo-origin at the endpoint's
     city, reached only via transit with AS-path length 3.
- **`site`** (L2): the other city (or cities) of the circuit. It is routed on the backbone only (§6.7).
- **Your own customers as destinations.** A POP's `home` flows do not target your own customers. Instead, on-net traffic
  comes from the `audience` side: a hosting customer whose audience includes your POP X makes a flow between the
  customer and X. It is extra traffic on top of X's home demand, and it is small.

### 5.3 Flow columns
These are typed arrays like today's `FLB` (grow by doubling; scratch space kept between calls, copied out at the end):
- `FE`: endpoint index; `FO`: origin index, or `−1−popIndex` when the far end is one of your POPs.
- `FCL`: class index.
- `FV`: base volume at the peak, in Gbps.
- `FTZ`: the tz whose local hour drives the shape. This is the endpoint city, or for "origin's hour" classes the origin's
  anchor (or the own POP).
- `FIN`, `FOUT`: the class's in and out factors. A `site` flow has `out` from the initiator to the far site.
- Hourly volumes: `in(h) = FV × FIN × SHAPE[cls][local(h, FTZ)]`, and the same for out.

**Expected size:**
- a POP's home flows: about 260 (one per network, as today);
- each customer group: at most 41;
- each L2 customer: one per spoke or pair;
- each cache: one `fill` flow.

The total is the same order as today's flow count.

## 6. Control plane (`31-policy.js`, `32-control-plane.js`)
This part is capacity-blind. It is rebuilt only when its key changes (§10.3).

### 6.1 Graph
- The same as today: live links, merged per city pair into `edges`, with weight `pairW` and latency `linkLat`; islands
  come from `rcGraph()`.
- **Views.**
  - A view is a sorted list of edge keys removed by `nocarry` rules.
  - View 0 is the full graph.
  - Each view gets its own `SPD/SPP` for every POP, built lazily the first time a route needs it.
  - Views are cached in `RC` and keyed by graph key + view key.

### 6.2 Automatic communities
Each is a string key. Rules match either a tag id or one of these keys.

| Key | On |
| --- | --- |
| `from:transit`, `from:pni`, `from:ix`, `from:cache` | routes learned at that kind of exit |
| `cone` | routes to a network in a peer's customer cone (today's `coneOf`) |
| `net:<id>` | routes to an origin of that network |
| `region:<reg>` | routes to an origin in that region |
| `at:<city>`, `at-region:<reg>` | routes learned at an exit in that city or region |
| `pop:<city>`, `pop-region:<reg>` | your prefixes originated at that POP (export side) |
| `class:<cls>`, `biz` | your prefixes of a customer group or L2 of that class; `biz` = every class but `home` |
| `cust:<id>` | the prefixes of one customer |

**Tags:**
- A tag attached to an exit, cache or POP is carried by every route learned at that exit, or originated at that POP.
- A tag attached to a customer (`b:`) is carried by that customer's prefixes, and by the flows of its group for QoS.
- A group whose members carry different tags is split into one group per tag set.

### 6.3 Routes and their attributes (outbound)
- **Which exits reach an origin of network `n`:** exactly today's `okBy[n]`. That includes every event filter: `depeer`,
  `leak`, sender pays (`snd`), `rpki`, the grace route, `CONE`/`DOWN`, `ixSessions`.
- **AS-path length** of exit `e` → origin `o`:

| exit `e` | `o.net = e.net` | `o.net` in `e.net`'s cone | otherwise |
| --- | --- | --- | --- |
| cache | 1 | — | — |
| PNI, IX | 1 | 2 | — |
| transit | 1 | 2 | 3 |

  An IX session reaches `o.net` directly if `o.net` is in the exit's direct session set (`e.dir`, or all of `e.nets`),
  otherwise through the cone.
- **Initial local-pref** = 100.
- **Import rules** (`x:<ref>:in` and `x:*:in`): the first matching rule for this exit wins; `deny` drops the route.
- The pseudo-origin `rest` is reachable from transit exits only, with AS-path length 3.

### 6.4 Rule evaluation
- `polRules()` = `S.pol.rules`, followed by the rules compiled from a live RouteScript (§6.8).
- A rule matches a route if `m` is in the route's community set.
- At each place, **the first matching rule decides** that place's attribute: `lp` and `deny` for imports and POPs,
  `nocarry` for links. Export actions accumulate in rule order, so a prepend count is the sum, capped at 3.
- Matching uses precomputed per-route community masks:
  - every key that any rule mentions gets a bit;
  - each route builds its mask once;
  - a rule tests one bit.

### 6.5 Best path (outbound, for each POP `p` and origin `o`)
**Candidates:** the routes to `o` from exits in `p`'s island. The route's view must reach the exit from `p`, and it must
not be denied by `pop:<p>`/`pop:*`.

Sort key (smaller first):
1. `−lp`, after `pop:` rules that set an lp;
2. AS-path length;
3. eBGP over iBGP: `0` if the exit is in `p`, else `1`;
4. IGP distance from `p` to the exit's city **in the route's view**;
5. exit order (its index in `E`, so older objects come first).

- **Without multipath at `p`,** take the first candidate.
- **With `S.pol.mp[p]`,** every candidate that ties with the first on keys 1–4 shares the traffic equally.
- Inside the backbone, every equal-cost IGP path always shares (the same as today's merged edges; no change).

**Sharing work** (needed for speed):
- Origins of one network with identical candidate lists (same exits, same lp/AS-path, same view) share the result.
- The share key is the net plus the bitmask of rules matched per exit (§6.4).
- Most networks therefore resolve once per POP, as today.

**Output** `CP.out[p][o] = [[exitIndex, share], …]`, plus the backbone path for each (from that view's `SPP`).

### 6.6 Inbound (for each origin `o` and island prefix `P`)
This decides which exit traffic *from* `o` enters by. Here `P` means "the prefixes of POP `p`", or of a customer group or
L2 site in `p`.

**Export side.** `P` is announced at exit `e` if all of these hold:
- `e` is in `p`'s island;
- no export rule matching `P`'s communities says `noexp` at `e`;
- if `regonly` is set at `e`, `o.reg` equals `e`'s region.

`prepend k` adds `k` to the AS-path length seen at `e`.

**`o`'s own choice**, in this order (as the remote network sees it):
1. **Relationship:**
   - cache: the CDN maps your users onto its own cache, only for its own network;
   - peer route: `e` is a PNI or IX session with `o.net`;
   - provider route: anything else.

   Relationship order: cache > peer > provider.
2. AS-path length (the same table as §6.3, seen from `o`), plus the prepends at `e`.
3. **Hot potato:** the smallest `kmBetween(o.anchor, e.city)`.
4. Exit order.

**Output** `CP.in[o][P] = [exitIndex, then the next candidates in order]`. The tail of the list is what CDN spill uses
(§7.3). Inbound traffic then follows the backbone from `e.city` to `p` in view 0, since your own prefixes are not
filtered by `nocarry` unless a rule matches `pop:`/`class:`/`cust:` keys.

### 6.7 Islands, your own prefixes and L2
- **A flow whose far end is your own POP `q`** (on-net):
  - **Same island:** it stays on the backbone, `p → q` in view 0, and never touches an exit.
  - **Different islands:** it is a normal route to `q`'s prefixes. The only routes for them come in through `p`'s exits
    and carry your own AS, so **BGP loop prevention drops them**.
  - It becomes reachable only if some exit `e` in `p`'s island has `sess[e].allowas` (it accepts the route: AS-path
    length 2 through a peer, 3 through transit) or `sess[e].dflt` (a default route: AS-path length 3, used only if
    nothing else exists; transit only).
  - It then leaves at `e`, enters `q`'s island as though it came from an origin anchored at `e.city` on network `e.net`
    (§6.6), and crosses two exits.
  - Unreachable flows are counted as unmet. In the "why" view they show as `no route (loop prevention)`.
- **L2 (`site`) flows** run on the backbone only, using today's `l2Routes` modes (`normal`, `fast`, `scenic`).
  - `scenic` reads yesterday's per-direction load (`R.prev`, §9).
  - **L2 between islands is impossible,** as today.

### 6.8 RouteScript
`teParse()` is unchanged. Its lines compile to runtime rules (never saved) whenever `teRules()` is live:

| RouteScript line | Becomes |
| --- | --- |
| `prefer pni for X` | `lp 400` on `from:pni` ∧ `net:X` |
| `avoid ix for X` | `lp 10` |
| `prefer transit T` | `lp 150` on `x:t:*` of T |
| `avoid transit T` | `lp 60` |
| `prepend transit T k` | `prepend k` at T's exits |
| `drain C` | `lp 1` at `pop:C`, plus `noexp` of everything at C's exits |
| `avoid link A-B` | metric ×60 (as today: an IGP change, not a rule) |
| `blackhole ddos` | `blackhole` export of the attacked prefix |
| `cap`, `spill` | stay Auto-TE settings (§7.3) |
| `protect customers` | a QoS entry `biz` |

For an "∧" match, a compiled rule may carry `m` as an array; rules in `S.pol` match a single key.

New lines (parsed into the same rules; translated messages for errors):

```
tag <name> on cache <net> <city> | transit <net> <city> | pop <city> | pni <net> <city> | ix <ix> | customer <name>
at link <cityA>-<cityB> don't carry <tag|community>
at transit|pni|ix <name> [city] prefer|avoid|deny <tag|community>
at transit|pni|ix <name> [city] don't announce|prepend N|region only <tag|community>
qos priority <tag|community>
multipath <city|all>
```

## 7. Data plane (`34-data-plane.js`)

### 7.1 Pipes
- **Index:** `NP` pipes in one table.
  - For edge `i`: `2i` = `edge.a→edge.b` and `2i+1` = `b→a`, where `edge.a` is the sorted key's first city.
  - Then for each exit `x`: `2NE+2x` = **rx** (into your network) and `+1` = **tx** (out).
- **Capacity:**
  - **Edge pipes:** active capacity and standby capacity (`scap`), the same in both directions. Standby links carry
    only what the active ones cannot, as today (§9: per-link output).
  - **Exit pipes:** `e.cap`, as today: `liveCap × lagF`, the RouteScript cap, the prepend split, the 0.5 for sacrificial
    PNIs. Caches: rx = `cacheG(c)`, tx = the same. The courtesy (grace) route gets an unlimited pipe.
- **Routers:** per POP, one scalar `NRES = nodeCap(c)`. Load = all traffic through the router in both directions, with
  transit-pass weighting (`PASS`, from the backbone core) as today.
- **Link output** is oriented per link: `l.a→l.b` is pipe `2i` if `l.a === edge.a`, else `2i+1`.

### 7.2 Incidence (built once per control-plane result)
For each flow, two lists of `(pipe, share)` in path order:
- **out** (from you): backbone pipes from the endpoint POP toward the outbound exit, then that exit's **tx**;
- **in** (to you): the inbound exit's **rx**, then backbone pipes from that exit toward the POP.

With ECMP, shares multiply along the path. Router visits are stored the same way, with their own list of
`(router, weight)`.

Storage is CSR typed arrays: `IO_OFF/IO_P/IO_S` for out, `II_OFF/II_P/II_S` for in, plus router lists.

### 7.3 The hourly loop (for `h = 0..23`)
1. **Offered load.** For every flow `f`: `vin = FV·FIN·shape`, `vout = FV·FOUT·shape`. Add `vin × share` along the in
   list and `vout × share` along the out list. Routers get `(vin + vout) × weight`.
2. **CDN spill**, for flows to origins whose network is `type:'cdn'`.
   - For each exit pipe whose rx offered is above `SPILL_CDN × C` (`SPILL_CDN = 0.95`), move the excess of those CDN
     flows, proportionally, onto each flow's next inbound candidate (`CP.in` tail).
   - Rebuild just their incidence, then repeat at most 3 times.
   - **Caches:** only `CACHE_HIT = 0.85` of a network's home volume can be served by its cache. The other 15% takes the
     next candidate from the start. Cache capacity spills the same way.
3. **Auto-TE** (only if `teRules()` is live and `coreTE()`):
   - `spill at X%`: for each backbone pipe above `X × C`, move the excess of the outbound flows crossing it, in flow
     order, onto `altPath()` (today's function, avoiding pipes above X). At most 2 alternatives per flow and 2 rounds.
     The amount moved goes into `R.teMoved`.
   - `cap transit T at G`: the excess outbound over G on T's tx moves to each flow's next outbound candidate.
4. **QoS.** For each pipe, split the offered load into a priority part (flows whose class or tags match `S.pol.qos`) and
   best effort.
   - Priority loss: `max(0, 1 − C/Op)`.
   - Best-effort capacity left: `Cb = max(0, C − Op × (1 − priority loss))`.
5. **Loss per pipe**, with load `O` and capacity `C` (tunable):
   ```
   u = O / C
   drop  = O > C ? 1 − C/O : 0
   burst = u > 0.85 ? 0.002 × ((min(u,1) − 0.85) / 0.15)^2 : 0
   loss  = min(1, drop + burst)
   ```
   Routers apply the same formula to their scalar. A router's loss counts on both directions of every flow through it.
6. **Second pass.**
   - Recompute the offered load along each list, scaling the volume by the losses already met upstream on that path,
     then recompute the losses once.
   - A flow's **delivery ratio** = Π(1 − loss) over its list (in and out separately).
   - The Great Firewall (a `cnCity` crossing, as in today's `push()`) multiplies in a fixed loss of `0.20`, or `0.35`
     during the `gfw` event, or `0.03` on premium paths. That is counted in the flow's loss, not on any pipe.
7. **Record:**
   - `OFF[h·NP + k]`: offered per pipe;
   - `DLV[h·NP + k]`: carried, which is `min(O, C)` after the second pass;
   - `LOSS[h·NP + k]`;
   - per flow, `FDI[h·NF + f]` and `FDO[…]`: delivered in and out.

   All are `Float32Array`.

**Determinism:** there is no randomness. Every loop runs in index order, and sorts are stable.

### 7.4 DDoS (`25-ddos-flood.js`, ported)
- **The attack:** today's `R.ddos` targets and sizes. For each target, inbound flows from up to 8 origins weighted by
  `users` (botnets), class `junk` (in 1, out 0, flat, not elastic, never in QoS). They enter by inbound selection (§6.6),
  so mostly through transit and IX.
- **`blackhole` export** (or `blackhole ddos`): the target's prefixes are announced with the blackhole community, and
  attack traffic toward them is dropped **before** your exits (it adds no load). The target's own legitimate traffic is
  lost as well, which is the trade-off, as today.
- **Scrubbing** (today's scrub centres): attack flows enter at the scrubbing POP's exits, as though it announced the
  target's prefix. Clean traffic is hauled to the target over the backbone as a `site`-like flow.
- `R.tgtF` and `R.bbF` disappear. The attack's effect is its loss on shared pipes, read through §8.

### 7.5 Latency
- **Per flow:** `ms = backbone path ms + kmBetween(exit city, origin anchor) / 200 × 1.3`. For an own-POP or `site` far
  end, it is the backbone only.
- **Detour** = `ms − kmBetween(endpoint, far end) / 200 × 1.3`: the part you control.
- Today's `LAT_OK`, `latLoss` and the Korean thresholds apply to `2 × detour`, so `latF` per endpoint is the
  volume-weighted factor.
- For L2, `R.l2lat` is as today.

### 7.6 Events and scenario rules that touch routing
They keep their meaning; this is where each one lands:

| Event or rule | Where |
| --- | --- |
| `depeer`, `leak`, sender pays (`snd`), `rpki` | exit reach (`okBy`), as today (§6.3) |
| `viral`, `php`, `golden`, `krroute`, `pmtud`, the Russian Goggle throttle, `local` | endpoint volumes (§5.1) |
| `gfw`, China crossing | the flow's fixed loss (§7.3 step 6) |
| grace (courtesy route) | an exit with an unlimited pipe (§7.1) |
| link `deg`, `l.loss`, cuts, standby | `capOf()` and the live graph, as today |
| `ixdown`, LACP (`lagF`, `ixLagF`), site outages (`liveN`) | exit capacity or presence, as today |
| DDoS, scrubbing | §7.4 |

## 8. Day aggregates and their consumers (`35-day.js`, `88-days/10-day-tick.js`)

### 8.1 Service per endpoint
For an endpoint or customer group `g` of class `c`:
- **Busy hours:** hours where `SHAPE[c][local(h)] ≥ 0.5`.
- **Delivered** `D` = Σ delivered / Σ offered over those hours, adding in and out. Unreachable flows count as offered,
  not delivered.
- **Loss** `L` = the worst busy-hour loss of the group's volume.
- **Service:**
  - elastic class: `sf = D × latF`;
  - inelastic class: `sf = D × q × latF`, where `q = L ≤ tol ? 1 : clamp(1 − (L − tol)/(3·tol), 0, 1)`.
- **Backup:** `sf = min(1, Σ delivered over its night window / Σ offered)`. Nothing else counts: backup is about volume,
  not rate.
- **L2:** `sf` as above, using its `site` flows; `R.l2[b.id] = b.bw × D`.
- **Grace:** while `S.day < S.engGrace`, use `sf = max(sf, 0.95)` for mood and growth only. Revenue uses the real `sf`.

**Who reads it:**
- `sfOf(R, c)` returns the POP's home `sf`.
- `bizSf(b)` returns its group's (IP) or its own (L2) `sf`, times its fiber check as today.
- Revenue, mood, churn, eyeball growth, SLA payouts, events (`b.srv` adds up the daily `sf`), the Pitcairn grant and
  scenario checks keep their formulas but read these values.

### 8.2 Billing (`40-billing.js`)
- **Daily sample, per transit port:** take the 24 hourly rx and tx (`DLV` of its pipes, adding prepend twins that share
  its id), and keep the top 6 of each, descending.
- **`p95dir(hist, today)`:**
  - Pool the stored tops of the last 29 days with today's.
  - With `n` days, `k = ceil(0.05 × 24 × n)`. Sort the pool in descending order and take index `k − 1`.
  - This is exact unless one day holds more than 6 of the top `k`. In that case it bills slightly lower; that is
    accepted, and a test documents it.
- **Bill:** `q = max(p95dir(i), p95dir(o))`. `transitMo(t, q)` and the commit floor are unchanged. `R.p95[t.id] = q`, and
  `R.p95dir[t.id] = {i, o}` says which direction set the bill.
- **Paid PNIs with `perG`:** the same, on `p.hist`.
- Exchange, cache and port fees are unchanged.
- `histToday()` keeps its role: once today's row exists, a recompute later that day does not count today twice.

### 8.3 Stats and history
- **The peak hour** `hp` = argmax over `h` of the hour's total delivered.
  - `R.served` and `R.demand` are taken at `hp`. Goals, `stats.peak`, levels, badges and the share card all read these
    unchanged.
  - The "traffic now" tiles read the current hour through accessors (§9).
- `S.hist` adds `pin`, `pout`, `srvH` and `loss` (§4).
- **The clean-days streak** counts days when no endpoint's `L` exceeds its class's `tol`, and every home `D ≥ 0.995`.
- **`R.egT` and `R.netEg`** (the traffic by kind of exit, by network) are taken at `hp` from the in direction. Dashboard
  charts keep working.

## 9. R: the result shape and accessors
New fields:

```js
R.H = 24; R.hp; R.NP; R.pipeCap (Float64Array NP)
R.off, R.dlv, R.loss                   // Float32Array 24·NP
R.pipeOfLink(l) -> [ab, ba]            // pipe indices oriented to l.a→l.b, or null if the link is not live
R.pipeOfExit(kind, id) -> [rx, tx]     // kind 't'|'ix'|'p'|'c'; summed over prepend twins
R.at(pipe, h = UI.hour) -> {off, dlv, loss, cap}
R.linkAt(l, h = UI.hour) -> {ab:{off, dlv, loss}, ba:{…}, cap}   // one link's share of its edge (active first, standby after)
R.flowsOn(pipe, h) -> [{o:originIndex or 'own:<city>' or 'l2:<id>', g}, …]   // lazy, top 12, like today's R.ef
R.why(pop, net) -> [{step, exit, lp, as, igp, decided:bool}, …]               // lazy
R.svc = {pop:{city:{D, L, sf}}, grp:{key:{D, L, sf}}, l2:{id:{D, L, sf}}}
R.prev                                 // yesterday's per-direction edge load at hp (for scenic L2)
```

Kept for compatibility. Old readers keep working, and each moves to the accessors in phase 6:

| Field | New meaning |
| --- | --- |
| `R.load[l.id]` | the busier direction at that link's own busiest hour (that hour is the link's daily peak, so upgrade logic stays right) |
| `R.useT`, `R.useIx`, `R.usePni`, `R.useCache` | `max(rx, tx)` at that port's busiest hour |
| `R.nodeLoad`, `R.nodeCap` | the router at its busiest hour |
| `R.citySrv`, `R.cityDem` | at `hp` |
| `R.ef[edgeKey]` | built from `R.flowsOn` for both directions merged, so old panels still render |

**Dropped:** `R.efg`, `R.fl`, `R.flc`, `R.efp`, `R.tgtF`, `R.bbF`.
- `38-pni-value.js` reads `R.fl`; it becomes a function over the flow columns with the same answers per city and network.
- Its estimate becomes "what a PNI here would take, at the peak hour, in the in direction".

**The worker** (`28-route-worker.js`):
- It posts `{S, prev:R.prev, l2route}` and receives the typed arrays as transferables, plus the plain fields.
- The accessors are rebuilt on the main thread (`rwPack`/`rwUnpack`).
- One day per job, as today.

## 10. Time, the loop and when things are computed

### 10.1 Hours
- `UI.hour = Math.floor(acc / DAY_MS × 24)`, clamped to 0..23, and updated in `frame()`.
- A change of hour marks the panels and the map dirty (`UI.panelsDue`). It never recomputes anything.
- When the game is paused, the hour stays. In puzzles (`rule('clock')` false), `UI.hour = R.hp`.

### 10.2 The day
`dayTick()`:
1. `dayPre()`;
2. `computeDay()`, all 24 hours, in the worker when it is on;
3. `dayPost()` on the aggregates. Billing samples, history rows and mood use §8.

### 10.3 Recompute triggers and caching
- **The control plane key** `CPK` = the graph key (as today) + exits key (as today) + `polKey` (S.pol plus the compiled
  RouteScript, JSON) + the event flags that change reach. While `CPK` stays the same, `CP` and the incidence are reused.
- **The data plane** reruns whenever flows or capacities change: every day, and after any action that changes them.
  `routeIfChanged()` keeps its role, with `routeKey()` extended by `polKey`.
- **Budget:** on `tests/fixtures/big-network.json`, the median `computeDay()` must be ≤ 1.2 × today's median `compute()`
  on main. If it is slower, move incidence building into the cached part first.

## 11. UI
Principles:
- one idea per sheet;
- everything reachable by tapping on the map;
- works at 360 px portrait and landscape, using the phone tab bar and bottom sheets;
- every term has a one-line tooltip;
- with nothing configured the game still plays.

All new text goes through `tr()`, and translations are added with `scripts/i18n-add.js`.

| Where | What |
| --- | --- |
| **HUD** | A clock, `14:00 UTC`. Tapping it shows the hour in your home POP's time. |
| **Map: night** | A soft shade over the night side. The subsolar longitude is `(12 − h) × 15`, and the terminator is a filled polygon drawn after land, before links. It is skipped when `far`. |
| **Map: links** | Two lanes, offset ±0.28 w from the centre line, each 0.5 w wide, coloured by `utilCol(u)` of its own direction at `UI.hour`. Dots run in each lane's direction. A lane with `loss ≥ 0.001` pulses red. When `far`, or when `busy` (`linesOnScreen > MAP_BUSY`), the lanes collapse to today's single line, coloured by the worse direction. |
| **Link sheet** | `pipeBars`: two rows, `Frankfurt → Amsterdam  72 / 100 G  ·  0.0 % loss` and the reverse. Then `graph24`: an inline SVG 24h chart of each direction's load, with in as an area, out as a line, capacity as a dashed line and the current hour as a tick, following the MRTG convention. Then "On this link": the top 5 per direction from `R.flowsOn`, shown as origin names (`NetChill · eu-west`). |
| **Port sheets** (transit, IX, PNI, cache rows in the city panel) | The same `pipeBars` (rx/tx) and `graph24`. Transit adds `Billed on: in · p95 412 G`. Each port gets a Tags row: chips, plus "+ tag". Transit and peer sessions get two switches, `allowas-in` and `Accept default route` (transit only), off by default, each with a one-line explanation. |
| **POP sheet** | A Tags row and a `Multipath` switch, off by default. |
| **Customer sheet** | A Tags row, and service as `Delivered 99.2 % · loss 0.4 % (ok ≤ 0.3 %)` at its busy hours. |
| **Networks list** | One row per network, with region chips. Opening a row lists its origins: in/out now, the exit used out and in, and a one-line "why" (`Shorter AS path · PNI · Frankfurt`). |
| **Routing tab** (dashboard, `55-routing.js`) | Four sections. **Tags:** create, rename and delete; each shows its value `AS:v` and where it is attached. **Rules:** each in plain words (`Routes tagged us-only · Los Angeles–Tokyo · don't carry`), with ↑ ↓ and ✕; "+ rule" opens a sheet with three pickers (match: tags first, then automatic communities in groups; place: exits, links, POPs, "every exit"; action: only those valid for the place, with a number field for lp or prepend). **QoS:** a list of matches in the priority queue. **Why this path?:** pick a POP and a network, see `R.why` as steps with the deciding one highlighted. "Edit as text" opens RouteScript. |
| **Lists** (NOC congested links, hot ports, dashboard busiest) | Rows read `Paris → London · 112 % · 11 % loss`, sorted by loss, then use, at the busiest hour, with that hour shown (`20:00`). |

Shared widgets (`93-ui/15-pipes.js`): `pipeBars(cap, [aName, bName], [offA, offB], [lossA, lossB])` and
`graph24(rxArr, txArr, cap, hour)`. Both return HTML strings, as `btn()` does.

## 12. MCP (`scripts/lib/mcp-page.js`, `mcp-commands.js`, `docs/MCP.md`)
- **`status`:** adds `hour`, `peakHour`, and served and demand at the peak.
- **`hot_spots`:** links and ports with `{dir, offeredGbps, capacity, loss, hour}` for the busier direction, plus the
  other direction.
- **New read tools:**
  - `origins({net?})`: the network's origins and how each reaches you;
  - `why_path({pop, net})`: `R.why`;
  - `link_day({id})`: 24h per direction.
- **New actions** (they go through `ACT`, as today):
  - `tagAdd {name}`, `tagDel {id}`, `tagOn {id, ref}`, `tagOff {id, ref}`;
  - `ruleAdd {m, at, act, n}`, `ruleMove {id, by}`, `ruleDel {id}`;
  - `qosAdd {m}`, `qosDel {i}`;
  - `multipath {city, on}`;
  - `sess {ref, allowas?, dflt?}`.

## 13. Tests
Each phase adds its own tests. All of them are seeded, and none depends on luck. Most cases use a small hand-built network
created with `ACT` calls in `tests/harness.js`.

| Test file | Must show |
| --- | --- |
| `regions.test.js` | Every city has a region and a tz. Tokyo has tz 9, Beijing 8, Mumbai 5.5, LA −8 (from longitude), and `regionOf('lax') === 'us-west'`. |
| `origins.test.js` | Every network has ≥ 1 origin. The sum of content and users weights per network matches its share × the type factors. CDNs have no users. The count is 300–800, and indices are stable between two loads. |
| `traffic.test.js` | Every `BIZ_T` type is in `CLASS_OF` (or is fiber). Every shape has 24 values with a maximum of 1. A Tokyo home flow peaks at UTC 11–12; a Frankfurt backup is non-zero only at UTC 0–4; training is flat. |
| `bgp-best-path.test.js` | With nothing configured: a PNI to NetChill beats local transit (AS path), and a far PNI beats local transit too. With `lp 200` on transit, transit wins. With two equal transits in one POP, the older one takes everything unless multipath is on, and then they split 50/50. |
| `bgp-communities.test.js` | The LA case: POPs in LA, San Jose and Tokyo, a NetChill cache in LA, an IX in Tokyo with NetChill, and links LA–SJ and LA–Tokyo. Tag the cache `us-only` and add the rule `l:lax\|tok nocarry us-only`. Then Tokyo's NetChill leaves by the Tokyo IX, San Jose's by the LA cache, and nothing NetChill-bound crosses LA–Tokyo. |
| `bgp-inbound.test.js` | NetChill traffic into a POP comes over the PNI even when your outbound to it prefers transit (asymmetry). `prepend 3` on one transit moves inbound to the other. `regonly` at a Frankfurt transit keeps US origins off it. |
| `islands.test.js` | Two islands with a hosting customer in B and eyeballs in A: unreachable by default (unmet, `why` says loop prevention). With `allowas` on A's transit, the traffic crosses an exit in A and one in B. With a link built, it stays on the backbone. |
| `pipes.test.js` | Residential traffic through a remote exit loads the link toward the POP (B→A) about 10× the reverse. A hosting customer loads the opposite way. An L2 `dci` loads both directions equally. `R.pipeOfLink(l)` is oriented to `l.a→l.b` when the link was built in either order. |
| `loss.test.js` | A pipe offered 120 % loses `1 − 1/1.2 ≈ 16.7 %`. At 90 % it loses about 0.02 %. A non-CDN network over a full PNI drops; a CDN spills to IX or transit and loses nothing. A QoS `class:gaming` keeps gaming at 0 loss while home traffic on the same pipe loses more. |
| `diurnal.test.js` | A transit port shared by Tokyo and Frankfurt eyeballs shows two peaks about 8 h apart. The day's peak hour `R.hp` matches the largest sum. `UI.hour` changes no numbers in `R`. |
| `billing-p95.test.js` | p95 picks the 36th highest of 30 × 24 samples. The bill follows the busier direction. An old numeric `t.hist` migrates and bills the same as before on its first day. |
| `engine-migration.test.js` | `tests/fixtures/big-network.json` (an old save) loads, gets `engV 3`, gets the exit-kind rules, multipath everywhere, `engNews` and `engGrace`. After 5 days, no customer has left because of loss. |
| `policy-sanitize.test.js` | A hostile `S.pol` (unknown ids, huge arrays, bad numbers, prototype keys) comes out clean and within the limits. |

**Existing tests:**
- **`route-fuzz`** (comparing main with this checkout) is disabled during phases 3–6, with a skip that names this spec.
  The route-cache on/off comparison stays on. Once phase 6 lands, the main comparison is re-enabled.
- **To rewrite:** `route-skip`, `speed`, `game.test.js`'s equality checks, and the exact-number tests (`moscow-premium`,
  `glowball-sakura-lager`, `philippines`, `gangnam`, `pni-list`, `peering`). Their new numbers must be derived and
  explained in the test, not just pasted in.
- **`perf-bench.js`'s "same outcome"** check is expected to differ. For these phases it is reviewed on timing only, and
  the PR says so.

## 14. Delivery phases
Each phase ends with `npm test` green, `node scripts/i18n-check.js` at 0/0/0, perf measured against main, and the game
playable.

| # | Phase | Ends when |
| --- | --- | --- |
| 1 | This spec, ADR `0004-bgp-hourly-engine.md`, rule and doc changes (§15) | they are merged |
| 2 | Regions, origins, classes (data only, unused) | `regions`, `origins` and `traffic` tests pass, nothing else changes |
| 3 | Control plane plus a **flat one-hour** data plane with directed pipes and loss, behind `compute()`; the compatibility fields fill old readers; `S.pol` and the migration (§4) | the `bgp-*`, `islands`, `pipes`, `loss`, `engine-migration` and `policy-sanitize` tests pass; the old UI still works on `R.load` and the like |
| 4 | 24 hours, timezones, `UI.hour`, the worker, day aggregates (§8), billing | `diurnal` and `billing-p95` tests pass; the perf budget is met |
| 5 | Classes per customer (groups, audiences, L2 sites, fill, DDoS as flows) | the traffic and service tests pass |
| 6 | UI (§11) and MCP (§12) | checked by hand at 360 px and on desktop; MCP tools answer |
| 7 | Rebalance: prices, levels (`LV_REQ` peaks), scenarios, puzzles, weekly content, the bots (`scenario-bot.js`, `scenario-ref.js`), gameplay rules, CHANGELOG | the gameplay-rules test passes; weekly content is reissued |

## 15. Rules and instructions to change (phase 1)
- **`.claude/skills/gameplay-rules`:**
  - M1 becomes "Old saves load and migrate (`engV`), then play by the current engine; On-call equals `RULE_DEF`."
  - New rules, each with a test:
    - **E1:** routing never sees capacity, except CDN spill and Auto-TE;
    - **E2:** every `BIZ_T` type has a traffic class;
    - **E3:** every capacity has rx and tx;
    - **E4:** every network has an origin;
    - **E5:** a new network starts with an empty `S.pol`;
    - **E6:** islands cannot reach each other without a link, `allowas` or a default route.
- **`docs/ARCHITECTURE.md`:** rewrite "The life of a day", "compute()" and the globals (`R`, `CP`, `UI.hour`) in phase
  4; until then, keep the "Planned" note.
- **New ADR `docs/adr/0004-bgp-hourly-engine.md`:** capacity-blind BGP, hourly data plane, origins.
- **Skills:**
  - `edit-the-game`: the new files;
  - `write-tests`: small hand-built networks, and hours;
  - `performance`: the budget in §10.3 and the outcome-difference note.
- **CLAUDE.md:**
  - Releases: this is a **3.0.0**, and the rule "patch or minor" needs a line for a major, decided by Frederic.
  - "What's new" gets one bullet that stands on its own (for example "Your network now runs on real BGP, with traffic
    that follows the sun, in and out on every link, and packet loss") plus the release link.
  - Nothing else changes: GitHub Pages only, phones first, saves are sacred (migrated), and translations by label.

## 16. Open points (to settle before phase 3)
- `EYE_W`, `CACHE_HIT`, the audience gravity distance (3000 km) and `peakUtil`s are first guesses, to be checked against
  the big-network fixture in phase 5.
- Should a `regonly` export also apply to a cache (that is, only map users from the cache's region)? The proposal is
  yes, which makes caches respect it.

## 17. As built (2026-11-03)

The engine is `src/game/80-simulation/31-35`, the UI `93-ui/15-pipes.js` and `93-ui/47-bgp-panel.js`, the actions
`90-actions/62-policy.js`; tests `tests/network-engine.test.js`, `tests/origins.test.js`, `tests/traffic-mix.test.js`
and rules E1–E8. Where the
code differs from the text above:

- **Classes.** IP events (`event`, `esport`) are a class of their own, `live` (out-heavy, evening, inelastic); `capw`,
  `capsub` and `slice` are `dci`, `flex` is `special`, `l3vpn` is `enterprise`.
- **Audiences** have no `rest` flow: the 40 strongest origins plus every POP of yours with broadband, renormalised. Who is
  in an audience does not change with demand, so routing is kept from day to day.
- **Old preferences** are not migrated into rules: an exit's own Prefer is local-pref 150, Backup only is local-pref 20
  and three prepends on its announcements. RouteScript's compiled rules come before `S.pol`'s (a deployed controller
  has the last word).
- **Grace** (old saves' first 30 days) lifts service to 95% everywhere, revenue included.
- **L2 circuits** are one endpoint per pair of sites; a customer's service is its worst pair.
- **Inbound ties** (same relationship, AS path and distance) go by a stable hash per origin and exit: the far side's
  own tie-breaks, which spread traffic over your ports.
- **Loss.** Bursts cost up to 0.2% between 85% and 100%; at or above 100% a pipe drops exactly the excess and carries its
  capacity. A two-way flow is delivered as well as its worse direction (TCP). Flood junk is served first on every pipe
  and router (it does not back off), then the priority queue, then best effort.
- **DDoS** keeps its model (25-ddos-flood.js: spread, RTBH, Flowspec, scrubbing); its junk is offered to the pipes.
  Collateral counts what others lose on the pipes the junk crosses.
- **Latency** is the detour your network adds to the trip to the far end (backbone to the exit, plus the exit's distance
  to the origin, minus the direct distance), on every kind of exit; under sender pays, Korean users mind the haul itself.
- **Auto-TE** gives every single-path list one second path (the shortest avoiding its links, within the reach of the
  backbone's TE level) and moves exactly what is over the spill mark, up to three rounds a hour. `cap` moves outbound
  onto the best route without the capped upstream, or drops it.
- **Puzzles and Architect runs** (no clock) route steady flows: every hour alike, circuits at full rate both ways in the
  priority queue, eyeballs download only, content from the source nearest its users, no bursts, spill on. They are
  capacity puzzles, and their references were built for that.
- **The hour** shown (`UI.hour`) follows the clock; the HUD shows it in UTC. The map's night shade and the networks list's
  region chips and origins are not built yet; neither are `R.why` ("why this path?"), the MCP `origins`, `why_path` and
  `link_day` tools, nor the ratio rule for peering (§6).
- **Hosters** (`30-networks/34-hosters.js`, `type:'host'`): six global ones and one or two per region, open peering,
  upstreams in Tier 1 cones; the long tail's own hosting entries are `host` too. Content is served from the origin's
  server nearest the user (`srvOf`), and that city is where the far side's hot potato starts; under sender pays it is
  never inside Korea (`srvNoKr`). Flows and the looking glass name it.
- **Performance** on `tests/fixtures/big-network.json` (`npm run perf -- --base-ref origin/main`, headless, median of
  15): `compute()` 48 → 244 ms, `dayTick()` 74 → 454 ms (the day runs in the route worker during play), `after()`
  2.8 → 3.6 ms, the map at three zooms 7.3 → 10.6 ms (two lanes per link), panels and dashboard unchanged. The
  budget of §10.3 (1.2×) is not met: a day is 24 hours, and on this network a customer signing or leaving rebuilds the
  per-item routing (about 150 ms of the 230). Next steps: key the route memo per network and by exit identity, so a new
  exchange member or customer only reroutes what it touches.

