import type { Point } from 'geojson'
import { describe, expect, it } from 'vitest'

import { newLeg, newStay, newStop, newTrip } from '../itinerary/create'
import type { Stay, Stop, Trip } from '../itinerary/model'
import {
  PIN_HALO_REACH_PX,
  PIN_RADIUS_PX,
  PULSE_MS,
  isPlaced,
  pinCoreLayer,
  pinData,
  pinHaloLayer,
  pinLabelLayer,
  pulseAt,
} from './pin'
import { jumpAt, stayMarkersOf, JUMP_HEIGHT_M, JUMP_MS } from './stay-marker'

/**
 * The Pin, pinned by the things that would go wrong quietly.
 *
 * The loud failure — no Pin at all — is visible the first time anyone opens the map. The quiet ones
 * are a Pin at Null Island the moment a name is typed (#8's sentinel, which cost that ticket an
 * 11,141 km Path), and a Pin and its building ending up at different coordinates, which is the
 * failure #9 exists to make impossible.
 */

const placedStop = (
  name: string,
  lng: number,
  lat: number,
  stays: Stay[] = [],
): Stop => ({
  ...newStop(),
  id: name,
  name,
  coord: { lng, lat },
  inbound: newLeg(),
  stays,
})

const stay = (over: Partial<Stay> = {}): Stay => ({ ...newStay(), ...over })

const booked = (coord: Stay['coord']): Stay =>
  stay({
    name: 'a bed',
    status: 'booked',
    coord,
    booking: {
      reference: 'ABC123',
      platform: null,
      cancelBy: null,
      contact: null,
      detail: null,
    },
  })

const tripOf = (...stops: Stop[]): Trip => ({ ...newTrip(), stops })

const pointsOf = (trip: Trip) =>
  pinData(trip).features.map((f) => (f.geometry as Point).coordinates)

describe('which Stops get a Pin', () => {
  it('marks every placed Stop, booked or not', () => {
    const trip = tripOf(
      placedStop('Langkawi', 99.728, 6.29),
      placedStop('Koh Kradan', 99.257, 7.3105, [
        booked({ lng: 99.25546, lat: 7.30365 }),
      ]),
    )

    expect(pinData(trip).features).toHaveLength(2)
  })

  it('drops a Stop that has never been placed rather than drawing it at Null Island', () => {
    // `{ lng: 0, lat: 0 }` is the sentinel the whole app writes — not `null` — which is what put an
    // airliner in the Gulf of Guinea in #8 the moment a name was typed into Home.
    const unplaced = placedStop('Pai', 0, 0)
    expect(isPlaced(unplaced)).toBe(false)
    expect(pinData(tripOf(unplaced)).features).toHaveLength(0)
  })

  it('keeps a Stop that is genuinely on the null meridian or the equator', () => {
    // Accra is 4 km from (0, 0) and Libreville sits on the equator. Neither is the sentinel, and a
    // rule that tested both coordinates with AND would be the one that ate them.
    expect(isPlaced(placedStop('Accra', 0, 5.6))).toBe(true)
    expect(isPlaced(placedStop('Libreville', 9.45, 0))).toBe(true)
  })
})

describe('where a Pin stands', () => {
  const centre = { lng: 99.257, lat: 7.3105 }
  const bed = { lng: 99.25546, lat: 7.30365 }

  it("stands on the bed once a Stay has its own coordinate, not the Stop's centre", () => {
    const trip = tripOf(
      placedStop('Koh Kradan', centre.lng, centre.lat, [booked(bed)]),
    )
    expect(pointsOf(trip)).toEqual([[bed.lng, bed.lat]])
  })

  it("falls back to the Stop's centre when the Stay has no coordinate", () => {
    const trip = tripOf(
      placedStop('Koh Kradan', centre.lng, centre.lat, [booked(null)]),
    )
    expect(pointsOf(trip)).toEqual([[centre.lng, centre.lat]])
  })

  it('puts the Pin and the building it marks on exactly the same coordinate', () => {
    // The whole of #9's answer to the 2 km question. These two are 780 m apart on the real island,
    // and a Stay Marker is not drawn below z17, where the viewport is 853 m wide — so a Pin at the
    // centre and a building on the beach are never both on screen to be reconciled by eye.
    const trip = tripOf(
      placedStop('Koh Kradan', centre.lng, centre.lat, [booked(bed)]),
    )

    const [pin] = pointsOf(trip)
    const [building] = stayMarkersOf(trip).map((m) => m.origin)

    expect(pin).toEqual(building)
  })

  it('stands no building where nothing is booked, but still stands a Pin', () => {
    const trip = tripOf(
      placedStop('Langkawi', 99.728, 6.29),
      placedStop('Koh Lipe', 99.304, 6.488, [
        stay({ name: 'Castaway', status: 'shortlisted' }),
      ]),
    )

    expect(pinData(trip).features).toHaveLength(2)
    expect(stayMarkersOf(trip)).toHaveLength(0)
  })
})

describe('what a Pin carries', () => {
  it("carries the traveller's own spelling, never the geocoder's", () => {
    // #18: he typed `Koh Mook` because that is what the ferry ticket says. OSM's `Ko Muk` is on the
    // map's own labels and must never reach this one.
    const trip = tripOf(placedStop('Koh Mook', 99.2967, 7.3797))
    expect(pinData(trip).features[0].properties?.name).toBe('Koh Mook')
  })

  it('marks unresolved Stops as pulsing and settled ones as not', () => {
    const trip = tripOf(
      placedStop('Langkawi', 99.728, 6.29),
      placedStop('Bangkok', 100.5018, 13.7563, [
        booked({ lng: 100.56, lat: 13.738 }),
      ]),
    )

    expect(pinData(trip).features.map((f) => f.properties?.pulsing)).toEqual([
      true,
      false,
    ])
  })

  it('pulses a Placeholder, which is real money and still unresolved', () => {
    const held = booked({ lng: 101.7, lat: 3.14 })
    held.status = 'placeholder'

    const trip = tripOf(placedStop('Kuala Lumpur', 101.6869, 3.139, [held]))
    expect(pinData(trip).features[0].properties?.pulsing).toBe(true)
  })
})

describe('the layers', () => {
  it('draws the halo only under the Stops that are pulsing', () => {
    expect(pinHaloLayer().filter).toEqual(['get', 'pulsing'])
  })

  it('holds the Pin at a pixel radius, so it is screen-constant at every zoom', () => {
    // The law #20 measured and rejected for a building, and the right one for a marker — which is
    // why it is a plain number here and not an expression on zoom.
    expect(pinCoreLayer().paint?.['circle-radius']).toBe(PIN_RADIUS_PX)
  })

  it('leaves collision on, so nine names thin out instead of piling up', () => {
    const layout = pinLabelLayer().layout ?? {}
    expect(layout['text-allow-overlap']).toBeUndefined()
    expect(layout['text-ignore-placement']).toBeUndefined()
  })

  it('hangs the label below the Pin, clear of the building underneath it', () => {
    expect(pinLabelLayer().layout?.['text-anchor']).toBe('top')
  })
})

describe('the Pulse', () => {
  it('expands from the Pin own edge and fades out as it goes', () => {
    const start = pulseAt(0)
    const late = pulseAt(PULSE_MS * 0.9)

    expect(start.radiusPx).toBe(PIN_RADIUS_PX)
    expect(late.radiusPx).toBeGreaterThan(start.radiusPx)
    expect(late.opacity).toBeLessThan(start.opacity)
  })

  it('never reaches further than it says it does', () => {
    for (let ms = 0; ms < PULSE_MS * 3; ms += 37) {
      const { radiusPx, opacity } = pulseAt(ms)
      expect(radiusPx).toBeLessThanOrEqual(PIN_RADIUS_PX + PIN_HALO_REACH_PX)
      expect(opacity).toBeGreaterThanOrEqual(0)
    }
  })

  it('repeats exactly, so every Pin on one clock stays on one clock', () => {
    expect(pulseAt(120)).toEqual(pulseAt(120 + PULSE_MS))
    expect(pulseAt(120)).toEqual(pulseAt(120 + PULSE_MS * 41))
  })

  it('survives a negative clock, because performance.now is not the only caller', () => {
    expect(pulseAt(-1).opacity).toBeGreaterThanOrEqual(0)
    expect(pulseAt(-1).radiusPx).toBeGreaterThanOrEqual(PIN_RADIUS_PX)
  })
})

describe('the Jump', () => {
  it('sits on the ground for half the cycle, which is what makes it a hop', () => {
    const grounded = Array.from({ length: 200 }, (_, i) =>
      jumpAt((i / 200) * JUMP_MS),
    ).filter((h) => h === 0)

    expect(grounded.length).toBeGreaterThan(90)
    expect(grounded.length).toBeLessThan(110)
  })

  it('clears its own roofline and no more', () => {
    const heights = Array.from({ length: 400 }, (_, i) =>
      jumpAt((i / 400) * JUMP_MS),
    )

    expect(Math.max(...heights)).toBeCloseTo(JUMP_HEIGHT_M, 2)
    expect(Math.min(...heights)).toBe(0)
  })

  it('never goes underground, at any clock', () => {
    for (let ms = -JUMP_MS; ms < JUMP_MS * 3; ms += 13) {
      expect(jumpAt(ms)).toBeGreaterThanOrEqual(0)
    }
  })
})

describe('which buildings hop', () => {
  it('hops the booked Stay nobody has pasted a link for', () => {
    const trip = tripOf(placedStop('Railay', 98.838, 8.011, [booked(null)]))
    expect(stayMarkersOf(trip)[0].jumping).toBe(true)
  })

  it('stands still once the link is pasted', () => {
    const trip = tripOf(
      placedStop('Railay', 98.838, 8.011, [booked({ lng: 98.84, lat: 8.01 })]),
    )
    expect(stayMarkersOf(trip)[0].jumping).toBe(false)
  })
})
