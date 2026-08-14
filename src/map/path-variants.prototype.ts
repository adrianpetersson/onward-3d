import type { FeatureCollection } from 'geojson'
import { Group } from 'three'
import type {
  GeoJSONSource,
  LineLayerSpecification,
  Map as MapLibreMap,
} from 'maplibre-gl'

import type { Anchor } from './model-layer'
import { readSpanOf } from './model-scale'
import { loadModel } from './models/load'
import { buildStayMarker } from './stay-marker'
import type { DrawnPath } from './diorama-layer.prototype'
import {
  alongPath,
  buildPath,
  greatCircleDistanceM,
  orientationAt,
  type PathPoint,
} from './path-geometry.prototype'
import {
  standInLegs,
  STAND_IN_STOPS,
  VEHICLE_FOR,
  type StandInLeg,
  type StandInMode,
} from './stand-in-trip.prototype'

/**
 * PROTOTYPE for #8 — three structurally different answers to "how is a Path drawn".
 *
 * The question underneath all five bullets on the ticket is whether a Path lives **on the ground or
 * in the air**, because that one choice decides the rest: what draws it, whether its width is a map
 * property or a model property, where its Vehicle sits, and whether two nearly-coincident Legs can
 * be told apart at all.
 *
 * - **A — Sea level.** Every Path is a MapLibre `line` layer, draped on the terrain, great-circle
 *   densified. Vehicles stand on the ground at the midpoint. The paper-map answer.
 * - **B — Everything arcs.** Every Path is three.js geometry lifted into a dome whose apex is a
 *   fixed fraction of the Leg's own length. Vehicles ride the arc. The airline-map answer.
 * - **C — The Mode decides.** Flights arc; everything that actually touches the surface hugs it.
 *   Two mechanisms in one map, which is the thing to check — the ticket's own instinct, and the one
 *   that has to prove it does not read as two different maps stapled together.
 */

export type VariantKey = 'A' | 'B' | 'C'

/**
 * Apex height as a fraction of the Leg's own great-circle distance.
 *
 * A ratio rather than a height in metres, so the arc is the same *shape* on a 40 km boat hop and an
 * 8,600 km flight and at every zoom — see `buildPath`. 0.12 is a starting guess; `?arc=` moves it.
 */
export const DEFAULT_ARC_RATIO = 0.12

export type Variant = {
  key: VariantKey
  name: string
  blurb: string
  arcRatioFor: (mode: StandInMode, arc: number) => number
}

const SURFACE_MODES: readonly StandInMode[] = ['boat', 'ferry', 'van', 'train']

export const VARIANTS: Record<VariantKey, Variant> = {
  A: {
    key: 'A',
    name: 'Sea level',
    blurb:
      'Every Path on the ground, drawn by MapLibre. Vehicles at the midpoint.',
    arcRatioFor: () => 0,
  },
  B: {
    key: 'B',
    name: 'Everything arcs',
    blurb: 'Every Path bows into the air in three.js. Vehicles ride the arc.',
    arcRatioFor: (_mode, arc) => arc,
  },
  C: {
    key: 'C',
    name: 'The Mode decides',
    blurb: 'Flights bow; boat, ferry, van and train hug the surface.',
    arcRatioFor: (mode, arc) => (SURFACE_MODES.includes(mode) ? 0 : arc),
  },
}

/**
 * A colour per Mode, and the question of whether it is needed at all.
 *
 * The Vehicle standing on the Path already says which Mode it is, so colouring the line too may be
 * saying it twice — `?ink=one` paints every Path the same ink to see whether anything is lost. The
 * palette is #11's: these have to sit on sand `#e8ddc4`, teal `#7fc0c4` and moss `#b7cba4` without
 * any of them disappearing.
 */
export const MODE_INK: Record<StandInMode, number> = {
  flight: 0xd9694a,
  train: 0x7a5c8e,
  ferry: 0x2f7f86,
  boat: 0x46a0a6,
  van: 0xc0883a,
}

/** One ink for every Mode, for the `?ink=one` comparison. A warm near-black against the toy palette. */
export const ONE_INK = 0x3d3630

/** Dash pattern per Mode, in multiples of the line width. `null` is solid. */
export const MODE_DASH: Record<StandInMode, readonly number[] | null> = {
  flight: [2, 1.4],
  train: [3, 1, 0.6, 1],
  ferry: [4, 1.6],
  boat: [1.6, 1.4],
  van: [1, 1.2],
}

export const PATH_WIDTH_PX = 3

export type SceneOptions = {
  variant: VariantKey
  /** Apex as a fraction of the Leg's distance, before the variant decides which Modes get it. */
  arc: number
  /** Where along its Path a Vehicle sits, 0 at the departure end and 1 at the arrival end. */
  at: number
  ink: 'mode' | 'one'
}

export const DEFAULT_OPTIONS: SceneOptions = {
  variant: 'C',
  arc: DEFAULT_ARC_RATIO,
  at: 0.5,
  ink: 'mode',
}

export const inkFor = (mode: StandInMode, ink: SceneOptions['ink']): number =>
  ink === 'one' ? ONE_INK : MODE_INK[mode]

/** The same ink as a CSS hex, which is the only form a MapLibre paint property will take. */
export const inkHexFor = (
  mode: StandInMode,
  ink: SceneOptions['ink'],
): string => `#${inkFor(mode, ink).toString(16).padStart(6, '0')}`

/** A Leg's own chain of ends: departure, its Vias in order, arrival. */
const endsOf = (leg: StandInLeg) => [leg.from, ...leg.via, leg.to]

export type BuiltLeg = {
  leg: StandInLeg
  path: PathPoint[]
  lifted: boolean
  distanceM: number
}

export function buildLegs(options: SceneOptions): BuiltLeg[] {
  const variant = VARIANTS[options.variant]

  return standInLegs().map((leg) => {
    const ratio = variant.arcRatioFor(leg.mode, options.arc)
    const ends = endsOf(leg)

    return {
      leg,
      path: buildPath(ends, ratio),
      lifted: ratio > 0,
      distanceM: ends
        .slice(1)
        .reduce(
          (total, end, i) => total + greatCircleDistanceM(ends[i], end),
          0,
        ),
    }
  })
}

/**
 * The Paths this variant hands to the three.js layer — the lifted ones only.
 *
 * A Path on the surface is deliberately **not** here: it goes to MapLibre as a `line` layer instead,
 * because a surface Path wants everything MapLibre already does and three.js does not — draping onto
 * the terrain so it follows a hillside, dash patterns, and a width that is already screen-space. The
 * moment a Path leaves the ground, all three stop being available and it has to be geometry.
 */
export const liftedPaths = (
  legs: readonly BuiltLeg[],
  options: SceneOptions,
): DrawnPath[] =>
  legs
    .filter((built) => built.lifted)
    .map((built) => ({
      id: `path-${built.leg.name}`,
      points: built.path,
      colour: inkFor(built.leg.mode, options.ink),
      widthPx: PATH_WIDTH_PX,
    }))

/** The surface Paths, as one GeoJSON feature collection per Mode so each can carry its own dash. */
export const surfaceGeoJson = (
  legs: readonly BuiltLeg[],
  mode: StandInMode,
): FeatureCollection => ({
  type: 'FeatureCollection',
  features: legs
    .filter((built) => !built.lifted && built.leg.mode === mode)
    .map((built) => ({
      type: 'Feature',
      properties: { name: built.leg.name },
      geometry: {
        type: 'LineString',
        coordinates: built.path.map((point) => point.at),
      },
    })),
})

export const surfaceSourceId = (mode: StandInMode) => `proto-path-${mode}`

export const surfaceLayer = (
  mode: StandInMode,
  options: SceneOptions,
): LineLayerSpecification => {
  const dash = MODE_DASH[mode]

  return {
    id: `proto-path-${mode}`,
    type: 'line',
    source: surfaceSourceId(mode),
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: {
      'line-color': inkHexFor(mode, options.ink),
      'line-width': PATH_WIDTH_PX,
      ...(dash ? { 'line-dasharray': [...dash] } : {}),
    },
  }
}

/** Above the land fills and below the place labels, so a Path never covers a Stop's name. */
export const PATH_BEFORE = 'airport'

/**
 * A Vehicle turned to face along its Path, and standing at the right height above the ground.
 *
 * Two nested groups rather than an Euler with two terms: the climb has to be applied **inside** the
 * yaw, or a Vehicle heading east pitches north.
 */
async function buildVehicle(
  mode: StandInMode,
  path: readonly PathPoint[],
  at: number,
): Promise<{ content: Group; altitudeM: number; index: number }> {
  const { index } = alongPath(path, at)
  const { yaw, climb } = orientationAt(path, index)

  const pitching = new Group()
  pitching.add(await loadModel(VEHICLE_FOR[mode]))
  pitching.rotation.x = -climb

  const heading = new Group()
  heading.add(pitching)
  heading.rotation.y = yaw

  return { content: heading, altitudeM: path[index].altitudeM, index }
}

/**
 * Everything the layer draws: a Stay Marker at every Stop, and a Vehicle on every Leg.
 *
 * The Stay Markers are #20's and #9's, and are here only so a Path is judged against the world it
 * has to share. A Leg's **second Mode draws nothing** — `CONTEXT.md` already rules that the first is
 * the one the map draws, and the Bangkok sleeper that ends in a van is the case that tests it.
 */
export async function buildAnchors(
  legs: readonly BuiltLeg[],
  options: SceneOptions,
): Promise<Anchor[]> {
  const stays = STAND_IN_STOPS.map(async (stop): Promise<Anchor> => ({
    id: `stay-${stop.name}`,
    origin: stop.at,
    content: await buildStayMarker(),
    role: 'stay',
    read: readSpanOf('stay_guesthouse'),
  }))

  const vehicles = legs.map(async (built): Promise<Anchor> => {
    const key = VEHICLE_FOR[built.leg.mode]
    const { content, altitudeM } = await buildVehicle(
      built.leg.mode,
      built.path,
      options.at,
    )

    return {
      id: `vehicle-${built.leg.name}`,
      origin: alongPath(built.path, options.at).point.at,
      // Above the ground, which the layer resolves — 0 on a surface Path puts the Vehicle on the
      // terrain. On a lifted Path this is metres above sea level being read as metres above ground,
      // which over-lifts by the terrain height: at most ~2 km against an apex of 50 km and up.
      altitudeM,
      content,
      role: 'vehicle',
      read: readSpanOf(key),
    }
  })

  return Promise.all([...stays, ...vehicles])
}

/** The Modes that ever draw a surface Path, so sources and layers can be created once up front. */
export const ALL_MODES: readonly StandInMode[] = [
  'flight',
  'train',
  'ferry',
  'boat',
  'van',
]

export function readOptions(): SceneOptions {
  const params = new URLSearchParams(window.location.search)
  const asked = params.get('variant')?.toUpperCase()

  // `Number(null)` is 0, not NaN — so an absent parameter has to be told apart from a present zero
  // before it is parsed, or `?at=` silently means "at the departure end" instead of the default.
  const number = (key: string, fallback: number, min: number, max: number) => {
    const raw = params.get(key)
    if (raw === null) return fallback
    const value = Number(raw)
    return Number.isFinite(value) && value >= min && value <= max
      ? value
      : fallback
  }

  return {
    variant:
      asked && asked in VARIANTS
        ? (asked as VariantKey)
        : DEFAULT_OPTIONS.variant,
    arc: number('arc', DEFAULT_OPTIONS.arc, 0, 1),
    at: number('at', DEFAULT_OPTIONS.at, 0, 1),
    ink: params.get('ink') === 'one' ? 'one' : 'mode',
  }
}

/** Whether the app is running as #8's prototype at all. Absent `?variant=`, nothing here loads. */
export const prototypeRequested = (): boolean =>
  new URLSearchParams(window.location.search).has('variant')

export function mountSurfacePaths(
  map: MapLibreMap,
  legs: readonly BuiltLeg[],
  options: SceneOptions,
): void {
  for (const mode of ALL_MODES) {
    const id = surfaceSourceId(mode)
    const data = surfaceGeoJson(legs, mode)
    const existing = map.getSource<GeoJSONSource>(id)

    if (existing) {
      existing.setData(data)
      continue
    }

    map.addSource(id, { type: 'geojson', data })
    map.addLayer(surfaceLayer(mode, options), PATH_BEFORE)
  }
}
