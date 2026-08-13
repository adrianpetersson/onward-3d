# The Diorama's visual language — three registers

Evidence for [#11](https://github.com/adrianpetersson/onward/issues/11). Shot at 1440 × 900, dpr 1,
on the branch `prototype/11-diorama-visual-language`. **No register has been chosen yet** — these are
the artifact to react to, not the answer.

Run them with `pnpm dev` and `?variant=A|B|C`, or flip with the bar at the bottom of the screen
(← / → also work). No `variant` at all is today's unstyled fork, kept as the baseline.

| | A — Chart | B — Relief | C — Cutout |
| --- | --- | --- | --- |
| island z13.8 | [flat](./a-chart-island.png) | [shaded](./b-relief-island.png) | [flat, weak coast](./c-cutout-island.png) |
| approach z16.2 | [a-chart-approach](./a-chart-approach.png) | [b-relief-approach](./b-relief-approach.png) | [c-cutout-approach](./c-cutout-approach.png) |
| hut z18.9 | [a-chart-hut](./a-chart-hut.png) | [b-relief-hut](./b-relief-hut.png) | [c-cutout-hut](./c-cutout-hut.png) |

## Findings that hold whichever register wins

- **[A symbol label does draw over a custom 3D layer](./labels-composite-over-3d.png).** #2's
  inference that it might not is wrong, and measured wrong: added after `diorama-models`, the text
  crosses the guesthouse roof fully legible. Labels are a taste decision after all.
- **[A hillshade past the DEM's z15 turns to blobs](./b-relief-hillshade-artefacts-at-z19.png).**
  `maxzoom: 16` on the layer fixes it; ramping `hillshade-exaggeration` down with a zoom expression
  does **not** — the property takes the expression and the artefacts stay.
- **[A DOM label anchored at the coordinate covers the marker it names](./b-relief-label-covers-marker.png).**
  It rises from the same point the building does, and no CSS offset can know how tall that building
  is on screen.
- **A three.js light can never shade the ground.** The terrain is MapLibre's and is not in the
  scene, so C's raking key light only ever rakes across the models — which is most of its thesis.
