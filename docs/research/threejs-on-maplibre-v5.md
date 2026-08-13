# How three.js models are drawn on MapLibre GL JS v5 today

Research for [#2](https://github.com/adrianpetersson/onward/issues/2). Feeds
[ADR 0001](../adr/0001-maplibre-v5-with-a-threejs-custom-layer.md) and the globe proof in
[#14](https://github.com/adrianpetersson/onward/issues/14).

**Date of investigation: 2026-08-13.** Every version number and commit date below was read on that date;
treat anything about "latest" as decaying from then.

## Headline

**The custom layer receives a fully usable projection matrix under globe. The headline feature is not at
risk.** MapLibre ships an official example that does exactly the globe-to-model thing Onward needs, and I
measured the matrix chain landing a model at its lat/lng to within **0.01 px of `map.project()`** across
globe, mercator, pitch, the globe→mercator transition, and z1 → z20. The globe half of ADR 0001 can be
un-hedged.

The real finding is a different one: **`maplibre-gl` latest is v6.3.0, not v5**, and v6 deleted the API
the v5 globe recipe depends on. That changes what "build on v5" costs later, and it is the thing worth
deciding now.

## Versions checked

| Thing                                 | Version    | Date read from           | Source                                                                                                     |
| ------------------------------------- | ---------- | ------------------------ | ---------------------------------------------------------------------------------------------------------- |
| `maplibre-gl` latest on npm           | **6.3.0**  | published 2026-08-10     | [registry.npmjs.org/maplibre-gl](https://registry.npmjs.org/maplibre-gl)                                   |
| `maplibre-gl` latest v5               | **5.24.0** | published 2026-04-23     | same                                                                                                       |
| `maplibre-gl` first v5                | 5.0.0      | published 2024-12-31     | same                                                                                                       |
| `maplibre-gl` v6.0.0                  | 6.0.0      | published 2026-07-22     | same                                                                                                       |
| `three` latest                        | 0.185.1    | published 2026-07-01     | [registry.npmjs.org/three](https://registry.npmjs.org/three)                                               |
| `@react-three/fiber` latest           | 9.7.0      | —                        | [registry.npmjs.org/@react-three/fiber](https://registry.npmjs.org/@react-three/fiber)                     |
| `@deck.gl/mapbox` latest              | 9.3.10     | published 2026-08-11     | [registry.npmjs.org/@deck.gl/mapbox](https://registry.npmjs.org/@deck.gl/mapbox)                           |
| `react-map-gl` latest                 | 8.1.2      | published 2026-07-29     | [registry.npmjs.org/react-map-gl](https://registry.npmjs.org/react-map-gl)                                 |
| `threebox-plugin` latest              | 2.2.7      | published **2022-06-03** | [registry.npmjs.org/threebox-plugin](https://registry.npmjs.org/threebox-plugin)                           |
| `@dvt3d/maplibre-three-plugin` latest | 1.7.1      | published 2026-07-26     | [registry.npmjs.org/@dvt3d/maplibre-three-plugin](https://registry.npmjs.org/@dvt3d/maplibre-three-plugin) |

Versions I actually ran: **`maplibre-gl@5.24.0`**, `three@0.169.0`, `@react-three/fiber@9.7.0`,
`typescript@5.9.2`, Chromium via Playwright on `ANGLE (Apple, ANGLE Metal Renderer: Apple M1 Pro)`.

**When globe projection arrived: v5.0.0.** At tag `v4.7.1` there is no
`src/geo/projection/globe_transform.ts` (HTTP 404) and `src/ui/map.ts` contains zero occurrences of
`setProjection`; at `v5.0.0-pre.1` both exist. Globe is therefore a v5 feature, not a v4 one.
([v4.7.1 tree](https://github.com/maplibre/maplibre-gl-js/tree/v4.7.1/src/geo/projection),
[v5.0.0 tree](https://github.com/maplibre/maplibre-gl-js/tree/v5.0.0/src/geo/projection))

---

# VERIFIED

Everything in this section is either a quotation from a primary source at a pinned version, or a number
I measured on this machine today. Where it is a measurement, the harness is in
[Appendix: the spike](#appendix-the-spike) so it can be re-run.

## V1. The custom layer gets a real projection matrix under globe. Measured.

MapLibre publishes an official example for precisely this:
**[Add a 3D model to globe using three.js](https://maplibre.org/maplibre-gl-js/docs/examples/add-a-3d-model-to-globe-using-threejs/)**.
Its source at `v5.24.0` is
[`test/examples/add-a-3d-model-to-globe-using-threejs.html`](https://github.com/maplibre/maplibre-gl-js/blob/v5.24.0/test/examples/add-a-3d-model-to-globe-using-threejs.html);
its `og:created` is `2025-06-25`. I confirmed by fetching the file at successive tags that it does **not**
exist at `v5.0.0`, `v5.4.0`, `v5.5.0` or `v5.6.0` (HTTP 404) and first appears at **`v5.7.0`** (HTTP 200).
So the globe recipe is newer than v5 itself — it is roughly a year old, not two.

Its own comments state the design intent:

> `// The API demonstrated in this example will work regardless of projection.`
> `// Click this button to toggle it.`

and on the layer:

> `renderingMode: '3d', // The layer MUST be marked as 3D in order to get the proper depth buffer with globe depths in it.`

The mechanism is two multiplications:

```js
const modelMatrix = map.transform.getMatrixForModel(modelOrigin, modelAltitude);
const m = new THREE.Matrix4().fromArray(args.defaultProjectionData.mainMatrix);
const l = new THREE.Matrix4()
  .fromArray(modelMatrix)
  .scale(new THREE.Vector3(s, s, s));
this.camera.projectionMatrix = m.multiply(l);
```

`args` is `CustomRenderMethodInput`, and at `v5.0.0` it already carried everything needed for globe —
`nearZ`, `farZ`, `fov`, `modelViewProjectionMatrix`, `projectionMatrix`, `shaderData`
(`variantName` / `vertexShaderPrelude` / `define`) and `defaultProjectionData`
([`custom_style_layer.ts` @ v5.0.0](https://github.com/maplibre/maplibre-gl-js/blob/v5.0.0/src/style/style_layer/custom_style_layer.ts)).
Diffing that file `v5.0.0` → `v5.24.0` shows **no change to the type at all** — only doc-comment link
syntax, an `export` keyword, and a `globalState` constructor argument. The custom-layer contract has been
stable for the entire v5 line.

The doc comment on `defaultProjectionData` is the sentence that matters, and it is easy to misread:

> `If you just need a projection matrix, use` `defaultProjectionData.projectionMatrix`.
> `A projection matrix is sufficient for simple custom layers that also only support mercator projection.`

That is about drawing your **own tiled geometry** with MapLibre's shader prelude. A single GLB at one
location is not that case — `getMatrixForModel` does the sphere maths on the CPU instead, so three.js's
own materials never need MapLibre's vertex shader.

### What I measured

I built a custom layer whose `render` computes `mainMatrix × getMatrixForModel(origin, alt)`, pushes the
model's local origin `(0,0,0)` through it to a screen pixel, and compares that against MapLibre's own
`map.project(origin)`. It also `gl.readPixels` the framebuffer to count the model's pixels, so
"placed correctly" and "actually drawn" are separate measurements.

`maplibre-gl@5.24.0`, `three@0.169.0`, 640×640 canvas, model at `[100.5, 13.75]`:

| Scenario                     | `projectionTransition` | `shaderData.variantName` | matrix vs `map.project()` | model pixels |
| ---------------------------- | ---------------------- | ------------------------ | ------------------------- | ------------ |
| globe, z1, pitch 0           | 1                      | `globe`                  | **0.00 px**               | 36           |
| globe, z3, pitch 0           | 1                      | `globe`                  | **0.00 px**               | 484          |
| globe, z3, pitch 60          | 1                      | `globe`                  | **0.00 px**               | 418          |
| globe, z2, model near limb   | 1                      | `globe`                  | **0.00 px**               | 56           |
| globe, z11                   | 1                      | `globe`                  | **0.01 px**               | —            |
| globe, z11.95                | 1                      | `globe`                  | **0.01 px**               | 11 896       |
| globe, z12 (post-transition) | 0                      | `mercator`               | **0.00 px**               | 17 104       |
| globe, z17, pitch 60         | 0                      | `mercator`               | **0.00 px**               | 1 646        |
| globe, z20, pitch 70         | 0                      | `mercator`               | **0.00 px**               | 118 360      |
| mercator, z3                 | 0                      | `mercator`               | **0.00 px**               | 484          |
| mercator, z17, pitch 60      | 0                      | `mercator`               | **0.00 px**               | —            |

Zero drift, everywhere, including at high pitch and through the projection switch. `shaderData.define`
contained `GLOBE` whenever `variantName` was `globe`, i.e. MapLibre correctly advertises the projection to
the layer.

One incidental observation, from a sweep at z10.8 / 11.0 / 11.2 / 11.4 / 11.6 / 11.7 / 11.8 / 11.9 /
11.95 / 12.0 / 12.2 using `jumpTo`: `projectionTransition` read `1` at every zoom up to 11.95 and `0` from
12.0, and `nearZ`/`farZ` jumped from `0.5`/`664789` to `12.8`/`1609` across that boundary. I never
observed a fractional value. I am **not** claiming the blend is instantaneous — `jumpTo` skips the
animation, and I did not test an animated `flyTo`. See [I3](#i3-the-animated-globmercator-blend-is-untested).

## V2. Occlusion by the globe works, and it is depth, not clipping.

The naive test (model at the antipode) is ambiguous: it also sits near the far plane, so a zero pixel
count could be far-plane clipping rather than occlusion. I swept the model's angular distance from the
camera centre instead, at z1 with the whole planet in frame and a 200 km box:

| Angular offset from camera centre | NDC z    | clip w (`farZ` = 1295.6) | model pixels |
| --------------------------------- | -------- | ------------------------ | ------------ |
| 0°                                | 0.999730 | 960.0                    | 36           |
| 45°                               | 0.999778 | 1006.4                   | 28           |
| 70°                               | 0.999832 | 1064.2                   | 19           |
| 85°                               | 0.999866 | 1104.5                   | 14           |
| 95°                               | 0.999889 | 1132.1                   | **2**        |
| 110°                              | 0.999919 | 1172.5                   | **0**        |
| 140°                              | 0.999965 | 1239.6                   | **0**        |
| 180°                              | 0.999989 | 1276.6                   | **0**        |

At 110–180° the model is comfortably **inside** the frustum (`clip w` < `farZ`, NDC z < 1) and the
placement is still exact (0.00 px), yet nothing is drawn. That is the depth buffer, not the far plane. The
taper from 14 → 2 → 0 across 85–110° is the limb: a 200 km-tall box peeks over the horizon before
disappearing.

This matches the mechanism in the source. `render/painter.ts` at `v5.24.0` renders the sphere into the
depth buffer before the translucent pass:

```ts
if (!this.opaquePassEnabledForLayer() && !globeDepthRendered) {
  globeDepthRendered = true;
  // Render the globe sphere into the depth buffer - but only if globe is enabled and terrain is disabled.
  // There should be no need for explicitly writing tile depths when terrain is enabled.
  if (renderOptions.isRenderingGlobe && !this.style.map.terrain) {
    this._renderTilesDepthBuffer();
  }
}
```

([`painter.ts` @ v5.24.0](https://github.com/maplibre/maplibre-gl-js/blob/v5.24.0/src/render/painter.ts), lines ~581–587)

This was a real bug once and is fixed: [#4817](https://github.com/maplibre/maplibre-gl-js/issues/4817)
("3d models are not correctly hidden using the globe view", reported against `5.0.0-pre.1`) was closed
2024-10-21 by [#4838](https://github.com/maplibre/maplibre-gl-js/pull/4838) ("Globe custom layers: draw
globe into depth buffer"), whose description says:

> Fill extrusion and 3D custom layer now use a depth buffer with globe rendered into it for occlusion.

That PR also records a **constraint that survives**: it notes that non-3D layers cannot be blended on top
of custom 3D layers (only other custom 3D layers can). So a `renderingMode: '3d'` layer draws late; a
label layer will not composite over a Stay Marker. Worth knowing before the Diorama's label design is
settled.

## V3. Occlusion by terrain works too, and altitude is metres above **sea level**.

Same harness, `tiles.mapterhorn.com` DEM (the source the official
[3D terrain example](https://maplibre.org/maplibre-gl-js/docs/examples/3d-terrain/) uses), camera at
Zermatt `[7.65, 45.98]`, z12, pitch 75. `map.queryTerrainElevation` reported **3599 m** at the site.

| Setup                 | model altitude arg | matrix vs `map.project()` | model pixels |
| --------------------- | ------------------ | ------------------------- | ------------ |
| terrain **off**       | 0                  | 0.00 px                   | 682          |
| terrain on            | 0 (sea level)      | 205.87 px                 | **0**        |
| terrain on            | 3599 (= terrain)   | **0.00 px**               | 289          |
| terrain on            | 5599 (2 km above)  | 141.71 px                 | 768          |
| terrain on, globe set | 3599               | **0.00 px**               | 289          |

Two facts fall out:

1. **Terrain occludes a 3D custom layer.** The identical box is visible with terrain off (682 px) and
   completely hidden with terrain on (0 px), because at altitude 0 it is buried inside a 3.6 km mountain.
   No ray-marching or manual depth work required.
2. **The 205.87 px "error" is not an error.** `getMatrixForModel(location, altitude)` treats altitude as
   metres above sea level, whereas `map.project()` returns the point on the _terrain surface_. Feed the
   terrain elevation in and the delta collapses to exactly 0.00 px; feed 2 km more and the model floats by
   a proportional 141.71 px. **A Stay Marker on terrain must add `map.queryTerrainElevation()` itself.**
   MapLibre will not drape it.

This is what the official
[terrain example](https://maplibre.org/maplibre-gl-js/docs/examples/adding-3d-models-using-threejs-on-terrain/)
does too — its `onAdd` calls `map.queryTerrainElevation(...)` for each model and differences it against a
scene origin ([source @ v5.24.0](https://github.com/maplibre/maplibre-gl-js/blob/v5.24.0/test/examples/adding-3d-models-using-threejs-on-terrain.html)).

The last row is weaker than it looks: z12 is past the globe→mercator transition, so `projectionTransition`
read 0 and the variant was `mercator` even with `setProjection({type:'globe'})`. **Globe + terrain +
model at a genuinely globe-scale zoom is not covered by my measurements.** MapLibre does support the
combination in principle — "Support Terrain in Globe projection"
([#4976](https://github.com/maplibre/maplibre-gl-js/pull/4976)) is in the v5.0.0 changelog.

## V4. Placement and metre scaling. The maths, from source.

`getMatrixForModel` has two implementations, and reading both is the clearest possible answer to
"how does scaling behave from world zoom to street zoom".

**Mercator** ([`mercator_transform.ts` @ v5.24.0](https://github.com/maplibre/maplibre-gl-js/blob/v5.24.0/src/geo/projection/mercator_transform.ts), line 802):

```ts
const modelAsMercatorCoordinate = MercatorCoordinate.fromLngLat(
  location,
  altitude,
);
const scale = modelAsMercatorCoordinate.meterInMercatorCoordinateUnits();
mat4.translate(m, m, [
  modelAsMercatorCoordinate.x,
  modelAsMercatorCoordinate.y,
  modelAsMercatorCoordinate.z,
]);
mat4.rotateZ(m, m, Math.PI);
mat4.rotateX(m, m, Math.PI / 2);
mat4.scale(m, m, [-scale, scale, scale]);
```

**Globe** ([`vertical_perspective_transform.ts` @ v5.24.0](https://github.com/maplibre/maplibre-gl-js/blob/v5.24.0/src/geo/projection/vertical_perspective_transform.ts), line 980):

```ts
const scale = 1.0 / earthRadius;
mat4.rotateY(m, m, (lnglat.lng / 180.0) * Math.PI);
mat4.rotateX(m, m, (-lnglat.lat / 180.0) * Math.PI);
mat4.translate(m, m, [0, 0, 1 + altitude / earthRadius]);
mat4.rotateX(m, m, Math.PI * 0.5);
mat4.scale(m, m, [scale, scale, scale]);
```

`earthRadius = 6371008.8` ([`lng_lat.ts`](https://github.com/maplibre/maplibre-gl-js/blob/v6.3.0/src/geo/lng_lat.ts), line 8).

So under both projections the returned matrix maps **one three.js unit to one metre**, and the two
projections differ only in what "one metre" means downstream — mercator units under mercator, unit-sphere
radii under globe. A model authored at true metres needs `scale = 1` and never changes with zoom. That is
the good outcome: no per-zoom scale hack, no LOD switch at the transition.

I confirmed the metre semantics behave: a 20 m box was sub-pixel and invisible at z1–z11.5, then measured
4 px at z12, 96 px at z15, 1646 px at z17 and 118 360 px at z20 — monotonic, with placement exact at every
step.

Two practical consequences, both measured as test artefacts before I understood them:

- The mercator matrix has a **negative X scale** (`-scale, scale, scale`) and a Z rotation of π. The frame
  is mirrored. Un-mirrored geometry will render back-to-front; the official terrain example handles the
  equivalent problem by doing `scene.scale.multiply(new THREE.Vector3(1, 1, -1))`.
- At high zoom a large model swallows the camera. My 200 km box vanished at z11+ purely because the camera
  was inside it and three.js's default `side: FrontSide` culled every face. Not a MapLibre issue, but the
  same trap awaits a Vehicle model scaled for globe legibility.

## V5. `CustomLayerInterface` is still the sanctioned route, and everything else routes through it.

Nothing has superseded it. MapLibre maintains **five** first-party three.js examples at `v5.24.0` —
[3D model](https://maplibre.org/maplibre-gl-js/docs/examples/add-a-3d-model-using-threejs/),
[3D model on globe](https://maplibre.org/maplibre-gl-js/docs/examples/add-a-3d-model-to-globe-using-threejs/),
[3D model with shadow](https://maplibre.org/maplibre-gl-js/docs/examples/add-a-3d-model-with-shadow-using-threejs/),
[3D models on terrain](https://maplibre.org/maplibre-gl-js/docs/examples/adding-3d-models-using-threejs-on-terrain/),
[3D tiles](https://maplibre.org/maplibre-gl-js/docs/examples/add-3d-tiles-using-threejs/) — plus a
babylon.js one, all built on `type: 'custom'`
([examples index](https://maplibre.org/maplibre-gl-js/docs/examples/)).

More telling: **deck.gl's interleaved mode is itself a `CustomLayerInterface`.** From
[`modules/mapbox/src/mapbox-layer-group.ts`](https://github.com/visgl/deck.gl/blob/master/modules/mapbox/src/mapbox-layer-group.ts):

```ts
import type {Map, CustomLayerInterface} from './types';
...
this.type = 'custom';
this.renderingMode = props.renderingMode || '3d';
```

There is no lower-level door. Every bridge is a wrapper over the same interface.

## V6. Bridge library survey — real dates, not reputation.

| Library                                                                           | Last **code** commit | Last npm publish | Open issues     | MapLibre? | Globe?  | Verdict           |
| --------------------------------------------------------------------------------- | -------------------- | ---------------- | --------------- | --------- | ------- | ----------------- |
| [threebox](https://github.com/jscastro76/threebox) (`threebox-plugin`)            | **2024-10-10**       | **2022-06-03**   | 67              | **No**    | No      | Do not use        |
| [`@dvt3d/maplibre-three-plugin`](https://github.com/dvt3d/maplibre-three-plugin)  | 2026-07-26           | 2026-07-26       | 3               | Yes       | **No**  | Mercator-only     |
| [`maplibre-three-world`](https://github.com/bruce-yu-studio/maplibre-three-world) | 2026-07-29           | 2026-07-29       | 0               | Yes       | Unknown | Too new (0 stars) |
| [`@deck.gl/mapbox`](https://github.com/visgl/deck.gl)                             | 2026-08-12           | 2026-08-11       | 475 (repo-wide) | Yes       | **Yes** | Alive, but see V7 |
| [`react-map-gl`](https://github.com/visgl/react-map-gl)                           | 2026-08-06           | 2026-07-29       | 94              | Yes       | n/a     | Fine, orthogonal  |

**threebox is dead for this purpose, on two independent counts.** Its repo looks active
(`pushed_at: 2026-07-25`) but that is Dependabot: filtering bump/dependabot commits, the last real code
change is **2024-10-10** ("fix loading models without materials") and the one before that **2024-01-10**.
npm has not seen a release since **2022-06-03**. Decisively, a GitHub code search for `maplibre` across
`jscastro76/threebox` returns **`total_count: 0`** — it is a Mapbox GL JS library that has never
referenced MapLibre, let alone MapLibre's globe. Its most recent substantive commits are about
`posMatrix` → `projMatrix` renames "after v2.3.0" of _Mapbox_.

**`@dvt3d/maplibre-three-plugin` is genuinely maintained but Mercator-only.** Published 1.7.1 on
2026-07-26, only 3 open issues, 86 stars, created 2024-12-07 — a real project. But a code search for
`mainMatrix` in the repo returns **0 hits**, and the single hit for `globe` is in
`examples/cesium-demo.html`. It never touches the API that carries globe state. Adopting it would trade
50 lines of matrix code for a dependency that cannot do the one thing that is hard.

**`maplibre-three-world`** (created 2025-12-09, 0 stars, 0 open issues) is too young to bet a headline
feature on.

**`react-map-gl` is orthogonal to this question.** It is a React wrapper for the map instance, not for
custom layers — `react-map-gl@8.1.2` is a thin metapackage that depends on `@vis.gl/react-mapbox` and
`@vis.gl/react-maplibre` at the same version
([registry](https://registry.npmjs.org/react-map-gl/8.1.2)); `@vis.gl/react-maplibre@8.1.2` (published
2026-07-29) declares `peerDependencies: {"maplibre-gl": ">=4.0.0"}`. Using it or not changes nothing
about how the model layer is written. Note that `>=4.0.0` is an open upper bound, which is a _claim_ of v6
compatibility rather than evidence of it.

## V7. deck.gl says globe is fully supported — and cannot run on v6 today.

The claim is explicit, in deck.gl's own docs source
([`docs/api-reference/mapbox/overview.md`](https://github.com/visgl/deck.gl/blob/master/docs/api-reference/mapbox/overview.md),
"Limitations"):

> `Mapbox's non-Mercator projections are not supported as their API doesn't expose the parameters used. Maplibre's globe projection is fully supported.`

Same section, the terrain caveat:

> `Mapbox/MapLibre's terrain features are partially supported. When a terrain is used, the camera of deck.gl and the base map should synchronize, however the deck.gl data with z=0 are rendered at the sea level and not aligned with the terrain surface.`

Its interleaved compatibility table stops at `maplibre-gl-js v3+ | ✓*` (`*will fallback to WebGL1 if
WebGL2 is not available`) — it does not enumerate v5 or v6.

**How it achieves globe matters, and it is not MapLibre's matrix.** In
[`modules/mapbox/src/deck-utils.ts`](https://github.com/visgl/deck.gl/blob/master/modules/mapbox/src/deck-utils.ts)
deck.gl swaps in its **own** `_GlobeView` and re-derives the camera:

```ts
import {Deck, MapView, _GlobeView as GlobeView, ...} from '@deck.gl/core';
...
export function getDefaultView(map: Map): GlobeView | MapView {
  if (getProjection(map) === 'globe') {
    return new GlobeView({id: MAPBOX_VIEW_ID});
  }
```

It reads `nearZ`/`farZ` from the v5 custom-layer args when present and otherwise falls back to
`map.transform._nearZ` / `map.transform.elevation`, annotated `@ts-ignore transform is not typed`. That is
two camera models kept in sync, not one shared matrix — a different and more fragile guarantee than
`getMatrixForModel` gives.

And it is currently **broken against v6**. deck.gl RFC
[#10501](https://github.com/visgl/deck.gl/issues/10501) — "Support MapLibre GL JS v4.5.1 through v6 in
MapboxOverlay", **open**, created 2026-07-28 — states it plainly:

> MapLibre v6 removed the private `map.transform` property as part of its camera-composition refactor.
> `@deck.gl/mapbox` currently reads that property for viewport height, terrain elevation, and near/far
> clipping planes. As a result, the current integration cannot run against v6 even though MapLibre now
> exposes public APIs for the data deck.gl needs.

Status: `Proposed`. Two sibling RFCs ([#10502](https://github.com/visgl/deck.gl/issues/10502) FOV sync,
[#10503](https://github.com/visgl/deck.gl/issues/10503) camera roll) are also open. Anyway, deck.gl is the
wrong shape for Onward: a Stay Marker is one GLB at one coordinate, which is exactly what ADR 0001 already
identified as deck.gl's weak spot.

## V8. React Three Fiber renders into MapLibre's context. Verified by running it.

**It works.** I attached R3F to MapLibre's own canvas and GL context and drove it from MapLibre's
`render()`. Under globe at z2 it drew **256 px**; at z2/pitch 60, **240 px**; under mercator z2,
**256 px**; and with the camera moved to the model's antipode, **0 px** — so it is depth-occluded by the
globe exactly like plain three.js.

The API surface is real, not a hack. From
[`packages/fiber/src/core/renderer.tsx`](https://github.com/pmndrs/react-three-fiber/blob/master/packages/fiber/src/core/renderer.tsx):

```ts
export type GLProps =
  | Renderer
  | ((defaultProps: DefaultGLProps) => Renderer)
  | ((defaultProps: DefaultGLProps) => Promise<Renderer>)
  | Partial<Properties<THREE.WebGLRenderer> | THREE.WebGLRendererParameters>
...
export function createRoot<TCanvas extends HTMLCanvasElement | OffscreenCanvas>(
  canvas: TCanvas,
): ReconcilerRoot<TCanvas>
```

`createRoot`, `advance`, `invalidate` and `extend` are all public exports of `@react-three/fiber`
([`core/index.tsx`](https://github.com/pmndrs/react-three-fiber/blob/master/packages/fiber/src/core/index.tsx)),
and `advance` with no `state` argument advances every registered root
([`core/loop.ts`](https://github.com/pmndrs/react-three-fiber/blob/master/packages/fiber/src/core/loop.ts)):

```ts
export function advance(timestamp: number, runGlobalEffects: boolean = true, state?: RootState, frame?: XRFrame): void {
  if (runGlobalEffects) flushGlobalEffects('before', timestamp)
  if (!state) for (const root of _roots.values()) update(timestamp, root.store.getState())
  ...
```

I confirmed at runtime that R3F was using _our_ objects, not its own defaults: `cameraIsOurs: true`,
`glIsOurs: true`, `frameloop: "never"`, `priority: 0`, `scene.children: ["Mesh/BoxGeometry"]`.

**Three sharp edges, each of which cost me a failed run:**

1. **`THREE.Camera` is rejected.** The MapLibre examples all use a bare `new THREE.Camera()`. R3F's store
   calls `camera.updateProjectionMatrix()` during `configure`/`setSize`, which a bare `Camera` does not
   implement. Observed: `TypeError: l.updateProjectionMatrix is not a function` from `Object.setSize`.
   Fix: use a `PerspectiveCamera` and stub `updateProjectionMatrix = () => {}`, since MapLibre owns the
   projection.
2. **`createRoot` does not populate the component catalogue.** Rendering `<mesh><boxGeometry/></mesh>`
   threw `R3F: BoxGeometry is not part of the THREE namespace! Did you forget to extend?`. `<Canvas>` does
   this for you; with `createRoot` you must call `extend(THREE)` yourself.
3. **R3F changes the colour pipeline.** At runtime `gl.toneMapping` read `4`
   (`ACESFilmicToneMapping`) and `outputColorSpace` `"srgb"`. A pure-green `0x00ff00` material landed on
   screen as `rgb(147, 228, 89)`. This silently ate my first two runs (my pixel detector was looking for
   pure green) and it will silently eat the Diorama's flat-colour palette. Set `NoToneMapping` — or R3F's
   `flat` — if the matte look is meant to be exact.

`@react-three/fiber@9.7.0` declares `peerDependencies: {"react": ">=19 <19.3", "three": ">=0.156", ...}`
([registry](https://registry.npmjs.org/@react-three/fiber/9.7.0)), so it pins a React 19 window.

## V9. TypeScript: what is actually in the shipped v5 typings.

I installed `maplibre-gl@5.24.0` into a temp directory and typechecked probe assertions against its
`dist/maplibre-gl.d.ts` (15 180 lines) with `typescript@5.9.2`, `strict: true`. **tsc exit code 0**, so
all of the following hold:

- `map.transform.getMatrixForModel([lng, lat], alt)` **typechecks**. `Camera` declares
  `transform: ITransform` and `IReadonlyTransform` declares
  `getMatrixForModel(location: LngLatLike, altitude?: number): mat4` (d.ts line 6160). The v6 changelog
  calls this helper "internal", but in v5 it is in the public typings with no `_` prefix and no
  deprecation.
- `args.defaultProjectionData.mainMatrix` typechecks. Note the **name**: `ProjectionData` declares
  `mainMatrix`, not `projectionMatrix`. The
  [live CustomLayerInterface API page](https://maplibre.org/maplibre-gl-js/docs/API/interfaces/CustomLayerInterface/)
  describes the render argument as `{gl, modelViewProjectionMatrix}`, and the v5 doc comment on
  `defaultProjectionData` still says `projectionMatrix` — but the official example and the type both use
  `mainMatrix`. Trust the type.
- `args.defaultProjectionData.projectionTransition`, `args.shaderData.define`,
  `args.shaderData.variantName` and `args.projectionMatrix` all typecheck.
- `args.getProjectionData({...})` is **absent** in v5.24.0 — asserted via `@ts-expect-error`, which tsc
  accepted. It is a v6 addition (see V10).

`ProjectionData` at `v5.24.0` is `{mainMatrix, tileMercatorCoords, clippingPlane, projectionTransition,
fallbackMatrix}` — identical field names at `v5.0.0`, `v5.6.0` and `v5.7.0`
([`projection_data.ts`](https://github.com/maplibre/maplibre-gl-js/blob/v5.24.0/src/geo/projection/projection_data.ts)).

## V10. v6 deletes the API the v5 globe recipe is built on.

This is the finding that should change a decision. From the
[v6.0.0 changelog](https://github.com/maplibre/maplibre-gl-js/blob/main/CHANGELOG.md), breaking changes:

> ⚠️ `Map` now composes a `Camera` instead of extending it (`Map` extends `Evented` directly and forwards
> the camera API). The internal `map.transform` was removed — use map's public API instead or open a PR if
> you need something that's not exposed. **Removed the internal `transform.getMatrixForModel` helper**
> ([#7800](https://github.com/maplibre/maplibre-gl-js/pull/7800))

Also in v6.0.0, and relevant to a Vite SPA:

> ⚠️ Switch to an ESM-only distribution (`maplibre-gl.mjs`). The UMD bundles (`maplibre-gl.js`,
> `maplibre-gl-csp.js`) are no longer published. […] consumers using `import maplibregl from 'maplibre-gl'`
> must switch to `import * as maplibregl from 'maplibre-gl'` or named imports.
> ([#6254](https://github.com/maplibre/maplibre-gl-js/pull/6254))

> ⚠️ WebGL (v1) support has been removed; WebGL2 is now required.
> ([#7453](https://github.com/maplibre/maplibre-gl-js/pull/7453))

**The good news: MapLibre already shows the migration, in the same example file.** Diffing
`add-a-3d-model-to-globe-using-threejs.html` between `v5.24.0` and `v6.3.0`, the v6 version deletes the
`getMatrixForModel` call and inlines two local functions, switching on `projectionTransition`:

```js
const isGlobe = args.defaultProjectionData.projectionTransition > 0;
const l = isGlobe
  ? getGlobeModelMatrix(modelOrigin, modelAltitude)
  : getMercatorModelMatrix(modelOrigin, modelAltitude);
l.scale(new THREE.Vector3(scaling, scaling, scaling));
```

with

```js
const earthRadius = 6371008.8; // meters, matches MapLibre's internal value
function getGlobeModelMatrix(location, altitude) {
  const [lng, lat] = location;
  const scale = 1 / earthRadius;
  return new THREE.Matrix4()
    .makeRotationY((lng / 180) * Math.PI)
    .multiply(new THREE.Matrix4().makeRotationX((-lat / 180) * Math.PI))
    .multiply(
      new THREE.Matrix4().makeTranslation(0, 0, 1 + altitude / earthRadius),
    )
    .multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2))
    .multiply(new THREE.Matrix4().makeScale(scale, scale, scale));
}
```

Compare that against the `vertical_perspective_transform.ts` source quoted in [V4](#v4-placement-and-metre-scaling-the-maths-from-source):
it is the **same matrix, term for term**. The v6 replacement is not a redesign; it is the deleted internal
copied into userland. The v6 example also adds a public escape hatch on the args object,
`getProjectionData(params)`, described in the type as needed "only when rendering tiles in a completely
custom way"
([`custom_style_layer.ts` @ v6.3.0](https://github.com/maplibre/maplibre-gl-js/blob/v6.3.0/src/style/style_layer/custom_style_layer.ts)),
plus a v5→v6 migration guide at `docs/guides/v5-to-v6-migration-guide.md`.

The v6 `CustomRenderMethodInput` is otherwise the same shape, tightened: `gl` is now `WebGL2RenderingContext`
only (no WebGL1 union).

**Practical read:** because the docs site serves the current release, the page linked from issue #2 now
shows the **v6** code. Anyone copying it into a v5 app gets hand-rolled matrices that work anyway (they're
projection-agnostic and depend on nothing internal). That is the better thing to copy regardless of which
major we pin — **write the two matrix functions locally and never call `map.transform`.** Onward's model
layer then compiles unchanged on v5 and v6, and neither the ESM switch nor the transform removal touches it.

---

# INFERRED

Reasoned from the above, not directly observed. Flagged so it is not mistaken for measurement.

## I1. The globe risk in ADR 0001 can be closed, but #14 should still exist

V1–V4 remove the _technical_ uncertainty: the matrix is usable, placement is exact, occlusion works, metre
scaling is projection-independent. What I have **not** shown is that it looks good — an arc from
Copenhagen to Bangkok rendered as a three.js tube under globe, a Vehicle oriented along a great circle, a
Pin whose pulse reads at both scales. Those are Diorama questions and #14 is still the place to answer them.

## I2. Vehicle orientation along a Path is unsolved by `getMatrixForModel`

`getMatrixForModel` gives position and an up-vector, not a heading. A plane banking along a great circle
needs a rotation derived from the Path tangent, in the same frame the matrix establishes — and that frame
is **mirrored** under mercator (V4) but not under globe. I expect the sign of a heading rotation to differ
between projections. Untested; a Vehicle at globe scale is the first place it would show.

## I3. The animated globe↔mercator blend is untested

`jumpTo` gave me only `projectionTransition ∈ {0, 1}` (V1). MapLibre's own type says the field "also
follows the globe->mercator transition when zooming in", implying intermediate values during animation.
Both PR [#5150](https://github.com/maplibre/maplibre-gl-js/pull/5150) ("fixes 3D model disappearing during
projection transition") and issue [#5117](https://github.com/maplibre/maplibre-gl-js/issues/5117) exist
precisely because this window was once broken. I infer it is fixed — but Onward's headline gesture _is_
this animation, so it deserves its own eyes-on check rather than my inference.

## I4. Labels will not composite over Stay Markers

From PR #4838's own note that non-3D layers cannot be blended on top of custom 3D layers. I did not test a
symbol layer over a model. Related and still open in spirit:
[#6443](https://github.com/maplibre/maplibre-gl-js/issues/6443) ("Why do I see the custom object below the
map only at some zooms / pitches?", closed 2025-09-24) is a user hitting the confusing end of this.

## I5. Pinning v5 has a shelf life

v5.24.0 was the last v5 minor (2026-04-23); v6.0.0 landed 2026-07-22 and v6.3.0 on 2026-08-10. Bug fixes
are landing on `main`/v6. I infer v5 gets security-only attention at best. Nothing forces a move today —
but the cost of _not_ using `map.transform` (V10) is roughly zero, so paying it now keeps the door open.

---

# Answers to the ticket, in its own order

**Is `CustomLayerInterface` still the sanctioned way, or is there a better-maintained bridge?**
Sanctioned, and there is no better-maintained bridge — every candidate is either dead for MapLibre
(threebox: no MapLibre references at all, no npm release since 2022-06-03), Mercator-only
(`@dvt3d/maplibre-three-plugin`: 0 references to `mainMatrix`), too new (`maplibre-three-world`), or a
wrapper over `CustomLayerInterface` anyway (deck.gl). Write the layer directly. V5, V6.

**Does the custom layer receive a usable projection matrix under globe, or is it Mercator-only?**
**It does.** Not Mercator-only. `mainMatrix × getMatrixForModel` placed a model within 0.01 px of
`map.project()` under globe at z1–z20, at pitch 0 and 60, near the limb, and across the projection switch.
There is an official example for it, added in v5.7.0. V1.

**Can `@react-three/fiber` render into a custom layer's context, or must it be plain three.js?**
R3F can, and I ran it — 256 px drawn under globe, 0 px when occluded. Requires `createRoot` +
`extend(THREE)` + `frameloop: 'never'` + `advance()`, a camera that implements `updateProjectionMatrix`,
and awareness that R3F defaults to ACES tone mapping. V8.

**How is a model placed at a lat/lng and scaled to real metres, and how does that behave world → street?**
`getMatrixForModel` (v5) or the two inlined equivalents (v6) return a matrix in which **one unit is one
metre**, under both projections. Scale is therefore constant across zoom — verified monotonic growth of a
20 m box from invisible at z1 to 118 360 px at z20 with zero placement drift. Mind the mirrored mercator
frame. V4.

**Depth and occlusion: does a model hide behind 3D terrain, or draw through it?**
It hides — correctly, via the depth buffer, with `renderingMode: '3d'`. The same box measured 682 px with
terrain off and 0 px with terrain on when buried in a 3.6 km mountain. Globe occlusion likewise (0 px past
110° from the camera centre, while still inside the frustum). But **altitude is metres above sea level**:
you must add `map.queryTerrainElevation()` yourself or the model sinks. V2, V3.

---

## Recommendation

**Keep MapLibre GL JS v5 + three.js through `CustomLayerInterface`, and delete the globe hedge from
ADR 0001 — but write the model matrices by hand instead of calling `map.transform`.**

Concretely:

1. **Do not adopt any bridge library.** The layer is ~40 lines. threebox is dead for MapLibre, the
   maintained MapLibre/three plugin cannot do globe, and deck.gl is both the wrong shape for single GLBs
   and currently unable to run on v6.
2. **Copy the v6 example's `getGlobeModelMatrix` / `getMercatorModelMatrix` into the repo**, switching on
   `args.defaultProjectionData.projectionTransition > 0`. They are term-for-term MapLibre's own internal
   maths, they work identically on v5, and they make the model layer immune to the single breaking change
   (`map.transform` removal) standing between v5 and v6. Cost now: near zero. Cost later if skipped: a
   rewrite of the one file the whole product rests on.
3. **Mark every model layer `renderingMode: '3d'`** and set `canvasContextAttributes: {antialias: true}`,
   per the official example's own comments — that flag is what buys globe and terrain occlusion.
4. **Treat altitude as sea level.** Any Stay Marker on terrain adds `map.queryTerrainElevation()`.
5. **Plan the v6 move, don't do it now.** v5.24.0 is the end of the v5 line. With (2) done, the migration
   is the ESM import change plus whatever else v6 touches — not a re-architecture. Revisit once
   `@vis.gl`'s and the wider ecosystem's v6 support settles (deck.gl RFC #10501 is a useful bellwether
   even though we won't use deck.gl).

**Confidence: high** on the ticket's central question — that the custom layer receives a usable projection
matrix under globe, that models are placed correctly in metres at every zoom, and that occlusion works
against both the globe and terrain. That rests on a first-party MapLibre example plus 25-odd measurements
I took today at pinned versions, not on inference.

**Confidence: medium** on the recommendation to stay on v5. It is right for shipping the pitched map first
(the build order already assumes that), but v5 is a closed line and I am inferring rather than observing
its support posture.

### What still needs proving in code

- **An animated `flyTo` through the globe→mercator transition**, watching a model the whole way. My
  `jumpTo` tests never produced a fractional `projectionTransition`, so the animated blend — Onward's
  actual headline gesture — is inferred fixed, not observed. **Highest-value remaining spike.** (I3)
- **Globe + terrain at a globe-scale zoom.** My globe+terrain row was secretly Mercator because z12 is
  past the switch. (V3)
- **Vehicle heading along a Path**, under both projections, to find whether the mirrored mercator frame
  flips the sign of a heading rotation. (I2)
- **A symbol/label layer over a `renderingMode: '3d'` model**, to see what the "cannot blend on top"
  constraint costs the Diorama's labelling. (I4)
- **R3F end-to-end in a Vite + TypeScript build**, not from a CDN import map — that R3F draws is settled,
  but its resize path, `StrictMode` double-invocation and MapLibre's `webglcontextlost` handling are not.
  A plain-three.js layer with React only on the outside remains the lower-risk default until this is done.
  (V8)

---

## Appendix: the spike

Written to a temp directory, not to this repo, and run against `maplibre-gl@5.24.0` + `three@0.169.0` in
Chromium (ANGLE/Metal, Apple M1 Pro) on 2026-08-13. The core of it, reconstructed to the essentials:

```js
// custom layer: does mainMatrix x getMatrixForModel agree with map.project()?
const layer = {
  id: "probe",
  type: "custom",
  renderingMode: "3d",
  onAdd(m, gl) {
    this.map = m;
    this.camera = new THREE.Camera();
    this.scene = new THREE.Scene();
    this.scene.add(
      new THREE.Mesh(
        new THREE.BoxGeometry(1, 1, 1),
        new THREE.MeshBasicMaterial({
          color: 0xff0000,
          side: THREE.DoubleSide,
        }),
      ),
    );
    this.renderer = new THREE.WebGLRenderer({
      canvas: m.getCanvas(),
      context: gl,
    });
    this.renderer.autoClear = false;
  },
  render(gl, args) {
    const m = new THREE.Matrix4().fromArray(
      args.defaultProjectionData.mainMatrix,
    );
    const l = new THREE.Matrix4()
      .fromArray(this.map.transform.getMatrixForModel(ORIGIN, ALTITUDE))
      .scale(new THREE.Vector3(SCALE, SCALE, SCALE));
    const mvp = m.clone().multiply(l);

    this.camera.projectionMatrix = mvp.clone();
    this.renderer.resetState();
    this.renderer.render(this.scene, this.camera);

    // where the matrix chain puts the model origin, vs MapLibre's own answer
    const v = new THREE.Vector4(0, 0, 0, 1).applyMatrix4(mvp);
    const c = this.map.getCanvas();
    const fromMatrix = [
      ((v.x / v.w) * 0.5 + 0.5) * c.clientWidth,
      (1 - ((v.y / v.w) * 0.5 + 0.5)) * c.clientHeight,
    ];
    const fromApi = this.map.project(ORIGIN);
    // deltaPx = hypot(fromMatrix - fromApi)  -> 0.00 in every scenario in V1

    // and: is anything actually drawn? gl.readPixels + count model-coloured pixels,
    // which is what separates "occluded" from "mispositioned" in V2/V3.
  },
};
```

The map was created with
`canvasContextAttributes: {antialias: false, preserveDrawingBuffer: true}` (needed for pixel readback) and
an empty style plus one `background` layer, so no tile network dependency; the terrain runs added
`{type: 'raster-dem', url: 'https://tiles.mapterhorn.com/tilejson.json'}` and `map.setTerrain(...)`.

The TypeScript probe (V9) asserted the public typings with `tsc --strict --noEmit`, using
`@ts-expect-error` for the one assertion of **absence** (`args.getProjectionData` in v5), so that a future
addition of that field would fail the check rather than pass silently.

**Caveat on all measurements:** one machine, one GPU, one browser. The globe latitude-precision fix in
v6.1.0 ("Fix globe latitude precision on some GPUs (e.g. Mali)",
[#7419](https://github.com/maplibre/maplibre-gl-js/issues/7419)) is a reminder that globe maths has been
GPU-sensitive. Sub-pixel agreement on Apple/Metal is not a guarantee of sub-pixel agreement on a mid-range
Android.
