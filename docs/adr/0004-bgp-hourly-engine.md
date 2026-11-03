# ADR 0004: A BGP network that does not see capacity, two pipes a link, 24 hours a day

- Status: accepted
- Date: 2026-11-03

## Context

Until 2.7 the simulation was a capacity puzzle more than a network. A link or a port was one undirected pipe, so you
could not tell which direction was full. Every endpoint's traffic was split by the same share table, so an AI training
cluster "watched" the same mix as a household, flat around the clock. Routing filled the nearest exit and quietly
topped up the next one when it was full: nothing was ever dropped, and "100%" said nothing about loss. Policy was a
fixed ranking of exit kinds. Players who run networks for a living could not play it the way they think.

## Decision

The full model is [docs/specs/network-engine.md](../specs/network-engine.md). In short:

- **Routing is BGP and never sees capacity.** Out: local-pref (100 by default), AS path, eBGP over iBGP, IGP, oldest,
  multipath when switched on. In: the far network's choice. Only three things move traffic for room: a CDN's egress
  engineering, Auto-TE, and the steady flows of puzzles (capacity puzzles by design).
- **Communities and rules** (`S.pol`): tags of your own and automatic ones, attached to ports, caches, POPs and
  customers; rules that set local-pref, drop, prepend, limit to a region, blackhole, or keep a route off a link. Routers
  start with nothing configured.
- **Two pipes per link and port**, each with its own load and loss, shown on the map (two lanes) and in every panel.
- **24 hours a day.** Every customer type has a traffic class with its own far ends, direction and daily shape, run on
  the initiator's local time. Transit bills the 95th percentile of hourly samples, on the busier direction.
- **Loss.** A full pipe drops what does not fit; service per endpoint is what it got in its busy hours, against its
  class's tolerance for loss.
- **Remote networks are origins**: one per network and region, so traffic has a place and a timezone.

## Consequences

- Old saves load and migrate once (`S.engV`): they get the old exit order as local-pref rules, multipath everywhere, a
  notice, and 30 days in which loss costs no customers. Then they play by the new engine (gameplay rule M1 changed).
- Routing differs from 2.7 on purpose, so the route fuzzer compares this engine with itself (cache on and off) until
  main has it, and the benchmark's "same outcome" check flags the change.
- Scenarios, puzzles and weekly content were re-checked; Gangnam got 30 more days, a published weekly scenario a new
  revision.
- A day costs more than before (24 hours instead of one snapshot); the work that depends only on the network's
  structure is kept between calls, and the day runs in the route worker during play. Numbers in the spec.
- Hosting does not change: still one static page on GitHub Pages ([ADR 0001](0001-github-pages-only.md)).
