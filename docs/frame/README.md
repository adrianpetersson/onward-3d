# Where the camera stands — [#24](https://github.com/adrianpetersson/onward/issues/24)

Evidence for the framing decision. Both taken at 1400 × 900 against the dev server.

## `empty-state-globe.png`

A brand-new Onward with nothing in `localStorage`: no Trip, no Origin, no Stops. The camera opens
on the globe at **z2, centred `[20, 20]`**, flat and north-up.

The ticket proposed asking the browser for the traveller's location here. It was cut — there are
three empty states rather than two, and the middle one (an Origin typed but no Stops) already knows
where home is. What is left for geolocation is this frame, and #14's globe answers it without a
permission dialog, a denial path, or a preference to persist.

`[20, 20]` rather than `[0, 0]`: Null Island is open ocean **and** this app's own not-yet-placed
sentinel, which #8 already shipped a visible bug from.

## `real-trip-framed.png`

The real SEA Itinerary (#15) on load. All eight Stops framed with their Pins, every Leg drawn, and
both long-hauls running off the top-left — the Origin is deliberately **outside** the box, so the
frame is the working view rather than an establishing shot of an empty globe.

Two things worth reading off it:

- **The trip clears the Itinerary panel.** The fit pads left by the panel's 400 px plus air, which
  is why the camera centre (97.43°E) sits west of the trip's own centre (~100.25°E).
- **The default view is 46 % globe.** It lands at **z5.63**, inside #14's 4 → 7 morph band, with
  `transitionState` measured at **0.456** — and it renders correctly. #14 shipped the band having
  only seen it at its two ends; the app's opening camera now sits in the middle of it on every load.
