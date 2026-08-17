# 0008 — The Stay Marker signals a booking; it does not depict one

Date: 2026-08-17

Status: Accepted. Amends the _reasoning_ of [ADR 0005](0005-a-vehicle-is-exaggerated-a-stay-marker-never-is.md) and leaves its rule intact.

## Context

[#7](https://github.com/adrianpetersson/onward/issues/7) fired the tracer with Kenney's
`building-sample-house-b` — a cream two-block guesthouse with pitched gable roofs — for one reason:
[#4](https://github.com/adrianpetersson/onward/issues/4) had judged the Modular Buildings kit to be
"flat-roofed cubes", and this was the one pre-assembled sample that looked like somewhere you sleep.
It was chosen because it existed.

[#20](https://github.com/adrianpetersson/onward/issues/20) then ruled that a Stay Marker is drawn at
true metres and simply **not drawn** below 15 px, which for that model is z17. And
[#9](https://github.com/adrianpetersson/onward/issues/9) ruled that there is **one** building, not one
per kind of Stay, because the Pin standing above it already carries the status at every zoom the
building is not drawn at.

That left two problems visible in the real Itinerary
([#15](https://github.com/adrianpetersson/onward/issues/15)):

1. **z17 is very close in.** At z17 the viewport is ~700 m, so a booking only announces itself once
   the camera is already inside the Stop. Across the whole planning range, a booked bed was invisible.
2. **The building was indistinguishable from its neighbours.** #9 recorded this outright: drawn at
   true metres, the guesthouse is "one more building among the OSM extrusions on the same beach".
   MapLibre draws OSM's `building-3d` extrusions at true metres too, and we do not get a vote.

[#21](https://github.com/adrianpetersson/onward/issues/21) was written expecting the hard part to be
sourcing a CC0 highrise. It was not: `building-sample-tower-a/b/c/d.glb` ship inside the archive
already listed in `sources.json`. #4's claim was simply wrong, and no new source, licence or
attribution surface was needed.

The real question was whether one building can serve eight Stops when three are cities and five are
islands. Two facts settled it:

- **The building follows `Stay.status`, not the Stop.** `markerAt` returns `building: false` for a
  Shortlisted Stay. On the real trip all three urban Stays are shortlisted _area names_ — "Sukhumvit —
  Asok / Phrom Phong", "Bukit Bintang", "George Town heritage core" — so no building rises at any of
  them. Exactly two Stops draw one, and both are islands.
- **`Stay` has no field for what kind of building it is.** Selecting between models needs either a new
  field, or inference from free text. The former is a model change made to fix a depiction — the move
  this repo already declined for rolling stock — and the latter guesses.

## Decision

**The Stay Marker is a symbol that a bed is booked here. It is not a portrait of the accommodation.**

Every non-Shortlisted Stay stands the same 40 m hotel tower, whether the real bed is a Sukhumvit condo,
a George Town shophouse or a hut on Koh Kradan. The traveller does not need the map to tell them what
they already know they booked; they need to _find_ it.

**It is a highrise precisely because that is what makes it findable**, and the mechanism is #20's own:

- `readSpanOf` reads an asset's **longest** axis, and for a tower that is its height. Read at 40 m the
  tower crosses `STAY_MIN_PX` at **z14.80** (Bangkok) / **z14.83** (Koh Kradan), against the
  guesthouse's z16.97 — **2.2 zoom levels earlier, with `STAY_MIN_PX` untouched.** This is the pixel
  threshold being spent exactly as it was designed to be.
- At 40 m it out-tops every real building on a Thai island beach, so it is no longer one extrusion among
  many. `docs/models/stay-hotel/real-trip-koh-lipe-among-osm.png` is the proof: the tower is plainly
  distinguishable among dozens of OSM extrusions along Pattaya Beach.

`building-sample-tower-a` over the other three on **slenderness, which is a cost here rather than a
virtue** — the corollary that inverts the obvious. Because the law reads the longest axis, a model
arrives 15 px along it and `15 ÷ slenderness` across. The guesthouse's longest axis was its 8.9 m
_footprint_, so it arrived 15 px wide and chunky; a tower's is its height, so Kenney's narrowest
(`tower-d`, h/foot 3.42) arrives as a **4 px stick**. `tower-a`'s h/foot of 2.0 stays a block, and its
window grid and entrance canopy read as a hotel. See `docs/models/stay-hotel/picking-at-15px.png`.

## What this does to ADR 0005

**Its rule stands unchanged; its stated reason is now only half true.**

ADR 0005 argues that a Vehicle is exaggerated because it "depicts a Mode rather than claiming to be a
machine", and that a Stay Marker is never exaggerated because it _is_ such a claim. After this ADR the
Stay Marker is a symbol too — so that distinction can no longer be what separates them.

It never was. What killed exaggeration for the Stay Marker was a **measurement**: holding an 8.9 m
building at ~48 px means inflating it to 396 m at island zoom, 77 km over Thailand and 705 km on the
trip view, where it occludes the coastline it stands on and the map underneath disappears. A Vehicle
at the identical multiplier reads perfectly. **The asymmetry is ground contact, not symbolism** — a
building sits on the terrain and buries it; a Vehicle sits on a Path over water or air. That
measurement is untouched by this ADR, so `STAY_MIN_PX` and the no-exaggeration rule are untouched too.

## Consequences

- **A booking is visible from z14.8 instead of z17**, which is the point.
- **#9's reasoning is weakened and its outcome is not.** #9 argued from a Stay Marker not being drawn
  below z17, where the viewport (853 m) is narrower than most Stop-centre-to-bed gaps. At z14.8 the
  viewport is ~3.3 km, which is wider than Koh Kradan's 780 m and George Town's 1.1 km — those gaps
  _would_ now fit on screen. The ruling survives because #9 **removed the second coordinate** rather
  than relying on it being invisible: there is one `coord`, so no pair remains to reconcile.
- **Two Stay Markers still never share a frame.** At z15 the viewport is 2.8 km and the two
  building-bearing Stops on the real trip are 92 km apart.
- **The shadow disc tripled.** A 40 m tower throws ~31 m of shadow, so the catcher is now derived
  (~44 m) rather than hand-picked. The formula validates against #7's eye: it returns 11.2 m for the
  old guesthouse, which shipped at 14 m. #7's residual — the catcher is flat, and wrong on a slope —
  now applies over three times the area. `SHADOW_EXTENT_M` still covers it at 60 m, with 26% margin
  rather than 5×; **a taller Stay Marker than this must raise it.**
- **The Jump got less legible and no metre value fixes that.** 6 m was justified as clearing the
  guesthouse's roofline; clearing 40 m would be a launch. It is now a quarter of the model's height
  (10 m), which is 8.4 px at z16 but only 3.8 px at the tower's new z14.8 floor, against the 10 px it
  had at the guesthouse's z17 floor. Matching that would take a 26 m hop. The pulsing Pin carries the
  same information at every zoom, so this is a residual and not a hole.
- **#17's justification for scaling trains on height lost its comparison.** It read "a 20 m carriage
  towers over an 8 m guesthouse", and the guesthouse is gone. The conclusion is unaffected — a carriage
  inflated 4.3× in cross-section is absurd whatever stands next to it — and `build.mjs` now says so
  without the comparison, so it cannot rot again.
- **z17 as the opening zoom is now a choice, not a floor** (`INITIAL_VIEW`). Opening wider would still
  show a building. Nobody has made that call.
- **Bundle weight is unchanged**: 398 tris and 42.5 kB against the guesthouse's 374 and 40.0 kB;
  eleven models still ship at 1.26 MB.
- **The other three towers are not shipped.** #17 already left three unreachable train GLBs in the
  bundle; once was enough. They are recorded in `sources.json` under `notTaken` with the measurements,
  so re-picking costs one line and no research.
