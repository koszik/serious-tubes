---
name: gameplay-rules
description: The design rules of Series of Tubes, each with an id and the test that enforces it. Use whenever you add or change cities, countries, networks (NETS, upstreams, traffic shares, presence), cables, exchanges, data centers, customers, scenarios, puzzles, presets or rules, balance numbers or progression, and before committing any such change.
---

# Gameplay rules

These are what the game promises, held up by `tests/gameplay-rules.test.js` (one `test()` per id, on the live
`CITIES`, `NETS`, `CABLES`, `SCN`, `PZ`, `PRESETS`…). Each rule is true of the intended design.

## Procedure

1. Changing anything above? Run `npm test -- tests/gameplay-rules.test.js` (under a minute) before committing.
2. A failure names what breaks the rule and how to fix it. Fix the data or the code.
3. Only when real life really is different, add an entry to `EXCEPTIONS` in the test (keyed by rule id, sorted, with
   its reason in plain words). Never delete or loosen a check to make it pass. A stale exception fails too.
4. A new rule gets an id in the right section here, one line, a why, and its own `test('ID: …')`.

## World

| Id | Rule | Why |
| --- | --- | --- |
| W1 | Every city has a country code (`cc`, ISO 3166-1 alpha-2; territories have their own: PR, GU, RE, MQ, CW…), a region, a landmass and coordinates. | Borders, prices and the eyeball rule all hang off the country. |
| W2 | Every country on the map has at least two consumer networks of its own: an eyeball network, or a Tier 1 or Tier 2 incumbent that sells to homes, whose home markets (`cc` on the network) include that country and which has a PoP there. | Real countries have competing local ISPs, and peering locally is half the game. Add real operators in `src/game/30-networks/32-homegrown-eyeballs.js`. |
| W3 | Every city can buy transit from someone, or is a documented exception (Pitcairn: land your own cable; Stuttgart: peering only). | A start or an expansion must never be a dead end by accident. |
| W4 | Cable pairs join two distinct real cities, have a length, and cable ids are unique. | Broken landings break routing and the own-cable planner. |
| W5 | A city alone on its landmass has a cable or a beach to land one. | Islands are reachable. |
| W6 | Internet latency between cities follows the cables (`worldMs`, `80-simulation/81-world-latency.js`): cable pairs at 1.25× their length, land neighbours at 1.6×, long routes within 15% of measured RTTs, and other networks' international traffic never transits Russia or mainland China. Latency customers ask for the fastest path anyone could build (`bestBuildMs`) plus 15%. | Straight lines made London–Tokyo 124 ms instead of ~220 and asked HFT firms for routes that cannot exist. Fix a wrong pair in the cable catalog, not in the factors. |

## Networks

| Id | Rule | Why |
| --- | --- | --- |
| N1 | Network ids and ASNs are unique; ASNs are public (the real one for real-world networks). | Saves key on ids; players look ASNs up. |
| N2 | Names are puns: no network, cable, exchange, data center, router, optic, cable ship or maintenance club is called by a real name (blocklist `REAL_NAMES` in the test), and no lazy "-ish" names. | CLAUDE.md. Add the real name to the blocklist whenever you add its pun. |
| N3 | Every non-Tier-1, non-content network is in a founding Tier 1's customer cone (`up`), or is a documented island (transit-free incumbents, China, Korea, Australia…). Upstreams exist and are never content. | Tier 1 by customer cone (#85): a new network outside the cones makes Tier 1 harder for every save, old ones included. |
| N4 | No upstream cycles. | Cones must be trees, not loops. |
| N5 | Traffic shares are positive and below 20%; `NSH` and the regional tables sum to 1; content carries at least 30%. | Shares drive every flow; eyeballs mostly ask for traffic. |
| N6 | Every network has a type, a peering policy (selective ones state `minIx`/`minPni`), a colour and a translated blurb; carriers have a price. | Panels and the peering rules read them. |
| N7 | PoPs are real, distinct cities; exchange ports only where the city has an exchange and the network has a PoP. | Presence follows PeeringDB-style reality. |

## Modes and rules

| Id | Rule | Why |
| --- | --- | --- |
| M1 | On-call is the classic ruleset: it equals `RULE_DEF`, and a save without rules loads as On-call. Old saves load and migrate once (`engV`, `migrate()`), then play by the current engine. The seeded suites (`tests/game.test.js`, `tests/rules.test.js`) are its behaviour. | Old saves keep loading; the simulation they run on is today's game. |
| M2 | Presets are ordered: Best Effort never harsher than Change Freeze, Change Freeze never harsher than On-call, BGP at 3 a.m. never gentler (chaos, lead times, market; and a seeded year of incidents). Only Best Effort mends sea cuts without ships, skips conferences, rescues instead of game over, has patient customers and instant PNIs. | The names promise it. |
| M3 | Every subsystem that can annoy the player reads a rule: outages and events (`chaos`), DDoS, sold-out routes, de-peering and hardware prices (`market`), lead times (`lead`), the clock, cable ships (`sea`), conferences (`confs`), going broke (`broke`), customer patience (`moods`), PNI delivery (`pnis`), and the day's toasts (quiet notifications). A quiet ruleset gives a quiet year. | Rules are presets of flags, not separate code. |
| M4 | Scenarios and the weekly challenge always run On-call plus their own `S.scn.rules`. | Fair scores. |
| M5 | Sandbox has no locked feature: open gates, every level, own cables, endless money. | It is a sandbox. |

## Content

| Id | Rule | Why |
| --- | --- | --- |
| C1 | Every scenario has a name, a goal, an `ok()` its progress card (`SCN_PROG`) shows, and cannot be won on day 0; so does every committed weekly scenario (`site/scenarios/weekly/`, its goal type's card in `WS_GOALS`). | A goal must need play. |
| C2 | Every puzzle has a 1-star and a 3-star reference solution in `REF` of `tests/puzzles.test.js`, which builds and scores them. | Every puzzle is solvable and every star reachable. |
| C3 | Every player-facing string is translated in every language (`node scripts/i18n-check.js`: 0 missing, 0 unused, 0 broken). | CLAUDE.md; see `add-strings`. |
| C4 | Every Architect run, handmade (`REF` in `tests/architect.test.js`) or weekly (`ref` in its file, `scripts/weekly-architect.js --check`), has a reference build that passes every brief's chaos monkey review and earns three stars; every weekly brief takes at least one change (a tube, a bigger tube, a move), and later briefs' cities stay hidden until they come. | A run you cannot finish, or a brief that asks for nothing, is not a puzzle; knowing the next brief makes it a chore. |

## Fun and fairness

| Id | Rule | Why |
| --- | --- | --- |
| F1 | A new network gets a gentle start: no outage before day 45, no event before day 40 and only good news before day 50, nothing sold out for 90 days, hardware prices hold for 180, and a new customer loses no mood and counts no SLA downtime for 15 days (`PROV_D`). | New players learn before they get punished. |
| F2 | On On-call, a simple build in a start city (broadband, the cheapest 100G transit, an exchange port with the route server) makes money within 3 months, in Frankfurt, New York, Singapore and Johannesburg. | Seeded today it turns a profit in month 1 or 2; a balance change that breaks this makes the start too hard. |
| F3 | A specialist path (#187) only brings a customer type in below its level when the network can already serve it, or nearly: the spotted cities have POPs, the latency is met, the fiber carries at least three quarters of the smallest order. | Capability, not luck: an offer you cannot fulfil with a reasonable build is a trap. |
| F4 | The chaos monkey visits only On-call and BGP at 3 a.m. (never Change Freeze, Sandbox, puzzles or scenarios), not before day 180, for 120 to 240 days; while it is here its snips replace the ordinary failures, each snip heals within a week, and it goes after tubes with no other way round first. | A test of resilience you can prepare for, not a pile-on: the reward goes to networks built with a second path. |
| F5 | Capacity you rent to other carriers never outgrows the route's market: a broker listing sells over time as carriers between the two cities want it, and neither it nor a random offer sells past what both cities' eyeballs support (a landing town counts the big city it serves). | Rent that scales with your own glass and not with demand is a money machine (#203). |
| F6 | A circuit customer pays a markup (at least 1.2×) on what its capacity leases for on its route and size, and every customer pays less per Gbps at its largest size than at its smallest. | Linear prices made a hyperscaler's 6.4T pay 30× a 6.4T wave; real big buyers pay close to cost, and the premium goes to small, fast or picky circuits. |
| F7 | Every contract has an SLA level chosen when signing; trading, hyperscaler, AI WAN, AGI, sovereign cloud, Mars and flex-algo customers only sign Premium or Strict, and rebates are capped at 1×, 3× and 12× the monthly fee. | A big price comes with a big promise; the cap keeps one bad cut painful but survivable. |
| F8 | Customers keep asking: offers come every few days (about one in four days at level 1), signed customers ask for upgrades, new requirements, stricter SLAs and new sites, and every contract except fiber leases, capacity deals and events has a term; at its end a happy customer renews at today's price, a lukewarm one wants 15% off and an unhappy one, or one whose requests were ignored, leaves. | Handling customers is the game; a signed customer that never asks for anything again makes a quiet network pay for nothing. |
| F9 | Traffic per broadband subscriber grows 15% a year while what subscribers pay stays flat, transit and exchange ports get 15% cheaper a year (to at most 80% off), and the access network costs 55% of broadband revenue (20% in Korea; Australia pays its wholesale network instead). | How real networks age: OpenVault and TeleGeography put per-subscriber growth at 10–15% and transit price erosion at 12–17% a year; a network that never adds capacity shrinks. |
| F10 | A network left alone makes a bounded amount: the F2 reference build in Frankfurt, untouched for 12 game years, earns under $500k in total and ends the 12 years making under 5% of its best month. | Idling at 8x must not turn into unlimited money. |
| F11 | Every connection to another network pays one cross-connect per fiber patch, the same for any speed: one per transit, exchange, PNI and fabric port or LAG member, one at each end of a wave or lit fiber pair, one in each building for a second site's ring; none for remote ports, your own exchange, VXCs or caches. By region ($80–250 a month), 1.5× at hubs with 50+ data centres, nothing monthly in cheaper markets (a one-off install everywhere). A PNI's own bill is only what a paid peer charges. | How colocation really bills: the patch, not the speed; it makes big PNIs and your own fiber pay off and expensive hubs cost what they do. |
| F12 | A customer is judged on the extra round trip its routing adds over a handoff in its own city, both ways (in where the far network hands it over, out where you send it), against its type's tolerance (`LAT_TOL`, 10–50 ms; broadband 20); the NOC says whether routing or a new connection fixes it. | The nearest-exit check missed hot potato inbound and never judged business customers. |

## Routing engine

docs/specs/network-engine.md. These hold the simulation to how networks really work.

| Id | Rule | Why |
| --- | --- | --- |
| E1 | Routing never sees capacity: BGP picks the path, and a full pipe drops what does not fit. Only a CDN's egress engineering, Auto-TE and the steady flows of puzzles and Architect runs move traffic for room. | That is how the internet behaves, and why a network engineer watches utilisation and loss. |
| E2 | Every customer type has a traffic class (fiber leases carry none), and every class a 24-hour shape that peaks at 1. | Customers have their own patterns; nobody is a copy of the eyeballs. |
| E3 | Every live link and every port is two pipes, each with its own load and loss, and each is shown. | The busy direction must be visible. |
| E4 | Every network has at least one origin, in a known region, anchored in a real city. | Every flow needs a far end with a place and a timezone. |
| E5 | A new network starts with nothing configured: no tags, rules, QoS, multipath or session switches. | Routers ship that way; configuring them is the game. |
| E6 | Your islands reach each other over the internet, out at an exit of one and in at an exit of the other, with no switch to turn on (as if every session accepted your own AS); a link between them keeps it on your backbone. | Networks with islands run allowas-in; the cost is the two ports it crosses. |
| E7 | Each class fetches from the kinds of network that really serve it (`DST_W`): home users mostly from CDNs and clouds, about a tenth from hosters, little from carriers or other ISPs' users; training only from clouds and hosters. Every region but China has a hoster (`type:'host'`, with upstreams and exchanges, no home market). China's, Russia's and Korea's own tables stay as they are. | Eyeballs do not download from eyeballs, and a GPU cluster does not train on a video CDN. |
| E8 | Content comes from the origin's server nearest the user (`srvOf()`, its PoPs in that region), which is where the far side's hot potato starts; under sender pays, never from inside Korea. | NetChill serves Paris from Paris, so it enters at your Paris port, not London. |

## DDoS

| Id | Rule | Why |
| --- | --- | --- |
| D1 | Attack sizes come from the world, never from your network: a heavy tail (median near 9 G, one in a hundred over 650 G) scaled by the era, capped at the era's record, and for the first 180 days (or with one POP) never more than twice your biggest port. Ten times the subscribers means the same attacks. | Sizes that grew with the network made every late-game flood larger than the internet's record (#242). |
| D2 | A flood enters on every port the internet reaches you on, by each network's share, and a port carries only what fits: everyone on a full port loses the same share. | Real floods are spread by geography; one fat port at a single POP is the weak spot (#242). |
| D3 | Only upstream tools (RTBH, clean pipe) and an engaged scrubbing center keep a flood off your ports. Flowspec acts on the ingress router, after the port, within that router's own rule budget. | Flowspec protects customers, not the external connections; TCAM is finite. |
| D4 | RTBH costs only the target: it goes dark (and its mood drops once), everyone else is saved, and the attack counts as sacrificed, not held. | RTBH is the tool that saves the network and is bad for that one customer, so it must be a real choice. |
| D5 | Flowspec filters at the edge first: an attack with a signature, rule room at every POP it enters and room on every port goes no further. A scrubbing center takes only what the edge cannot, and only while one is up; its diversion is an announcement, so the target's inbound traffic enters at the center and rides home once. The card judges the attack against the target's service just before it. | Diverting filterable floods cost a detour for nothing; hauling the clean traffic on top of the normal path counted it twice; a dead center blacked the target out. |
