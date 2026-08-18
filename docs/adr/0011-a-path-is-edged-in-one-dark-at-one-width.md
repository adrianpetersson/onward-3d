# 0011 — A Path is edged in one dark, at one width

**Status**: accepted, 17 Aug 2026
**Ticket**: [#22](https://github.com/adrianpetersson/onward/issues/22)

## The decision

Every Path is drawn twice: a solid **casing** in one neutral dark, and the Mode's own dashed **core**
over it. Two rulings inside that, and both are the un-obvious branch:

1. **The casing carries no hue.** One ink, `#2f4f4f`, for every Mode — not a darker shade of each
   Mode's own ink.
2. **There is one width, at every zoom.** `PATH_CASING_PX` 7 over `PATH_WIDTH_PX` 4, flat from the
   globe to street level. No `interpolate` on zoom.

And one non-decision worth recording as such: **no ink changed.** `MODE_STYLE` is exactly where
[#8](https://github.com/adrianpetersson/onward/issues/8) left it.

## Why this needs recording

Both rulings read as oversights, and both would be helpfully repaired by the next person to open the
file. A per-Mode casing is what every road style in the world does. A zoom ramp is what
`line-width` is usually for, and the ticket that commissioned this work asked for one in as many
words: "width is screen-space, so it is one number per zoom rather than one number."

## What was measured

The instrument is `scripts/paths/`: two screenshots of one camera, with the Path layers drawn and
hidden, compared per pixel in CIE L\*a\*b\*. Numbers below are ΔE76 — perceptual distance, not a
luminance ratio. WCAG contrast is the wrong instrument here and says so out loud: it scores coral
`flight` on teal sea at **1.69**, which is a picture nobody has ever failed to see, because the whole
difference is hue.

### The complaint was one fault and turned out to be three

Three of the real trip's nine Legs are `boat`, and `boat` ink on water is **ΔE 14.0** — against
`ferry`'s 24.9 over the same water, and 46.9 for the next weakest pairing anywhere on the map. Teal
on teal. **No width fixes that**, which is the first thing that had to be established, because the
ticket is titled "three pixels is not the hook".

Second: at the app's own opening camera the nine Legs span **5.1 px to 2,406 px** — 470× in one
frame. Dash length is a multiple of line width, so Koh Kradan → Koh Mook draws **0.6 of one dash
cycle**, and whether it appeared at all was a matter of phase. Widening the line makes that _worse_:
at 8 px it would be 0.2 of a cycle.

Third, and the one that resolves the other two: a cased Path is **two inks on screen**, and it
separates from the ground if **either** of them does. The weakest pairing on the whole map goes from
**ΔE 14.0 to 43.4** with no ink touched.

### Why the casing carries no hue

A per-Mode casing — each ink mixed 55 % toward the Diorama's darkest — was built first, and lost on
both counts it was supposed to win:

|                             | per-Mode casing | one neutral dark |
| --------------------------- | --------------: | ---------------: |
| weakest band against ground |     ΔE **34.4** |      ΔE **43.4** |
| closest pair of Modes       |      ΔE **6.1** |      ΔE **12.5** |

Darkening compresses the palette toward the shade, so `boat` and `ferry` — already the closest pair,
and the very pair #8 said colour has to separate at region zoom — halve their distance. The neutral
is both more visible **and** free: it leaves every Mode's ink where it was, which is the colour
channel [#23](https://github.com/adrianpetersson/onward/issues/23) is owed intact.

`#2f4f4f` is `PIN_RESOLVED_INK`, so a Stop's marker and the Legs running into it are edged with the
same dark. A test pins the two equal rather than a comment claiming it.

### Why the casing is solid, not an outline

A dashed casing scaled to stay in phase with the core is the other obvious shape, and it was built.
It fails on the real trip's dash scale: each dash is ~6 px long at this width, so a 1.5 px border on
every side of one is most of the mark, and the band comes out **a row of dark dots** with the Mode's
ink squeezed out of the middle.

Solid, the casing fills the dash gaps instead — which is what pays for the 5.1 px Leg above. Cased,
it is 5.1 px of solid ink whatever the dash does.

The cost is real and is the reason this ADR exists rather than a comment: **the casing is what you
see in the gaps**, so roughly half the band's length is casing ink. That is precisely why it must not
carry hue.

### Why one width

7/4 was rendered at **z2.4 on the globe, z5.6 (the app's own load frame), z8.6 over the island chain,
and z14.6 and z18.2 on Koh Kradan**, and reads at all five. A line competes with other _screen_
marks, and the Diorama's mark density barely moves with zoom: [#11](https://github.com/adrianpetersson/onward/issues/11)
stripped every road, railway and aeroway, so above the coastline a Path is very nearly the only line
on the map, and symbol collision thins the labels to whatever fits. An interpolation would have been
three more numbers buying nothing.

### The result, per Leg

74 crossings sampled along the nine Legs at the opening camera, each classified by nearest ink so one
emphatic Leg cannot vouch for its neighbours:

|        | crossings unambiguous (ΔE ≥ 25) |
| ------ | ------------------------------- |
| before | **59 / 74**                     |
| after  | **73 / 74**                     |

Koh Kradan → Koh Mook went **0/3 → 3/3** (median ΔE 19.5 → 42.9) and Koh Mook → Koh Lipe **0/4 → 4/4**
(19.0 → 44.3). Nothing that already read stopped reading. The one crossing still under the floor is a
point where the train passes beneath a place label.

## What this is not

**Not the chunky green band the Destination is after.** This is the width at which a Leg stops being
missable, not the width at which a Path becomes an object lying on the terrain. Volume, and whether
six inks collapse to one, are #23's, and this ADR is written to leave both available: the colour
channel is untouched, and the casing here is **centred**, where #23's cheapest route to volume is the
same line **offset down-screen** to read as a side wall.

## Traps recorded on the way

**`setPaintProperty('line-dasharray', …)` on a layer created without one throws inside MapLibre's
render loop, not at the call site.** The stack is in `setUniforms`, several frames from anything you
wrote, and the map keeps throwing every frame. A cross-faded property has to be present in the
layer's paint when it is added; changing a dash later means removing and re-adding the layer.

**`map.project()` and a draped line disagree by a few pixels over hilly ground.** A line layer is
draped onto the terrain and a projected point is not, and the offset is not along the line's normal.
Any measurement that walks out from a projected vertex has to search a box, or it will report a
visible Leg as absent — which it did, for the train, twice.

**With terrain on, the zoom you asked `jumpTo` for is not the zoom you get.** A pitched jump to z18.2
settled at z16.94: MapLibre keeps the camera's altitude and recomputes zoom once the elevation under
the centre arrives. Evidence has to record the zoom it ended at, not the one it requested.
