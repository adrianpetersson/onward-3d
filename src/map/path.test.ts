import type { LineString } from 'geojson'
import { describe, expect, it } from 'vitest'

import { newTrip } from '../itinerary/create'
import type { Coord, Leg, Mode, Stop, Trip } from '../itinerary/model'
import {
  bearing,
  densify,
  DRAWN_MODES,
  greatCircleDistanceM,
  interpolate,
  MODE_STYLE,
  pathData,
  pathLayer,
  pathsOf,
} from './path'

/**
 * The Path, pinned by the two things that would silently go wrong.
 *
 * A Path drawn as a straight mercator line is *nearly* right on every short Leg, so nothing on the
 * island chain would ever catch it — and then Copenhagen → Bangkok runs **1,432 km** off the route an
 * aircraft flies, diving south over Iran where the real route arcs north over the Kazakh steppe. The
 * other is a Leg with an end missing or still unplaced, which is the ordinary state of a Trip halfway
 * through being typed in.
 */

const CPH: Coord = { lng: 12.5683, lat: 55.6761 }
const BKK: Coord = { lng: 100.5018, lat: 13.7563 }
const KRADAN: Coord = { lng: 99.25546, lat: 7.30365 }

const leg = (over: Partial<Leg> = {}): Leg => ({
  mode: null,
  secondMode: null,
  depart: null,
  arrive: null,
  dayRoll: 0,
  durationMin: null,
  price: null,
  carrier: null,
  fromPlace: null,
  via: [],
  note: null,
  booking: null,
  ...over,
})

const stop = (id: string, coord: Coord, mode: Mode | null): Stop => ({
  id,
  name: id,
  coord,
  // Null throughout: a Footprint is only ever known for a Stop found by name (#18), and nothing a
  // Path does may depend on having one — which is worth having the fixtures assert by omission.
  footprint: null,
  arrival: null,
  departure: null,
  inbound: leg({ mode }),
  stays: [],
})

const trip = (over: Partial<Trip> = {}): Trip => ({
  ...newTrip(),
  origin: { ...CPH, name: 'copenhagen' },
  stops: [],
  returnLeg: null,
  ...over,
})

describe('greatCircleDistanceM', () => {
  it('measures Copenhagen to Bangkok at 8,620 km', () => {
    // Cross-checked against the spherical law of cosines and a 3D chord before it was written down;
    // all three agree to the metre on MapLibre's mean earth radius.
    expect(greatCircleDistanceM(CPH, BKK) / 1000).toBeCloseTo(8619.61, 1)
  })

  it('is zero between a point and itself', () => {
    expect(greatCircleDistanceM(KRADAN, KRADAN)).toBe(0)
  })
})

describe('interpolate', () => {
  it('is the route an aircraft flies, not the average of two coordinates', () => {
    /*
     * The whole reason this module exists. Halfway from Copenhagen to Bangkok is 43.0° N, 70.9° E,
     * over the Kazakh steppe — verified against the standard Bx/By midpoint formula. Averaging the
     * two lng/lat pairs gives 34.7° N, 56.5° E instead: **1,544 km away**, and visibly wrong on any
     * map that shows both ends at once.
     */
    const half = interpolate(CPH, BKK, 0.5)
    const averaged = {
      lng: (CPH.lng + BKK.lng) / 2,
      lat: (CPH.lat + BKK.lat) / 2,
    }

    expect(half.lat).toBeCloseTo(43.0015, 3)
    expect(half.lng).toBeCloseTo(70.8944, 3)
    expect(greatCircleDistanceM(half, averaged) / 1000).toBeCloseTo(1544, -1)
  })

  it('lands on both ends', () => {
    // Not `toEqual`: the round trip through three trig calls lands 1e-14 away, which is exact enough
    // for a coordinate and not exact enough for an identity check.
    expect(interpolate(CPH, BKK, 0).lat).toBeCloseTo(CPH.lat, 9)
    expect(interpolate(CPH, BKK, 0).lng).toBeCloseTo(CPH.lng, 9)
    expect(interpolate(CPH, BKK, 1).lat).toBeCloseTo(BKK.lat, 9)
    expect(interpolate(CPH, BKK, 1).lng).toBeCloseTo(BKK.lng, 9)
  })

  it('survives coincident ends rather than dividing by zero', () => {
    expect(interpolate(KRADAN, KRADAN, 0.5)).toEqual(KRADAN)
  })
})

describe('bearing', () => {
  it('is 90° due east along the equator', () => {
    expect(bearing({ lng: 0, lat: 0 }, { lng: 10, lat: 0 })).toBeCloseTo(90, 6)
  })

  it('is the heading a Leg leaves on, not the direction of its endpoints', () => {
    /*
     * Copenhagen to Bangkok leaves on **83.8°**, almost due east, and arrives on **144.7°**,
     * south-east — cross-checked against the reverse bearing plus 180. Sixty degrees apart on one
     * Leg, which is why a Vehicle takes its heading from the Path's tangent where it stands rather
     * than from the Leg's two endpoints.
     */
    expect(bearing(CPH, BKK)).toBeCloseTo(83.82, 1)
    expect(bearing(interpolate(CPH, BKK, 0.999), BKK)).toBeCloseTo(144.7, 0)
  })
})

describe('densify', () => {
  it('puts every vertex on the great circle', () => {
    const points = densify([CPH, BKK])

    for (const point of points) {
      const along = interpolate(
        CPH,
        BKK,
        greatCircleDistanceM(CPH, point) / greatCircleDistanceM(CPH, BKK),
      )
      expect(greatCircleDistanceM(point, along)).toBeLessThan(1000)
    }
  })

  it('bends through a Via instead of passing near it', () => {
    const beijing: Coord = { lng: 116.4074, lat: 39.9042 }
    const points = densify([CPH, beijing, BKK])

    const nearest = Math.min(
      ...points.map((point) => greatCircleDistanceM(point, beijing)),
    )
    expect(nearest).toBeLessThan(50_000)

    // And without it, the Path misses Beijing by hundreds of kilometres.
    const direct = Math.min(
      ...densify([CPH, BKK]).map((point) =>
        greatCircleDistanceM(point, beijing),
      ),
    )
    expect(direct).toBeGreaterThan(500_000)
  })

  it('joins sub-segments without repeating the shared vertex', () => {
    const beijing: Coord = { lng: 116.4074, lat: 39.9042 }
    const points = densify([CPH, beijing, BKK])
    const duplicated = points.filter(
      (point, i) =>
        i > 0 &&
        point.lng === points[i - 1].lng &&
        point.lat === points[i - 1].lat,
    )

    expect(duplicated).toEqual([])
  })

  it('runs longitudes continuously across the antimeridian', () => {
    /*
     * Nadi to Apia crosses 180°. Left wrapped, the longitudes jump +179 → −172 and MapLibre draws
     * the Leg the long way round the planet — a line across every ocean instead of a 1,100 km hop.
     */
    const points = densify([
      { lng: 177.44, lat: -17.75 },
      { lng: -171.76, lat: -13.85 },
    ])

    for (let i = 1; i < points.length; i++) {
      expect(Math.abs(points[i].lng - points[i - 1].lng)).toBeLessThan(180)
    }
    expect(points.at(-1)!.lng).toBeGreaterThan(180)
  })
})

describe('pathsOf', () => {
  it('draws one Path per Leg, from the Origin out', () => {
    const paths = pathsOf(
      trip({
        stops: [stop('bkk', BKK, 'flight'), stop('kradan', KRADAN, 'boat')],
      }),
    )

    expect(paths.map((path) => path.mode)).toEqual(['flight', 'boat'])
    expect(paths[0].points.at(0)!.lng).toBeCloseTo(CPH.lng, 9)
    expect(paths[0].points.at(0)!.lat).toBeCloseTo(CPH.lat, 9)
    expect(paths[1].points.at(-1)!.lat).toBeCloseTo(KRADAN.lat, 6)
  })

  it('draws a Leg whose Mode is not known yet, in the neutral ink', () => {
    const paths = pathsOf(trip({ stops: [stop('bkk', BKK, null)] }))

    expect(paths).toHaveLength(1)
    expect(paths[0].mode).toBe('unknown')
  })

  it('draws nothing for a Leg with an end it cannot resolve', () => {
    // The ordinary state of a half-typed Trip: `origin` is null until it has been searched for, and
    // half a line reads as a bug where a missing one reads as unfinished.
    expect(
      pathsOf(trip({ origin: null, stops: [stop('bkk', BKK, 'flight')] })),
    ).toEqual([])
  })

  /*
   * The sentinel, which is the bug this whole block exists for. `{ lng: 0, lat: 0 }` — not `null` —
   * is how the rest of the app says "not placed yet": `newStop()` creates every Stop there, and the
   * sidebar writes an Origin as `{ name, lng: 0, lat: 0 }` the moment a name is typed without a
   * search result picked. Reading only `null` drew an 11,141 km Path from the Gulf of Guinea with an
   * airliner standing on it, which is exactly what the module doc claims cannot happen.
   */
  const UNPLACED = { lng: 0, lat: 0 }

  it('draws nothing from an Origin that has a name but no position yet', () => {
    const paths = pathsOf(
      trip({
        origin: { ...UNPLACED, name: 'Copenhagen' },
        stops: [stop('bkk', BKK, 'flight')],
      }),
    )

    expect(paths).toEqual([])
  })

  it('drops both Legs around an unplaced Stop rather than routing through Null Island', () => {
    const paths = pathsOf(
      trip({
        stops: [
          stop('bkk', BKK, 'flight'),
          stop('nowhere', UNPLACED, 'boat'),
          stop('kradan', KRADAN, 'boat'),
        ],
      }),
    )

    // Only Copenhagen → Bangkok survives; the two Legs touching the unplaced Stop are gone.
    expect(paths.map((path) => path.id)).toEqual(['bkk'])

    for (const path of paths) {
      for (const point of path.points) {
        expect(point.lng === 0 && point.lat === 0).toBe(false)
      }
    }
  })

  it('drops an unplaced Via instead of bending the Path through Null Island', () => {
    const withVia = stop('bkk', BKK, 'flight')
    withVia.inbound = leg({
      mode: 'flight',
      via: [{ ...UNPLACED, name: 'Beijing' }],
    })

    const [path] = pathsOf(trip({ stops: [withVia] }))
    const [direct] = pathsOf(trip({ stops: [stop('bkk', BKK, 'flight')] }))

    // Identical to the Leg with no Via at all — and, crucially, not NaN, which is what splicing a
    // null into the chain of ends would produce for every vertex downstream of it.
    expect(path.lengthM).toBeCloseTo(direct.lengthM, 6)
    expect(path.points.every((p) => Number.isFinite(p.lng))).toBe(true)
  })

  it('still draws a Stop that is genuinely on the equator at 0° E', () => {
    // The cost of the sentinel, and it is worth being honest about: a Stop exactly at 0,0 is
    // undrawable. It is in the Gulf of Guinea, 380 km from land, and the whole app already reads it
    // as unplaced — so agreeing with the rest of the app beats a Path nobody wants.
    const nearby = { lng: 0.0001, lat: 0 }
    const paths = pathsOf(
      trip({
        origin: { ...nearby, name: 'almost' },
        stops: [stop('bkk', BKK, 'flight')],
      }),
    )

    expect(paths).toHaveLength(1)
  })

  it('sends the return Leg home to the Origin, which is no Stop', () => {
    const paths = pathsOf(
      trip({
        stops: [stop('bkk', BKK, 'flight')],
        returnLeg: leg({ mode: 'flight' }),
      }),
    )

    expect(paths).toHaveLength(2)
    expect(paths[1].points.at(0)!.lng).toBeCloseTo(BKK.lng, 6)
    expect(paths[1].points.at(-1)!.lng).toBeCloseTo(CPH.lng, 6)
  })

  it('measures a Leg through its Vias, not end to end', () => {
    const beijing = {
      ...({ lng: 116.4074, lat: 39.9042 } as Coord),
      name: 'beijing',
    }
    const withVia = stop('bkk', BKK, 'flight')
    withVia.inbound = leg({ mode: 'flight', via: [beijing] })

    const [viaBeijing] = pathsOf(trip({ stops: [withVia] }))
    const [direct] = pathsOf(trip({ stops: [stop('bkk', BKK, 'flight')] }))

    expect(viaBeijing.lengthM).toBeGreaterThan(direct.lengthM)
  })
})

describe('MODE_STYLE', () => {
  it('gives every Mode its own ink and its own dash', () => {
    const inks = DRAWN_MODES.map((mode) => MODE_STYLE[mode].ink)
    const dashes = DRAWN_MODES.map((mode) => MODE_STYLE[mode].dash.join())

    expect(new Set(inks).size).toBe(DRAWN_MODES.length)
    expect(new Set(dashes).size).toBe(DRAWN_MODES.length)
  })
})

describe('pathData', () => {
  it('carries the Mode on every feature, which is what both paint properties match on', () => {
    const paths = pathsOf(
      trip({
        stops: [stop('bkk', BKK, 'flight'), stop('kradan', KRADAN, 'boat')],
      }),
    )

    expect(pathData(paths).features.map((f) => f.properties?.mode)).toEqual([
      'flight',
      'boat',
    ])
  })

  it('is empty rather than absent for a Trip with nothing drawable', () => {
    expect(pathData(pathsOf(trip())).features).toEqual([])
  })

  it('writes coordinates the way GeoJSON wants them, lng first', () => {
    const paths = pathsOf(trip({ stops: [stop('bkk', BKK, 'flight')] }))
    const [feature] = pathData(paths).features
    const line = feature.geometry as LineString

    expect(line.coordinates[0][0]).toBeCloseTo(CPH.lng, 9)
    expect(line.coordinates[0][1]).toBeCloseTo(CPH.lat, 9)
  })
})

describe('pathLayer', () => {
  it('matches on the Mode for both the ink and the dash', () => {
    // One layer for every Mode, which is only possible because `line-dasharray` is data-driven in
    // MapLibre 6.3.0 — a `CrossFadedDataDrivenProperty`. Four Modes with four dashes and four inks
    // were rendered from a single layer before this was collapsed from seven.
    const { paint } = pathLayer()

    for (const property of ['line-color', 'line-dasharray'] as const) {
      const expression = paint?.[property] as unknown[]
      expect(expression[0]).toBe('match')
      expect(expression[1]).toEqual(['get', 'mode'])
    }
  })

  it('falls back to the neutral unknown styling rather than to a Mode', () => {
    const expression = pathLayer().paint?.['line-color'] as unknown[]

    // The last branch of a `match` is the fallback, and `unknown` must never appear as a label.
    expect(expression.at(-1)).toBe(MODE_STYLE.unknown.ink)
    expect(expression).not.toContain('unknown')
  })
})
