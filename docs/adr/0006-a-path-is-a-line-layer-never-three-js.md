# 0006 — A Path is a MapLibre line layer, never three.js

**Status**: accepted, 14 Aug 2026
**Ticket**: [#8](https://github.com/adrianpetersson/onward/issues/8)

## The decision

Every Path is a MapLibre `line` layer, densified along the **great circle** and draped on the
terrain. No Path is ever three.js geometry, and **no Path is lifted into the air** — not even a
flight. A Mode is carried by the line's **colour and dash**, and by the Vehicle standing on it.

## Why this needs recording

Because it is the un-obvious answer in an app whose whole premise is a 3D map, and the obvious one
is written into the ticket that asked the question: "a flight from Copenhagen to Bangkok wants to
bow upward; a ferry from Koh Lipe to Langkawi wants to hug the sea." Anyone arriving later will have
the same instinct, and the reason it was not taken is a measurement rather than a preference.

## What was measured

Three variants were built on the real SEA trip and looked at across the camera ladder
(`docs/paths/variants-contact-sheet.png`).

**An arc buys no bow at pitch 0, and pitch 0 is where a long-haul is looked at.** The trip view is
the only camera that frames Copenhagen to Bangkok, and it is flat by design.

Looking straight down, a lifted Path keeps both ends pinned to the ground and produces no arc at
all — it only slides its middle **~25 px radially away from the centre of the screen**, which is the
perspective divide and not a bow (`docs/paths/a-trip-surface.png` against
`docs/paths/c-trip-arced.png`; measured at 23–26 px across the clean span of the curve, and matching
what MapLibre's own camera predicts for an 864 km apex at that eccentricity). The curve you can
actually see on that camera is the **great circle**, and it is present in both. So the lift returns
nothing and costs positional truth: it puts the line somewhere the Leg is not.

_(864 km rather than the 1,030 km an earlier draft of this ADR claimed. The dome is per sub-segment,
so the highest point drawn is 12% of the 7,202 km Copenhagen → Beijing hop; 1,030 km is 12% of the
direct great circle, which is not the Leg the screenshot shows.)_

So the arc is paid for at every camera and cashed at none. Cranking it to 30% of the Leg's length
makes it unmistakable on a pitched camera (`docs/paths/b-arc-30-percent.png`) — and lifts a ferry
tens of kilometres off the sea, which is the one thing the glossary says a ferry does not do.

**Three things come free from a line layer, and none survives the move into the model layer:**

1. It **drapes onto the terrain**, so a Path follows a hillside instead of cutting through it.
2. A line's width is already **screen-space**, which is the only thing a line's width can sensibly
   be — and the one property [#20](https://github.com/adrianpetersson/onward/issues/20)'s size law
   deliberately says nothing about.
3. `line-dasharray` exists at all. In three.js the equivalent is a fat-line shader carrying dash
   distances in world units.

And the dash turns out to be what actually reads as "this one is a flight" at trip zoom, where the
Vehicle is far too small to identify and a coral dashed line over Siberia is instantly an aircraft.

## What it costs

**The globe ([#14](https://github.com/adrianpetersson/onward/issues/14)) is the one camera where an
arc would have paid** — a Path standing off the sphere at the limb, occluding correctly against it,
is a real picture and this decision gives it up. #14 is explicitly droppable and nothing may block
on it, so buying a second rendering mechanism for a view that may never ship was the worse trade. If
the globe ships and looks poor without it, this is the ADR to re-open.

**Nothing extra, as it turns out.** This ADR first claimed the dash cost seven layers — one source
and one layer per Mode — on the belief that `line-dasharray` could not be data-driven in MapLibre.
**That is false.** 6.3.0 declares it a `CrossFadedDataDrivenProperty`, and four Modes with four
different dashes and four different inks were rendered from a single layer to check. So there is one
source and one layer, both paint properties `match` on the Mode the feature carries, and the dash
costs nothing.

## What was learned on the way, and is easy to lose

**A Path is not an Anchor.** The model layer's matrix maps one unit to one metre _at the anchor's own
latitude_. A Path spanning Copenhagen to Bangkok covers 42° of latitude, so geometry built in a
single anchor's metre frame diverges by kilometres before it is halfway. Had the arc been kept, a
Path would have had to be drawn in MapLibre's own frame — `mainMatrix`, with vertices in mercator
`[0, 1]` plus metres under mercator and unit-sphere coordinates under globe — one pass per Path.

**MapLibre scales a custom layer's altitude by the map centre's latitude, not by the latitude of the
thing being drawn.** `mercator_transform.ts` builds the custom-layer matrix with a z scale of
`worldSize / pixelsPerMeter`, and `pixelsPerMeter` is `mercatorZfromAltitude(1, center.lat) *
worldSize`. `getMercatorModelMatrix` divides by the _anchor's_ circumference instead, so a drawn
altitude comes out multiplied by `cos(centreLat) / cos(ownLat)`.

This is **dormant and harmless today**, and it is worth being precise about why: every anchor in the
Diorama sits on the ground, where the altitude is tens of metres and the camera is centred on the
thing being looked at. [#7](https://github.com/adrianpetersson/onward/issues/7)'s 0.001 px agreement
was measured with the anchor at the centre, where the two conventions are identical by construction.
It stops being dormant the moment anything is lifted — which, with this ADR, nothing is. **Anyone
adding altitude to a model must fix this first.**

**Tessellating by distance turns a dome into a triangle.** One vertex per 40 km is right for a great
circle, where the chord between two vertices really is nearly the arc. It is wrong for anything
curved in the vertical: a 60 km hop is two segments, so a lifted Path rendered as a kink rather than
a bow — in exactly the picture where the bow was the thing being judged.
