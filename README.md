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

**And one real building stood on a real beach.** The scaffold's orange triangle went, and a CC0
low-poly guesthouse stood at Ao Niang Resort on Koh Kradan at true metre scale — lit, casting a
shadow, cut off correctly by the hillside if you sank it into one, and landing within 0.001 px of
where MapLibre itself projects the coordinate. It was a tracer rather than a feature, and now that
the map draws your actual trip it has stood down to `?markers=N`, where it stays as the thing to
measure with. See [#7](../../issues/7) and [`docs/tracer/`](./docs/tracer/).

**And the trip is now on the map.** Save, and every Leg is drawn: a **Path** curving along the real
great circle — Copenhagen to Bangkok arcs over the Kazakh steppe, 1,432 km from where a straight line
on a flat map would put it — bending through any Via you gave it, inked and dashed by its Mode, with
a toy **Vehicle** standing at the midpoint pointing the way it is going. A Leg you haven't told the
Mode of yet is drawn too, in a muted dotted line, because the movement is real even when how you make
it isn't decided.

**No Path is lifted into the air, and that is a decision rather than an omission** — the only camera
that frames a long-haul looks straight down, and there a flight arcing to an 864 km apex produces no
bow at all: it just slides ~25 px off the line it should be on. See [#8](../../issues/8) and
[ADR 0006](./docs/adr/0006-a-path-is-a-line-layer-never-three-js.md). Vehicles thin out as you pull
back — one is drawn only where its Path has room for it — so the island-hop chain is three boats up
close and none at all over the region, instead of six models in a smear.

**And how big a model looks is settled.** The tracer left a problem behind: at true metre scale an 8.9 m
building is **1.5 px at z14 and 0.006 px over Thailand**, so a Stay Marker is invisible at any zoom that
frames more than one Stop. The answer is not one multiplier for everything —
[#20](../../issues/20) measured that and it wrecks the map. **A Vehicle is exaggerated to a floor of
40 px, because it is a symbol of a Mode; a Stay Marker never exaggerates at all and is simply not drawn
until it covers 15 px, which for today's model is z17.** Below that, a Pin holds the Stop
([#9](../../issues/9)). Open the deployed map with `?markers=1` and zoom out past z17: the building
vanishing is the law working, not a bug.
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

**And you can now find a Stop by typing its name.** Type into a new Stop's Name box and the places it
could be drop down underneath; pick one and the coordinate lands. It searches with **both spellings of
the same island** — because `Koh Lipe` alone answers with four hamlets in Liberia and `Koh Kradan`
alone answers with nothing at all, while `Ko Lipe` and `Ko Kradan` find them instantly, and `Koh Rong`
is genuinely spelled that way in Cambodia. So neither spelling is chosen for you; both are asked, and
the answers are merged. Picking a result **never renames your Stop** — you typed `Koh Mook` because
that is what the ferry ticket says, and OSM's `Ko Muk` stays on the map's own labels where it belongs.
Search stops the moment a Stop is placed, so renaming one can never move it. See
[#18](../../issues/18).

**What doesn't: nothing stands at a Stop yet.** The Paths arrive and leave, but the place they meet
is bare — the tracer building has stood down to `?markers=N`, and Pins and the Stay Marker's real
behaviour are [#9](../../issues/9), which is the next thing to build.

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
- **[src/map/path.ts](./src/map/path.ts)** — the line drawn for a Leg: great-circle geometry, the ink
  and dash each Mode carries, and why none of it is three.js.
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
