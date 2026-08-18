/**
 * THROWAWAY — the prototype for #23, "A Path with volume".
 *
 * Six ways to draw a Path, switchable at runtime with `?variant=`. Nothing here is meant to ship;
 * the winner gets rewritten into `path.ts` properly and the rest goes no further than the
 * `prototype/23-path-volume` branch. Follows the `?markers=N` precedent in `use-diorama.ts`: a
 * measurement affordance lives in the URL, so it can be repeated rather than reverted.
 *
 * ## The question this is built to answer
 *
 * #23 says the wanted look is "a chunky green band with 3D space in it", and that there are only two
 * channels — colour and dash — with each wanted change spending one:
 *
 * - going green spends **colour** (six Modes to one ink)
 * - going extruded spends **dash** (`line-dasharray` does not exist on a `fill-extrusion`)
 *
 * So the prototype's real job is to find the third channel, or to establish that one change has to
 * be given up.
 *
 * **The premise turns out to be wrong, and that is the finding.** "Green" is not one ink, it is a
 * hue family, and the family is wide enough to hold every Mode with *better* separation than the
 * rainbow that ships today — see `GREEN_RAMP`. So going green need not spend the colour channel at
 * all, and the third channel was never needed.
 */

import type {
  DataDrivenPropertyValueSpecification,
  FillExtrusionLayerSpecification,
  LineLayerSpecification,
} from 'maplibre-gl'
import type { FeatureCollection } from 'geojson'

import type { Coord } from '../itinerary/model'
import {
  DRAWN_MODES,
  MODE_STYLE,
  PATH_CASING_INK,
  PATH_CASING_PX,
  PATH_SOURCE_ID,
  PATH_WIDTH_PX,
  bearing,
  type DrawnMode,
  type DrawnPath,
} from './path'

/** Every variant's key. `shipped` is the control — exactly what is on `main`. */
export type VariantKey =
  | 'shipped'
  | 'wall'
  | 'green-bed'
  | 'one-green'
  | 'green-ramp'
  | 'green-solid'
  | 'extruded'

export const VARIANT_KEYS: VariantKey[] = [
  'shipped',
  'wall',
  'green-bed',
  'one-green',
  'green-ramp',
  'green-solid',
  'extruded',
]

// ---------------------------------------------------------------------------------------------
// The inks
// ---------------------------------------------------------------------------------------------

/**
 * The wall — the shade the band's side is painted in, one step darker than the casing.
 *
 * Three tones is what makes a band read as an object rather than as ink: the Mode's own core is the
 * lit top face, the casing is the edge, and this is the side catching no light.
 */
const WALL_INK = '#1b2f2f'

/** The same three tones, moved into green. `#22402c` separates from every ground better than
 * `#2f4f4f` does (ΔE 52.5 against water, where the neutral manages 43.4), so the green bed costs
 * nothing in legibility. */
const GREEN_CASING_INK = '#22402c'
const GREEN_WALL_INK = '#13251a'

/** The literal reading of "going green": one ink for every Mode, dash left as the only separator. */
const ONE_GREEN = '#3f8a59'

/**
 * Seven greens, one hue family, every Mode still its own.
 *
 * Chosen inside #11's register — matte, saturation 0.25–0.55, lightness 0.20–0.50, which is the
 * envelope the Diorama's own fills sit in — and then checked two ways:
 *
 * - **against the ground**: the worst pairing is `boat` over water at **ΔE 25.6**, which clears the
 *   ΔE 25 floor #22 established, before the casing is counted at all.
 * - **against each other**: the closest pair is `ferry`/`boat` at **ΔE 19.2**, against the shipped
 *   palette's closest pair of **12.5** (`ferry`/`boat` again). One hue family separates the Modes
 *   *better* than six hues do, because the shipped palette spends its range on hue while colliding
 *   in lightness, and a green ramp separates on lightness and saturation — which is where the
 *   Diorama's pale grounds leave the most room.
 *
 * Grouped so the family means something: sea Modes lean green-cyan, road Modes lean olive, rail sits
 * mid-green and air is the lightest thing on the map.
 */
const GREEN_RAMP: Record<DrawnMode, string> = {
  flight: '#8fc74f',
  train: '#2f7d3a',
  ferry: '#2f8f78',
  boat: '#57c2a0',
  bus: '#6f8f2a',
  van: '#46601f',
  /** Still not a Mode. Desaturated inside the family, so "undecided" reads as drained rather than
   * as a seventh Mode. */
  unknown: '#6b7d68',
}

// ---------------------------------------------------------------------------------------------
// Layer ids
// ---------------------------------------------------------------------------------------------

export const PATH_WALL_LAYER_ID = 'paths-wall'
export const PATH_EXTRUSION_LAYER_ID = 'paths-extrusion'
export const PATH_EXTRUSION_SOURCE_ID = 'paths-extruded'

/** `match` on the feature's Mode, with `unknown` as the fallback branch — copied from `path.ts`
 * rather than exported from it, because this file is throwaway and that one is not. */
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

const dash = byMode(
  (mode) => ['literal', [...MODE_STYLE[mode].dash]] as unknown as number[],
)

/**
 * How far down-screen the wall is pushed, in pixels.
 *
 * `line-translate-anchor: 'viewport'` rather than the default `'map'`, and that is the whole reason
 * this works: `line-offset` and a map-anchored translate both move the line *relative to its own
 * direction*, so the wall would swap sides as a great circle sweeps through its bearing — a Path
 * would be lit from the left at one end and the right at the other. Anchored to the viewport, the
 * shade always falls the same way down the screen, which is what a single light source means.
 */
const WALL_DROP_PX = 3

const wallLayer = (ink: string): LineLayerSpecification => ({
  id: PATH_WALL_LAYER_ID,
  type: 'line',
  source: PATH_SOURCE_ID,
  layout: { 'line-cap': 'butt', 'line-join': 'round' },
  paint: {
    'line-width': PATH_CASING_PX,
    'line-color': ink,
    'line-translate': [0, WALL_DROP_PX],
    'line-translate-anchor': 'viewport',
  },
})

const casingLayer = (
  ink: string,
  id = 'paths-casing',
): LineLayerSpecification => ({
  id,
  type: 'line',
  source: PATH_SOURCE_ID,
  layout: { 'line-cap': 'butt', 'line-join': 'round' },
  paint: { 'line-width': PATH_CASING_PX, 'line-color': ink },
})

/**
 * The core — the lit top face. `ink` is a `match` on the Mode, or a single colour.
 *
 * `solid` drops the dash entirely. Worth noting what that *buys*, because the dash was not only a
 * cost: #22's hardest case is Koh Kradan → Koh Mook at **5.1 px long**, carrying 0.6 of one dash
 * cycle, so whether it drew at all was a matter of phase. A solid core is 5.1 px of ink unconditionally
 * — the problem ADR 0011 solved with a casing stops existing rather than being covered up.
 *
 * What it costs is the Mode. #8 established colour and dash as the two channels; a solid single-ink
 * band spends both, and the Mode then lives only on the Vehicle standing on the Path — which #8
 * deliberately culls at region and trip zoom, where a Leg is smallest.
 */
const coreLayer = (
  ink: DataDrivenPropertyValueSpecification<string> | string,
  solid = false,
): LineLayerSpecification => ({
  id: 'paths',
  type: 'line',
  source: PATH_SOURCE_ID,
  layout: { 'line-cap': 'butt', 'line-join': 'round' },
  paint: {
    'line-width': PATH_WIDTH_PX,
    'line-color': ink,
    ...(solid ? {} : { 'line-dasharray': dash }),
  },
})

// ---------------------------------------------------------------------------------------------
// The extrusion route — buffer the line into a polygon and extrude it
// ---------------------------------------------------------------------------------------------

const EARTH_RADIUS_M = 6371008.8
const toRad = (d: number) => (d * Math.PI) / 180
const toDeg = (r: number) => (r * 180) / Math.PI

/** The point `metres` away from `from` on the given compass bearing. */
const destination = (
  from: Coord,
  bearingDeg: number,
  metres: number,
): Coord => {
  const δ = metres / EARTH_RADIUS_M
  const θ = toRad(bearingDeg)
  const φ1 = toRad(from.lat)
  const λ1 = toRad(from.lng)

  const φ2 = Math.asin(
    Math.sin(φ1) * Math.cos(δ) + Math.cos(φ1) * Math.sin(δ) * Math.cos(θ),
  )
  const λ2 =
    λ1 +
    Math.atan2(
      Math.sin(θ) * Math.sin(δ) * Math.cos(φ1),
      Math.cos(δ) - Math.sin(φ1) * Math.sin(φ2),
    )

  return { lng: toDeg(λ2), lat: toDeg(φ2) }
}

/**
 * A Path's vertices buffered out to a ribbon polygon, `widthM` wide.
 *
 * No join or cap handling: at one vertex per 40 km the turn between segments is a fraction of a
 * degree, so a mitre would buy nothing visible. It is a prototype — the point is to see the
 * extrusion, not to ship a buffer.
 */
const ribbon = (points: readonly Coord[], widthM: number): Coord[] => {
  const half = widthM / 2

  const normalAt = (i: number): number => {
    const back = i > 0 ? bearing(points[i - 1], points[i]) : null
    const forward =
      i < points.length - 1 ? bearing(points[i], points[i + 1]) : null

    if (back === null) return forward! + 90
    if (forward === null) return back + 90

    // Average the two headings through the shortest turn, or a Leg that crosses due north comes out
    // with its normal pointing backwards.
    const turn = ((forward - back + 540) % 360) - 180
    return back + turn / 2 + 90
  }

  const left = points.map((p, i) => destination(p, normalAt(i), half))
  const right = points.map((p, i) => destination(p, normalAt(i) + 180, half))

  return [...left, ...right.reverse(), left[0]]
}

/**
 * Metres per screen pixel at a given latitude and zoom — how the extrusion's width in **metres** is
 * converted from the width in pixels a line layer would simply have been given.
 *
 * **`zoom + 1`, and that is a trap worth recording.** The formula everyone quotes,
 * `156543.03392 * cos(lat) / 2 ** zoom`, is for **256 px** tiles. MapLibre's zoom is defined on
 * **512 px** tiles, so it is one power of two coarser and the familiar version comes out exactly
 * **2× too large**. Built with the 256 px formula, a band asked to be 7 px measured **14.09 px** on
 * the real trip at z8.6 — close enough to look like a taste problem rather than an arithmetic one,
 * which is how it survived the first sweep.
 */
export const metresPerPixel = (lat: number, zoom: number): number =>
  (156543.03392 * Math.cos(toRad(lat))) / 2 ** (zoom + 1)

/**
 * The extruded Paths as polygons, sized for one camera.
 *
 * **This is the cost of the extrusion route, and it is not a paint property.** A line layer's width
 * is screen-space, so one number covers every zoom (ADR 0011 measured that 7/4 reads from the globe
 * to street level). An extrusion's width is baked into the geometry in metres, so holding a constant
 * screen width means **rebuilding every polygon whenever the zoom changes** — and the real trip
 * spans 6,000× in metres-per-pixel between its load frame and street zoom on Koh Kradan.
 */
export const extrudedPathData = (
  paths: readonly DrawnPath[],
  lat: number,
  zoom: number,
): FeatureCollection => {
  const mpp = metresPerPixel(lat, zoom)
  const widthM = PATH_CASING_PX * mpp

  /*
   * `?h=<metres>` pins the band's height instead of scaling it with the width, and it exists to
   * settle one question: whether the extrusion route's missing Legs are missing *because* the band is
   * kilometres tall.
   *
   * Holding a constant *screen* height means a height in metres that scales with the zoom, and on the
   * real trip's load frame that is a band **6,556 m tall** — a wall higher than the Alps lying across
   * the Andaman. Holding a *true* height instead (a toy track is a few metres) makes the volume
   * invisible everywhere above street zoom. That vice is the finding; this parameter is how both
   * horns get measured rather than argued.
   */
  const pinned = Number(
    new URLSearchParams(window.location.search).get('h') ?? Number.NaN,
  )

  return {
    type: 'FeatureCollection',
    features: paths.map((path) => ({
      type: 'Feature',
      id: path.id,
      properties: {
        id: path.id,
        mode: path.mode,
        // Squat rather than square: a band is a track, not a wall. Height is in metres too, so it
        // has exactly the same problem the width does.
        height: Number.isFinite(pinned) ? pinned : widthM * 0.6,
      },
      geometry: {
        type: 'Polygon',
        coordinates: [
          ribbon(path.points, widthM).map(({ lng, lat: y }) => [lng, y]),
        ],
      },
    })),
  }
}

/**
 * The extruded band.
 *
 * `fill-extrusion-vertical-gradient` is left on — it is the only lighting an extrusion offers, and
 * it is what puts a lit top and a shaded side on the band without a second layer. What it cannot do
 * is carry a dash: there is no `fill-extrusion-dasharray`, which is the channel this route spends.
 */
const extrusionLayer = (): FillExtrusionLayerSpecification => ({
  id: PATH_EXTRUSION_LAYER_ID,
  type: 'fill-extrusion',
  source: PATH_EXTRUSION_SOURCE_ID,
  paint: {
    'fill-extrusion-color': ONE_GREEN,
    'fill-extrusion-height': ['get', 'height'],
    'fill-extrusion-base': 0,
    'fill-extrusion-opacity': 1,
    'fill-extrusion-vertical-gradient': true,
  },
})

// ---------------------------------------------------------------------------------------------
// The registry
// ---------------------------------------------------------------------------------------------

export type Variant = {
  key: VariantKey
  /** Shown in the switcher bar. */
  name: string
  /** One line on what it spends, shown under the name. */
  spends: string
  /** Line layers in draw order — first is drawn first, so it ends up underneath. */
  lines: LineLayerSpecification[]
  /** Present only on the extrusion route, which needs its own source and a zoom listener. */
  extrusion?: FillExtrusionLayerSpecification
}

export const VARIANTS: Record<VariantKey, Variant> = {
  shipped: {
    key: 'shipped',
    name: 'Shipped — flat, cased',
    spends: 'nothing · the control, exactly what is on main',
    lines: [
      casingLayer(PATH_CASING_INK),
      coreLayer(byMode((m) => MODE_STYLE[m].ink)),
    ],
  },

  wall: {
    key: 'wall',
    name: 'Wall — volume, Mode inks kept',
    spends: 'nothing · a third line pushed down-screen is the side wall',
    lines: [
      wallLayer(WALL_INK),
      casingLayer(PATH_CASING_INK),
      coreLayer(byMode((m) => MODE_STYLE[m].ink)),
    ],
  },

  'green-bed': {
    key: 'green-bed',
    name: 'Green bed — green track, Mode on top',
    spends: 'nothing · the bed goes green, the Mode keeps its own ink and dash',
    lines: [
      wallLayer(GREEN_WALL_INK),
      casingLayer(GREEN_CASING_INK),
      coreLayer(byMode((m) => MODE_STYLE[m].ink)),
    ],
  },

  'one-green': {
    key: 'one-green',
    name: 'One green — the ticket’s own reading',
    spends:
      'the COLOUR channel · six Modes to one ink, dash left alone to carry them',
    lines: [
      wallLayer(GREEN_WALL_INK),
      casingLayer(GREEN_CASING_INK),
      coreLayer(ONE_GREEN),
    ],
  },

  'green-ramp': {
    key: 'green-ramp',
    name: 'Green ramp — one hue family, every Mode its own',
    spends:
      'nothing · green is a family, not an ink (closest pair ΔE 19.2 vs shipped 12.5)',
    lines: [
      wallLayer(GREEN_WALL_INK),
      casingLayer(GREEN_CASING_INK),
      coreLayer(byMode((m) => GREEN_RAMP[m])),
    ],
  },

  /**
   * **Adrian's ruling, 18 Aug 2026: "the dashes are ugly i want it all green in one color".**
   *
   * One green, solid, on the dark green bed and wall — so the band is one colour and its own shading,
   * and nothing else. Both channels #8 named are spent deliberately: the Mode is no longer on the
   * Path at all, and lives on the Vehicle standing on it and in the sidebar.
   */
  'green-solid': {
    key: 'green-solid',
    name: 'Green solid — one colour, no dash',
    spends: 'BOTH channels · the Mode leaves the Path entirely',
    lines: [
      wallLayer(GREEN_WALL_INK),
      casingLayer(GREEN_CASING_INK),
      coreLayer(ONE_GREEN, true),
    ],
  },

  extruded: {
    key: 'extruded',
    name: 'Extruded — real volume, no dash',
    spends: 'the DASH channel, the drape, and screen-space width',
    lines: [],
    extrusion: extrusionLayer(),
  },
}

/** The variant asked for in `?variant=`, or the control. */
export const variantFromUrl = (): Variant => {
  const asked = new URLSearchParams(window.location.search).get('variant')
  return VARIANTS[(asked ?? 'shipped') as VariantKey] ?? VARIANTS.shipped
}

/** Exposed for the measurement scripts, which want the numbers without reading the module. */
export const VARIANT_INKS = {
  WALL_INK,
  GREEN_CASING_INK,
  GREEN_WALL_INK,
  ONE_GREEN,
  GREEN_RAMP,
  PATH_CASING_INK,
  MODE_STYLE,
}
