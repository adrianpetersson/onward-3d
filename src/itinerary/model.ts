/**
 * The Itinerary, as data.
 *
 * Every field here earned its place against the real Southeast Asia trip rather than against an
 * imagined one — see [#10](https://github.com/adrianpetersson/onward/issues/10) for the audit, which
 * records what was cut and why. Two shapes are worth knowing before reading:
 *
 * - **A Leg is stored on the Stop it arrives at**, not in a list keyed by its endpoints. See
 *   [ADR 0003](../../docs/adr/0003-a-leg-is-stored-on-the-stop-it-arrives-at.md).
 * - **One booked movement is one Leg**, however many vehicles it takes — which is what holds
 *   `secondMode` to exactly one extra everywhere in the real trip.
 *
 * Nothing derivable is stored. `nights` is the famous case, but it is not the only one: durations,
 * per-night rates, booked-ness, refundability and the whole existence and order of Legs all fall out
 * of what is here. The derivations live in `derive.ts` and are the only place they exist.
 */

/** How a Leg is travelled. Drives which Vehicle is drawn; the Vehicle itself is never stored. */
export type Mode = 'flight' | 'train' | 'ferry' | 'boat' | 'bus' | 'van'

export type Coord = { lng: number; lat: number }

/**
 * How much ground a Stop covers — the rectangle it sits inside. Koh Kradan's is the island; Bangkok's
 * is the city.
 *
 * Named edges rather than a tuple: it arrives from the geocoder as `[west, north, east, south]`,
 * which is an ordering worth reading twice and never worth trusting to an index.
 *
 * Optional, and only ever known for a Stop the traveller *found by name* — a Stop placed by pasting a
 * link or clicking the map has none, and there is no way to acquire one later. Whatever reads it must
 * therefore work without it.
 */
export type Footprint = {
  west: number
  north: number
  east: number
  south: number
}

/** A named point that is not a Stop: a Trip's Origin, and a Leg's Vias. */
export type Place = Coord & { name: string }

/**
 * Four currencies appear on one trip (SEK, THB, MYR, EUR) and none is ever converted into another —
 * a keyless client-side app has no rate source, so a total across them would be a guess wearing a
 * decimal point.
 */
export type Money = { amount: number; currency: string }

export type StayStatus = 'booked' | 'placeholder' | 'shortlisted'

/**
 * A reservation that has been made and has a reference number.
 *
 * `reference` is non-optional on purpose: without one there is no Booking, only an intention, and an
 * intention lives in the `price` of the Stay or Leg it sits beside. This is one type rather than two
 * because the glossary already said so — a Booking attaches to a Stop (a Stay) or to a Leg.
 *
 * **But it may be `''`, and nothing may treat that as "not a Booking".** The sidebar writes an empty
 * one the moment "＋ I have booked this" is clicked, and a real bed booked by phone carries a deadline
 * and a phone number before its confirmation email arrives.
 * [#12](https://github.com/adrianpetersson/onward/issues/12) enforced the rule above literally and
 * deleted exactly that, and [ADR 0010](../../docs/adr/0010-a-removal-hands-back-what-it-destroys.md)
 * is what now guards it: the removal guard asks whether *any* field has been written into, never
 * whether this one has.
 */
export type Booking = {
  /** `688166919` · `EEOIO2` · `MMMNEN`. The one string that makes this a Booking at all. */
  reference: string
  /** Agoda, Booking, or the guesthouse direct. Free text: this audience books beach huts. */
  platform: string | null
  /** Free-cancellation deadline, date only. `null` means non-refundable. */
  cancelBy: string | null
  /** One number that survives offline. On an island with no roads it *is* the arrival logistics. */
  contact: string | null
  /**
   * Paperwork Onward displays and never computes on — seat numbers, baggage allowance, the name the
   * booking was made under. Deliberately one free-text field rather than a column each: every one of
   * those columns was considered and cut for appearing once.
   */
  detail: string | null
}

export type Stay = {
  name: string
  /**
   * Intent, not paperwork — which is why it cannot be derived from `booking`. A Placeholder and a
   * Booked Stay both carry a real reference and real money; only this says which one you mean to
   * cancel. The map reads it.
   */
  status: StayStatus
  /** Pasted from a Google Maps URL, or clicked. `null` until then, which is the common case. */
  coord: Coord | null
  /** Paid, or merely targeted — `status` says which. */
  price: Money | null
  /** `null` on a Shortlisted Stay: nothing to reference, nothing to cancel. */
  booking: Booking | null
}

export type Leg = {
  /**
   * The Mode the map draws — and `null` until it is known.
   *
   * The audit had this non-null, on the grounds that most unbooked Legs know their Mode and nothing
   * else. Implementation disagreed: inserting a Stop mid-trip creates a Leg on the spot, and there
   * is no honest default for it. Guessing `flight` would stand a plane on a twenty-minute hop
   * between two islands. No Vehicle is drawn until this is set.
   */
  mode: Mode | null
  /** A second vehicle under the same ticket: the sleeper that ends in a van. */
  secondMode: Mode | null
  /** Local wall clock, `HH:mm`. No offset is stored — none is knowable client-side, and a hand-typed wrong one would silently corrupt every derived figure. */
  depart: string | null
  /** Local wall clock, `HH:mm`. The date is not stored; it is anchored to the arriving Stop. */
  arrive: string | null
  /** `1` when arrival lands the day after departure — the trip's own `(+1)` notation. Anchors the departure date. */
  dayRoll: number
  /**
   * Not derivable from two wall clocks across time zones: 18:00 → 09:45 is 8h45, not 15h45. It is
   * also the only quantitative fact most unbooked Legs have — "ferry, 1h30" and nothing else.
   */
  durationMin: number | null
  /** The fare of the movement, quoted or paid. */
  price: Money | null
  /** Known before any ticket exists, so it cannot belong to the Booking. */
  carrier: string | null
  /** Where you must physically be, which the departing Stop does not say — a station, a pier, the next beach along. */
  fromPlace: string | null
  /** Points that visibly bend the Path. A layover in Beijing does; a speedboat's call at Koh Ngai is sub-pixel and belongs in `note`. */
  via: Place[]
  /** Operational prose. With `Booking.detail`, one of only two free-text fields in the whole model. */
  note: string | null
  booking: Booking | null
}

export type Stop = {
  /** Position is order, so it cannot also be identity — Stops are dragged, swapped and renamed. */
  id: string
  /**
   * The traveller's phrasing, and **only** the traveller's.
   *
   * This once read "seeded from the geocoder and then owned by him", which
   * [#18](https://github.com/adrianpetersson/onward/issues/18) made false: search now happens *in*
   * this field, so the traveller types the name first and picking a result never rewrites it. He
   * typed `Koh Mook` because that is what the ferry ticket says; OSM's `Ko Muk` is shown on the row he
   * picked and on the map's own labels, and never here. The one thing that still seeds a name is a
   * pasted Google Maps link, into an empty field only.
   */
  name: string
  /** Always present. A Stop that cannot be drawn cannot exist. */
  coord: Coord
  /**
   * How big this Stop is, when it is known — see {@link Footprint}. Captured when a Stop is found by
   * name, because it cannot be recovered afterwards: re-running the search months later may not
   * return the same record. `null` for every Stop placed by paste or by click, which is most of them.
   */
  footprint: Footprint | null
  /** Date only. Every time of day on this trip belongs to a service, and therefore to a Leg. */
  arrival: string | null
  /** Date only, and **not** derivable from the next Stop's arrival — an overnight Leg puts a night between them. */
  departure: string | null
  /** The movement into this Stop. On the first Stop, the movement from the Trip's Origin. */
  inbound: Leg
  /**
   * A list, not one. "Book the replacement before cancelling the incumbent" mandates a window in
   * which a single Stop legitimately holds two real Bookings.
   */
  stays: Stay[]
}

export type Trip = {
  id: string
  /** The place-word only. Any date in the title is derived, or it goes stale the moment a Leg moves. */
  name: string
  /** Home. One place used twice — out and back. `null` until it has been searched for. */
  origin: Place | null
  /** Stored order: the array index **is** the order, so there is no second copy to fall out of sync. */
  stops: Stop[]
  /** The one Leg that arrives nowhere. `null` when a Trip does not return to its Origin. */
  returnLeg: Leg | null
}
