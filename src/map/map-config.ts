import type {
  HillshadeLayerSpecification,
  MapOptions,
  RasterDEMSourceSpecification,
  StyleSpecification,
  TerrainSpecification,
} from 'maplibre-gl'

import dioramaStyle from './style/onward-positron.json'
import type { LngLatTuple } from './model-matrix'

/**
 * Every provider the Diorama draws from, and the exact settings each one needs.
 *
 * The stack is deliberately **keyless** — OpenFreeMap for tiles, AWS Terrarium for elevation,
 * Photon for search — so this project has no credential to store and no env var to forget. See #3.
 */

/**
 * The zooms the globe hands over to the pitched map across.
 *
 * Below `from` the world is a sphere; above `to` it is the pitched mercator Diorama; between them
 * MapLibre morphs continuously. Ruling 2's "one map, zoom-driven" arriving as two numbers (#14).
 *
 * **4 → 7 rather than MapLibre's own 11 → 12**, because a globe at city zoom is the wrong picture:
 * the pitched map is the product and the globe is the establishing shot for the whole Trip. By z7 the
 * camera frames a region and the Diorama should already be flat and tilted.
 */
export const GLOBE_BAND = { from: 4, to: 7 } as const

/**
 * The zoom above which the globe **draws nothing at all**, measured in #14.
 *
 * Not a soft limit and not about quality: pinned to `vertical-perspective` and climbed, MapLibre
 * renders 22 features at z16.0, 15 at z16.5 and **0 from z16.8 up** — no tiles, no coastline, no Pin,
 * with a lone three.js model floating in a void (`docs/globe/globe-draws-nothing-at-z17.png`).
 * Isolated from terrain: `setTerrain(null)` changes nothing and switching the same camera to
 * mercator brings the map straight back.
 *
 * This is almost certainly why MapLibre's own default hands over at z11 → z12. It is recorded here
 * because it is the one number that makes `GLOBE_BAND` unsafe to move upward, and a test pins the
 * relationship rather than trusting a comment.
 */
export const GLOBE_CEILING_ZOOM = 16.8

/**
 * The forked Positron style, stripped, with Liberty's `building-3d` extrusion lifted in. Lives in
 * the repo as source: see `style/README.md` for what was taken out.
 *
 * The projection is added here rather than in the JSON so the band can carry its reasoning, and it
 * is on the **style** rather than a `setProjection` call because `setProjection` throws
 * `Style is not done loading.` before the map's `load` — so calling it needs a handler and gets a
 * frame of mercator first. A style property is read as the style is built and neither problem
 * exists. See [ADR 0007](../../docs/adr/0007-the-globe-hands-over-before-it-runs-out.md).
 */
export const DIORAMA_STYLE = {
  ...(dioramaStyle as StyleSpecification),
  projection: {
    type: [
      'interpolate',
      ['linear'],
      ['zoom'],
      GLOBE_BAND.from,
      'vertical-perspective',
      GLOBE_BAND.to,
      'mercator',
    ],
    // The spec's `projection.type` is a `projectionDefinition`, which accepts a string *or* a
    // zoom expression. The generated `StyleSpecification` type only admits the string form.
  } as unknown as StyleSpecification['projection'],
} satisfies StyleSpecification

export const TERRAIN_SOURCE_ID = 'terrain'

export const ELEVATION_ATTRIBUTION =
  'Mapzen, USGS, Copernicus/EU, Kartverket, NOAA'

/**
 * AWS Terrarium, chosen over Mapterhorn because it is uniform z0–15 worldwide where Mapterhorn
 * stops at z12 over Thailand and Malaysia — exactly where Onward's zoom-to-the-hut happens.
 *
 * **Three of these properties are not the spec defaults, and one of them fails silently.**
 *
 * - `encoding` defaults to `'mapbox'`. Terrarium consumed as Mapbox-encoded renders as noise with
 *   no error thrown — nothing in the console, just wrong hills.
 * - `tileSize` defaults to 512; S3 serves 256.
 * - `maxzoom` defaults to 22, so without it MapLibre requests tiles past z15 and 404s at street
 *   level. Set it and MapLibre overzooms the deepest real tile instead.
 */
export const TERRAIN_SOURCE: RasterDEMSourceSpecification = {
  type: 'raster-dem',
  tiles: [
    'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png',
  ],
  encoding: 'terrarium',
  tileSize: 256,
  maxzoom: 15,
  attribution: ELEVATION_ATTRIBUTION,
}

/**
 * 2 rather than the 1.5 the scaffold shipped. #11 compared the two side by side against a shaded
 * ground: at 1.5 Koh Kradan's 83 m of real relief still flattens out under a hillshade, and at 2 the
 * ridge reads without the coastline starting to look like a cliff.
 */
export const TERRAIN: TerrainSpecification = {
  source: TERRAIN_SOURCE_ID,
  exaggeration: 2,
}

/**
 * The layer that makes the ground read as ground.
 *
 * #6 and #7 both hit the same wall from different sides: the stripped Positron fork carries no
 * `hillshade`, so an island with 83 m of correctly-decoded elevation still drew as a flat silhouette
 * ([`docs/tracer/island-reads-flat.png`](../../docs/tracer/island-reads-flat.png)). #11 settled that
 * by shading it — the DEM is downloaded, decoded and paid for either way, and one layer over it is
 * the whole fix.
 *
 * It is **not** in `style/onward-positron.json` with the rest of the visual language, and cannot be:
 * it reads `TERRAIN_SOURCE`, which is added at runtime rather than declared in the style. A style
 * referencing a source that is not there yet throws on construction.
 *
 * **`maxzoom` is load-bearing and the value is measured.** The Terrarium DEM's deepest real tile is
 * z15, and MapLibre overzooms a `hillshade` past that into large soft blobs — at z18.9 the sea off
 * Ao Niang fills with them and the Diorama reads broken. Capping the *layer* is what fixes it;
 * ramping `hillshade-exaggeration` down with a zoom expression does **not** — MapLibre accepts the
 * expression and the artefacts stay exactly as they were. 16 rather than 15 because one level of
 * overzoom is still clean, and past it a Stay Marker's own cast shadow is carrying the relief anyway.
 */
export const HILLSHADE: HillshadeLayerSpecification = {
  id: 'terrain-hillshade',
  type: 'hillshade',
  source: TERRAIN_SOURCE_ID,
  maxzoom: 16,
  paint: {
    'hillshade-shadow-color': '#8d7f61',
    'hillshade-highlight-color': '#fff6e4',
    'hillshade-accent-color': '#a08d68',
    'hillshade-exaggeration': 0.45,
  },
}

/**
 * Where the hillshade goes in the layer order — directly above every land fill, and below the
 * buildings so an extrusion is never shaded twice.
 *
 * It does also cover `water`, which sounds wrong and is not: Terrarium encodes the open sea as a
 * flat ~0 m, so the shading over it is uniform and invisible. Only the overzoom above z15 ever made
 * the sea look wrong, and `maxzoom` closed that.
 */
export const HILLSHADE_BEFORE = 'waterway'

/**
 * Koh Mook, Trang — a Stop on the trip this MVP has to hold, and the place #3 wants a screenshot of
 * before its own terrain recommendation hardens.
 */
export const KOH_MOOK: LngLatTuple = [99.2967, 7.3797]

/**
 * Ao Niang Resort, Koh Kradan — the coordinate #7 fires its tracer at, and a real Stay on the trip
 * this MVP has to hold.
 *
 * It is the geocoder's own answer rather than a hand-read one: Photon, the keyless search #3 chose,
 * returns this for "Ao Niang" as an `osm_value: hotel`. Worth knowing that it sits on the island's
 * **west** shore, not the south-east cove #7 assumed — the bay OSM calls อ่าวเนียง is 300 m east of
 * the resort that shares its name.
 */
export const AO_NIANG: LngLatTuple = [99.25546, 7.30365]

/**
 * The pitched map ships before the globe (#14), so the camera opens pitched and close in rather
 * than on a globe. No `projection` is set: mercator is the default and the handover is #14's.
 *
 * 60 is MapLibre's default `maxPitch`, and anything above it is silently clamped rather than
 * refused. Going steeper than this is a deliberate act that has to raise the cap too.
 *
 * z17 rather than the scaffold's z14: an 8 m building is roughly two pixels tall at z14, so the
 * tracer opens where a Stay Marker is actually legible. What that says about the zoom range a
 * true-metre model reads at is #7's to record and #8's to live with.
 */
export const INITIAL_VIEW = {
  center: AO_NIANG,
  zoom: 17,
  pitch: 60,
  bearing: -22,
} satisfies Partial<MapOptions>

/**
 * Search is not wired up yet — the geocoder lands with the sidebar (#10) — but the credit is owed
 * the moment the deployed page exists, so it ships with the scaffold.
 *
 * The other two credits arrive on their own: MapLibre's `AttributionControl` reads OpenFreeMap's
 * string out of the TileJSON and the elevation string off `TERRAIN_SOURCE.attribution`.
 */
export const SEARCH_ATTRIBUTION =
  'Search: <a href="https://photon.komoot.io/" target="_blank" rel="noreferrer">Photon</a> / <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>'
