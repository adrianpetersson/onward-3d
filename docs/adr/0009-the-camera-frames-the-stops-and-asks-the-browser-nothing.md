# 0009 — The camera frames the Stops, flat, and asks the browser nothing

**Status**: accepted, 17 Aug 2026
**Ticket**: [#24](https://github.com/adrianpetersson/onward/issues/24)

_Renumbered from 0008 to 0009 on 17 Aug 2026. [#21](https://github.com/adrianpetersson/onward/issues/21)'s [ADR 0008](0008-the-stay-marker-signals-a-booking-it-does-not-depict-one.md) was already on `main` when this landed, and ADRs sequence by landing order. The collision survived a rebase **onto** that very commit, because the two filenames differ and git therefore sees no conflict — `docs/adr` numbering has no guard from version control by construction, which is why `adr-numbering.test.ts` now asserts it._

## The decision

Where the camera stands is decided from the Trip alone, on a three-rung ladder: the **placed Stops**
if there are any, else a **placed Origin**, else the **globe** at z2 centred `[20, 20]`.

Three things about that are deliberate and none is obvious:

- **No geolocation.** Onward never calls `navigator.geolocation`, and asks the browser for no
  permission of any kind.
- **The Origin is outside the frame.** A framed Trip fits its Stops; the Legs to and from home run
  off the edges.
- **The frame is flat.** Pitch 0, bearing 0, in an app whose whole visual premise is a pitched 3D
  Diorama.

The load frame is built into the map's constructor. A save never re-frames; an adoption does.

## Why this needs recording

Each of the three reads as an oversight to anyone arriving later, and each will get "fixed" by
someone acting in good faith.

**Geolocation is the obvious feature and the ticket asked for it by name.** #24's own proposal was
"on first open, ask for the browser's location and frame the map there", and it listed the follow-on
questions — when the prompt fires, what happens on deny, whether it persists — as mandatory. They are
not answered anywhere, because the feature is not there.

**A flat overview looks like the pitch was forgotten**, in a codebase where `INITIAL_VIEW` had been
pitched 60 since the scaffold.

**Framing "the Itinerary" without the Origin looks like a bug**, especially since `CONTEXT.md`
defines an Itinerary as the Stops _together with_ the Legs from the Origin out and back.

## Why no geolocation

**The ticket counted two empty states. There are three**, and the middle one dissolves the case.

1. **Stops placed** — frame them. Arithmetic, no permission.
2. **An Origin placed, no Stops** — frame the Origin. Also no permission, and the Origin is the
   traveller's own home _as he typed it_, which beats any fix the browser can derive.
3. **Neither** — the only state geolocation ever addressed.

State 3 is roughly the first thirty seconds of a single-user desktop app's life. And
[ADR 0007](0007-the-globe-hands-over-before-it-runs-out.md) had already shipped a better answer to it
than a street-level view of the traveller's own roof: a globe, which is the one place he is
definitively not planning to go. The globe costs no permission, has no denial path and no `http://`
caveat, works offline, and leaves nothing to persist.

What it buys beyond the frame itself is that **Onward remains a bundle that asks the browser for
nothing** — the same line the keyless tile stack, the absent API key and the zero-server-surface
rulings all hold. A permission dialog would have been the first.

The cost, recorded honestly: a first-time visitor sees a globe rather than somewhere they recognise.

## Why pitch 0 — this one is measured, not chosen

**MapLibre's fit cannot see pitch.** `cameraForBoxAndBearing` projects the bounds' four corners into
world coordinates, rotates them by **bearing**, and fits the axis-aligned box. Pitch is never read,
and the `CenterZoomBearing` it returns has no pitch field at all.

So `fitBounds(bounds, { pitch: 45 })` does not fit a pitched frame — it computes the zoom as though
the camera were flat and _then_ tilts it. A tilted camera sees a trapezoid, narrower at the far edge,
so the top of the intended bounds falls outside the viewport.

A pitched overview is therefore available only by paying for it: over-padding vertically to swallow
the trapezoid, or fitting flat and zooming out by a correction constant. Both are a hand-tuned number
that no test can derive and that goes wrong the moment the viewport aspect changes. The oblique is
not lost — it arrives the moment the traveller flies down to a Stop, which is the zoom range the
Diorama was built to read at.

**Anyone reintroducing pitch here must bring the correction with it.** Setting `pitch` on the fit and
seeing "it looks fine" is the failure mode: it under-fits by an amount that depends on the bounds, so
it looks fine on the trip it was tried against.

## Why the Origin is outside the frame

Measured against the real SEA Itinerary at 1400 × 900:

| Frame                | Zoom     | What you see                                                       |
| -------------------- | -------- | ------------------------------------------------------------------ |
| Stops **and** Origin | ~3.5     | A globe, Copenhagen to Kuala Lumpur, two airliners and little else |
| Stops only           | **5.63** | Eight Pins, nine Legs, the Paths, two Vehicles                     |

The first is a better establishing shot and the second is the view actually opened dozens of times
over the months before the flight. Load gets the working view.

This is a **naming** decision as much as a camera one: because `CONTEXT.md` makes the Origin part of
the Itinerary by definition, the function is called `framingFor` and the ticket's language of
"framing the Itinerary" was deliberately dropped. Framing the Stops and calling it the Itinerary
would have quietly contradicted the glossary.

## Consequences

**The app's default view is 46 % globe.** z5.63 sits inside
[ADR 0007](0007-the-globe-hands-over-before-it-runs-out.md)'s 4 → 7 morph band —
`transitionState` measured at **0.456** — and it renders correctly. ADR 0007 recorded that the band's
width was a judgement seen only at its two ends; the opening camera now exercises its middle on every
load. It also means **the band is no longer free to move**: widening it upward would change the
picture Onward opens on.

**`Footprint` has its first consumer**, which is what `CONTEXT.md` always said it was for. Nothing
depends on having one — a Stop placed by paste or click contributes its point, and a lone unsized
Stop falls back to z12 rather than fitting a zero-size box to street level.

**A save must never re-frame.** Flying down to a Stay Marker, correcting a date and saving cannot
yank the camera back out. Re-framing is keyed on the store's `generation`, which bumps only when the
Itinerary is replaced from outside the sidebar — otherwise relinking a file on a machine with no
cache would leave the globe on screen with a full Itinerary loaded underneath it.

**Two known gaps.** A _point_ framing does not clear the Itinerary panel, because `CameraOptions`
carries no `padding` in 6.3.0 and only `fitBounds` accepts one — immaterial above ~840 px wide. And
a Trip crossing the antimeridian frames the long way round, since the edges are min/maxed in raw
longitude; the real trip never approaches it.
