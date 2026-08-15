import { describe, expect, it } from 'vitest'

import {
  atRisk,
  drawingStay,
  legsOf,
  markerAt,
  nightsAt,
  orderConflicts,
  tripEnd,
  tripNights,
  tripStart,
} from './derive'
import type { Leg, Stay, Stop, Trip } from './model'

/**
 * The real Southeast Asia trip, trimmed to what the derivations touch. The numbers below are the
 * ones the source documents state in prose — "23 nights", "One hotel night", "3 nights at
 * 535.29/night" — so a broken derivation shows up as a disagreement with the trip itself.
 */

function leg(mode: Leg['mode'], over: Partial<Leg> = {}): Leg {
  return {
    mode,
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
  }
}

function stop(
  id: string,
  name: string,
  arrival: string | null,
  departure: string | null,
  inbound: Leg,
  stays: Stay[] = [],
): Stop {
  return {
    id,
    name,
    coord: { lng: 100, lat: 8 },
    footprint: null,
    arrival,
    departure,
    inbound,
    stays,
  }
}

const AO_NIANG: Stay = {
  name: 'Ao Niang Beach Resort',
  status: 'booked',
  // Nobody has ever pasted a Google Maps link for it, which is the whole point of the jump.
  coord: null,
  price: { amount: 1605.86, currency: 'SEK' },
  booking: {
    reference: '688166919',
    platform: 'Agoda',
    cancelBy: '2026-12-13',
    contact: '+66 81 893 8008',
    detail: 'Breakfast included. Booked as Timothy Petersson.',
  },
}

/** A real Booking, held only so the dates cannot sell out, and meant to be replaced. */
const THE_NOI: Stay = {
  name: 'The Noi Guesthouse',
  status: 'placeholder',
  coord: null,
  price: { amount: 2254, currency: 'SEK' },
  booking: {
    reference: '746681',
    platform: 'Agoda',
    cancelBy: '2026-12-23',
    contact: null,
    detail: 'Held for 25–28 Dec, which is no longer the plan.',
  },
}

const LANGKAWI_TARGET: Stay = {
  name: 'Telaga / Pantai Kok — not Cenang',
  status: 'shortlisted',
  coord: null,
  price: { amount: 2250, currency: 'SEK' },
  booking: null,
}

function seaTrip(): Trip {
  return {
    id: 'sea-2026',
    name: 'Southeast Asia',
    origin: { name: 'Copenhagen', lng: 12.5683, lat: 55.6761 },
    stops: [
      // Leaves CPH on the 13th, lands in Bangkok on the 14th — the overnight is the Leg's, not a Stop's.
      stop(
        'bkk',
        'Bangkok',
        '2026-12-14',
        '2026-12-15',
        leg('flight', {
          dayRoll: 1,
          price: { amount: 4072, currency: 'SEK' },
          via: [{ name: 'Beijing', lng: 116.5844, lat: 40.0799 }],
          booking: {
            reference: 'EEOIO2',
            platform: 'Air China',
            cancelBy: null,
            contact: null,
            detail: 'CA878 52L · CA959 46L',
          },
        }),
      ),
      // The sleeper: boards the 15th, arrives the 16th. This is the night no Stop can account for.
      stop(
        'aonang',
        'Ao Nang',
        '2026-12-16',
        '2026-12-20',
        leg('train', { secondMode: 'van', dayRoll: 1, durationMin: 820 }),
      ),
      stop('kradan', 'Koh Kradan', '2026-12-20', '2026-12-23', leg('boat'), [
        AO_NIANG,
      ]),
      stop('mook', 'Koh Mook', '2026-12-23', '2026-12-26', leg('boat')),
      stop('lipe', 'Koh Lipe', '2026-12-26', '2026-12-29', leg('boat'), [
        THE_NOI,
      ]),
      stop(
        'langkawi',
        'Langkawi',
        '2026-12-29',
        '2027-01-01',
        leg('ferry', { durationMin: 90 }),
        [LANGKAWI_TARGET],
      ),
      stop(
        'penang',
        'Penang — George Town',
        '2027-01-01',
        '2027-01-04',
        leg('flight'),
      ),
      stop('kl', 'Kuala Lumpur', '2027-01-04', '2027-01-06', leg('train')),
    ],
    returnLeg: leg('flight', {
      via: [{ name: 'Dubai', lng: 55.3644, lat: 25.2532 }],
      price: { amount: 2000, currency: 'MYR' },
      booking: {
        reference: 'MMMNEN',
        platform: 'Emirates',
        cancelBy: null,
        contact: null,
        detail: 'EK345 27K · EK153 26K',
      },
    }),
  }
}

describe('nights', () => {
  it('counts a single Bangkok night', () => {
    expect(nightsAt(seaTrip().stops[0])).toBe(1)
  })

  it('is null while a Stop has no dates yet', () => {
    const sketch = stop('new', '', null, null, leg('boat'))
    expect(nightsAt(sketch)).toBeNull()
  })

  it('counts the Trip as a span, not as the sum of its Stops', () => {
    const trip = seaTrip()
    const summed = trip.stops.reduce((n, s) => n + (nightsAt(s) ?? 0), 0)

    // 22 nights are slept at Stops; the 23rd is spent on the sleeper, which belongs to a Leg.
    expect(summed).toBe(22)
    expect(tripNights(trip)).toBe(23)
  })
})

describe('the ends of the Trip', () => {
  it('winds the start back over the overnight flight out', () => {
    // Bangkok is reached on the 14th; you leave Copenhagen on the 13th.
    expect(tripStart(seaTrip())).toBe('2026-12-13')
  })

  it('lands home on the day the last Stop is left', () => {
    expect(tripEnd(seaTrip())).toBe('2027-01-06')
  })
})

describe('legs', () => {
  it('derives one Leg into every Stop, plus the return', () => {
    const trip = seaTrip()
    const legs = legsOf(trip)

    expect(trip.stops).toHaveLength(8)
    expect(legs).toHaveLength(9)
  })

  it('runs the first Leg from the Origin rather than from a Stop', () => {
    const [first] = legsOf(seaTrip())
    expect(first.from).toMatchObject({ name: 'Copenhagen' })
    expect(first.to?.name).toBe('Bangkok')
  })

  it('gives the return Leg a departing Stop and nowhere to arrive', () => {
    const last = legsOf(seaTrip()).at(-1)
    expect((last?.from as Stop).name).toBe('Kuala Lumpur')
    expect(last?.to).toBeNull()
  })

  it('keeps a Leg attached to its Stop when the Stop is dragged', () => {
    const trip = seaTrip()
    const [mook] = trip.stops.splice(3, 1)
    trip.stops.splice(1, 0, mook)

    const moved = legsOf(trip).find((l) => l.to?.id === 'mook')

    // The boat travelled with the island it lands on — ADR 0003. It now describes a different
    // movement, which is the known cost, but it was not orphaned and it did not re-point silently.
    expect(moved?.leg.mode).toBe('boat')
    expect(moved?.from).toMatchObject({ name: 'Bangkok' })
  })
})

describe('what the map stands at a Stop', () => {
  it('marks every placed Stop, whatever is booked there', () => {
    // #9's ruling, and the one worth pinning: there is no Stop the map leaves unmarked. The old
    // shape returned a Pin *or* a building, which left a booked Stop with nothing on it at every
    // zoom below z17 — which is most of them.
    for (const stop of seaTrip().stops)
      expect(markerAt(stop).coord).toBeTruthy()
  })

  it('stands a pulsing Pin and no building where nothing is booked', () => {
    expect(markerAt(seaTrip().stops[0])).toMatchObject({
      building: false,
      pulsing: true,
    })
  })

  it('stands a pulsing Pin and no building for a Stay that is only shortlisted', () => {
    const langkawi = seaTrip().stops[5]
    expect(markerAt(langkawi)).toMatchObject({
      building: false,
      pulsing: true,
      jumping: false,
    })
  })

  it('stands a jumping building for a booked Stay nobody has placed yet', () => {
    const kradan = seaTrip().stops[2]
    const marker = markerAt(kradan)

    // Paid, confirmed, 1,605.86 SEK — settled, so it does not pulse. It jumps instead, because the
    // building is standing on the island's centre rather than on its own beach.
    expect(marker).toMatchObject({
      building: true,
      pulsing: false,
      jumping: true,
    })
    expect(marker.coord).toEqual(kradan.coord)
  })

  it('moves the Pin to the bed, not just the building, once a link has been pasted', () => {
    const kradan = seaTrip().stops[2]
    kradan.stays[0].coord = { lng: 99.2565, lat: 7.3086 }

    const marker = markerAt(kradan)
    expect(marker).toMatchObject({
      building: true,
      pulsing: false,
      jumping: false,
    })

    // One coordinate for both, which is the whole of #9's answer to the 2 km question: the Pin and
    // the building it stands over can never be somewhere different, because there is only one.
    expect(marker.coord).toEqual({ lng: 99.2565, lat: 7.3086 })
    expect(marker.coord).not.toEqual(kradan.coord)
  })

  it('stands a pulsing building on a Placeholder', () => {
    // A real Booking, so it earns a building — but one you mean to cancel, so it stays unresolved.
    expect(markerAt(seaTrip().stops[4])).toMatchObject({
      building: true,
      pulsing: true,
      jumping: true,
    })
  })

  it('draws the booked Stay while an incumbent is still waiting to be cancelled', () => {
    const lipe = seaTrip().stops[4]
    const replacement: Stay = {
      ...AO_NIANG,
      name: 'Somewhere better',
      status: 'booked',
    }
    lipe.stays.push(replacement)

    expect(drawingStay(lipe)?.name).toBe('Somewhere better')
    expect(markerAt(lipe).pulsing).toBe(false)
  })
})

describe('order against dates', () => {
  it('finds nothing wrong with the trip as planned', () => {
    expect(orderConflicts(seaTrip())).toEqual([])
  })

  it('lets the span run backwards rather than pretending otherwise', () => {
    const trip = seaTrip()
    // Bangkok (14–15 Dec) dragged to the end, behind Kuala Lumpur (leaves 6 Jan). The span is now
    // measured from Ao Nang's arrival to Bangkok's departure, and runs backwards.
    const [bangkok] = trip.stops.splice(0, 1)
    trip.stops.push(bangkok)

    // The order wins and draws, so the derived span genuinely inverts. This is the caller's problem
    // to present, not this function's to hide — the sidebar suppresses the figure and shows the flag.
    expect(tripNights(trip)).toBeLessThan(0)
    expect(orderConflicts(trip)).not.toEqual([])
  })

  it('reports a Stop dragged in front of one it arrives after', () => {
    const trip = seaTrip()
    const [lipe] = trip.stops.splice(4, 1)
    trip.stops.splice(3, 0, lipe)

    // Koh Mook now sits after Koh Lipe but arrives three days earlier. Reported, never corrected.
    expect(orderConflicts(trip)).toEqual(['mook'])
  })
})

describe('money at risk', () => {
  it('counts only what can no longer be got back, and never converts', () => {
    const trip = seaTrip()

    // On 20 Dec, Ao Niang's 13 Dec deadline has passed and both flights were never refundable — but
    // The Noi is still free to cancel until the 23rd, so its 2,254 SEK is not yet at risk.
    expect(atRisk(trip, '2026-12-20')).toEqual({
      SEK: 1605.86 + 4072,
      MYR: 2000,
    })
  })

  it('adds a Placeholder the moment its cancellation window shuts', () => {
    // The 23rd is the last free day; the 24th is not. This is the date the source says to diarise.
    expect(atRisk(seaTrip(), '2026-12-23')).toEqual({
      SEK: 1605.86 + 4072,
      MYR: 2000,
    })
    expect(atRisk(seaTrip(), '2026-12-24')).toEqual({
      SEK: 1605.86 + 2254 + 4072,
      MYR: 2000,
    })
  })

  it('leaves a refundable Stay out while its deadline is still ahead', () => {
    const risk = atRisk(seaTrip(), '2026-12-01')
    expect(risk).toEqual({ SEK: 4072, MYR: 2000 })
  })
})
