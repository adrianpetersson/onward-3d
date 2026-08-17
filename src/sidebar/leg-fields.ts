/**
 * Which of a Leg's fields the card asks for first, and which it keeps folded away.
 *
 * The split is the real trip's own, not a guess. Measured across the nine Legs of
 * `docs/real-trip/sea-xmas-2026.json`, three fields are filled on every single one — **Mode,
 * `durationMin` and `note`** — while `depart` and `arrive` are filled on four, `price`, `carrier` and
 * `fromPlace` on five, `dayRoll` on two, `secondMode` on one and `via` on none.
 *
 * That measurement overturned the plan this came from
 * ([#28](https://github.com/adrianpetersson/onward/issues/28)), which demoted `durationMin` as a
 * "derived display, empty on every Leg". It is the opposite: **five Legs carry a duration and no
 * times at all** — Koh Mook, Koh Lipe, Langkawi, George Town and Kuala Lumpur — which is exactly what
 * `model.ts` says it is for, "the only quantitative fact most unbooked Legs have". Demoting it would
 * have folded away the one thing most Legs know. What *is* a derived display is the `That is` echo
 * beside it, and that now rides inside the same field instead of costing a row of its own.
 *
 * Nothing is deleted, only demoted: `edit-leg` applies a `Partial<Leg>` over the existing Leg, so a
 * field the card stops rendering keeps its value, and everything `parse.ts` imported survives any
 * number of edits made in the reduced card. What demotion *can* still cost is visibility — a filled
 * `carrier` hidden behind a closed fold reads as lost — which is what {@link serviceSummary} is for.
 */

import type { Leg } from '../itinerary/model'

/**
 * Where a Leg's field sits on the card.
 *
 * - `fast` — above the fold, asked on every Leg.
 * - `service` — behind `＋ Who runs it, and where it leaves from`, and summarised on that row when set.
 * - `booking` — behind `＋ I have booked this ticket`, which predates this split and set its pattern.
 * - `absent` — no control anywhere. One field only, and it is a known gap rather than a decision:
 *   `via` is declared in the model and drawn by `path.ts`, and
 *   [#29](https://github.com/adrianpetersson/onward/issues/29) owns its door.
 *
 * Typed as `Record<keyof Leg, …>` on purpose: adding a field to `Leg` fails the build until someone
 * says out loud which tier it belongs in, which is the only durable defence against a field that
 * exists in the data and nowhere on screen.
 */
export type LegFieldTier = 'fast' | 'service' | 'booking' | 'absent'

export const LEG_FIELD_TIER: Record<keyof Leg, LegFieldTier> = {
  mode: 'fast',
  depart: 'fast',
  arrive: 'fast',
  dayRoll: 'fast',
  durationMin: 'fast',
  price: 'fast',
  note: 'fast',

  carrier: 'service',
  fromPlace: 'service',
  secondMode: 'service',

  booking: 'booking',

  via: 'absent',
}

/** The service tier, in the order it reads — the two that name the service, then the extra vehicle. */
const SERVICE_FIELDS: {
  key: keyof Leg
  /** How this field says itself on the closed row. `null` when unset. */
  summarise: (leg: Leg) => string | null
}[] = [
  { key: 'carrier', summarise: (leg) => leg.carrier },
  { key: 'fromPlace', summarise: (leg) => leg.fromPlace },
  {
    key: 'secondMode',
    summarise: (leg) => (leg.secondMode ? `then a ${leg.secondMode}` : null),
  },
]

/**
 * What the closed service row says when it is holding something.
 *
 * `null` when it holds nothing, which is when the row is free to be an invitation instead. The point
 * is that a demoted field is *summarised* rather than hidden: on the real trip five of nine Legs have
 * a carrier, and a fold that showed no sign of it would be the same lie
 * [#30](https://github.com/adrianpetersson/onward/issues/30) records in a different place.
 */
export function serviceSummary(leg: Leg): string | null {
  const parts = SERVICE_FIELDS.map((field) => field.summarise(leg)).filter(
    (part): part is string => part !== null && part !== '',
  )
  return parts.length === 0 ? null : parts.join(' · ')
}

/**
 * Whether to offer the `+1` on the arrival.
 *
 * `dayRoll` cannot be derived and the obvious heuristic is measurably wrong: #28 suggested it appear
 * "when an arrival lands before its departure", and the real trip's very first Leg is Air China
 * **18:00 → 18:05 (+1)** — an arrival *after* its departure that still rolls a day, because the
 * flight takes 18h05. Nor can it be computed from `depart` plus `durationMin`: the two clocks are in
 * different zones and no offset is stored, which is the same reason `model.ts` refuses to derive
 * `durationMin` from them. So it stays a control, and only appears where it could mean anything —
 * once both times are set, or if it is already rolled, so that a Leg imported with a `+1` can always
 * be un-rolled.
 */
export function offersDayRoll(leg: Leg): boolean {
  return (leg.depart !== null && leg.arrive !== null) || leg.dayRoll !== 0
}

/** `820` → `13h 40m`. The `Takes` field's own echo, in the units a traveller thinks in. */
export function hoursAndMinutes(minutes: number | null): string {
  if (minutes === null) return '—'
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return h === 0 ? `${m}m` : m === 0 ? `${h}h` : `${h}h ${m}m`
}

/** Exported for the test that keeps {@link SERVICE_FIELDS} and {@link LEG_FIELD_TIER} agreeing. */
export const SERVICE_FIELD_KEYS = SERVICE_FIELDS.map((field) => field.key)
