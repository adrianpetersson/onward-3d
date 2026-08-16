# The real SEA itinerary, entered through the sidebar

The destination gate ([#15](https://github.com/adrianpetersson/onward/issues/15)). Adrian's real trip
— 13 Dec 2026 → 6 Jan 2027, `~/Documents/sea-xmas/itinerary-clean.md` — typed into Onward through the
sidebar, nothing seeded in code, then looked at.

`sea-xmas-2026.json` is the envelope the sidebar produced, captured verbatim after Save. It is the
artefact, not an input: every value in it arrived through a field.

## What the trip actually is

The ticket said "nine Stops, ten Legs across six Modes". Entering it corrects all three counts:

|       | Ticket said | Really                                                                                                            |
| ----- | ----------- | ----------------------------------------------------------------------------------------------------------------- |
| Stops | nine        | **eight** — Copenhagen is the Origin, and an Origin is never a Stop                                               |
| Legs  | ten         | **nine** — eight inbound plus the Leg home; the sleeper-plus-van is _one_ Leg with two Modes, which is the ruling |
| Modes | six         | **five** — `flight`, `train`, `boat`, `ferry`, `van`. Nothing on this trip is a `bus`                             |

## What held

- **23 nights.** The header derives the trip's own figure while its Stops sum to 22. The missing night
  is the sleeper's and belongs to a Leg — [#10](https://github.com/adrianpetersson/onward/issues/10)'s
  ruling, confirmed against the real thing rather than a fixture.
- **13 Dec – 6 Jan.** `tripStart` winds back over the outbound's `+1 day`, so the span reads from the
  evening he leaves Copenhagen and not from the morning he lands in Bangkok.
- **Search found all eight Stops**, and [#18](https://github.com/adrianpetersson/onward/issues/18)'s
  two hard cases came out right on the real names: `Koh Kradan` → `Ko Kradan` (the dual-spelling merge;
  the `Koh` spelling alone returns nothing), and `Koh Lipe` → the island ranked first with the Liberian
  hamlets below it. `Ao Nang` kept its own spelling while taking `Ban Ao Nang`'s coordinate. Bangkok
  and Copenhagen now rank **first**, where #18 measured them 4th and 2nd before `lang=en`.
- **The Ao Niang paste placed the bed, not the camera.** The real URL carries `@13.7563309,100.5017651`
  — Bangkok — and `!3d7.3031889!4d99.2552559`. It landed on Koh Kradan.
  [#13](https://github.com/adrianpetersson/onward/issues/13)'s rule, on the live field.
- **Street zoom on Koh Kradan** (`kradan-z182.png`): the Stay Marker stands under its Pin, at true
  metres, among the OSM bungalows on the same beach — [#20](https://github.com/adrianpetersson/onward/issues/20)
  and [#9](https://github.com/adrianpetersson/onward/issues/9) exactly as written. At z17.0 it is still
  below the 15 px threshold and only the Pin draws; it arrives by z18.2.
- **The sea border** (`sea-border-lipe-langkawi.png`): a dashed ferry Path with its Vehicle at the
  midpoint, pointing the way it goes. Nothing about the crossing reads broken.
- **The globe** (`world-z24.png`): two long-hauls, two airliners, and no other Vehicle —
  [#8](https://github.com/adrianpetersson/onward/issues/8)'s clearance rule doing what it said it would.
- **The deployed build** (`deployed-*.png`) renders the same trip identically, and `window.__diorama`
  is `undefined` there — the dev-only handle really is dev-only.
- **Graceful degradation.** With no file picker available the save fell to `cache-only` and said so:
  "this trip is only in this browser — choose a file… to keep it on disk". The trip survived a reload.

## What did not

Three tickets came out of this, all filed rather than patched:

1. **A Leg's Via cannot be entered at all.** `Leg.via` is in the model, `path.ts` bends a Path through
   it, and there is a test using Beijing — but no field exists. So both long-hauls draw as direct
   great circles: Copenhagen → Bangkok flies over Kazakhstan instead of up to Beijing and back down,
   and the way home skips Dubai. The same gap is why the sleeper train's Vehicle floats in the Gulf of
   Thailand (`region-z62.png`) — a Via on the peninsula is what would put it back on land.
2. **The Leg home shows the outbound Leg's data, and the first edit throws it away.** The card renders
   `draft.returnLeg ?? {...stops[0].inbound}`, so before it is touched it claims 18:00, Air China,
   Copenhagen T3 and the Beijing note. The reducer builds from `newLeg()`, so one click on a Mode
   blanks all six fields.
3. **Nothing stands at the Origin** (`origin-copenhagen-unmarked.png`). Both long-hauls converge on a
   bare point; the only word there is OSM's own "Copenhagen", which would be on the map anyway.

Also observed, and left where they were already recorded:

- **A Stop cannot be deleted.** `remove-stop` is in the reducer and tested; nothing in the UI dispatches
  it. Noted on [#19](https://github.com/adrianpetersson/onward/issues/19), which owns what a delete
  should take with it.
- **`Ban Ko Li Pe` and `Koh Lipe` both draw**, one above the other — #9's known residual, confirmed.
- **`Booking.detail` really does absorb columns.** The Air China booking put four facts in it: two seat
  numbers, an e-ticket number and a confirmation code. It displays fine; the fear
  [#10](https://github.com/adrianpetersson/onward/issues/10) recorded was well founded.
- **`train_intercity_*` ships and is never drawn.** `VEHICLE_FOR.train` is always
  `train_sleeper_nose`, so the daytime ETS to Kuala Lumpur is depicted by a sleeper. Three GLBs in the
  bundle are unreachable.

## Reproducing it

The screenshots were taken against `pnpm dev` at 1600×1000 in Chromium, driving the sidebar's own
handlers. The deployed check moved this envelope into `onward-tan.vercel.app`'s `localStorage` and
reloaded — the data still came from the sidebar, only the origin changed, which is what opening the
File on another machine would do.
