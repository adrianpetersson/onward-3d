# MapLibre GL JS with a three.js custom layer

Onward's whole value is a 3D map that works at two wildly different scales: a 9,000 km flight arc from
Copenhagen to Bangkok, and a beach hut on a 300 m-wide sandbar at Koh Kradan. We chose **MapLibre GL JS**
as the map, with **three.js** models injected through a `CustomLayerInterface`, because it is the only
option offering a globe projection _and_ pitched 3D terrain _and_ street-level model placement in one
instance — so the zoom-driven dive from globe to hut needs no seam between two libraries.

**Which major** (5.24.0 vs 6.3.0) is decided separately in
[#16](https://github.com/adrianpetersson/onward/issues/16); see the amendment below. Nothing in this ADR
depends on the answer.

## Considered options

- **deck.gl** — excellent arc and trips layers and a globe view, but weaker support for placing individual
  GLB models at street scale, which is exactly what a Stay Marker is.
- **CesiumJS** — the strongest real-earth engine, with proper terrain and ellipsoidal maths. Rejected for
  bundle weight and because stylising it into a matte low-poly Diorama fights the library rather than
  using it.
- **react-globe.gl** — beautiful arcs for almost no effort, and structurally incapable of the street-level
  half of the product.
- **Google Photorealistic 3D Tiles** — wrong register entirely; we deliberately chose stylised over
  photoreal, and it carries billing.

## Consequences

Also rejected: **every bridge library.** `threebox` has had no npm release since 2022-06-03 and a code
search for `maplibre` in its repository returns zero hits. `@dvt3d/maplibre-three-plugin` is maintained but
has no reference to `mainMatrix`, making it Mercator-only. deck.gl's interleaved mode is itself a custom
layer, fakes the globe with its own `_GlobeView`, and per its own open RFC cannot run against MapLibre v6.
Onward talks to `CustomLayerInterface` directly.

## Amendment, 13 Aug 2026 — the globe risk is closed, and v5 was not the current major

Two corrections from [#2](https://github.com/adrianpetersson/onward/issues/2)
([findings](https://github.com/adrianpetersson/onward/blob/research/threejs-on-maplibre-v5/docs/research/threejs-on-maplibre-v5.md)):

**The globe hedge comes out.** This ADR originally recorded that whether a custom layer receives a usable
projection matrix under globe projection was an open question, and the largest single risk in the project.
It is now measured: `mainMatrix × getMatrixForModel()` placed a model within **≤0.01 px of `map.project()`
in all 12 scenarios** tested — globe and mercator, pitch 0 and 60, near the limb, and z1→z20 through the
projection switch. Occlusion is true depth rather than clipping, against both the globe's limb and 3D
terrain. MapLibre ships an official globe + three.js example as of v5.7.0. The fallback-to-pitched-map
contingency is no longer needed for technical reasons.

What remains open is **aesthetic, not technical**, and belongs to
[#14](https://github.com/adrianpetersson/onward/issues/14): whether the animated globe↔mercator blend
preserves models mid-transition (only the endpoints `{0, 1}` were observable via `jumpTo`, so this is
inferred rather than measured), and whether the intercontinental arc is actually the wow moment it is meant
to be. #14 stays droppable.

**This ADR originally said "v5" on the false assumption that v5 was current.** `maplibre-gl@latest` is
**6.3.0**; v5 ended at 5.24.0. v6 removed `map.transform` (and with it `transform.getMatrixForModel`),
switched to an ESM-only distribution, and dropped WebGL1. The mitigation is cheap and applies either way:
**write the two model-matrix functions locally and never call `map.transform`** — MapLibre's own v6 example
does exactly this, and the inlined functions are the deleted internal copied term-for-term. Onward's model
layer then compiles unchanged on both majors.
