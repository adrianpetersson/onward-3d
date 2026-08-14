import type { FeatureCollection } from 'geojson'
import type {
  DataDrivenPropertyValueSpecification,
  LineLayerSpecification,
} from 'maplibre-gl'

import type { Coord, Mode, Place, Stop, Trip } from '../itinerary/model'
import { legsOf } from '../itinerary/derive'

/**
 * The line the Diorama draws for a Leg.
 *
 * A Path is "a bird's path between two Stops, not a routed road or rail alignment" (`CONTEXT.md`),
 * which settles more than it sounds like: the line between two ends is a **great circle**, not a
 * straight line in whatever projection happens to be on. Copenhagen → Bangkok is the case that
 * proves it. The real route arcs north over the Kazakh steppe — its midpoint is 43.0° N, 70.9° E —
 * while the straight mercator line dives south over Iran, and at 65.8° E the two are **1,432 km
 * apart** (45.9° N against 33.0° N). That is not a subtlety; it is wrong to anyone who has watched a
 * seat-back map.
 *
 * ## A Path is a MapLibre line layer, and never three.js
 *
 * #8 built the alternative and measured it. Two things come free from a `line` layer and neither
 * survives the move into the model layer: the line **drapes onto the terrain**, so it follows a
 * hillside instead of cutting through it; and a line's width is already a **screen-space** property,
 * which is the only thing a line's width can sensibly be — and the one property #20's size law
 * deliberately says nothing about.
 *
 * The thing three.js would have bought is **altitude** — a flight bowing up out of the sea. It does
 * not survive being looked at, because the trip view is the only camera that frames a long-haul and
 * it is pitch 0 by design. **Looking straight down, altitude buys no bow.** A Path lifted to an
 * 864 km apex keeps both ends pinned to the ground and only slides its middle **~25 px radially away
 * from the centre of the screen**, under the perspective divide — `docs/paths/a-trip-surface.png`
 * against `docs/paths/c-trip-arced.png`. So the lift costs positional truth and returns no arc: the
 * curve that is actually visible on that camera is the great circle, and it is in both. What reads
 * as "this one is a flight" is the **dash**, which costs nothing.
 *
 * Two consequences worth keeping: a Path is therefore **outside the model layer entirely**, and the
 * globe (#14) is the one camera where an arc would have paid — worth re-opening only if the globe
 * ships and looks poor without it.
 */

const EARTH_RADIUS_M = 6371008.8

const toRad = (deg: number) => (deg * Math.PI) / 180
const toDeg = (rad: number) => (rad * 180) / Math.PI

/** How the map treats a Leg whose Mode is not known yet. `Leg.mode` is nullable on purpose (#10). */
export type DrawnMode = Mode | 'unknown'

export const drawnModeOf = (mode: Mode | null): DrawnMode => mode ?? 'unknown'

export function greatCircleDistanceM(from: Coord, to: Coord): number {
  const φ1 = toRad(from.lat)
  const φ2 = toRad(to.lat)
  const Δφ = toRad(to.lat - from.lat)
  const Δλ = toRad(to.lng - from.lng)

  const a =
    Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2

  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(a)))
}

/**
 * A point a fraction `f` along the great circle between two ends.
 *
 * Spherical interpolation, not a lerp of two lng/lat pairs: averaging coordinates gives a point that
 * is not on the route at all, and on Copenhagen → Bangkok it misses by 1,544 km.
 */
export function interpolate(from: Coord, to: Coord, f: number): Coord {
  const φ1 = toRad(from.lat)
  const λ1 = toRad(from.lng)
  const φ2 = toRad(to.lat)
  const λ2 = toRad(to.lng)

  const δ = greatCircleDistanceM(from, to) / EARTH_RADIUS_M

  // Coincident ends: both sines below go to zero and the ratios are 0/0.
  if (δ < 1e-12) return { lng: from.lng, lat: from.lat }

  const a = Math.sin((1 - f) * δ) / Math.sin(δ)
  const b = Math.sin(f * δ) / Math.sin(δ)

  const x = a * Math.cos(φ1) * Math.cos(λ1) + b * Math.cos(φ2) * Math.cos(λ2)
  const y = a * Math.cos(φ1) * Math.sin(λ1) + b * Math.cos(φ2) * Math.sin(λ2)
  const z = a * Math.sin(φ1) + b * Math.sin(φ2)

  return {
    lng: toDeg(Math.atan2(y, x)),
    lat: toDeg(Math.atan2(z, Math.hypot(x, y))),
  }
}

/** Initial bearing in degrees clockwise from north — the compass heading a Vehicle here would take. */
export function bearing(from: Coord, to: Coord): number {
  const φ1 = toRad(from.lat)
  const φ2 = toRad(to.lat)
  const Δλ = toRad(to.lng - from.lng)

  const y = Math.sin(Δλ) * Math.cos(φ2)
  const x =
    Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ)

  return (toDeg(Math.atan2(y, x)) + 360) % 360
}

/** One vertex per this many metres: enough that a great circle reads as a curve rather than a chord. */
const METRES_PER_SEGMENT = 40_000
const MIN_SEGMENTS = 2
const MAX_SEGMENTS = 192

/**
 * Keeps longitudes running continuously rather than wrapping at the antimeridian.
 *
 * A `LineString` whose longitudes jump +179 → −179 is drawn as a line all the way back across the
 * world. Unwrapping stops that, and costs nothing on every Leg that goes nowhere near ±180.
 *
 * The consequence is that **`densify` deliberately emits longitudes outside [−180, 180]**, which the
 * line layer wants and an *anchor* cannot have — see `wrapLng` in `vehicle.ts`.
 */
const unwrapped = (lng: number, previous: number): number =>
  lng - 360 * Math.round((lng - previous) / 360)

/**
 * The vertices of a Path through an ordered chain of ends — departure, the Leg's Vias, arrival.
 *
 * Each sub-segment is its own great circle, so a Via genuinely bends the Path rather than being a
 * label on a straight line. That is the whole of what a Via is for: "a named point a Leg passes
 * through without staying… carries a coordinate so the Path bends correctly through it".
 */
export function densify(ends: readonly Coord[]): Coord[] {
  const points: Coord[] = []

  for (let leg = 0; leg < ends.length - 1; leg++) {
    const from = ends[leg]
    const to = ends[leg + 1]

    const segments = Math.min(
      MAX_SEGMENTS,
      Math.max(
        MIN_SEGMENTS,
        Math.ceil(greatCircleDistanceM(from, to) / METRES_PER_SEGMENT),
      ),
    )

    // Skip the join vertex on every sub-segment after the first: it is the previous one's last.
    for (let i = leg === 0 ? 0 : 1; i <= segments; i++) {
      const point = interpolate(from, to, i / segments)
      const previous = points.at(-1)?.lng

      points.push({
        lng:
          previous === undefined ? point.lng : unwrapped(point.lng, previous),
        lat: point.lat,
      })
    }
  }

  return points
}

/**
 * The coordinate an end of a Leg actually sits at, or `null` where it has not been placed.
 *
 * A Stop carries its coordinate on `.coord`; an Origin or a Via *is* one. **`{ lng: 0, lat: 0 }` is
 * the not-yet-placed sentinel the whole app reads** — the same test `StopCard` and `OriginRow` use
 * before they will show a coordinate — so an end still sitting on it is unresolved rather than a
 * place in the Gulf of Guinea. `newStop()` creates every Stop there, and the sidebar writes an
 * Origin as `{ name, lng: 0, lat: 0 }` the moment a name is typed without a search result picked,
 * so this is the ordinary state of a half-built Trip and not an edge case.
 */
const coordOf = (end: Stop | Place | null): Coord | null => {
  if (!end) return null

  const coord = 'coord' in end ? end.coord : { lng: end.lng, lat: end.lat }
  return coord.lng === 0 && coord.lat === 0 ? null : coord
}

/** One Leg, resolved into something drawable: which Mode to ink it with, and the line itself. */
export type DrawnPath = {
  /** Stable across a redraw: the arriving Stop's id, or `return-N` for the Leg that arrives nowhere. */
  id: string
  mode: DrawnMode
  points: Coord[]
  /** Great-circle metres end to end, Vias included — what the Vehicle's own law measures against. */
  lengthM: number
}

/**
 * Every Path the Itinerary draws, in order.
 *
 * A Leg with either end **unplaced** is not drawn at all rather than drawn to nowhere. That means
 * `null` *and* the `{ lng: 0, lat: 0 }` sentinel above: an Origin is null until it has been searched
 * for, but the sidebar writes the sentinel as soon as a name is typed, and a Stop is created on it.
 * Drawing those would run an 11,141 km Path from the Gulf of Guinea to Bangkok with an airliner
 * standing on it — and half a line reads as a bug where a missing one reads as unfinished.
 *
 * A Leg with no *Mode* is still drawn — the movement is real even when how it is made is not yet
 * known — in the neutral ink `unknown` carries.
 */
export function pathsOf(trip: Trip): DrawnPath[] {
  return legsOf(trip).flatMap((resolved, index): DrawnPath[] => {
    const from = coordOf(resolved.from)

    // The return Leg arrives at no Stop; it goes home, which is the Origin it left from. Keyed on
    // whether a Stop is *there* rather than on whether it resolved — `?? coordOf(trip.origin)` reads
    // the same and is wrong, because it sends the Leg into an unplaced Stop home to the Origin
    // instead of dropping it.
    const to = resolved.to ? coordOf(resolved.to) : coordOf(trip.origin)
    if (!from || !to) return []

    // Dropped rather than asserted: a Via is a Place like any other and may be unplaced, and
    // splicing a null into the chain would put NaN through every vertex downstream of it.
    const via = resolved.leg.via
      .map((place) => coordOf(place))
      .filter((coord): coord is Coord => coord !== null)

    const ends = [from, ...via, to]

    return [
      {
        id: resolved.to?.id ?? `return-${index}`,
        mode: drawnModeOf(resolved.leg.mode),
        points: densify(ends),
        lengthM: ends
          .slice(1)
          .reduce(
            (total, end, i) => total + greatCircleDistanceM(ends[i], end),
            0,
          ),
      },
    ]
  })
}

/**
 * A colour and a dash per Mode, so a Leg says how it is travelled without a legend.
 *
 * Both are load-bearing and they carry at different zooms. The **colour** is what separates a ferry
 * from a boat when the whole island chain is a couple of hundred pixels of coast; the **dash** is
 * what survives a Path being one pixel wide on the trip view, where the Vehicle standing on it is
 * far too small to read and the coral dashed line over Siberia is instantly a flight.
 *
 * Dash lengths are in multiples of the line width, which is what MapLibre measures them in. Chosen
 * against #11's palette — sand `#e8ddc4`, teal `#7fc0c4` and moss `#b7cba4` — so none of them
 * disappears into the ground or the sea.
 */
export const MODE_STYLE: Record<
  DrawnMode,
  { ink: string; dash: readonly number[] }
> = {
  flight: { ink: '#d9694a', dash: [2, 1.4] },
  train: { ink: '#7a5c8e', dash: [3, 1, 0.6, 1] },
  ferry: { ink: '#2f7f86', dash: [4, 1.6] },
  boat: { ink: '#46a0a6', dash: [1.6, 1.4] },
  bus: { ink: '#c0883a', dash: [2.4, 1.2] },
  van: { ink: '#a86b2d', dash: [1, 1.2] },
  /** Not a Mode: a Leg that has one and has not been told which. Muted, and finely dotted. */
  unknown: { ink: '#9a9086', dash: [0.6, 1.4] },
}

export const DRAWN_MODES = Object.keys(MODE_STYLE) as DrawnMode[]

export const PATH_WIDTH_PX = 3

/**
 * One source and one layer for every Path, whatever its Mode.
 *
 * Worth stating because the obvious alternative — a layer per Mode — is what this started as, on the
 * belief that `line-dasharray` could not be data-driven in MapLibre. **It can**: 6.3.0 declares it a
 * `CrossFadedDataDrivenProperty`, and four Modes with four different dashes and four different inks
 * render correctly from a single layer. So the Mode lives on the feature, both paint properties
 * `match` on it, and there is one thing to add to the style instead of seven.
 */
export const PATH_SOURCE_ID = 'paths'
export const PATH_LAYER_ID = 'paths'

/**
 * Where the Paths go in the layer order: above every land and water fill, below the place labels.
 *
 * Under the labels deliberately — #11 kept them because "a shaded island with no names tells you
 * what you are looking at but not where it is", and a Path drawn over the name of the island it
 * arrives at takes that back.
 */
export const PATH_BEFORE = 'airport'

/** `match` on the feature's Mode, with the neutral `unknown` styling as the fallback branch. */
const byMode = <T>(
  of: (mode: DrawnMode) => T,
): DataDrivenPropertyValueSpecification<T> =>
  [
    'match',
    ['get', 'mode'],
    ...DRAWN_MODES.filter((mode) => mode !== 'unknown').flatMap((mode) => [
      mode,
      of(mode),
    ]),
    of('unknown'),
  ] as unknown as DataDrivenPropertyValueSpecification<T>

export const pathLayer = (): LineLayerSpecification => ({
  id: PATH_LAYER_ID,
  type: 'line',
  source: PATH_SOURCE_ID,
  layout: { 'line-cap': 'butt', 'line-join': 'round' },
  paint: {
    'line-width': PATH_WIDTH_PX,
    'line-color': byMode((mode) => MODE_STYLE[mode].ink),
    // `literal` because a bare array inside a `match` branch would be read as another expression.
    'line-dasharray': byMode(
      (mode) => ['literal', [...MODE_STYLE[mode].dash]] as unknown as number[],
    ),
  },
})

/** Every Path as one feature collection, each feature carrying the Mode both paint properties read. */
export const pathData = (paths: readonly DrawnPath[]): FeatureCollection => ({
  type: 'FeatureCollection',
  features: paths.map((path) => ({
    type: 'Feature',
    id: path.id,
    properties: { id: path.id, mode: path.mode },
    geometry: {
      type: 'LineString',
      coordinates: path.points.map(({ lng, lat }) => [lng, lat]),
    },
  })),
})
