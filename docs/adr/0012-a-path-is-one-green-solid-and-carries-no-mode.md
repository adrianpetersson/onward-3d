# 0012 — A Path is one green, solid, and carries no Mode

**Status**: accepted, 18 Aug 2026
**Ticket**: [#23](https://github.com/adrianpetersson/onward/issues/23)

## The decision

Every Path is drawn **three times** — a side wall pushed 3 px down-screen, a bed, and a solid core —
all three in green, all three from one source, all three still `line` layers.

```
PATH_INK          #3f8a59   the lit top face, 4 px, solid
PATH_CASING_INK   #22402c   the bed, 7 px
PATH_WALL_INK     #13251a   the side wall, 7 px, line-translate [0, 3] anchored to the viewport
PATH_UNKNOWN_INK  #6b7d68   a Leg that has a Mode and has not been told which
```

Three rulings inside that, and the first is the one that matters:

1. **The Path carries no Mode.** `MODE_STYLE` is deleted. Both of
   [#8](https://github.com/adrianpetersson/onward/issues/8)'s channels — colour and dash — are spent,
   and a Leg no longer says how it is travelled. The Mode lives on the **Vehicle** standing on the
   Path, and in the sidebar.
2. **One distinction survives**: a Leg with **no** Mode is drained rather than absent. `unknown` is not
   a Mode, so this is not per-Mode colour returning.
3. **Volume is three tones of one colour, not geometry.** No `fill-extrusion`, no three.js —
   [ADR 0006](0006-a-path-is-a-line-layer-never-three-js.md) stands.

## Why this needs recording

Because it **reverses** the two decisions directly upstream of it, and both were recorded with
measurements. #8 established that "a Mode is identifiable without a legend by colour and dash
together", and that both are load-bearing at different zooms.
[ADR 0011](0011-a-path-is-edged-in-one-dark-at-one-width.md) then went out of its way to leave the
palette untouched — "`MODE_STYLE` is exactly where #8 left it… #23 is owed the colour channel whole."

#23 was commissioned to find a **third** channel so that the band could go green and gain volume
without giving up the Mode. It found one. It was then not used.

## What the prototype found, and what was done with it

The prototype is `prototype/23-path-volume`, six variants on `?variant=`, with the sheets and every
number in [`docs/paths-volume/`](../paths-volume/README.md).

**The ticket's premise was wrong.** "Going green spends the colour channel — six Modes to one ink"
assumes green is an ink. It is a hue family, and inside [#11](https://github.com/adrianpetersson/onward/issues/11)'s
matte register the family holds all seven Modes with a closest pair of **ΔE 19.2**, against the shipped
rainbow's **12.5**. The colour channel was never full: the shipped palette spent its range on hue
while colliding in lightness (teal `boat` against teal `ferry`), and a green ramp separates on
lightness and saturation, which is where the Diorama's pale sand-and-moss grounds leave the most room.

So `green-ramp` — green band, volume, **and** every Mode still its own — was the recommendation, and it
was **declined on taste**. Adrian, from the sheets: _"the dashes are ugly i want it all green in one
color."_ That is a judgement about the picture, which is the one thing a prototype exists to collect,
and it is why this ADR records a loss rather than a free win.

## What it costs

**At region and trip zoom, nothing on the map says which Leg is which.** #8's whole argument for two
channels was that colour separates a ferry from a boat when the island chain is 200 px of coast, and
[ADR 0011](0011-a-path-is-edged-in-one-dark-at-one-width.md) measured exactly that pairing as the
weakest on the map. The real trip has three `boat` Legs and one `ferry`, and they are now one object.

The Vehicle does not cover it. #8 hides a Vehicle whose Path has no room for it, so the Vehicles are
gone below about z6.7 — and [#24](https://github.com/adrianpetersson/onward/issues/24) made the app
**open** at z5.63. The camera Onward chooses for itself is below the threshold, so the first picture a
traveller sees is the one with no Mode information on it at all.

That is accepted, not overlooked. Whether the Leg card's own list is enough is a real question and it
belongs to whoever next looks at the sidebar beside the map.

**The bed is no longer `PIN_RESOLVED_INK`.** #22 made the Path's edge and the Pin's dark the same ink
so that "a Stop's marker and the Legs running into it are edged with the same dark", and pinned them
equal in a test. The ruling was about the Path, so the Pin was left alone: they are now ΔE 15.1 apart.
The test asserts the inequality _and_ the closeness, so drifting further apart fails. Whether the Pin
should follow the Path into green is unowned.

## What it buys, beyond taste

**It retires #22's hardest case instead of covering it.** Dash length is a multiple of line width, so
Koh Kradan → Koh Mook — **5.1 px long** at the opening camera — carried **0.6 of one dash cycle**, and
whether it drew at all was a matter of phase. ADR 0011's solid casing existed largely to fill those
gaps. With a solid core the gaps do not exist: the Leg is 5.1 px of ink unconditionally.

**The green is more visible than the palette it replaces**, which was the surprise. Measured against
the Diorama's own fills, read out of `onward-positron.json` rather than copied:

|                                      | shipped (#8 + ADR 0011)         | this        |
| ------------------------------------ | ------------------------------- | ----------- |
| worst ink against any ground, alone  | ΔE **14.0** (`boat` over water) | ΔE **34.8** |
| worst ink against any ground, banded | ΔE **43.4**                     | ΔE **52.5** |
| unambiguous crossings, load frame    | **73/74**                       | **73/74**   |
| worst Leg's median, load frame       | ΔE **40.8**                     | ΔE **58.1** |
| unambiguous crossings, island chain  | **19/19**                       | **19/19**   |

**Green survives #11's register with room**, which #23 asked out loud and expected to be a problem: "a
green Path sits on top of moss terrain rather than against it." It does not. The Diorama's two green
grounds — `park #c6d6b0` and `landcover_wood #b7cba4` — are pale desaturated sage, so a matte
mid-green is ΔE 34.8 and 40.5 from them. A test asserts this against the style's own fills.

## Why the volume is a translated line and not an extrusion

`fill-extrusion` gives genuinely the better picture — a real lit top face and a real shaded side,
visible at Koh Kradan in `docs/paths-volume/kradan-extruded.png`. It was built and measured and lost on
five counts:

1. **No dash exists on it** at all (`fill-extrusion` has no `dasharray`), so it cannot even be the
   fallback if the Mode ever has to come back to the Path.
2. **It does not drape — it is buried.** An extrusion sits at absolute altitude, so on any ground above
   sea level the Path goes _inside_ the terrain it is supposed to lie on. At Kradan the band cuts
   straight chords through the island and vanishes behind the hill.
3. **At pitch 0 it has no volume at all**, and ADR 0006 established that the trip view is flat by
   design. The one camera the Destination calls the hook is the one an extrusion cannot reach.
4. **Width becomes geometry.** A line's width is one screen-space number that ADR 0011 measured as
   reading from the globe to street level. An extrusion's is baked into the polygon in metres, so
   holding a constant screen width across the real trip's **6,000×** span of metres-per-pixel means
   re-buffering every Path on every zoom change.
5. **Constant screen size demands a band kilometres tall, and it stops drawing there.** Height is in
   metres too: 7 px wide and squat is **6,556 m tall** at the load frame, and at that height only
   **33/74** crossings drew. Width was 10.9 km in every row below, so this isolates to height alone.

   | band height at the load frame  | crossings that drew |
   | ------------------------------ | ------------------- |
   | 6,556 m (constant screen size) | **33/74**           |
   | 2,000 m                        | 73/74               |
   | 400 m                          | 68/74               |
   | 60 m                           | 59/74               |

   _(The threshold is measured; MapLibre's internal reason for dropping very tall extrusions was not
   chased.)_

By contrast the wall costs a third draw of one geometry — no second source, no copy of the vertices,
no three.js pass — and it _improves_ ground separation on its own (`boat`'s worst median 40.8 → 52.2).

## Traps recorded on the way

**`line-offset` is the wrong property for a side wall.** It offsets relative to the line's own
direction, so on a great circle the wall swaps sides as the bearing sweeps and one Path is lit from the
left at one end and the right at the other. `line-translate` with `line-translate-anchor: 'viewport'`
is the one that means "down the screen", which is what a single light source means. A test pins the
anchor.

**MapLibre's zoom is defined on 512 px tiles, so the resolution formula everyone quotes is 2× too
large.** `156543.03392 * cos(lat) / 2 ** zoom` is the **256 px** figure; MapLibre needs
`2 ** (zoom + 1)`. A band asked to be 7 px measured **14.09 px** — close enough to look like a taste
problem rather than an arithmetic one, which is how it survived a whole sweep. Anything converting a
screen width into metres hits this.

**A ribbon buffered wider than its Leg is long self-intersects.** At the load frame the extruded band
was 10.9 km wide and Koh Kradan → Koh Mook is 7.9 km long. It was not what made the Legs vanish, but it
waits for anyone taking the extrusion route further.

**`setPaintProperty('line-dasharray', …)` on a layer created without one throws inside MapLibre's
render loop**, every frame, several stack frames from the call site — ADR 0011's trap, and newly
relevant: the core now ships _without_ a dash, so putting one back means removing and re-adding the
layer rather than setting a property.
