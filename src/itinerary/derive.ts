/**
 * Everything the Itinerary knows without being told.
 *
 * This module is the only place a derived fact exists. If a number can be computed from `model.ts`,
 * computing it here is the rule and storing it is the bug — nights are the seed example, but the
 * order and existence of every Leg, both ends of the Trip, and what the map draws at each Stop are
 * all derived too.
 *
 * Dates are plain `YYYY-MM-DD` strings and all arithmetic is done in UTC. There is no time zone in
 * the model on purpose (see `model.ts`), so treating a calendar date as a local `Date` — which is
 * what `new Date('2026-12-20')` does on the wrong side of midnight — would shift it by a day.
 */

import type { Leg, Place, Stay, Stop, Trip } from './model'

const DAY_MS = 86_400_000

function toUtcDay(date: string): number {
  const [y, m, d] = date.split('-').map(Number)
  return Date.UTC(y, m - 1, d)
}

function fromUtcDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10)
}

/** Shifts a `YYYY-MM-DD` string by whole days without ever leaving UTC. */
export function shiftDate(date: string, days: number): string {
  return fromUtcDay(toUtcDay(date) + days * DAY_MS)
}

export function daysBetween(from: string, to: string): number {
  return Math.round((toUtcDay(to) - toUtcDay(from)) / DAY_MS)
}

/** Nights slept at a Stop. The rule every other derivation is measured against. */
export function nightsAt(stop: Stop): number | null {
  if (!stop.arrival || !stop.departure) return null
  return daysBetween(stop.arrival, stop.departure)
}

/**
 * Nights on the Trip — a **span**, not the sum of its Stops.
 *
 * The real trip is 23 nights and its Stops add up to 22. The missing one is spent on the sleeper
 * between Bangkok and Ao Nang, and it belongs to a Leg, so no Stop can account for it. Summing is
 * the tempting wrong answer and it is wrong by exactly the number of overnight Legs.
 */
export function tripNights(trip: Trip): number | null {
  const first = trip.stops.at(0)?.arrival
  const last = trip.stops.at(-1)?.departure
  if (!first || !last) return null
  return daysBetween(first, last)
}

/** The day you leave home: the first Stop's arrival, wound back over any overnight on the way in. */
export function tripStart(trip: Trip): string | null {
  const first = trip.stops.at(0)
  if (!first?.arrival) return null
  return shiftDate(first.arrival, -first.inbound.dayRoll)
}

/** The day you get home. */
export function tripEnd(trip: Trip): string | null {
  const last = trip.stops.at(-1)
  if (!last?.departure) return null
  return shiftDate(last.departure, trip.returnLeg?.dayRoll ?? 0)
}

/** A Leg with the two ends it runs between, resolved. `to` is null on the return Leg. */
export type ResolvedLeg = {
  leg: Leg
  from: Stop | Place | null
  to: Stop | null
}

/**
 * Every Leg in the Itinerary, in order — each Stop's inbound movement, then the return.
 *
 * This is the whole of "Legs are derived from Stop order". Nothing stores which Stops a Leg runs
 * between; it falls out of where the Leg is nested.
 */
export function legsOf(trip: Trip): ResolvedLeg[] {
  const legs: ResolvedLeg[] = trip.stops.map((stop, i) => ({
    leg: stop.inbound,
    from: i === 0 ? trip.origin : trip.stops[i - 1],
    to: stop,
  }))

  if (trip.returnLeg) {
    legs.push({
      leg: trip.returnLeg,
      from: trip.stops.at(-1) ?? null,
      to: null,
    })
  }

  return legs
}

/** The date a Leg departs — anchored to the Stop it arrives at, wound back over any overnight. */
export function legDepartureDate(trip: Trip, index: number): string | null {
  const stop = trip.stops[index]
  if (!stop?.arrival) return null
  return shiftDate(stop.arrival, -stop.inbound.dayRoll)
}

const RANK: Record<Stay['status'], number> = {
  booked: 0,
  placeholder: 1,
  shortlisted: 2,
}

/**
 * The Stay a Stop draws from when it holds more than one — which is legitimate during the window
 * where a replacement has been booked and the incumbent has not yet been cancelled.
 */
export function drawingStay(stop: Stop): Stay | null {
  if (stop.stays.length === 0) return null
  return [...stop.stays].sort((a, b) => RANK[a.status] - RANK[b.status])[0]
}

export type Marker = {
  /** A building stands wherever there is a Booking. A Pin stands where there is not. */
  kind: 'pin' | 'stay-marker'
  coord: { lng: number; lat: number }
  /** Unresolved: nothing booked, or booked only to be replaced. */
  pulsing: boolean
  /** Unplaced: the Booking is real, but no coordinate has been pasted, so this is the Stop's centre. */
  jumping: boolean
}

/**
 * What the map stands at a Stop.
 *
 * A booked bed is always a building, never a Pin — even before anyone has pasted a Google Maps link
 * for it. Without that coordinate the building stands at the Stop's own centre and **jumps**, which
 * asks for the one thing still missing instead of pretending nothing is settled. The two animations
 * are independent: a pulse means unresolved, a jump means unplaced, and a Placeholder with no
 * coordinate is honestly both.
 */
export function markerAt(stop: Stop): Marker {
  const stay = drawingStay(stop)
  const unresolved = !stop.stays.some((s) => s.status === 'booked')

  if (!stay || stay.status === 'shortlisted') {
    return { kind: 'pin', coord: stop.coord, pulsing: true, jumping: false }
  }

  return {
    kind: 'stay-marker',
    coord: stay.coord ?? stop.coord,
    pulsing: unresolved,
    jumping: stay.coord === null,
  }
}

/**
 * Stops whose stored position contradicts their dates.
 *
 * Dragging wins and draws; this only reports (see #10). Returned as the ids of Stops that arrive
 * before the Stop in front of them.
 */
export function orderConflicts(trip: Trip): string[] {
  const conflicts: string[] = []

  for (let i = 1; i < trip.stops.length; i++) {
    const previous = trip.stops[i - 1].arrival
    const current = trip.stops[i].arrival
    if (previous && current && current < previous)
      conflicts.push(trip.stops[i].id)
  }

  return conflicts
}

/** What a Stay costs per night — the arithmetic the source documents write out by hand. */
export function perNight(stay: Stay, stop: Stop): number | null {
  const nights = nightsAt(stop)
  if (!stay.price || !nights) return null
  return stay.price.amount / nights
}

/** Money that cannot be got back any more, grouped by currency because nothing converts. */
export function atRisk(trip: Trip, today: string): Record<string, number> {
  const totals: Record<string, number> = {}

  const add = (
    price: { amount: number; currency: string } | null,
    cancelBy: string | null,
  ) => {
    if (!price) return
    if (cancelBy && cancelBy >= today) return
    totals[price.currency] = (totals[price.currency] ?? 0) + price.amount
  }

  for (const stop of trip.stops) {
    for (const stay of stop.stays) {
      if (stay.booking) add(stay.price, stay.booking.cancelBy)
    }
    if (stop.inbound.booking)
      add(stop.inbound.price, stop.inbound.booking.cancelBy)
  }

  if (trip.returnLeg?.booking) {
    add(trip.returnLeg.price, trip.returnLeg.booking.cancelBy)
  }

  return totals
}
