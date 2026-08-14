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
  anchor({ role: 'stay', read: readSpanOf('stay_guesthouse') })

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
  it('reads the guesthouse on its length, not its ridge', () => {
    // sizeM is [4.41, 8, 8.88] — width, height, length — so the largest extent is the length.
    expect(readSpanOf('stay_guesthouse')).toEqual({ axis: 'z', metres: 8.88 })
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
    for (const zoom of [17, 18, 19, 20, 22]) {
      expect(scaleForDiorama(stay(), { zoom })).toBe(1)
    }
  })

  it('appears at z17 and not before — the handover chosen off the ladder', () => {
    expect(scaleForDiorama(stay(), { zoom: 16.9 })).toBe(0)
    expect(scaleForDiorama(stay(), { zoom: 17.1 })).toBe(1)
  })

  it('is not drawn at any zoom that frames more than one Stop', () => {
    // Island zoom still shows two islands; region zoom shows the whole Andaman coast.
    for (const zoom of [2.4, 5.6, 10, 13.2, 15, 16]) {
      expect(scaleForDiorama(stay(), { zoom })).toBe(0)
    }
  })

  it('appears two zoom levels earlier if the model is a 40 m highrise', () => {
    // The reason the threshold is stated in pixels: it follows the model rather than being re-picked.
    const highrise = anchor({ role: 'stay', read: { axis: 'y', metres: 40 } })

    expect(scaleForDiorama(highrise, { zoom: 15.1 })).toBe(1)
    expect(scaleForDiorama(highrise, { zoom: 14.8 })).toBe(0)
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
  it('agrees with the law about where the guesthouse hands over', () => {
    const at = zoomWhereSpanReaches(
      readSpanOf('stay_guesthouse').metres,
      STAY_MIN_PX,
      7.30365,
    )

    expect(at).toBeCloseTo(17, 1)
    expect(scaleForDiorama(stay(), { zoom: at + 0.01 })).toBe(1)
    expect(scaleForDiorama(stay(), { zoom: at - 0.01 })).toBe(0)
  })

  it('puts a 40 m highrise two levels earlier and a 3 m beach hut two later', () => {
    expect(zoomWhereSpanReaches(40, STAY_MIN_PX, 7.30365)).toBeCloseTo(14.8, 1)
    expect(zoomWhereSpanReaches(3, STAY_MIN_PX, 7.30365)).toBeCloseTo(18.6, 1)
  })
})
