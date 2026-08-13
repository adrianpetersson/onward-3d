import type {
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
 * The forked Positron style, stripped, with Liberty's `building-3d` extrusion lifted in. Lives in
 * the repo as source: see `style/README.md` for what was taken out.
 */
export const DIORAMA_STYLE = dioramaStyle as StyleSpecification

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

export const TERRAIN: TerrainSpecification = {
  source: TERRAIN_SOURCE_ID,
  exaggeration: 1.5,
}

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
