# 0007 — The globe hands over at z4 → z7, before it runs out

**Status**: accepted, 15 Aug 2026
**Ticket**: [#14](https://github.com/adrianpetersson/onward/issues/14)

## The decision

The Diorama is a **globe below z4**, morphs continuously between **z4 and z7**, and is the **pitched
mercator map from z7 up**. The band is written as a zoom expression on the style's `projection`
property, and its upper end must stay below `GLOBE_CEILING_ZOOM`.

Nothing else changed to make the globe work: no per-projection Path geometry, no ceiling on the
Vehicle size multiplier, no change to the model matrix, and no change to the model layer's hard
switch on `projectionTransition`.

## Why this needs recording

Two reasons, and the second is the one that will bite.

**The band looks like a taste decision and is half a hard constraint.** Above z16.8 the globe draws
_nothing_, so a band that reached up into street zoom leaves a blank map at every zoom in between.
Anybody widening the band to make the morph gentler will reach for the upper number first.

**MapLibre's own default is z11 → z12, and moving off a framework default deserves a reason.**
`{ type: 'globe' }` already works and already morphs; choosing 4 → 7 is a deliberate departure.

## What was measured

All of it in the app, on the real SEA itinerary, held **statically** at points in the morph — the
handover is a zoom expression, so the blend state is a pure function of zoom and needs no animation
to observe. Evidence in [`docs/globe/`](../globe).

**The globe stops rendering at z16.8.** Pinned to `vertical-perspective` and climbed: 22 rendered
features at z16.0, 15 at z16.5, and **0 at z16.8 and above** — no tiles, no coastline, no Pin, with a
lone three.js building floating in a void ([`globe-draws-nothing-at-z17.png`](../globe/globe-draws-nothing-at-z17.png)).
This is **not** a terrain interaction: `setTerrain(null)` changes nothing, and switching the same
camera to mercator brings 29 features straight back. It is almost certainly why MapLibre's own
default hands over where it does.

**A custom layer never sees a fractional transition.** Measured across 18 rungs of two different
bands, `projectionTransition` was only ever 0 or 1.
`GlobeTransform.getProjectionDataForCustomLayer` returns the vertical-perspective transform's data,
which hard-codes `applyGlobeMatrix ? 1 : 0`; the fractional `_globeness` goes to MapLibre's own
layers and never reaches `render()`. This confirms by observation what [#2](https://github.com/adrianpetersson/onward/issues/2)
could only infer, and it is why the model layer's `projectionTransition > 0` switch is correct rather
than lucky.

**Models do not drift through the morph.** The expectation going in was that they would: `mainMatrix`
is the _pure globe_ matrix for the whole morph while the tiles underneath are blended part-way to
mercator, which is exactly the shape of the bug MapLibre PR #5150 fixed. Measured, placement is
**0.00 px** from `map.project()` at every rung, and the picture agrees — at globeness 0.83 the
airliner sits exactly on its dashed Path, which MapLibre draws through the blended pipeline
([`mid-morph-vehicle-on-its-path.png`](../globe/mid-morph-vehicle-on-its-path.png)).

**The far side culls everything.** With the camera over South America and Southeast Asia on the far
side of the planet, no Pin, no label and no Path bleeds through — `circle`, `symbol` _and_ `line`
layers are all hidden behind the limb ([`far-side-culls-everything.png`](../globe/far-side-culls-everything.png)).
That closes the question [#9](https://github.com/adrianpetersson/onward/issues/9) left open when it
chose MapLibre layers over a three.js beacon.

**The exaggerated Vehicle is fine.** [#20](https://github.com/adrianpetersson/onward/issues/20)
warned that a Vehicle held at a 40 px floor is 587 km of geometry on the trip view and had never been
drawn on a sphere, and expected it to spear off the limb. It does not, because
[#8](https://github.com/adrianpetersson/onward/issues/8)'s clearance rule hides every Vehicle whose
Path has no room for it — so at those cameras only the flights draw, and they read as clean planes
([`exaggerated-vehicle-on-a-sphere.png`](../globe/exaggerated-vehicle-on-a-sphere.png)). No ceiling
on the multiplier is needed.

## Why z4 → z7 rather than z11 → z12

Because a globe at city zoom is the wrong picture. The pitched map is the product — the map's own
ruling that "the pitched map ships before the globe" — and the globe's job is to be the establishing
shot for the whole Trip: the great circle over Beijing with a plane on it, which is the one thing a
flat map cannot give you. By z7 the camera frames a region, and from there down the world should
already be flat and tilted.

It also leaves ~10 zoom levels of margin under the ceiling, where z11 → z12 leaves four.

## Why the projection is on the style rather than a `setProjection` call

`map.setProjection()` throws `Style is not done loading.` if it is called before the map's `load`
event, so using it means a `load` handler and one frame of mercator before the globe appears. A
`projection` property on the style object is read as the style is built, and has neither problem.

## What this rules out

A **Path lifted into an arc over the globe** stays out. [#8](https://github.com/adrianpetersson/onward/issues/8)
named the globe as the one camera an arc might have paid on, and left the door open. The flat
great-circle Path reads correctly on the sphere, so the door closes: two rendering mechanisms for one
kind of line is a cost [ADR 0006](0006-a-path-is-a-line-layer-never-three-js.md) declined, and
nothing measured here reopens it.

## The cost

The band is two magic numbers whose upper bound is tied to a measurement in a different file, held
together by a test rather than by the type system. And the morph is only ever seen going _through_
z4–z7 — nobody has watched it at a wider or narrower width, so "4 → 7 is the right width" is a
judgement rather than a measurement.
