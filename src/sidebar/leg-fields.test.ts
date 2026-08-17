import { describe, expect, it } from 'vitest'

import type { Leg } from '../itinerary/model'
import { readEnvelope } from '../itinerary/parse'
import realTrip from '../../docs/real-trip/sea-xmas-2026.json'
import {
  LEG_FIELD_TIER,
  SERVICE_FIELD_KEYS,
  hoursAndMinutes,
  offersDayRoll,
  serviceSummary,
} from './leg-fields'

/**
 * The Leg card's tiers, tested against the itinerary they were measured on.
 *
 * [#28](https://github.com/adrianpetersson/onward/issues/28) proposed the split from a screenshot and
 * got one field badly wrong, so the numbers that overturned it are pinned here rather than quoted:
 * they come out of `docs/real-trip/sea-xmas-2026.json`, which is the envelope the sidebar itself wrote
 * in [#15](https://github.com/adrianpetersson/onward/issues/15). Read through `readEnvelope`, so these
 * also fail if the real trip stops parsing.
 */

const legs: Leg[] = (() => {
  const read = readEnvelope(realTrip, () => 'test-id')
  if (read.state !== 'ok') {
    throw new Error(`the real trip no longer parses: ${JSON.stringify(read)}`)
  }
  const trip = read.envelope.trips[0]
  const returnLeg = trip.returnLeg
  if (!returnLeg) throw new Error('the real trip has no Leg home')
  return [...trip.stops.map((stop) => stop.inbound), returnLeg]
})()

/** How many of the real Legs have this field filled. A `0`, a `null` and an empty list are all unfilled. */
function filledOn(key: keyof Leg): number {
  return legs.filter((leg) => {
    const value = leg[key]
    if (value === null || value === undefined) return false
    if (Array.isArray(value)) return value.length > 0
    return value !== 0
  }).length
}

describe('the real trip is what the split was measured on', () => {
  it('has nine Legs — eight Stops and the Leg home', () => {
    // #15: eight Stops, not nine (Copenhagen is the Origin), and nine Legs, not the ten #28 asked for.
    expect(legs).toHaveLength(9)
  })

  it('fills Mode, Takes and Note on every one of them', () => {
    expect(filledOn('mode')).toBe(9)
    expect(filledOn('durationMin')).toBe(9)
    expect(filledOn('note')).toBe(9)
  })

  it('fills the times on fewer than half', () => {
    expect(filledOn('depart')).toBe(4)
    expect(filledOn('arrive')).toBe(4)
  })

  it('knows how long five Legs take and never when they leave', () => {
    /*
     * This is the finding that overturned #28's plan, which demoted `durationMin` as "derived
     * display, empty on every Leg". These five are `model.ts`'s "ferry, 1h30 and nothing else" —
     * the only quantitative fact they carry — so folding it away would have hidden the one thing
     * most of the Itinerary knows.
     */
    const durationOnly = legs.filter(
      (leg) =>
        leg.durationMin !== null && leg.depart === null && leg.arrive === null,
    )
    expect(durationOnly).toHaveLength(5)
    expect(filledOn('durationMin')).toBeGreaterThan(filledOn('depart'))
  })
})

describe('every field of a Leg has a tier', () => {
  it('puts the seven measured-common fields on the fast path', () => {
    const fast = Object.entries(LEG_FIELD_TIER)
      .filter(([, tier]) => tier === 'fast')
      .map(([key]) => key)
    expect(fast.sort()).toEqual([
      'arrive',
      'dayRoll',
      'depart',
      'durationMin',
      'mode',
      'note',
      'price',
    ])
  })

  it('demotes exactly the three service fields, and summarises the same three', () => {
    const service = Object.entries(LEG_FIELD_TIER)
      .filter(([, tier]) => tier === 'service')
      .map(([key]) => key)
    expect(service.sort()).toEqual(['carrier', 'fromPlace', 'secondMode'])
    // The summary is what keeps a demoted field from reading as a lost one, so it may not fall
    // behind the tier table.
    expect([...SERVICE_FIELD_KEYS].sort()).toEqual(service.sort())
  })

  it('leaves via as the one field with no control at all', () => {
    // A known gap with a ticket on it (#29) rather than an oversight — the model declares `via` and
    // `path.ts` bends a Path through it, and nothing can type one.
    const absent = Object.entries(LEG_FIELD_TIER)
      .filter(([, tier]) => tier === 'absent')
      .map(([key]) => key)
    expect(absent).toEqual(['via'])
    expect(filledOn('via')).toBe(0)
  })

  it('reaches every field the real trip actually fills', () => {
    // The ticket's own condition: every field currently on the card stays reachable and editable.
    const unreachable = (Object.keys(LEG_FIELD_TIER) as (keyof Leg)[]).filter(
      (key) => LEG_FIELD_TIER[key] === 'absent' && filledOn(key) > 0,
    )
    expect(unreachable).toEqual([])
  })
})

describe('the closed service row says what it is holding', () => {
  const leg = (patch: Partial<Leg>): Leg =>
    ({
      mode: 'train',
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
      ...patch,
    }) satisfies Leg

  it('invites rather than summarises when it holds nothing', () => {
    expect(serviceSummary(leg({}))).toBeNull()
  })

  it('names the service, then where it leaves from, then the extra vehicle', () => {
    expect(
      serviceSummary(
        leg({
          carrier: 'A and T Travel via 12go',
          fromPlace: 'Krung Thep Aphiwat',
          secondMode: 'van',
        }),
      ),
    ).toBe('A and T Travel via 12go · Krung Thep Aphiwat · then a van')
  })

  it('says whichever part it has', () => {
    expect(serviceSummary(leg({ carrier: 'KTM ETS' }))).toBe('KTM ETS')
    expect(serviceSummary(leg({ fromPlace: 'Butterworth' }))).toBe(
      'Butterworth',
    )
    expect(serviceSummary(leg({ secondMode: 'van' }))).toBe('then a van')
  })

  it('summarises the sleeper the real trip actually has', () => {
    const aoNang = legs[1]
    expect(aoNang.secondMode).toBe('van')
    expect(serviceSummary(aoNang)).toBe(
      'A and T Travel via 12go · Krung Thep Aphiwat · then a van',
    )
  })

  it('holds something on five of the nine real Legs', () => {
    expect(legs.filter((l) => serviceSummary(l) !== null)).toHaveLength(5)
  })
})

describe('the +1 on the arrival', () => {
  it('is offered once both times are set', () => {
    const bangkok = legs[0]
    expect(bangkok.depart).toBe('18:00')
    expect(bangkok.arrive).toBe('18:05')
    expect(offersDayRoll(bangkok)).toBe(true)
  })

  it('survives an arrival later in the day than its departure', () => {
    /*
     * #28 suggested the +1 appear "when an arrival lands before its departure". Air China leaves
     * Copenhagen at 18:00 and lands in Bangkok at 18:05 the next day, so that heuristic misses the
     * real trip's very first Leg. Nothing derives this: 18h05 added to 18:00 is not 18:05 in any
     * single time zone, and no offset is stored.
     */
    const bangkok = legs[0]
    expect(bangkok.dayRoll).toBe(1)
    expect(bangkok.arrive! > bangkok.depart!).toBe(true)
  })

  it('is withheld while there is nothing for it to modify', () => {
    const kohMook = legs[3]
    expect(kohMook.depart).toBeNull()
    expect(kohMook.arrive).toBeNull()
    expect(kohMook.dayRoll).toBe(0)
    expect(offersDayRoll(kohMook)).toBe(false)
  })

  it('is offered anyway on a Leg that already rolls, so it can be un-rolled', () => {
    // Reachability again: a `+1` that arrived with an imported Leg must not be able to strand itself.
    const rolled = legs[0]
    expect(
      offersDayRoll({ ...rolled, depart: null, arrive: null, dayRoll: 1 }),
    ).toBe(true)
  })
})

describe('the Takes echo', () => {
  it('reads back the units a traveller thinks in', () => {
    expect(hoursAndMinutes(820)).toBe('13h 40m')
    expect(hoursAndMinutes(1085)).toBe('18h 5m')
    expect(hoursAndMinutes(240)).toBe('4h')
    expect(hoursAndMinutes(20)).toBe('20m')
  })

  it('says nothing rather than zero when there is no duration', () => {
    expect(hoursAndMinutes(null)).toBe('—')
  })
})
