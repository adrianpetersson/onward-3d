/**
 * PROTOTYPE — #11, the Diorama's visual language. Throwaway; only the winner is folded into `main`.
 *
 * Three registers of the Diorama, switchable on the live map with `?variant=A|B|C`. Each is a whole
 * position, not a palette: they disagree about **what carries the ground**, and every other answer
 * in the ticket falls out of that disagreement.
 *
 * | | A — Chart | B — Relief | C — Cutout |
 * | --- | --- | --- | --- |
 * | relief from | nothing; the models' own shadows | a `hillshade` over the same DEM | a low raking key light |
 * | basemap | roads kept as hairlines | roads stripped, coast + wood kept | everything but coast, wood and buildings gone |
 * | coast read by | hard value contrast | shading plus contrast | flat colour blocks, hard edge |
 * | labels | MapLibre symbol layers, in the map plane | DOM pills over the canvas | billboarded sprites in the 3D world |
 * | chrome | matches: flat, sober, hairline | contrasts: solid warm panel | floats: a card over the world |
 *
 * The three label mechanisms are not three tastes. #2 flagged (INFERRED, untested) that a non-3D
 * layer may be unable to composite over a custom 3D layer — so A is the one that can actually fail,
 * and running all three is how that gets settled rather than guessed at. See `labels.ts`.
 */

import type {
  LayerSpecification,
  StyleSpecification,
  Map as MapLibreMap,
} from 'maplibre-gl'

import { DIORAMA_LIGHT, type LightSpec } from '../diorama-light'
import { TERRAIN_SOURCE_ID } from '../map-config'

export type LabelMode = 'symbol' | 'dom' | 'sprite'

export type Register = {
  key: string
  /** What it is called in the switcher, and in the answer. */
  name: string
  /** The position it takes, in one line. This is the thing being judged. */
  claim: string
  /** A fresh style. Never mutates the base — the switcher reloads, but the JSON is a module. */
  style: (base: StyleSpecification) => StyleSpecification
  /** Terrain exaggeration. A register that shades its ground can afford less of it. */
  exaggeration: number
  light: LightSpec
  labels: LabelMode
  /** Class on `<html>`; drives `chrome.css`. */
  chrome: string
}

// ---------------------------------------------------------------------------
// Style helpers. Each returns a new style; the base JSON is never touched.
// ---------------------------------------------------------------------------

const clone = (style: StyleSpecification): StyleSpecification =>
  structuredClone(style)

const ROAD_PREFIXES = [
  'tunnel_',
  'aeroway-',
  'road_',
  'highway_',
  'railway',
] as const
const LABEL_PREFIXES = ['label_', 'water_name_', 'waterway_line_label'] as const

const isRoad = (id: string) => ROAD_PREFIXES.some((p) => id.startsWith(p))
const isLabel = (id: string) =>
  id === 'airport' || LABEL_PREFIXES.some((p) => id.startsWith(p))
const isBoundary = (id: string) => id.startsWith('boundary')

/** Drop every layer whose id the predicate accepts. */
const drop = (
  style: StyleSpecification,
  gone: (id: string) => boolean,
): StyleSpecification => ({
  ...style,
  layers: style.layers.filter((layer) => !gone(layer.id)),
})

/** Merge paint properties into named layers, leaving anything unnamed alone. */
const repaint = (
  style: StyleSpecification,
  patch: Record<string, Record<string, unknown>>,
): StyleSpecification => ({
  ...style,
  layers: style.layers.map((layer) =>
    patch[layer.id]
      ? ({
          ...layer,
          paint: {
            ...('paint' in layer ? layer.paint : {}),
            ...patch[layer.id],
          },
        } as LayerSpecification)
      : layer,
  ),
})

/** Repaint every road-ish line at once, since a register treats them as one decision. */
const roadsTo = (
  style: StyleSpecification,
  colour: string,
): StyleSpecification => ({
  ...style,
  layers: style.layers.map((layer) =>
    isRoad(layer.id) && (layer.type === 'line' || layer.type === 'fill')
      ? ({
          ...layer,
          paint: {
            ...('paint' in layer ? layer.paint : {}),
            [layer.type === 'line' ? 'line-color' : 'fill-color']: colour,
          },
        } as LayerSpecification)
      : layer,
  ),
})

// ---------------------------------------------------------------------------
// A — Chart
// ---------------------------------------------------------------------------

/**
 * The ground is not shaded, on purpose. #7 showed Koh Kradan's 83 m of real relief reading as a flat
 * silhouette — this register says that is fine, and answers the coastline problem underneath it with
 * **value contrast** instead: warm paper land against flat ink water, so the island is carried by the
 * edge rather than by any hill inside it. Roads stay as hairlines because an instrument is allowed to
 * show its workings, and the place labels stay in the map plane where a chart puts them.
 */
const CHART: Register = {
  key: 'A',
  name: 'Chart',
  claim: 'Contrast carries the coast; geometry carries the relief.',
  exaggeration: 1.5,
  labels: 'symbol',
  chrome: 'chrome-chart',
  light: {
    sun: { color: 0xfffdf7, intensity: 2.6, position: [-0.5, 1.3, -0.6] },
    sky: { color: 0xd6e2ec, ground: 0xded5c4, intensity: 1.75 },
    shadowOpacity: 0.22,
  },
  style: (base) =>
    repaint(roadsTo(clone(base), '#e2dbcc'), {
      background: { 'background-color': '#f4efe6' },
      water: { 'fill-color': '#8ba6b8' },
      waterway: { 'line-color': '#8ba6b8' },
      park: { 'fill-color': '#eae7d9' },
      landcover_wood: { 'fill-color': '#e4e5d5' },
      landuse_residential: { 'fill-color': '#efe9dd' },
      building: { 'fill-color': '#e7e0d1' },
      'building-3d': { 'fill-extrusion-color': '#e7e0d1' },
      label_other: { 'text-color': '#5b564b', 'text-halo-color': '#f4efe6' },
      label_village: { 'text-color': '#403c34', 'text-halo-color': '#f4efe6' },
      label_town: { 'text-color': '#403c34', 'text-halo-color': '#f4efe6' },
      label_city: { 'text-color': '#2f2c26', 'text-halo-color': '#f4efe6' },
      label_city_capital: {
        'text-color': '#2f2c26',
        'text-halo-color': '#f4efe6',
      },
      water_name_point_label: { 'text-color': '#4a6478' },
      water_name_line_label: { 'text-color': '#4a6478' },
    }),
}

// ---------------------------------------------------------------------------
// B — Relief
// ---------------------------------------------------------------------------

/**
 * The DEM is already there and already correct — #7 measured 83 m of it — so this register spends it.
 * A `hillshade` over the same Terrarium source does the work the models cannot do at island zoom,
 * which frees the palette to go toy (sand, teal, moss) without the coast dissolving. Roads go
 * entirely: they are the least toy thing on the map, and shading needs the ground uncluttered to
 * read. Labels leave the map plane for DOM pills, which is also the only mechanism here that cannot
 * lose to the 3D layer.
 */
const RELIEF: Register = {
  key: 'B',
  name: 'Relief',
  claim:
    'The DEM is already paid for. Shade the ground and let the palette go toy.',
  exaggeration: 2,
  labels: 'dom',
  chrome: 'chrome-panel',
  light: {
    sun: { color: 0xfff4e2, intensity: 2.9, position: [-0.55, 1.15, -0.7] },
    sky: { color: 0xbfd8f0, ground: 0xd9c3a1, intensity: 1.6 },
    shadowOpacity: 0.32,
  },
  style: (base) =>
    repaint(
      drop(clone(base), (id) => isRoad(id) || isBoundary(id) || isLabel(id)),
      {
        background: { 'background-color': '#e8ddc4' },
        water: { 'fill-color': '#7fc0c4' },
        waterway: { 'line-color': '#7fc0c4' },
        park: { 'fill-color': '#c6d6b0' },
        landcover_wood: { 'fill-color': '#b7cba4' },
        landuse_residential: { 'fill-color': '#e3d7bd' },
        building: { 'fill-color': '#ded2bc' },
        'building-3d': { 'fill-extrusion-color': '#ded2bc' },
      },
    ),
}

/**
 * The hillshade cannot live in the style JSON: it reads the terrain source, and that source is added
 * on `load`, so a style that referenced it up front would be referencing a source that is not there
 * yet. It goes in above the land fills and below the waterway, so land is shaded and the water sits
 * flat on top of it.
 */
export const HILLSHADE: LayerSpecification = {
  id: 'terrain-hillshade',
  type: 'hillshade',
  source: TERRAIN_SOURCE_ID,
  /**
   * **Not optional, and the value is measured.** The Terrarium DEM's deepest real tile is z15
   * (`TERRAIN_SOURCE.maxzoom`), and MapLibre overzooms a `hillshade` past that into large soft
   * blobs — at z18.9 the sea off Ao Niang fills with them and the register reads broken. Capping the
   * *layer* is what fixes it; ramping `hillshade-exaggeration` down with a zoom expression does
   * **not** — the property accepts the expression and the artefacts stay exactly as they were.
   *
   * 16 rather than 15 because one level of overzoom is still clean, and the terrain itself keeps
   * shading the models above it regardless — the hillshade is only ever the wide-zoom half.
   */
  maxzoom: 16,
  paint: {
    'hillshade-shadow-color': '#8d7f61',
    'hillshade-highlight-color': '#fff6e4',
    'hillshade-accent-color': '#a08d68',
    'hillshade-exaggeration': 0.45,
  },
}

// ---------------------------------------------------------------------------
// C — Cutout
// ---------------------------------------------------------------------------

/**
 * The Diorama as a thing someone built out of card and felt on a table. Everything the basemap knows
 * that a physical model would not know is cut — roads, boundaries, labels, the 2D building fill —
 * leaving four blocks of flat colour and a hard coastline. Relief comes back through the **light**
 * rather than through a texture: the sun drops to a raking angle so the models throw long shadows and
 * the ground reads by where those shadows fall. Labels stand in the world as billboards, so they are
 * objects on the table too, and are occluded like everything else.
 */
const CUTOUT: Register = {
  key: 'C',
  name: 'Cutout',
  claim: 'A model on a table. Light rakes across it; nothing on it is printed.',
  exaggeration: 1.5,
  labels: 'sprite',
  chrome: 'chrome-float',
  light: {
    sun: { color: 0xfff0d8, intensity: 3.2, position: [-0.85, 0.42, -0.5] },
    sky: { color: 0xc9d9e4, ground: 0xcfc0a4, intensity: 1.1 },
    shadowOpacity: 0.42,
  },
  style: (base) =>
    repaint(
      drop(
        clone(base),
        (id) =>
          isRoad(id) ||
          isBoundary(id) ||
          isLabel(id) ||
          id === 'building' ||
          id === 'waterway' ||
          id.startsWith('landcover_ice') ||
          id.startsWith('landcover_glacier'),
      ),
      {
        background: { 'background-color': '#efe7d5' },
        water: { 'fill-color': '#6f8f94' },
        park: { 'fill-color': '#b3c197' },
        landcover_wood: { 'fill-color': '#9fb188' },
        landuse_residential: { 'fill-color': '#e9e0cb' },
        'building-3d': { 'fill-extrusion-color': '#e0d6c2' },
      },
    ),
}

// ---------------------------------------------------------------------------

export const REGISTERS = [CHART, RELIEF, CUTOUT] as const

/** What the map draws with no `?variant=` — #7's light on the unstyled fork, i.e. today. */
export const TODAY: Register = {
  key: 'today',
  name: 'Today (no register)',
  claim: 'The working fork, unstyled. The thing all three are arguing with.',
  exaggeration: 1.5,
  labels: 'symbol',
  chrome: 'chrome-chart',
  light: DIORAMA_LIGHT,
  style: (base) => base,
}

export const currentRegister = (): Register => {
  const asked = new URLSearchParams(window.location.search).get('variant')
  return REGISTERS.find((r) => r.key === asked) ?? TODAY
}

/** The hillshade is B's alone; every other register leaves the ground unshaded on purpose. */
export const applyRegisterOnLoad = (map: MapLibreMap, register: Register) => {
  if (register.key !== 'B') return
  map.addLayer(HILLSHADE, 'waterway')
}
