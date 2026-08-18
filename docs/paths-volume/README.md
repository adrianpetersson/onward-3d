# A Path with volume — six variants, and which channel pays

[#23](https://github.com/adrianpetersson/onward/issues/23). Six Path treatments on the real SEA
Itinerary, 1400 × 900 against `pnpm dev`, map only (the Itinerary panel is hidden, which is
[ADR 0011](../adr/0011-a-path-is-edged-in-one-dark-at-one-width.md)'s convention in `docs/casing/`).

Flip them by hand at `http://localhost:3000/?variant=<key>`, or with the arrow keys on the bar at the
bottom of the screen.

| key          | what it is                                                                 | what it spends                     |
| ------------ | -------------------------------------------------------------------------- | ---------------------------------- |
| `shipped`    | the control — 7 px casing, 4 px dashed Mode core                           | nothing                            |
| `wall`       | a third line pushed 3 px down-screen as a side wall                        | nothing                            |
| `green-bed`  | the bed and wall go green, the Mode keeps its own ink and dash             | nothing                            |
| `one-green`  | the ticket's own reading — six Modes to one green, dash left to carry them | **the colour channel**             |
| `green-ramp` | one hue family, every Mode its own green                                   | nothing                            |
| `extruded`   | `fill-extrusion` — a real prism with a lit top and a shaded side           | **the dash, the drape, and width** |

## The headline

**The ticket's premise is wrong, and that is the finding.** #23 says "going green spends the colour
channel. Six Modes to one ink." Green is not an ink, it is a **hue family**, and inside #11's own
matte register the family is wide enough to hold every Mode **better than the rainbow that ships
today**:

|                                      | shipped                         | `green-ramp`                    |
| ------------------------------------ | ------------------------------- | ------------------------------- |
| closest pair of Modes                | ΔE **12.5** (`ferry`/`boat`)    | ΔE **19.2** (`ferry`/`boat`)    |
| worst Mode against any ground        | ΔE **14.0** (`boat` over water) | ΔE **25.6** (`boat` over water) |
| worst Leg's median, app's load frame | ΔE **40.8**                     | ΔE **58.1**                     |
| unambiguous crossings, load frame    | **73/74**                       | **73/74**                       |

So there was never a third channel to find: **the colour channel was not full.** The shipped palette
spends its range on hue while colliding in lightness — teal `boat` against teal `ferry` — and a green
ramp separates on lightness and saturation instead, which is where the Diorama's pale sand-and-moss
grounds leave the most room. Seven greens inside the register are mutually ΔE ≥ 23 apart; the
hand-picked ramp trades some of that for coherence and still nearly doubles the shipped floor.

**And volume is free.** `line-translate` with `line-translate-anchor: 'viewport'` puts a third line
3 px down-screen as a side wall — no new source, no new geometry, ADR 0006 untouched, the dash intact,
the drape intact, width still screen-space. It also _improves_ ground separation: `boat`'s worst
median goes 40.8 → 52.6 on the wall alone.

## The sheets

The band is 7 px wide, so every sheet crops and magnifies. The window is chosen by finding the
densest patch of Path ink in the control frame and applying the same window to all six cells, so the
cells are the same piece of map.

| sheet                | what it answers                                        |
| -------------------- | ------------------------------------------------------ |
| `sheet-band.png`     | is there volume in the band, or is it just ink (9×)    |
| `sheet-islands.png`  | does it read as a **track** across the island chain    |
| `sheet-allmodes.png` | can you still tell seven Modes apart                   |
| `sheet-kradan.png`   | street zoom on terrain — where an extrusion should win |
| `sheet-load.png`     | the app's own opening frame, z5.63                     |

`sheet-allmodes.png` is the pair to look at for the colour question: in `one-green` the flight and the
van cross and **you cannot tell which is which**; in `green-ramp` they are chartreuse and dark olive
and stay separate. That is the whole argument in one picture.

## What the extrusion costs, measured rather than argued

Route 2 gives genuinely the best volume — `kradan-extruded.png` has a lit top face and a shaded side,
and it is the only variant that looks like an object rather than a bevel. It fails on five other
counts, every one of them measured:

1. **It has no dash**, and with one ink that leaves nothing to tell a boat from a ferry — the pairing
   #22 was filed on. `sheet-islands.png`, bottom right.
2. **It does not drape; it is buried.** At Koh Kradan the band cuts straight chords _through_ the
   island and disappears behind the hill — `kradan-extruded.png` against `kradan-shipped.png`. A
   `fill-extrusion` sits at absolute altitude, so on any ground above sea level the Path goes inside
   the terrain it is supposed to lie on.
3. **At pitch 0 there is no volume at all.** The app's own load frame is pitch 0 and ADR 0006
   established that the trip view is flat by design — so the one camera the Destination calls the
   hook is the one camera an extrusion's volume cannot reach.
4. **Width is geometry, so it is rebuilt on every zoom.** A line's width is one screen-space paint
   property that ADR 0011 measured as reading from the globe to street level. The extrusion's is baked
   into the polygon in metres, and holding a constant screen width across the real trip's **6,000×**
   span of metres-per-pixel means re-buffering every Path whenever the zoom moves. Built on `zoomend`
   it drew **14.09 px instead of 7** wherever the zoom changed without a redraw.
5. **Constant screen size demands a band kilometres tall, and it stops drawing at those heights.**
   Height is in metres too, so a band 7 px wide and squat is **6,556 m tall** at the load frame — and
   at that height only **33/74** crossings draw at all. Pinning the height smaller restores it:

   | band height at the load frame  | crossings that drew |
   | ------------------------------ | ------------------- |
   | 6,556 m (constant screen size) | **33/74**           |
   | 2,000 m                        | 73/74               |
   | 400 m                          | 68/74               |
   | 60 m                           | 59/74               |

   Width is 10.9 km in all four rows, so this isolates cleanly to **height alone**. The route works
   only at heights that are physical nonsense for a track, and breaks at the height its own
   constant-screen law demands. _(The threshold behaviour is measured; MapLibre's internal reason for
   dropping very tall extrusions was not chased.)_

## The three questions #23 asked out loud

**Does green survive #11's register?** Yes, with room, and this was the surprise. The Diorama's two
green grounds — `park #c6d6b0` and `landcover_wood #b7cba4` — are pale desaturated sage, so a matte
mid-green is far from both: every ink in the ramp clears ΔE 25 against **every** ground before the
casing is counted, and the dark green bed `#22402c` separates from water at **ΔE 52.5** where the
neutral `#2f4f4f` manages 43.4. The green bed is more visible than the one it replaces.

**What does a Leg with no Mode become?** `#6b7d68` — drained inside the family rather than a seventh
Mode, ΔE 30.1 from its worst ground and ≥ 19.2 from every other Mode. _Measured from the palette; the
crossing was not isolated in a picture._

**What happens where Paths overlap?** In `green-ramp` a crossing stays legible because the two Legs
are different greens (`sheet-allmodes.png`). In `one-green` and `extruded` it does not — the two bands
merge into one shape with no cue about which is on top.

## Reproducing it

```bash
pnpm dev
python3 scripts/paths/sweep-variants.prototype.py    # 42 frames, resumable
node scripts/paths/volume-sheet.prototype.mjs        # the five sheets
python3 scripts/paths/measure-variants.prototype.py  # on/off pairs + crossings
node scripts/paths/legibility-variants.prototype.mjs --detail
```

`legibility-variants.prototype.mjs` is #22's method with a **per-variant** ink table.
`scripts/paths/legibility.mjs` hardcodes the shipped palette, so pointed at a green variant it
classifies every Path pixel as ground and reports a perfectly visible Leg as absent — which it did,
before this existed. Run against `shipped` it reproduces ADR 0011's published **73/74** exactly, which
is what says the rest of the column is comparable.

## Traps found on the way

**MapLibre's zoom is defined on 512 px tiles, so the resolution formula everyone quotes is 2× too
large.** `156543.03392 * cos(lat) / 2 ** zoom` is the **256 px** figure; MapLibre needs
`2 ** (zoom + 1)`. A band asked to be 7 px measured **14.09 px** — close enough to look like a taste
problem rather than an arithmetic one, which is how it survived the first sweep. Anything converting a
screen width into metres hits this.

**`line-offset` is the wrong property for a side wall.** It offsets relative to the line's own
direction, so on a great circle the wall swaps sides as the bearing sweeps and a Path comes out lit
from the left at one end and the right at the other. `line-translate` with
`line-translate-anchor: 'viewport'` is the one that means "down the screen", which is what a single
light source means.

**A ribbon buffered wider than its Leg is long self-intersects.** At the load frame the band is 10.9 km
wide and Koh Kradan → Koh Mook is 7.9 km long. It did not turn out to be what made the Legs vanish
(height did), but it is waiting for anyone who takes the extrusion route further.
