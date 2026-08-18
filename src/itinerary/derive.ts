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

import { newLeg } from './create'
import type { Booking, Leg, Money, Place, Stay, Stop, Trip } from './model'

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

/**
 * Whether nothing has ever been entered against this Leg.
 *
 * Field-by-field against `newLeg()` rather than a hand-kept list, so a field added to `Leg` is
 * compared the day it exists — a list would quietly stop noticing the new field, and a Leg holding
 * data would be treated as blank. What hangs on this is visibility: the sidebar collapses an
 * untouched Leg out of the ribbon while its Stop is still unnamed (#27), and collapsing a *touched*
 * one would be the fold-that-loses-a-carrier lie in one more place (#30).
 */
export function legUntouched(leg: Leg): boolean {
  const blank = newLeg()
  return (Object.keys(blank) as (keyof Leg)[]).every((key) =>
    key === 'via' ? leg.via.length === 0 : leg[key] === blank[key],
  )
}

/** The date a Leg departs — anchored to the Stop it arrives at, wound back over any overnight. */
export function legDepartureDate(trip: Trip, index: number): string | null {
  const stop = trip.stops[index]
  if (!stop?.arrival) return null
  return shiftDate(stop.arrival, -stop.inbound.dayRoll)
}

/**
 * The last date the Itinerary knows of before a Stop — the floor its own dates sit on.
 *
 * A trip's dates are sequential: you cannot arrive at Koh Mook before you left Koh Kradan. This is a
 * **floor and never a value**, which is the distinction `model.ts` insists on — a Stop's arrival is
 * *not* derivable from the previous departure, because an overnight Leg puts a night between them.
 * What it buys is a date field that opens where the trip is instead of on today.
 *
 * It walks backwards until it finds a Stop carrying a date, so one half-filled Stop in the middle
 * does not break the chain for everything after it. The nearest Stop in front wins rather than the
 * latest date anywhere before it: a dragged order that contradicts its own dates is allowed to stand
 * (#10), and this follows the ribbon rather than policing it.
 *
 * `null` on the first Stop, which is correct — nothing precedes it, so today is genuinely the best
 * guess there, and today is already where an unconstrained picker opens.
 */
export function dateFloor(trip: Trip, index: number): string | null {
  for (let i = index - 1; i >= 0; i--) {
    // Departure first: it is the later of the two, and the one you actually leave on.
    const date = trip.stops[i].departure ?? trip.stops[i].arrival
    if (date) return date
  }

  return null
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
  /**
   * Where the Stop is marked: the bed's own coordinate when a Stay has one, and the Stop's centre
   * when it does not.
   *
   * One coordinate, not two, and that is [#9](https://github.com/adrianpetersson/onward/issues/9)'s
   * ruling rather than a convenience. A Stop's centre is what a geocoder returns for the *name* —
   * Bangkok's is 6.6 km from a bed on Sukhumvit and Koh Kradan's is 780 m from the hut on Ao Niang —
   * and the traveller never chose it. The bed is the place he actually goes, so it is what the map
   * points at as soon as it knows it.
   */
  coord: { lng: number; lat: number }
  /**
   * A Stay Marker stands here too, from the zoom its own true size earns (#20). False where nothing
   * is booked, so there is no building to draw and the Pin is the whole marker at every zoom.
   */
  building: boolean
  /** Unresolved: nothing booked, or booked only to be replaced. */
  pulsing: boolean
  /** Unplaced: the Booking is real, but no coordinate has been pasted, so this is the Stop's centre. */
  jumping: boolean
}

/**
 * What the map stands at a Stop. **Always a Pin**, and sometimes a building underneath it.
 *
 * This used to return a `kind` — Pin *or* Stay Marker — and #9 found that the choice cannot be made,
 * because the two are never on screen at the same time to choose between: a Stay Marker was not drawn
 * below z17, and at z17 the viewport is 853 m wide, which is narrower than the gap between a Stop's
 * centre and its own bed at most Stops on the real trip. An either/or therefore left every Stop
 * unmarked at exactly the zoom the traveller was looking at it, and left the building — drawn at
 * true metres, per #20 — indistinguishable from the OSM extrusions either side of it.
 *
 * So a Pin marks every Stop at every zoom, and `building` says whether one also rises beneath it.
 * Both stand at the same coordinate, which is what dissolves the question.
 *
 * **#21 weakened that argument and cannot reach the conclusion.** The Stay Marker is now a 40 m tower
 * drawn from **z14.8**, where the viewport is ~3.3 km — wider than Koh Kradan's 780 m gap and George
 * Town's 1.1 km, so those gaps *would* now fit on screen where #9 measured that they could not (only
 * Bangkok's 6.6 km still would not). What saves the ruling is that #9 did not merely observe the gap
 * was invisible, it **removed the second coordinate**: there is one `coord` here, so there is no gap
 * left to become visible. The reasoning is weaker; the outcome is untouched.
 *
 * The two animations remain independent: a pulse means unresolved, a jump means unplaced, and a
 * Placeholder nobody has pasted a link for is honestly both.
 */
export function markerAt(stop: Stop): Marker {
  const stay = drawingStay(stop)
  const unresolved = !stop.stays.some((s) => s.status === 'booked')

  // A Shortlisted Stay is a name and an intention: nothing is committed, so nothing is built.
  if (!stay || stay.status === 'shortlisted') {
    return {
      coord: stop.coord,
      building: false,
      pulsing: true,
      jumping: false,
    }
  }

  return {
    coord: stay.coord ?? stop.coord,
    building: true,
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

/**
 * Today, as the traveller's own calendar date.
 *
 * The one impure line in this file, and the only one. Every derivation below takes `today` as an
 * argument so it can be tested against a fixed date; this exists for the callers who genuinely mean
 * *now*.
 *
 * It reads the **local** date parts rather than slicing `toISOString()`, because a `cancelBy` is a
 * wall-clock date somebody copied off a booking confirmation. At 01:00 in Stockholm the UTC day is
 * still yesterday, and a deadline is not a thing to be a day wrong about.
 */
export function today(): string {
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

/**
 * A Booking that a removal is about to destroy, and the three facts that make destroying it matter.
 *
 * The unit is the **Booking**, not the money — see
 * [#19](https://github.com/adrianpetersson/onward/issues/19). A `price` with no Booking beside it is
 * an intention (a Shortlisted target's asking price, a fare nobody has bought) and removing it costs
 * nothing but retyping. A Booking is the only thing in the model that exists somewhere other than
 * Onward, so it is the only thing Onward cannot recreate.
 *
 * `reference` may be `''`: the sidebar writes an empty one the instant "＋ I have booked this" is
 * clicked, and [#12](https://github.com/adrianpetersson/onward/issues/12) found that treating that
 * state as "not really a Booking" is what destroys a real cancellation deadline and a real phone
 * number. So a Booking counts here from the click, not from the reference.
 */
export type Loss = {
  kind: 'stay' | 'leg'
  /** The Stay's own name, or the Leg's Mode — whatever names it in one phrase. `null` when neither. */
  name: string | null
  /** Possibly `''` — see above. */
  reference: string
  /** Who to go and cancel it with. The removal names it, because that is the errand it creates. */
  platform: string | null
  cancelBy: string | null
  /** The money the Booking committed, which lives on the Stay or Leg rather than on the Booking. */
  price: Money | null
  /**
   * What cancelling would still achieve, as of `today`:
   *
   * - `live` — the window is open, so the money comes back **if** the traveller goes and asks for it
   *   somewhere that is not Onward. The dangerous removal, and the reason this type exists.
   * - `passed` — the deadline is behind us and the money is already spent, whatever happens to the row.
   * - `none` — never refundable (`cancelBy` is `null`, per `model.ts`).
   */
  deadline: 'live' | 'passed' | 'none'
}

/**
 * One Booking, read as what destroying it would cost. `null` when there is no Booking to destroy,
 * which is the answer that lets every call site treat "nothing committed here" uniformly.
 */
export function lossOfBooking(
  kind: Loss['kind'],
  name: string | null,
  booking: Booking | null,
  price: Money | null,
  today: string,
): Loss | null {
  if (!booking) return null

  // An entirely blank Booking is not a loss — it is a mis-click on "＋ I have booked this" and the
  // click that undoes it should not have to argue. Note what this does *not* test: an empty
  // `reference`. #12 found that reading a reference-less Booking as "not really a Booking" is
  // precisely what destroys a real cancellation deadline and a real phone number, entered in the
  // window before the confirmation email arrives. Any one field written down makes this real.
  //
  // The row's `price` is deliberately *not* part of that test. It used to be, and it was wrong: a
  // Shortlisted Stay carries a real asking price (Langkawi's 2,250 SEK) with nothing committed, so
  // one click of "＋ I have booked this" followed by one of "not booked after all" fired the guard
  // and told the traveller that money was already spent. The unit is the Booking; a price beside a
  // blank one is still an intention.
  const written =
    booking.reference ||
    booking.platform ||
    booking.cancelBy ||
    booking.contact ||
    booking.detail
  if (!written) return null

  return {
    kind,
    name: name || null,
    reference: booking.reference,
    platform: booking.platform,
    cancelBy: booking.cancelBy,
    price,
    deadline:
      booking.cancelBy === null
        ? 'none'
        : booking.cancelBy >= today
          ? 'live'
          : 'passed',
  }
}

/** What removing one Stay destroys: its own Booking, or nothing. */
export function lossesOfStay(stay: Stay, today: string): Loss[] {
  const loss = lossOfBooking('stay', stay.name, stay.booking, stay.price, today)
  return loss ? [loss] : []
}

/**
 * What removing a Stop destroys — every Booking underneath it.
 *
 * That is wider than it first reads. A Stop owns its Stays *and* the Leg that arrives at it
 * ([ADR 0003](../../docs/adr/0003-a-leg-is-stored-on-the-stop-it-arrives-at.md)), so removing the
 * first Stop of the real trip takes Air China `EEOIO2` — the flight out of Copenhagen — with it.
 *
 * Stays first, in their own order, then the way in.
 */
export function lossesOfStop(stop: Stop, today: string): Loss[] {
  const wayIn = lossOfBooking(
    'leg',
    stop.inbound.mode,
    stop.inbound.booking,
    stop.inbound.price,
    today,
  )

  return [
    ...stop.stays.flatMap((stay) => lossesOfStay(stay, today)),
    ...(wayIn ? [wayIn] : []),
  ]
}

/**
 * A Leg still holding the times, fare and carrier of a movement that is no longer the movement it
 * describes.
 *
 * A Leg is stored on the Stop it arrives at and its two ends are derived from where that Stop sits
 * ([ADR 0003](../../docs/adr/0003-a-leg-is-stored-on-the-stop-it-arrives-at.md)), so re-pointing a Leg
 * takes nothing more than moving a Stop past another one. The annotations do not move with the ends:
 * the Koh Kradan speedboat dragged above Ao Nang keeps `09:30`, `575 SEK` and `Bundhaya` and now
 * claims they belong to a crossing nobody ever booked.
 */
export type StaleLeg = {
  /** The Stop whose inbound Leg went stale. `null` is the Leg home, which runs from the last Stop. */
  stopId: string | null
  /** The name of what it used to run from — a Stop that may since have been removed, or the Origin. */
  wasFrom: string | null
  /**
   * The name of what it runs from now.
   *
   * Both ends are reported because only one of them is not enough to be honest. "Koh Mook no longer
   * comes before this" is false after a one-place drag — Koh Mook is usually still earlier in the
   * trip, just no longer *immediately* before — so what changed is stated as the pair it is.
   */
  nowFrom: string | null
}

/** The id of what comes before the Stop at `index` — `null` meaning the Origin, of which there is one. */
function predecessorId(trip: Trip, index: number): string | null {
  return index === 0 ? null : trip.stops[index - 1].id
}

/**
 * Every Leg whose ends have changed since the last Save.
 *
 * **A pure comparison of two Trips, storing nothing.** The draft says where each Stop sits now and
 * `committed` says where it sat when the Leg was entered, so "which Legs are lying" needs no
 * `movedFrom` bookkeeping on the model and no memory of the drag that did it — a Leg is stale exactly
 * when the thing in front of it is a different thing.
 *
 * That definition is wider than the drag it was written for, and deliberately so: **removing** a Stop
 * re-points the Leg of the Stop that closes the gap, and **inserting** one re-points the Leg of the
 * Stop it was inserted above. All three arrive here for free, because all three change a predecessor.
 * One drag can stale up to three Legs — the moved Stop's, the one now behind it, and the one that
 * closed the gap it left.
 *
 * A Stop that is not in `committed` was inserted since the last Save, so it was never entered against
 * anything and cannot be stale. Saving clears every flag, because a reorder the traveller saved is a
 * reorder he meant ([#19](https://github.com/adrianpetersson/onward/issues/19)).
 */
export function staleLegs(draft: Trip, committed: Trip): StaleLeg[] {
  const before = new Map(
    committed.stops.map((stop, i) => [stop.id, predecessorId(committed, i)]),
  )
  /** A predecessor id read as a name, in whichever Trip still holds the Stop it points at. */
  const nameIn = (trip: Trip, id: string | null): string | null =>
    id === null
      ? trip.origin?.name || null
      : trip.stops.find((stop) => stop.id === id)?.name || null

  const stale: StaleLeg[] = draft.stops.flatMap((stop, i) => {
    if (!before.has(stop.id)) return []

    const was = before.get(stop.id) ?? null
    const now = predecessorId(draft, i)
    if (was === now) return []

    return [
      {
        stopId: stop.id,
        wasFrom: nameIn(committed, was),
        nowFrom: nameIn(draft, now),
      },
    ]
  })

  // The Leg home is the one Leg with no Stop of its own. It runs from whichever Stop ends the trip,
  // so it goes stale when a different Stop ends it — and only once it exists, which is why a Trip
  // whose `returnLeg` is still `null` is silent here (#30 owns what that placeholder shows).
  //
  // Its ends are Stops rather than predecessor slots, so `null` here means "no Stop at all" and must
  // not fall through to the Origin's name the way a first Stop's predecessor does.
  if (committed.returnLeg && draft.returnLeg) {
    const was = committed.stops.at(-1)?.id ?? null
    const now = draft.stops.at(-1)?.id ?? null
    if (was !== now)
      stale.push({
        stopId: null,
        wasFrom: was === null ? null : nameIn(committed, was),
        nowFrom: now === null ? null : nameIn(draft, now),
      })
  }

  return stale
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
