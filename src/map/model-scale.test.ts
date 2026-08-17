import { describe, expect, it } from 'vitest'

import type { Anchor } from './model-layer'
import type { LngLatTuple } from './model-matrix'
import {
  metresPerPixel,
  readSpanOf,
  scaleForDiorama,
  STAY_MIN_PX,
  VEHICLE_MIN_PX,
  zoomWhereSpanReaches,
} from './model-scale'

/**
 * The size law, pinned by its numbers.
 *
 * Every figure here was measured in the browser on #20's prototype before it was written down, and
 * the reason to keep them is that they are the whole argument: a change that quietly makes a Stay
 * Marker appear at z14, or a Vehicle 12 px wide over Thailand, breaks legibility in a way no type
 * error catches and no screenshot review would necessarily notice.
 */

const AO_NIANG: LngLatTuple = [99.25546, 7.30365]

const anchor = (over: Partial<Anchor> = {}): Anchor => ({
  id: 'test',
  origin: AO_NIANG,
  content: { name: 'stub' } as unknown as Anchor['content'],
  ...over,
})

const stay = (): Anchor =>
  anchor({ role: 'stay', read: readSpanOf('stay_hotel') })

const vehicle = (): Anchor =>
  anchor({ role: 'vehicle', read: readSpanOf('boat_speed') })

describe('metresPerPixel', () => {
  it('is the whole earth across 512 px at z0', () => {
    /*
     * 78,184 rather than the 78,271.5 every web-mercator scale bar quotes, and deliberately: that
     * figure comes from WGS84's equatorial circumference (40,075,016.686 m), while this comes from
     * MapLibre's own mean earth radius — the same constant `model-matrix.ts` uses to make one unit
     * one metre. The 0.11% gap matters far less than the two halves of the app agreeing about how
     * big a metre is, so do not "fix" this to the textbook number.
     */
    expect(metresPerPixel(0, 0)).toBeCloseTo(78184.04, 1)
  })

  it('halves with every zoom level', () => {
    expect(metresPerPixel(7.3, 11) / metresPerPixel(7.3, 12)).toBeCloseTo(2, 6)
  })

  it('shrinks towards the poles', () => {
    // Copenhagen against Koh Kradan: cos(55.7°) ÷ cos(7.3°).
    expect(metresPerPixel(55.7, 14) / metresPerPixel(7.3, 14)).toBeCloseTo(
      0.568,
      2,
    )
  })
})

describe('readSpanOf', () => {
  it('reads the hotel tower on its height, which is what buys the early handover', () => {
    // sizeM is [17.6, 40, 20] — width, height, length — so for a tower the largest extent is the
    // HEIGHT, where the guesthouse it replaced was read on its 8.88 m footprint and only 8 m tall.
    // That inversion is the whole of #21's gain: same STAY_MIN_PX, 2.2 zoom levels earlier.
    expect(readSpanOf('stay_hotel')).toEqual({ axis: 'y', metres: 40 })
  })

  it('reads the airliner on its wingspan, which is neither its length nor its height', () => {
    // The trap #17 recorded: the fuselage is the *shorter* horizontal axis on this model.
    expect(readSpanOf('airliner')).toEqual({ axis: 'x', metres: 60 })
  })

  it('reads a train carriage on its length', () => {
    expect(readSpanOf('train_intercity_nose')).toEqual({
      axis: 'z',
      metres: 6.84,
    })
  })
})

describe('a Stay Marker', () => {
  it('is never exaggerated, at any zoom it is drawn at', () => {
    for (const zoom of [15, 16, 17, 18, 19, 20, 22]) {
      expect(scaleForDiorama(stay(), { zoom })).toBe(1)
    }
  })

  it('appears at z14.8 and not before, because the model got taller and the rule did not', () => {
    // z17 while the Stay Marker was an 8.9 m guesthouse; z14.83 at this latitude now. STAY_MIN_PX
    // never moved — see model-scale.ts. Pinned tight so a silent model swap fails here first.
    expect(scaleForDiorama(stay(), { zoom: 14.8 })).toBe(0)
    expect(scaleForDiorama(stay(), { zoom: 14.9 })).toBe(1)
  })

  it('is not drawn at any zoom that frames more than one Stop', () => {
    // Island zoom still shows two islands; region zoom shows the whole Andaman coast. z15 and z16
    // used to be on this list and are not any more — the tower draws there. That is safe rather
    // than lucky: at z15 the viewport is 2.8 km, and the closest two Stops on the real trip that
    // both stand a building (Koh Kradan and Koh Lipe) are 92 km apart, so two Stay Markers still
    // never share a frame.
    for (const zoom of [2.4, 5.6, 10, 13.2, 14]) {
      expect(scaleForDiorama(stay(), { zoom })).toBe(0)
    }
  })

  it('would appear two zoom levels later again if the model went back to a guesthouse', () => {
    // The reason the threshold is stated in pixels: it follows the model rather than being
    // re-picked. #21 spent this in the tall direction; the guesthouse's own 8.88 m read is kept
    // here as the counterfactual, so the mechanism stays pinned from both sides.
    const guesthouse = anchor({
      role: 'stay',
      read: { axis: 'z', metres: 8.88 },
    })

    expect(scaleForDiorama(guesthouse, { zoom: 17.1 })).toBe(1)
    expect(scaleForDiorama(guesthouse, { zoom: 16.9 })).toBe(0)
  })
})

describe('a Vehicle', () => {
  it('is held at the floor wherever true scale would be smaller', () => {
    for (const zoom of [2.4, 5.6, 13.2, 16]) {
      const k = scaleForDiorama(vehicle(), { zoom })
      const px =
        (readSpanOf('boat_speed').metres * k) /
        metresPerPixel(AO_NIANG[1], zoom)

      expect(px).toBeCloseTo(VEHICLE_MIN_PX, 6)
    }
  })

  it('stops exaggerating once its own size is enough', () => {
    // A 4.94 m longtail passes 40 px at z19.26, and past that it is simply a 4.94 m longtail.
    expect(scaleForDiorama(vehicle(), { zoom: 19.5 })).toBe(1)
    expect(scaleForDiorama(vehicle(), { zoom: 19 })).toBeGreaterThan(1)
  })

  it('grows the way the zoom shrinks, so the number is never negative or NaN', () => {
    for (const zoom of [0, 1, 6, 12, 18, 24]) {
      const k = scaleForDiorama(vehicle(), { zoom })

      expect(Number.isFinite(k)).toBe(true)
      expect(k).toBeGreaterThanOrEqual(1)
    }
  })

  it('takes the same multiplier at the same latitude, so perspective survives', () => {
    // Two Stops 60 km apart on the same parallel: the law must not tell them apart.
    const near = anchor({
      role: 'vehicle',
      read: readSpanOf('boat_speed'),
      origin: [99.25546, 7.30365],
    })
    const far = anchor({
      role: 'vehicle',
      read: readSpanOf('boat_speed'),
      origin: [98.838, 7.30365],
    })

    expect(scaleForDiorama(near, { zoom: 13 })).toBe(
      scaleForDiorama(far, { zoom: 13 }),
    )
  })
})

describe('anything that is neither', () => {
  it('is drawn at true metre scale', () => {
    expect(scaleForDiorama(anchor(), { zoom: 3 })).toBe(1)
    expect(scaleForDiorama(anchor({ role: 'stay' }), { zoom: 3 })).toBe(1)
    expect(
      scaleForDiorama(anchor({ read: { axis: 'y', metres: 8 } }), { zoom: 3 }),
    ).toBe(1)
  })
})

describe('zoomWhereSpanReaches', () => {
  it('agrees with the law about where the hotel tower hands over', () => {
    const at = zoomWhereSpanReaches(
      readSpanOf('stay_hotel').metres,
      STAY_MIN_PX,
      7.30365,
    )

    expect(at).toBeCloseTo(14.8, 1)
    expect(scaleForDiorama(stay(), { zoom: at + 0.01 })).toBe(1)
    expect(scaleForDiorama(stay(), { zoom: at - 0.01 })).toBe(0)
  })

  it('spans the whole range a Stay Marker could be, from the shipped tower to a beach hut', () => {
    // 40 m is what ships (#21); 8.88 m was the guesthouse; 3 m is the truthful Koh Kradan bungalow
    // the ruling deliberately does NOT draw, because the building signals a booking rather than
    // depicting it. Nearly four zoom levels separate the two ends.
    expect(zoomWhereSpanReaches(40, STAY_MIN_PX, 7.30365)).toBeCloseTo(14.8, 1)
    expect(zoomWhereSpanReaches(8.88, STAY_MIN_PX, 7.30365)).toBeCloseTo(17, 1)
    expect(zoomWhereSpanReaches(3, STAY_MIN_PX, 7.30365)).toBeCloseTo(18.6, 1)
  })
})

describe("a Vehicle's Path has to have room for it", () => {
  /*
   * #8's half of the Vehicle law. The numbers below are the real trip: the Andaman boat hops are
   * 50–90 km, the Bangkok sleeper is ~700 km, and Copenhagen → Bangkok is 8,620 km. What the law has
   * to do is thin them out as the camera pulls back — at region zoom six Vehicles spread over ~180 px
   * of coastline is one smear — while never hiding the long-haul, which is the only Leg on screen at
   * trip zoom.
   */
  const onPath = (lengthM: number): Anchor =>
    anchor({ role: 'vehicle', read: readSpanOf('boat_speed'), pathM: lengthM })

  const BOAT_M = 91_000
  const SLEEPER_M = 700_000
  const LONG_HAUL_M = 8_620_000

  it('hides a boat hop at region zoom and draws it once the coast fills the screen', () => {
    expect(scaleForDiorama(onPath(BOAT_M), { zoom: 5.6 })).toBe(0)
    expect(scaleForDiorama(onPath(BOAT_M), { zoom: 8.2 })).toBeGreaterThan(0)
  })

  it('keeps the long-haul at every zoom the trip is ever seen at', () => {
    for (const zoom of [1, 2.4, 5.6, 8.2, 13.2]) {
      expect(scaleForDiorama(onPath(LONG_HAUL_M), { zoom })).toBeGreaterThan(0)
    }
  })

  it('thins the trip out in order of Leg length, longest surviving furthest out', () => {
    // At the camera that frames the whole region, the sleeper and the flight are drawn and the
    // island hops are not — which is exactly the "two or three Vehicles with room to stand".
    const zoom = 5.6

    expect(scaleForDiorama(onPath(BOAT_M), { zoom })).toBe(0)
    expect(scaleForDiorama(onPath(SLEEPER_M), { zoom })).toBeGreaterThan(0)
    expect(scaleForDiorama(onPath(LONG_HAUL_M), { zoom })).toBeGreaterThan(0)
  })

  it('measures against the Vehicle as drawn, not against the 40 px floor', () => {
    /*
     * Below the floor a Vehicle is 40 px whatever it really is, so it asks for 120 px of Path. Above
     * it the model is at true scale and bigger, and asks for three times *that* instead — 160 px of
     * boat wants 480 px of Path. Pinning the floor as the ruler would let a boat 160 px long stand
     * on a Path 130 px long, which is the smear this rule exists to stop.
     *
     * The Path lengths are derived from the zoom rather than written down, because what is being
     * tested is the boundary: no real Leg is a few metres long.
     */
    const crossover = zoomWhereSpanReaches(
      readSpanOf('boat_speed').metres,
      VEHICLE_MIN_PX,
      AO_NIANG[1],
    )

    const below = crossover - 2
    const belowM = metresPerPixel(AO_NIANG[1], below)
    expect(scaleForDiorama(onPath(119 * belowM), { zoom: below })).toBe(0)
    expect(
      scaleForDiorama(onPath(121 * belowM), { zoom: below }),
    ).toBeGreaterThan(0)

    const above = crossover + 2
    const aboveM = metresPerPixel(AO_NIANG[1], above)
    expect(scaleForDiorama(onPath(479 * aboveM), { zoom: above })).toBe(0)
    expect(
      scaleForDiorama(onPath(481 * aboveM), { zoom: above }),
    ).toBeGreaterThan(0)
  })

  it('leaves an anchor with no Path alone', () => {
    // Nothing but a Vehicle stands on a Path, and #9's Pins will not.
    expect(scaleForDiorama(vehicle(), { zoom: 5.6 })).toBeGreaterThan(0)
  })
})
