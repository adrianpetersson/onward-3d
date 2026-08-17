import { describe, expect, it } from 'vitest'

import realTrip from '../../docs/real-trip/sea-xmas-2026.json'
import { newStop, newTrip } from '../itinerary/create'
import type { Stop, Trip } from '../itinerary/model'
import { readEnvelope } from '../itinerary/parse'
import {
  EMPTY_CENTER,
  EMPTY_ZOOM,
  POINT_ZOOM,
  framePadding,
  framingFor,
  initialCamera,
} from './frame'

const stopAt = (
  lng: number,
  lat: number,
  footprint?: Stop['footprint'],
): Stop => ({
  ...newStop(),
  coord: { lng, lat },
  footprint: footprint ?? null,
})

const tripWith = (stops: Stop[], origin: Trip['origin'] = null): Trip => ({
  ...newTrip(),
  stops,
  origin,
})

/** The real SEA Itinerary as the sidebar wrote it (#15), read back through the store's own parser. */
const theRealTrip = (): Trip => {
  const read = readEnvelope(realTrip)
  if (read.state !== 'ok')
    throw new Error(`real trip did not parse: ${read.state}`)
  return read.envelope.trips[0]
}

describe('framingFor — the ladder', () => {
  it('opens on the globe when there is no placed Stop and no placed Origin', () => {
    expect(framingFor(newTrip())).toEqual({
      kind: 'point',
      center: EMPTY_CENTER,
      zoom: EMPTY_ZOOM,
    })
  })

  it('never opens on Null Island — the sentinel #8 shipped a bug from', () => {
    const framing = framingFor(newTrip())
    expect(framing).toMatchObject({ kind: 'point' })
    if (framing.kind !== 'point') throw new Error('unreachable')
    expect(framing.center).not.toEqual([0, 0])
  })

  it('frames the Origin when it is placed and no Stop is', () => {
    const trip = tripWith([], { name: 'Copenhagen', lng: 12.57, lat: 55.687 })

    expect(framingFor(trip)).toEqual({
      kind: 'point',
      center: [12.57, 55.687],
      zoom: POINT_ZOOM,
    })
  })

  it('falls to the globe when an Origin has a name but no coordinate', () => {
    // The sidebar writes exactly this the moment a name is typed without a result picked (#8).
    const trip = tripWith([], { name: 'Copenha', lng: 0, lat: 0 })

    expect(framingFor(trip)).toMatchObject({ center: EMPTY_CENTER })
  })

  it('prefers the Stops over the Origin once even one is placed', () => {
    const trip = tripWith([stopAt(100.49, 13.75)], {
      name: 'Copenhagen',
      lng: 12.57,
      lat: 55.687,
    })

    expect(framingFor(trip)).toMatchObject({ center: [100.49, 13.75] })
  })

  it('drops unplaced Stops rather than framing the Gulf of Guinea', () => {
    // A half-built Trip: one real Stop, one just typed. Framing both would pull the camera out to
    // span 100° of longitude to contain a Stop that is not anywhere yet.
    const trip = tripWith([stopAt(100.49, 13.75), newStop()])

    expect(framingFor(trip)).toEqual({
      kind: 'point',
      center: [100.49, 13.75],
      zoom: POINT_ZOOM,
    })
  })
})

describe('framingFor — extent', () => {
  it('fits a single Stop to its Footprint when it has one', () => {
    const trip = tripWith([
      stopAt(99.25, 7.31, {
        west: 99.24,
        north: 7.33,
        east: 99.27,
        south: 7.29,
      }),
    ])

    expect(framingFor(trip)).toEqual({
      kind: 'bounds',
      west: 99.24,
      south: 7.29,
      east: 99.27,
      north: 7.33,
    })
  })

  it('falls back to a fixed zoom for a single Stop with no Footprint', () => {
    // A Stop placed by paste or click can never acquire a Footprint (#18), so this is not a
    // temporary state — and the bounds of one point are a zero-size box that would fit to max zoom.
    const trip = tripWith([stopAt(99.25, 7.31)])

    expect(framingFor(trip)).toEqual({
      kind: 'point',
      center: [99.25, 7.31],
      zoom: POINT_ZOOM,
    })
  })

  it('treats several Stops sharing one coordinate as a point too', () => {
    const trip = tripWith([stopAt(99.25, 7.31), stopAt(99.25, 7.31)])

    expect(framingFor(trip)).toMatchObject({ kind: 'point' })
  })

  it('unions Footprints and bare points together', () => {
    const trip = tripWith([
      stopAt(100.49, 13.75, {
        west: 100.3,
        north: 13.9,
        east: 100.7,
        south: 13.5,
      }),
      stopAt(101.69, 3.15),
    ])

    expect(framingFor(trip)).toEqual({
      kind: 'bounds',
      west: 100.3,
      south: 3.15,
      east: 101.69,
      north: 13.9,
    })
  })

  it('does not trust a Footprint to arrive with west < east', () => {
    // #18 stored named edges because Photon sends `[west, north, east, south]` and the ordering is
    // not worth trusting to an index. A transposed pair must widen the frame, never invert it.
    const trip = tripWith([
      stopAt(99.25, 7.31, {
        west: 99.27,
        north: 7.29,
        east: 99.24,
        south: 7.33,
      }),
    ])

    expect(framingFor(trip)).toEqual({
      kind: 'bounds',
      west: 99.24,
      south: 7.29,
      east: 99.27,
      north: 7.33,
    })
  })
})

describe('framingFor — the real Itinerary', () => {
  const trip = theRealTrip()

  it('frames the Stops and leaves the Origin out of the box', () => {
    const framing = framingFor(trip)
    if (framing.kind !== 'bounds') throw new Error('expected bounds')

    // Bangkok in the north, Kuala Lumpur in the south, Ao Nang west and Bangkok east.
    expect(framing.north).toBeGreaterThan(13)
    expect(framing.south).toBeLessThan(4)

    // Copenhagen is at 55.7°N / 12.6°E. If it had been included, both of these would fail — which is
    // #24's Q2 pinned rather than commented.
    expect(framing.north).toBeLessThan(20)
    expect(framing.west).toBeGreaterThan(90)
  })

  it('contains every placed Stop', () => {
    const framing = framingFor(trip)
    if (framing.kind !== 'bounds') throw new Error('expected bounds')

    for (const stop of trip.stops) {
      expect(stop.coord.lng).toBeGreaterThanOrEqual(framing.west)
      expect(stop.coord.lng).toBeLessThanOrEqual(framing.east)
      expect(stop.coord.lat).toBeGreaterThanOrEqual(framing.south)
      expect(stop.coord.lat).toBeLessThanOrEqual(framing.north)
    }
  })
})

describe('framePadding', () => {
  it('clears the sidebar on a desktop window', () => {
    // The Itinerary panel is 400 px at left-[18px] and floats over the map (#10).
    expect(framePadding(1400, 900).left).toBeGreaterThanOrEqual(418)
  })

  it('never lets the padding eat the frame', () => {
    // MapLibre's fit returns `undefined` and silently does nothing when padding exceeds the
    // viewport — the silent-failure shape #6, #10 and #11 each recorded once already.
    for (const [w, h] of [
      [1400, 900],
      [900, 600],
      [600, 400],
      [320, 240],
      [100, 100],
    ]) {
      const p = framePadding(w, h)
      expect(p.left + p.right).toBeLessThan(w)
      expect(p.top + p.bottom).toBeLessThan(h)
    }
  })
})

describe('initialCamera', () => {
  it('hands MapLibre bounds and a capped fit for a real Itinerary', () => {
    const trip = theRealTrip()
    const camera = initialCamera(trip, 1400, 900)

    expect(camera.bounds).toBeDefined()
    expect(camera.fitBoundsOptions?.maxZoom).toBe(POINT_ZOOM)
    // Flat and north-up: MapLibre's fit cannot see pitch, so a pitched frame under-fits.
    expect(camera.fitBoundsOptions?.pitch).toBe(0)
    expect(camera.fitBoundsOptions?.bearing).toBe(0)
  })

  it('hands over a centre and a zoom when there is nothing to fit', () => {
    const camera = initialCamera(newTrip(), 1400, 900)

    expect(camera.bounds).toBeUndefined()
    expect(camera.center).toEqual(EMPTY_CENTER)
    expect(camera.zoom).toBe(EMPTY_ZOOM)
    expect(camera.pitch).toBe(0)
    expect(camera.bearing).toBe(0)
  })
})
