# Onward

A 3D map itinerary planner for solo travellers, backpackers and adventure travellers.

The map is the interface. Your trip is drawn into a stylised low-poly world: travel Paths between Stops
with a toy Vehicle for the Mode — plane, train, ferry, bus — pulsing Pins at each Stop, and a 3D building
standing on the actual beach once you've booked a Stay. Zoomed out it's a globe and your long-hauls arc
across it; zoom in and you drop to the hut you booked.

Administration lives in a sidebar that folds out from the left: add Stops, annotate the Legs between them
with flight and ferry details, paste a Google Maps link to place a Stay. Save, and the map redraws.

The 3D experience is the point. Everything else is in service of it.

## Status

Pre-MVP. The route to a working MVP is charted on the repo's
[wayfinder map](../../issues?q=is%3Aissue+label%3Awayfinder%3Amap) — a single issue indexing the decisions
made, with one child ticket per decision still open.

## Reading order

- **[CONTEXT.md](./CONTEXT.md)** — the glossary. Read this first; the words are load-bearing.
- **[docs/adr/](./docs/adr/)** — the decisions that would otherwise look arbitrary later.
- **The wayfinder map** — what's decided, what's still open, and what's deliberately out of scope.

## Not in the MVP

Deliberately, and recorded on the map: animated Vehicles travelling their Paths, a date-scrubbing
timeline, notes on Stops, points of interest, a multi-trip UI, accounts, a server, a database, and any
form of real routed pathfinding. Bird's paths only.
