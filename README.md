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

**And placing things.** Paste a Google Maps URL into any coordinate box and it reads the place's own
position out of it — offline, with no network call and no key. It reads the pin, never the camera, which is
a distinction worth knowing about before you trust any implementation of this
([#13](../../issues/13)). Bare `lat, lng` works too, a paste it cannot read says so and says what to do
instead, and clicking the map is always available underneath — including with no connection at all.

**What also works: one real building, on a real beach.** The scaffold's orange triangle is gone. A
CC0 low-poly guesthouse now stands at Ao Niang Resort on Koh Kradan at true metre scale — lit, casting
a shadow, and cut off correctly by the hillside if you sink it into one. It lands within 0.001 px of
where MapLibre itself projects the coordinate. See [#7](../../issues/7) and
[`docs/tracer/`](./docs/tracer/).

**What doesn't: the Itinerary is still not drawn.** That building is a tracer at a hard-coded
coordinate, not a Stay from your trip — nothing in the sidebar reaches the map yet. Paths and Vehicles
are [#8](../../issues/8); Pins and the Stay Marker's real behaviour are [#9](../../issues/9).

**And how big a model looks is settled.** The tracer left a problem behind: at true metre scale an 8.9 m
building is **1.5 px at z14 and 0.006 px over Thailand**, so a Stay Marker is invisible at any zoom that
frames more than one Stop. The answer is not one multiplier for everything —
[#20](../../issues/20) measured that and it wrecks the map. **A Vehicle is exaggerated to a floor of
40 px, because it is a symbol of a Mode; a Stay Marker never exaggerates at all and is simply not drawn
until it covers 15 px, which for today's model is z17.** Below that, a Pin holds the Stop
([#9](../../issues/9)). Zoom the deployed map out past z17 and the tracer vanishing is the law working.
See [ADR 0005](./docs/adr/0005-a-vehicle-is-exaggerated-a-stay-marker-never-is.md),
[`src/map/model-scale.ts`](./src/map/model-scale.ts) and [`docs/scale/`](./docs/scale/).

The building itself is wrong, though — it is the one pre-assembled house in a CC0 kit, where a Stay
wants a highrise. That is [#21](../../issues/21), and because #20's handover is a pixel count rather
than a zoom level, a taller model appears earlier on its own.

**And the trip now survives.** The Itinerary is saved to a **JSON file on your own disk** that you pick
once — put it in Dropbox or iCloud and your existing backups cover the trip. That file is the source of
truth and `localStorage` is only a cache of it, because no browser storage is durable: clearing site data
takes all of it, and Safari expires it after seven days without a visit. There is still no server, no key
and nothing to configure — see [#12](../../issues/12) and
[ADR 0004](./docs/adr/0004-the-file-is-the-truth-localstorage-is-a-cache.md). Chrome or Edge on the
desktop, since Firefox and Safari have no file picker; they run on the cache alone and say so.

One gap left worth knowing before you try it: there is **no search yet** ([#18](../../issues/18)), so a
Stop is placed by pasting or by clicking the map rather than by name.

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
- **[src/map/model-layer.ts](./src/map/model-layer.ts)** — how a three.js model gets anchored to a
  coordinate and drawn inside MapLibre's own GL context, and why one layer holds every model. Its
  companion [`model-scale.ts`](./src/map/model-scale.ts) is the only place a model's size is decided:
  one law, injected once, so nothing downstream can invent a multiplier of its own.
- **[docs/adr/](./docs/adr/)** — the decisions that would otherwise look arbitrary later.
- **The wayfinder map** — what's decided, what's still open, and what's deliberately out of scope.

## Not in the MVP

Deliberately, and recorded on the map: animated Vehicles travelling their Paths, a date-scrubbing
timeline, notes on Stops, points of interest, a multi-trip UI, accounts, a server, a database, and any
form of real routed pathfinding. Bird's paths only.

Also out: **manual JSON export and import**. The file on disk replaces both — it is written on every save
and re-opened when needed, so there is no button to press and no backup to remember to take.
