import { describe, expect, it } from 'vitest'

import {
  atRisk,
  dateFloor,
  drawingStay,
  legsOf,
  legUntouched,
  lossOfBooking,
  lossesOfStay,
  lossesOfStop,
  markerAt,
  nightsAt,
  orderConflicts,
  staleLegs,
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

describe('whether a Leg has ever been touched', () => {
  it('calls a fresh Leg untouched, comparing fields rather than references', () => {
    // `leg(null)` builds its own empty arrays and nulls — reference equality would call it touched.
    expect(legUntouched(leg(null))).toBe(true)
  })

  it('calls a Leg touched the moment it holds anything', () => {
    expect(legUntouched(leg('boat'))).toBe(false)
    expect(legUntouched(leg(null, { note: 'Ask for a lower berth.' }))).toBe(
      false,
    )
    expect(legUntouched(leg(null, { dayRoll: 1 }))).toBe(false)
    expect(
      legUntouched(
        leg(null, { via: [{ name: 'Beijing', lng: 116, lat: 40 }] }),
      ),
    ).toBe(false)
    expect(
      legUntouched(
        leg(null, {
          booking: {
            reference: '',
            platform: null,
            cancelBy: null,
            contact: null,
            detail: null,
          },
        }),
      ),
    ).toBe(false)
  })
})

describe('what the map stands at a Stop', () => {
  it('marks every placed Stop, whatever is booked there', () => {
    // #9's ruling, and the one worth pinning: there is no Stop the map leaves unmarked. The old
    // shape returned a Pin *or* a building, which left a booked Stop with nothing on it at every
    // zoom below the building's own floor — z17 when #9 ruled, z14.8 since #21, and still most of
    // the range either way.
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

describe('the floor under a Stop’s dates', () => {
  it('gives the first Stop nothing, because nothing precedes it', () => {
    // Which is the point: with no floor the picker opens on today, and for the day you leave home
    // today is genuinely the best guess there is.
    expect(dateFloor(seaTrip(), 0)).toBeNull()
  })

  it('anchors a Stop on the departure of the Stop in front of it', () => {
    // Ao Nang follows Bangkok, which leaves on the 15th — even though Ao Nang is not reached until
    // the 16th, because the sleeper puts a night in between. A floor, never a value.
    expect(dateFloor(seaTrip(), 1)).toBe('2026-12-15')
    expect(seaTrip().stops[1].arrival).toBe('2026-12-16')
  })

  it('walks back past a Stop that has no dates yet', () => {
    const trip = seaTrip()
    trip.stops[1].arrival = null
    trip.stops[1].departure = null

    // Koh Kradan still anchors on Bangkok rather than falling back to today: one half-filled Stop
    // in the middle must not break the chain for everything after it.
    expect(dateFloor(trip, 2)).toBe('2026-12-15')
  })

  it('takes an arrival when the Stop in front has not been left yet', () => {
    const trip = seaTrip()
    trip.stops[1].departure = null

    expect(dateFloor(trip, 2)).toBe('2026-12-16')
  })

  it('follows the ribbon rather than policing it when an order is dragged out of step', () => {
    const trip = seaTrip()
    // Bangkok (14–15 Dec) dragged to the end, behind Kuala Lumpur (leaves 6 Jan) — the case
    // `orderConflicts` reports and lets stand.
    const [bangkok] = trip.stops.splice(0, 1)
    trip.stops.push(bangkok)

    // The nearest Stop in front wins, not the latest date anywhere before. Ao Nang now leads and
    // takes no floor at all; Bangkok, now last, sits under Kuala Lumpur's departure and is therefore
    // visibly below its own floor — which is what the sidebar marks.
    expect(dateFloor(trip, 0)).toBeNull()
    expect(dateFloor(trip, 7)).toBe('2027-01-06')
    expect(trip.stops[7].arrival! < '2027-01-06').toBe(true)
  })

  it('leaves no date field on the real trip opening on today', () => {
    const trip = seaTrip()

    // The ticket's own test, stated as one: every date the traveller types after the first opens on
    // the month the trip is in. The first Stop's Arrival is the single exception, by design.
    const floors = trip.stops.map((_, i) => dateFloor(trip, i))

    expect(floors[0]).toBeNull()
    expect(floors.slice(1).every((floor) => floor !== null)).toBe(true)
    expect(floors.slice(1).every((floor) => floor!.startsWith('2026-12'))).toBe(
      false,
    )
    // Every floor lands inside the trip's own span, so no picker opens outside it.
    for (const floor of floors.slice(1)) {
      expect(floor! >= '2026-12-14' && floor! <= '2027-01-06').toBe(true)
    }
  })

  it('is the whole of what the sidebar hands its two pickers', () => {
    const trip = seaTrip()
    // Ao Nang is the one Stop on this trip whose arrival is not the previous departure — the sleeper
    // puts a night between them — so it is the only one where the two pickers differ at all.
    const aonang = trip.stops[1]

    // Arrival takes the floor; Departure takes its own arrival, which is the later of the two and
    // the date a departure actually follows.
    expect(dateFloor(trip, 1)).toBe('2026-12-15')
    expect(aonang.arrival ?? dateFloor(trip, 1)).toBe('2026-12-16')

    // With no arrival yet, Departure falls back to the same floor as Arrival rather than to today.
    aonang.arrival = null
    expect(aonang.arrival ?? dateFloor(trip, 1)).toBe('2026-12-15')
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

describe('what a removal takes with it', () => {
  it('takes nothing from a Stop that has committed nothing', () => {
    // Koh Mook: a boat in with no ticket, and nowhere booked to sleep. Five of the real trip's eight
    // Stops are this shape, which is why the guard has to be silent here or it trains you to dismiss it.
    expect(lossesOfStop(seaTrip().stops[3], '2026-08-17')).toEqual([])
  })

  it('reads a live cancellation window as the errand it is', () => {
    const [loss] = lossesOfStop(seaTrip().stops[2], '2026-08-17')

    expect(loss).toEqual({
      kind: 'stay',
      name: 'Ao Niang Beach Resort',
      reference: '688166919',
      platform: 'Agoda',
      cancelBy: '2026-12-13',
      price: { amount: 1605.86, currency: 'SEK' },
      deadline: 'live',
    })
  })

  it('turns the window over on the day after the deadline, not on it', () => {
    const on = (today: string) =>
      lossesOfStop(seaTrip().stops[2], today)[0].deadline

    expect(on('2026-12-12')).toBe('live')
    // The 13th is still a free day — the same boundary `atRisk` is pinned to, read from the other side.
    expect(on('2026-12-13')).toBe('live')
    expect(on('2026-12-14')).toBe('passed')
  })

  it('takes the flight out of Copenhagen with the first Stop', () => {
    // The cascade nobody expects: a Leg is stored on the Stop it arrives at, so removing Bangkok
    // removes Air China EEOIO2 — and its money sits on the Leg, not on the Booking.
    const losses = lossesOfStop(seaTrip().stops[0], '2026-08-17')

    expect(losses).toEqual([
      {
        kind: 'leg',
        name: 'flight',
        reference: 'EEOIO2',
        platform: 'Air China',
        cancelBy: null,
        price: { amount: 4072, currency: 'SEK' },
        deadline: 'none',
      },
    ])
  })

  it('lists the Stays it holds before the way into it', () => {
    const trip = seaTrip()
    trip.stops[2].inbound.booking = {
      reference: 'BUNDHAYA-1',
      platform: 'Bundhaya',
      cancelBy: null,
      contact: null,
      detail: null,
    }

    expect(
      lossesOfStop(trip.stops[2], '2026-08-17').map((loss) => loss.kind),
    ).toEqual(['stay', 'leg'])
  })

  it('does not count a price with no Booking under it', () => {
    // Langkawi's Shortlisted target carries a real 2,250 SEK asking price and commits none of it.
    // Removing an intention costs retyping, and the guard exists for what Onward cannot recreate.
    const langkawi = seaTrip().stops[5]

    expect(langkawi.stays[0].price).not.toBeNull()
    expect(lossesOfStay(langkawi.stays[0], '2026-08-17')).toEqual([])
  })

  it('ignores a Booking nothing has been written into yet', () => {
    // What "＋ I have booked this" creates, and what the click that undoes it should not have to argue with.
    const blank = {
      reference: '',
      platform: null,
      cancelBy: null,
      contact: null,
      detail: null,
    }

    expect(
      lossOfBooking('stay', 'Somewhere', blank, null, '2026-08-17'),
    ).toBeNull()
  })

  it('guards a Booking whose reference has not arrived but whose deadline has', () => {
    // #12's data-loss case exactly: booked by phone, deadline and number written down, confirmation
    // email still in the post. Testing the reference here is what destroyed this once already.
    const early = {
      reference: '',
      platform: null,
      cancelBy: '2026-12-21',
      contact: '+66 81 893 8008',
      detail: null,
    }

    expect(
      lossOfBooking(
        'stay',
        'Pankabay',
        early,
        { amount: 772.42, currency: 'SEK' },
        '2026-08-17',
      ),
    ).toMatchObject({ reference: '', deadline: 'live', cancelBy: '2026-12-21' })
  })
})

/** The reducer's own splice, so these test the derivation rather than a second idea of a move. */
function withStopsMoved(trip: Trip, from: number, to: number): Trip {
  const stops = [...trip.stops]
  const [moved] = stops.splice(from, 1)
  stops.splice(to, 0, moved)
  return { ...trip, stops }
}

describe('Legs left describing a movement nobody made', () => {
  it('finds none in a Trip nobody has reordered', () => {
    const trip = seaTrip()
    expect(staleLegs(trip, trip)).toEqual([])
  })

  it('stales three Legs from one drag, and names what each used to follow', () => {
    // Koh Kradan to the front. Its own Leg is re-pointed, Bangkok's is (it now follows Kradan), and
    // Koh Mook's is (it closes the gap Kradan left). Ao Nang still follows Bangkok and is untouched.
    const committed = seaTrip()
    const draft = withStopsMoved(committed, 2, 0)

    expect(staleLegs(draft, committed)).toEqual([
      { stopId: 'kradan', wasFrom: 'Ao Nang', nowFrom: 'Copenhagen' },
      { stopId: 'bkk', wasFrom: 'Copenhagen', nowFrom: 'Koh Kradan' },
      { stopId: 'mook', wasFrom: 'Koh Kradan', nowFrom: 'Ao Nang' },
    ])
  })

  it('names the Origin for the Leg that has become the way out of it', () => {
    // Bangkok pushed down one. Ao Nang is now the first Stop, so its sleeper — entered as the way in
    // from Bangkok — is claimed to be the long-haul out of Copenhagen; and Bangkok's flight, entered
    // as exactly that long-haul, now claims to start in Ao Nang. `wasFrom` is what each *used* to
    // follow, which is the fact that tells the traveller which one to fix.
    const committed = seaTrip()
    const draft = withStopsMoved(committed, 0, 1)

    expect(staleLegs(draft, committed)).toEqual([
      { stopId: 'aonang', wasFrom: 'Bangkok', nowFrom: 'Copenhagen' },
      { stopId: 'bkk', wasFrom: 'Copenhagen', nowFrom: 'Ao Nang' },
      { stopId: 'kradan', wasFrom: 'Ao Nang', nowFrom: 'Bangkok' },
    ])
  })

  it('stales the follower of a removed Stop, and can still name the Stop that has gone', () => {
    const committed = seaTrip()
    const draft = {
      ...committed,
      stops: committed.stops.filter((stop) => stop.id !== 'aonang'),
    }

    // Koh Kradan now arrives from Bangkok, and 'Ao Nang' is only findable in `committed` — which is
    // the reason the comparison takes both Trips.
    expect(staleLegs(draft, committed)).toEqual([
      { stopId: 'kradan', wasFrom: 'Ao Nang', nowFrom: 'Bangkok' },
    ])
  })

  it('stales the Stop an insertion pushed down, and never the inserted one', () => {
    const committed = seaTrip()
    const inserted = stop('ngai', 'Koh Ngai', null, null, leg(null))
    const stops = [...committed.stops]
    stops.splice(3, 0, inserted)

    expect(staleLegs({ ...committed, stops }, committed)).toEqual([
      { stopId: 'mook', wasFrom: 'Koh Kradan', nowFrom: 'Koh Ngai' },
    ])
  })

  it('says nothing about a rename, because identity is the id', () => {
    const committed = seaTrip()
    const draft = {
      ...committed,
      stops: committed.stops.map((stop) =>
        stop.id === 'mook' ? { ...stop, name: 'Ko Muk' } : stop,
      ),
    }

    expect(staleLegs(draft, committed)).toEqual([])
  })

  it('stales the Leg home when a different Stop ends the trip', () => {
    const committed = seaTrip()
    const draft = withStopsMoved(committed, 7, 0)

    expect(staleLegs(draft, committed)).toContainEqual({
      stopId: null,
      wasFrom: 'Kuala Lumpur',
      nowFrom: 'Penang — George Town',
    })
  })

  it('leaves the Leg home alone while it is still only a placeholder', () => {
    // #30 owns what an absent `returnLeg` renders. Nothing was entered against anything, so nothing
    // can have gone stale.
    const committed = { ...seaTrip(), returnLeg: null }
    const draft = withStopsMoved(committed, 7, 0)

    expect(staleLegs(draft, committed).some((leg) => leg.stopId === null)).toBe(
      false,
    )
  })
})

describe('the mis-click carve-out', () => {
  it('does not read a blank Booking as a loss just because the row has a price', () => {
    // The bug this replaces: a Shortlisted Stay carries a real asking price with nothing committed, so
    // one click of "＋ I have booked this" and one of "not booked after all" fired the guard and told
    // the traveller that Langkawi's 2,250 SEK was already spent. The unit is the Booking.
    const blank = {
      reference: '',
      platform: null,
      cancelBy: null,
      contact: null,
      detail: null,
    }

    expect(
      lossOfBooking(
        'stay',
        'Telaga / Pantai Kok — not Cenang',
        blank,
        { amount: 2250, currency: 'SEK' },
        '2026-08-17',
      ),
    ).toBeNull()
  })

  it('still counts a Booking with one field written and no price at all', () => {
    const justADeadline = {
      reference: '',
      platform: null,
      cancelBy: '2026-12-21',
      contact: null,
      detail: null,
    }

    expect(
      lossOfBooking('stay', 'Pankabay', justADeadline, null, '2026-08-17'),
    ).toMatchObject({ deadline: 'live', price: null })
  })
})
