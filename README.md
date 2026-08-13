# Onward

A 3D map itinerary planner for solo travellers, backpackers and adventure travellers.

The map is the interface. Your trip is drawn into a stylised low-poly world: travel Paths between Stops
with a toy Vehicle for the Mode — plane, train, ferry, bus — a pulsing Pin wherever you haven't booked a
bed yet, and a 3D building standing on the actual beach once you have. Zoomed out it's a globe and your
long-hauls arc across it; zoom in and you drop to the hut you booked.

Administration lives in a sidebar that folds out from the left: add Stops, annotate the Legs between them
with flight and ferry details, paste a Google Maps link to place a Stay. Save, and the map redraws.

The 3D experience is the point. Everything else is in service of it.

## Status

Pre-MVP, and standing up. The route to a working MVP is charted on the repo's
[wayfinder map](../../issues?q=is%3Aissue+label%3Awayfinder%3Amap) — a single issue indexing the decisions
made, with one child ticket per decision still open.

Deployed at **<https://onward-tan.vercel.app>**.

**What works: the sidebar.** You can build a whole Itinerary in it — Stops in order, dragged to reorder,
the Leg into each one annotated with its Mode, times, carrier and fare, and Stays carrying their
references and cancellation deadlines. The shape it captures is settled and tested: see
[`src/itinerary/model.ts`](./src/itinerary/model.ts) and [#10](../../issues/10).

**What doesn't: the half that makes it worth looking at.** The Itinerary is not drawn yet. The map is
still the scaffold's pitched view over Koh Mook with one orange triangle standing on the terrain — the
proof that a three.js model lands on a real coordinate, and nothing more. Paths, Pins and Stay Markers
are [#8](../../issues/8), [#9](../../issues/9) and [#7](../../issues/7).

Two other gaps worth knowing before you try it: there is **no search yet** ([#18](../../issues/18)), so a
Stop takes a pasted coordinate or a Google Maps link rather than a name; and **nothing survives a reload**
([#12](../../issues/12)).

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
- **[src/itinerary/model.ts](./src/itinerary/model.ts)** — the shape of an Itinerary, with the reason each
  field earned its place. Its companion [`derive.ts`](./src/itinerary/derive.ts) is the only place a
  derived fact exists: if something can be computed, storing it is a bug.
- **[docs/adr/](./docs/adr/)** — the decisions that would otherwise look arbitrary later.
- **The wayfinder map** — what's decided, what's still open, and what's deliberately out of scope.

## Not in the MVP

Deliberately, and recorded on the map: animated Vehicles travelling their Paths, a date-scrubbing
timeline, notes on Stops, points of interest, a multi-trip UI, accounts, a server, a database, and any
form of real routed pathfinding. Bird's paths only.
