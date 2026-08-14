# A Vehicle is exaggerated, a Stay Marker never is

Models are authored at true metres and the model matrix maps one unit to one metre, which makes an
8.9 m guesthouse 1.5 px tall at z14 and 0.006 px over Thailand. Something has to intervene, and the
obvious move is one multiplier for everything, sized to keep whatever is on screen legible. **We do not
do that.** The two roles get different laws:

- a **Vehicle** is held at a floor of **40 px** — `max(1, 40 ÷ what this zoom covers)` — because it is a
  symbol of a Mode rather than a claim about a machine;
- a **Stay Marker** is drawn at **true metres and nothing else**, and is **not drawn at all** until its
  own size covers **15 px**, which for today's guesthouse is **z17**. Below that a Pin holds the Stop
  ([#9](https://github.com/adrianpetersson/onward/issues/9)).

The law lives in [`src/map/model-scale.ts`](../../src/map/model-scale.ts) and is injected into the model
layer once, so that [#8](https://github.com/adrianpetersson/onward/issues/8) and
[#9](https://github.com/adrianpetersson/onward/issues/9) add anchors rather than multipliers.

The reason for the split is measured, not aesthetic
([#20](https://github.com/adrianpetersson/onward/issues/20)). Holding a Stay Marker at ~48 px means
inflating that guesthouse to **396 m at island zoom, 77 km over Thailand and 705 km on the whole-trip
view**, and nine of them do not read as nine Stops — they occlude each other and the coast they stand
on, and the map underneath disappears. The identical multiplier on Vehicles reads perfectly at the same
cameras: a plane at 40 px is a plane. That asymmetry is the whole decision, and
[`docs/scale/one-law-or-a-law-per-role.png`](../scale/one-law-or-a-law-per-role.png) is the pair of
screenshots it came from.

Two whole families were rejected on the way, both on numbers:

- **Constant apparent size** — the model behaving exactly like a map pin — never arrives anywhere. At z20
  it has to _shrink_ the guesthouse to 5.5 m to hold its target, leaving the Stay smaller than the real
  bungalows either side of it. MapLibre draws OSM's extrusions at true metres and we get no vote, so they
  are the ruler: [`docs/scale/constant-size-never-arrives.png`](../scale/constant-size-never-arrives.png).
- **A fixed exaggeration per role** cannot exist. Onward spans z1–z20, a factor of ~500,000 in metres per
  pixel. The constant that makes a Stay Marker legible on the trip view is a 444 m tower on the beach at
  street zoom; the one that behaves at street zoom is 0.3 px on the trip view.

## Consequences

- **The threshold is a pixel count, not a zoom level**, and that is what makes it survive a change of
  model. The judgement is "is this big enough to be a building yet", so 15 px is the constant and z17 is
  merely what it works out to for an 8.9 m guesthouse. A 40 m highrise crosses the same threshold at
  **z15** — two levels earlier, with nothing edited
  ([#21](https://github.com/adrianpetersson/onward/issues/21)).
- **A Stop with a booked Stay shows nothing of its own below z17 until
  [#9](https://github.com/adrianpetersson/onward/issues/9) lands.** The tracer on `main` disappears when
  you zoom out past the handover, and that is the law working. It does mean #9 owns a question it did not
  have before: below the handover, booked and unbooked Stops both fall back to whatever marks a Stop, so
  the _Pulse_ has to carry the distinction the building was carrying.
- **A Vehicle's multiplier is computed from zoom and latitude, not from where it lands on screen.** One
  number therefore serves every anchor at a latitude, and near models stay bigger than far ones — the
  perspective the pitched camera exists for survives. Measuring per anchor instead was built and
  rejected: it makes every marker the same size regardless of distance, and it scales anything merely
  _in front of_ the camera rather than actually worth drawing (a Stop 60 km up the coast came out a
  5.5 km building, Bangkok an 84 km one). `ScaleContext` is kept down to the zoom so that law is hard to
  write by accident.
- **Vehicle geometry gets absurd in metres and it does not matter.** The floor makes the airliner 63 km
  across at region zoom and 587 km on the trip view, and it renders cleanly at both — no clipping, no
  depth artefacts, ~0.13 ms per anchor as
  [#7](https://github.com/adrianpetersson/onward/issues/7) measured. **Untested under globe projection**
  ([#14](https://github.com/adrianpetersson/onward/issues/14)), where a 587 km object standing on the
  surface may well show at the limb.
- **A Vehicle's shadow catcher scales with it**, since the multiplier is uniform on the whole anchor. At
  region zoom that is a flat disc kilometres wide over water, which nothing has looked at yet;
  [#8](https://github.com/adrianpetersson/onward/issues/8) owns whether a Vehicle casts a shadow at all.
- **The law reads one number per model** — the largest of `sizeM`, on the axis it lies on — so the
  airliner is judged on its 60 m wingspan and the guesthouse on its 8.9 m length rather than its 8 m
  ridge. `readSpanOf` derives it from the table [#17](https://github.com/adrianpetersson/onward/issues/17)
  measured; nothing reads a bounding box at runtime.
- **`k = 0` means "do not draw"**, and the layer skips the pass entirely rather than drawing at zero size,
  so Stops out of range cost nothing at trip zoom.
