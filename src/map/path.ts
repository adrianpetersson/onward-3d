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
 * Dash lengths are in multiples of the line width, which is what MapLibre measures them in.
 *
 * **#8 said these were "chosen against #11's palette… so none of them disappears into the ground or
 * the sea", and measuring them says otherwise for exactly one:** `boat` over water is **ΔE 14.0**,
 * against `ferry`'s 24.9 over the same water and 46.9 for the next weakest pairing anywhere on the
 * map. Teal on teal, and it is on three of the real trip's nine Legs. That is what #22 was filed
 * about, and it is **not fixed here** — the ink is untouched, because the casing below separates the
 * band from the ground without spending the colour channel #23 owns.
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

/**
 * The Path's two widths, and why there is only one number for each.
 *
 * The **core** is the Mode's own dashed ink; the **casing** is a solid line of one dark under it,
 * two pixels wider on each side. #22 measured what a 3 px uncased line was actually doing on the
 * real Itinerary and found three separate faults where it had reported one:
 *
 * 1. **`boat` over water is ΔE 14.0** (see `MODE_STYLE`). No width fixes a teal line on teal sea.
 * 2. A **solid casing carries the Leg's existence where the dash cannot.** At the app's own opening
 *    camera the nine Legs span **5.1 px to 2,406 px** — 470× in one frame — and dash length is a
 *    multiple of line width, so Koh Kradan → Koh Mook gets **0.6 of one dash cycle** and widening the
 *    line makes that *worse*, not better. A solid casing draws whatever the Leg's length is.
 * 3. Ink on ground is a two-colour problem, and the casing turns it into a one-colour problem: the
 *    band separates if **either** of its inks does, so the weakest pairing on the whole map goes from
 *    **ΔE 14.0 to ΔE 43.4** with no ink changed.
 *
 * **One number rather than a zoom ramp, and that is a measurement.** The ticket assumed width "is one
 * number per zoom rather than one number" — what reads at street zoom and what reads across the
 * Andaman being different widths. It is not: 7/4 was rendered at **z2.4 on the globe, z5.6 (the app's
 * own load frame), z9.3 over the island chain and z14.6 and z18.2 on Koh Kradan**, and reads at all
 * five. A line competes with other *screen* marks, and the Diorama's mark density barely moves with
 * zoom — #11 stripped every road, railway and aeroway, so above the coastline a Path is very nearly
 * the only line on the map, and symbol collision thins the labels to whatever fits. An interpolation
 * would have been three more numbers buying nothing.
 *
 * A wider band is #23's to argue for: this is the width at which a Leg stops being missable, not the
 * width at which a Path becomes the chunky object the Destination is after.
 */
export const PATH_WIDTH_PX = 4

/**
 * Wider than the core by 1.5 px each side. Enough to read as an edge at every zoom above, and not so
 * much that the casing becomes the band — at 7/4 the core is 57 % of the width, which is what keeps
 * the Mode's own ink the thing you see.
 */
export const PATH_CASING_PX = 7

/**
 * One dark for every Mode, deliberately — **the casing must not carry hue**.
 *
 * The obvious alternative is a per-Mode casing, a darker shade of each ink, and it was built and
 * measured before this one. It loses on both counts. Darkening compresses the palette toward the
 * shade, so `boat` and `ferry` — already the closest pair at **ΔE 12.5** and the very pair #8 said
 * colour has to separate — collapse to **6.1**; and a mid-dark tinted casing separates from the
 * ground *less* well than a flat dark one (**ΔE 34.4 against 43.4** at the weakest pairing). So the
 * neutral is both more visible and free: it leaves every Mode's ink exactly where #8 put it, which
 * is the channel #23 is owed intact.
 *
 * It is `PIN_RESOLVED_INK` — the Pin's own dark — rather than a new colour, so a Stop's marker and
 * the Legs running into it are edged with the same ink. A test pins them equal; nothing imports
 * across the two modules, because a Path and a Pin agreeing on a colour is not a dependency.
 */
export const PATH_CASING_INK = '#2f4f4f'

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
export const PATH_CASING_LAYER_ID = 'paths-casing'

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

/**
 * The dark edge under every Path. Same source, same geometry, one layer earlier.
 *
 * **Solid, and that is the decision** — not a dashed outline tracing each dash. An outline was built
 * and rejected on the picture: the real trip's dashes are ~6 px long at this width, so a 1.5 px
 * border on every side of each one is most of the mark, and the band comes out a row of dark dots
 * with the Mode's ink squeezed out of the middle. Solid, the casing fills the dash gaps instead, and
 * the Leg reads as one continuous object with a rhythm in it rather than as a dotted line.
 *
 * Filling the gaps is what pays for #22's hardest case. Koh Kradan → Koh Mook is **5.1 px long** at
 * the opening camera and carries **0.6 of a dash cycle** — less than one dash, so whether it drew at
 * all was a matter of phase. Cased, it is 5.1 px of solid ink whatever the dash does.
 *
 * No `line-opacity` and no exemption for a Mode-less Leg, which is worth saying because the obvious
 * reading of #8 is that an undecided Leg should stay faint. It should not: a Leg is **derived from
 * Stop order**, so its *existence* is certain even when its Mode is not, and the casing is what says
 * a movement happens here. The muted dotted core above still says nobody has decided how.
 *
 * `butt` caps, matching the core: round caps would overhang each end by half the width, which at the
 * trip view is ~11 km of Path the Itinerary does not contain.
 */
export const pathCasingLayer = (): LineLayerSpecification => ({
  id: PATH_CASING_LAYER_ID,
  type: 'line',
  source: PATH_SOURCE_ID,
  layout: { 'line-cap': 'butt', 'line-join': 'round' },
  paint: {
    'line-width': PATH_CASING_PX,
    'line-color': PATH_CASING_INK,
  },
})

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
