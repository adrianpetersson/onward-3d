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

Pre-MVP, and standing up. The route to a working MVP is charted on the repo's
[wayfinder map](../../issues?q=is%3Aissue+label%3Awayfinder%3Amap) — a single issue indexing the decisions
made, with one child ticket per decision still open.

Deployed at **<https://onward-tan.vercel.app>**. Today that is a pitched 3D map over Koh Mook with one
orange triangle standing on the terrain: the scaffold's proof that a three.js model lands on a real
coordinate. Everything that makes it an itinerary planner is still ahead.

## Running it

Desktop browsers only, and deliberately so — there is no mobile layout and none is planned.

```bash
pnpm install
pnpm dev      # http://localhost:3000
```

| Command        | What it does                                                             |
| -------------- | ------------------------------------------------------------------------ |
| `pnpm dev`     | Dev server on port 3000                                                  |
| `pnpm build`   | Typechecks with `tsc --noEmit`, then builds to `dist/`                   |
| `pnpm preview` | Serves the built bundle — worth using, since the map's worker is bundled |
| `pnpm test`    | Vitest, once                                                             |
| `pnpm lint`    | ESLint                                                                   |
| `pnpm check`   | Prettier `--write` plus ESLint `--fix`                                   |

There is **nothing to configure**: no API keys, no env vars, no server. Tiles, terrain and search all come
from keyless providers, and the whole thing deploys as static files. If you find yourself adding a secret,
something has gone wrong — see [#3](../../issues/3) and [ADR 0002](./docs/adr/0002-no-backend-localstorage-and-one-edge-function.md).

## Reading order

- **[CONTEXT.md](./CONTEXT.md)** — the glossary. Read this first; the words are load-bearing.
- **[docs/adr/](./docs/adr/)** — the decisions that would otherwise look arbitrary later.
- **The wayfinder map** — what's decided, what's still open, and what's deliberately out of scope.

## Not in the MVP

Deliberately, and recorded on the map: animated Vehicles travelling their Paths, a date-scrubbing
timeline, notes on Stops, points of interest, a multi-trip UI, accounts, a server, a database, and any
form of real routed pathfinding. Bird's paths only.
