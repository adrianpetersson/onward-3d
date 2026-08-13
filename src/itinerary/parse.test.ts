import { describe, expect, it } from 'vitest'

import { MIGRATIONS, migrate, readEnvelope, writeEnvelope } from './parse'
import { CURRENT_SCHEMA_VERSION, STORE_KIND, envelopeOf } from './store'
import type { Trip } from './model'

/**
 * The read is what stands between a schema change and a re-typed itinerary, so these tests are
 * written from the traveller's side: what he loses, and what he keeps.
 *
 * Ids are minted from a counter rather than `crypto.randomUUID`, so a repair is assertable rather than
 * merely non-empty.
 */

const ids = () => {
  let n = 0
  return () => `minted-${++n}`
}

/** A stored envelope, as JSON text — which is what a file actually hands over. */
const stored = (body: Record<string, unknown>) =>
  JSON.stringify({
    kind: STORE_KIND,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    savedAt: '2026-08-13T10:00:00.000Z',
    openTripId: 'trip-1',
    trips: [],
    ...body,
  })

const oneTrip = (trip: Record<string, unknown>) =>
  stored({ trips: [{ id: 'trip-1', ...trip }] })

const read = (raw: unknown) => readEnvelope(raw, ids())

/** The envelope, or a failure that says which assertion was meant to run. */
function ok(raw: unknown) {
  const result = read(raw)
  if (result.state !== 'ok') {
    throw new Error(`expected a readable store, got ${JSON.stringify(result)}`)
  }
  return result.envelope
}

describe('what the reader refuses', () => {
  it.each([null, undefined, ''])('reads %s as an empty store', (value) => {
    expect(read(value)).toEqual({ state: 'empty' })
  })

  it('refuses text that is not JSON', () => {
    expect(read('{ not json')).toMatchObject({
      state: 'refused',
      reason: 'unreadable',
    })
  })

  it('refuses JSON that is not an object', () => {
    expect(read('[1, 2, 3]')).toMatchObject({
      state: 'refused',
      reason: 'unreadable',
    })
  })

  it("refuses a file that is not Onward's", () => {
    expect(read(JSON.stringify({ trips: [], schemaVersion: 1 }))).toMatchObject(
      { state: 'refused', reason: 'not-onward' },
    )
  })

  /**
   * The one refusal that protects data rather than reporting on it: reading a newer file leniently
   * would drop fields this build has never heard of, and the next save would write that loss back over
   * the traveller's own file.
   */
  it('refuses a file from a later build rather than stripping it', () => {
    const result = read(stored({ schemaVersion: CURRENT_SCHEMA_VERSION + 1 }))

    expect(result).toMatchObject({ state: 'refused', reason: 'too-new' })
    if (result.state === 'refused') {
      expect(result.detail).toContain(`${CURRENT_SCHEMA_VERSION + 1}`)
    }
  })
})

describe('absence is defaulted, and the unknown is ignored', () => {
  it('reads a trip that is missing everything but its id', () => {
    const trip = ok(oneTrip({})).trips[0]

    expect(trip).toEqual({
      id: 'trip-1',
      name: '',
      origin: null,
      stops: [],
      returnLeg: null,
    })
  })

  it('keeps a field it has never heard of out of the Itinerary', () => {
    const trip = ok(
      oneTrip({ name: 'Southeast Asia', mood: 'optimistic', budget: 42 }),
    ).trips[0]

    expect(trip.name).toBe('Southeast Asia')
    expect(trip).not.toHaveProperty('mood')
    expect(trip).not.toHaveProperty('budget')
  })

  /**
   * The case that makes a version bump unnecessary for most changes: a Stop written before a field
   * existed still loads, with that field at its default.
   */
  it('loads a Stop written before half its fields existed', () => {
    const [stop] = ok(oneTrip({ stops: [{ id: 's1', name: 'Koh Mook' }] }))
      .trips[0].stops

    expect(stop).toEqual({
      id: 's1',
      name: 'Koh Mook',
      coord: { lng: 0, lat: 0 },
      arrival: null,
      departure: null,
      inbound: {
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
      },
      stays: [],
    })
  })

  it('treats a wrongly-typed field as absent rather than coercing it', () => {
    const [stop] = ok(
      oneTrip({
        stops: [
          {
            id: 's1',
            name: 42,
            arrival: { year: 2026 },
            coord: { lng: '99.29', lat: 7.37 },
            inbound: { durationMin: '90', dayRoll: 'one' },
          },
        ],
      }),
    ).trips[0].stops

    expect(stop.name).toBe('')
    expect(stop.arrival).toBeNull()
    // Half a coordinate cannot be drawn, so it is the unplaced sentinel and not a plausible fiction.
    expect(stop.coord).toEqual({ lng: 0, lat: 0 })
    expect(stop.inbound.durationMin).toBeNull()
    expect(stop.inbound.dayRoll).toBe(0)
  })

  it('keeps a real zero coordinate, which is a place in the Gulf of Guinea', () => {
    const [stop] = ok(
      oneTrip({ stops: [{ id: 's1', coord: { lng: 0, lat: 0 } }] }),
    ).trips[0].stops

    expect(stop.coord).toEqual({ lng: 0, lat: 0 })
  })

  it('drops an unreadable Mode instead of guessing one', () => {
    const [stop] = ok(
      oneTrip({ stops: [{ id: 's1', inbound: { mode: 'hovercraft' } }] }),
    ).trips[0].stops

    expect(stop.inbound.mode).toBeNull()
  })
})

describe('the invariants model.ts states, enforced at the boundary', () => {
  /** "Without a reference there is no Booking, only an intention." */
  /**
   * The regression that matters most in this file. An earlier version enforced "no reference, no
   * Booking" literally and deleted the rest of the Booking with it — while the sidebar creates exactly
   * `{ reference: '', … }` the moment the traveller clicks "＋ I have booked this". So a booking made
   * before its reference arrived lost its cancellation deadline and its phone number on the next read,
   * and the following Save wrote that loss over the file.
   */
  it('keeps a Booking whose reference has not arrived yet', () => {
    const [stop] = ok(
      oneTrip({
        stops: [
          {
            id: 's1',
            inbound: {
              booking: {
                reference: '',
                platform: 'Agoda',
                cancelBy: '2026-12-01',
                contact: '+66 2 000 0000',
              },
            },
          },
        ],
      }),
    ).trips[0].stops

    expect(stop.inbound.booking).toEqual({
      reference: '',
      platform: 'Agoda',
      cancelBy: '2026-12-01',
      contact: '+66 2 000 0000',
      detail: null,
    })
  })

  it('drops a Booking with nothing in it at all', () => {
    const [stop] = ok(
      oneTrip({ stops: [{ id: 's1', inbound: { booking: {} } }] }),
    ).trips[0].stops

    expect(stop.inbound.booking).toBeNull()
  })

  /**
   * A Stay claiming money is committed, with nothing to show for it, would stand a building on the map
   * over a reservation that does not exist.
   */
  it('demotes a Booked Stay whose Booking did not survive', () => {
    const [stay] = ok(
      oneTrip({
        stops: [
          {
            id: 's1',
            stays: [{ name: 'Ao Niang', status: 'booked', booking: {} }],
          },
        ],
      }),
    ).trips[0].stops[0].stays

    expect(stay.status).toBe('shortlisted')
    expect(stay.booking).toBeNull()
  })

  /** The other half of the regression: a partial Booking must not cost the Stay its status either. */
  it('leaves a Booked Stay booked when only its reference is missing', () => {
    const [stay] = ok(
      oneTrip({
        stops: [
          {
            id: 's1',
            stays: [
              {
                name: 'Ao Niang',
                status: 'booked',
                booking: { cancelBy: '2026-12-01' },
              },
            ],
          },
        ],
      }),
    ).trips[0].stops[0].stays

    expect(stay.status).toBe('booked')
    expect(stay.booking?.cancelBy).toBe('2026-12-01')
  })

  it('leaves a Booked Stay alone when its reference is there', () => {
    const [stay] = ok(
      oneTrip({
        stops: [
          {
            id: 's1',
            stays: [
              {
                name: 'Ao Niang',
                status: 'booked',
                booking: { reference: 'EEOIO2' },
              },
            ],
          },
        ],
      }),
    ).trips[0].stops[0].stays

    expect(stay.status).toBe('booked')
    expect(stay.booking?.reference).toBe('EEOIO2')
  })

  /** The reducer addresses Stops by id, so a duplicate would edit two Stops with one keystroke. */
  it('mints a fresh id for a duplicated Stop', () => {
    const stops = ok(
      oneTrip({
        stops: [
          { id: 'same', name: 'Bangkok' },
          { id: 'same', name: 'Ao Nang' },
        ],
      }),
    ).trips[0].stops

    expect(stops.map((s) => s.id)).toEqual(['same', 'minted-1'])
    expect(stops.map((s) => s.name)).toEqual(['Bangkok', 'Ao Nang'])
  })

  it('mints an id for a Stop that has none, keeping its order', () => {
    const stops = ok(
      oneTrip({ stops: [{ name: 'Bangkok' }, { id: 'k', name: 'Kradan' }] }),
    ).trips[0].stops

    expect(stops.map((s) => s.id)).toEqual(['minted-1', 'k'])
  })

  it('keeps a Via that has a coordinate but no name', () => {
    const [stop] = ok(
      oneTrip({
        stops: [
          {
            id: 's1',
            inbound: { via: [{ lng: 116.4, lat: 39.9 }, { name: 'nowhere' }] },
          },
        ],
      }),
    ).trips[0].stops

    // The named one carries no coordinate, so it cannot bend a Path and is not a Place.
    expect(stop.inbound.via).toEqual([{ lng: 116.4, lat: 39.9, name: '' }])
  })
})

describe('the envelope itself', () => {
  it('repairs an openTripId that names no trip in the file', () => {
    const envelope = ok(
      stored({ openTripId: 'long-deleted', trips: [{ id: 'trip-9' }] }),
    )

    expect(envelope.openTripId).toBe('trip-9')
  })

  it('leaves openTripId null when there are no trips at all', () => {
    expect(ok(stored({ trips: [] })).openTripId).toBeNull()
  })

  /** An unknown save time has to LOSE the comparison in `resolve`, so it sorts before every real one. */
  it('reads a missing savedAt as one that sorts before any real timestamp', () => {
    const envelope = ok(stored({ savedAt: undefined }))

    expect(envelope.savedAt).toBe('')
    expect('' < '2026-08-13T10:00:00.000Z').toBe(true)
  })

  it('stamps the envelope with the version this build writes', () => {
    expect(ok(stored({ schemaVersion: 0 })).schemaVersion).toBe(
      CURRENT_SCHEMA_VERSION,
    )
  })
})

describe('a real Itinerary survives the round trip', () => {
  const trip: Trip = {
    id: 'trip-1',
    name: 'Southeast Asia',
    origin: { name: 'Malmö', lng: 13.0038, lat: 55.6047 },
    stops: [
      {
        id: 's-bkk',
        name: 'Bangkok',
        coord: { lng: 100.5018, lat: 13.7563 },
        arrival: '2026-12-14',
        departure: '2026-12-16',
        inbound: {
          mode: 'flight',
          secondMode: null,
          depart: '18:00',
          arrive: '09:45',
          dayRoll: 1,
          durationMin: 525,
          price: { amount: 5400, currency: 'SEK' },
          carrier: 'Air China',
          fromPlace: 'Copenhagen CPH',
          via: [{ name: 'Beijing', lng: 116.4074, lat: 39.9042 }],
          note: 'long layover',
          booking: {
            reference: '688166919',
            platform: 'Air China',
            cancelBy: null,
            contact: null,
            detail: 'seat 42A',
          },
        },
        stays: [
          {
            name: 'Riverside hostel',
            status: 'booked',
            coord: { lng: 100.4949, lat: 13.7414 },
            price: { amount: 1600, currency: 'THB' },
            booking: {
              reference: 'EEOIO2',
              platform: 'Agoda',
              cancelBy: '2026-12-01',
              contact: '+66 2 000 0000',
              detail: null,
            },
          },
        ],
      },
      {
        id: 's-kradan',
        name: 'Koh Kradan',
        coord: { lng: 99.2555, lat: 7.3037 },
        arrival: '2026-12-19',
        departure: '2026-12-22',
        inbound: {
          mode: 'train',
          secondMode: 'van',
          depart: '17:05',
          arrive: '08:20',
          dayRoll: 1,
          durationMin: 915,
          price: { amount: 1100, currency: 'THB' },
          carrier: 'SRT',
          fromPlace: 'Hua Lamphong',
          via: [],
          note: null,
          booking: null,
        },
        stays: [],
      },
    ],
    returnLeg: {
      mode: 'flight',
      secondMode: null,
      depart: '01:20',
      arrive: '07:55',
      dayRoll: 0,
      durationMin: 800,
      price: null,
      carrier: null,
      fromPlace: 'Krabi KBV',
      via: [],
      note: null,
      booking: null,
    },
  }

  it('comes back byte-identical through write and read', () => {
    const envelope = envelopeOf([trip], trip.id, '2026-08-13T10:00:00.000Z')
    const returned = ok(writeEnvelope(envelope))

    expect(returned).toEqual(envelope)
  })

  it('writes text a person can read, since it is a file he owns', () => {
    expect(writeEnvelope(envelopeOf([trip], trip.id, ''))).toContain('\n  ')
  })
})

describe('the migration chain', () => {
  it('ships with no migrations, because nothing has needed one yet', () => {
    expect(Object.keys(MIGRATIONS)).toEqual([])
  })

  /** The machinery is proven with synthetic steps rather than by inventing a fake production version. */
  it('applies every step in order, once each', () => {
    const applied: number[] = []
    const step = (n: number) => (envelope: Record<string, unknown>) => {
      applied.push(n)
      return { ...envelope, seen: [...((envelope.seen as number[]) ?? []), n] }
    }

    const result = migrate({}, 1, 4, { 1: step(1), 2: step(2), 3: step(3) })

    expect(applied).toEqual([1, 2, 3])
    expect(result.seen).toEqual([1, 2, 3])
  })

  it('skips a version with no entry, because the readers absorb additive changes', () => {
    const result = migrate({ v: 'start' }, 1, 4, {
      2: (envelope) => ({ ...envelope, v: 'touched' }),
    })

    expect(result.v).toBe('touched')
  })

  it('does nothing when the envelope is already current', () => {
    const envelope = { v: 1 }
    expect(migrate(envelope, 3, 3, { 3: () => ({ v: 999 }) })).toBe(envelope)
  })
})
