import type { LngLatTuple } from './model-matrix'
import type { ModelAssetKey } from './models/model-assets'

/**
 * PROTOTYPE for #8 — the real SEA trip standing in for the Itinerary nobody can draw yet.
 *
 * Inherited from #20's prototype, which built the same trip to judge a size law and said outright
 * that where a Vehicle goes and how a Path bends were #8's. This is that file with the crude parts
 * taken seriously: Legs now carry their **Vias**, so the CPH → BKK Path bends through Beijing
 * instead of cutting over Kazakhstan, and the Bangkok → Railay Leg is the overnight **sleeper that
 * ends in a van** the glossary describes rather than a third flight.
 *
 * Still deliberately crude, and none of it is #8's to answer:
 *
 * - every Stop gets the one guesthouse model, including Bangkok and Kuala Lumpur. Which building
 *   depicts which kind of Stay is #9's.
 * - a train is one carriage rather than the coupled a/b/c set #17 built it to be.
 *
 * Coordinates are hand-taken to a few hundred metres, which is far inside what any question here can
 * tell apart.
 */

export type StandInMode = 'flight' | 'boat' | 'ferry' | 'van' | 'train'

export const VEHICLE_FOR: Record<StandInMode, ModelAssetKey> = {
  flight: 'airliner',
  boat: 'boat_speed',
  ferry: 'ferry',
  van: 'van',
  train: 'train_sleeper_nose',
}

/** Copenhagen — the Origin. It is not a Stop, so nothing stands on it. */
export const ORIGIN: LngLatTuple = [12.5683, 55.6761]

export type StandInStop = {
  name: string
  at: LngLatTuple
  /** The Mode of the Leg *into* this Stop, per ADR 0003. */
  mode: StandInMode
  /**
   * A second vehicle under the same ticket. Carried because the real trip has one — the Bangkok
   * sleeper that ends in a van — and because `CONTEXT.md` already rules that **the first Mode is the
   * one the map draws**, which is a claim worth being able to look at rather than only read.
   */
  secondMode?: StandInMode
  /** Named points the Path passes through without staying. */
  via?: readonly { name: string; at: LngLatTuple }[]
}

export const STAND_IN_STOPS: readonly StandInStop[] = [
  {
    name: 'bangkok',
    at: [100.5018, 13.7563],
    mode: 'flight',
    via: [{ name: 'beijing', at: [116.4074, 39.9042] }],
  },
  { name: 'railay', at: [98.838, 8.011], mode: 'train', secondMode: 'van' },
  { name: 'koh-kradan', at: [99.25546, 7.30365], mode: 'boat' },
  { name: 'koh-bulon-le', at: [99.5586, 6.834], mode: 'boat' },
  { name: 'koh-lipe', at: [99.304, 6.488], mode: 'boat' },
  { name: 'langkawi', at: [99.728, 6.29], mode: 'ferry' },
  { name: 'george-town', at: [100.3354, 5.4141], mode: 'ferry' },
  { name: 'teluk-bahang', at: [100.213, 5.457], mode: 'van' },
  { name: 'kuala-lumpur', at: [101.6869, 3.139], mode: 'train' },
]

/** The Leg home, which has no Stop of its own. Real routing goes through the Gulf. */
export const RETURN_LEG: {
  name: string
  mode: StandInMode
  via: readonly { name: string; at: LngLatTuple }[]
} = {
  name: 'home',
  mode: 'flight',
  via: [{ name: 'dubai', at: [55.3657, 25.2532] }],
}

/** One Leg of the stand-in Itinerary, with both ends resolved — `legsOf` for a trip that has no model yet. */
export type StandInLeg = {
  name: string
  mode: StandInMode
  secondMode?: StandInMode
  from: LngLatTuple
  to: LngLatTuple
  via: readonly LngLatTuple[]
}

export const standInLegs = (): StandInLeg[] => [
  ...STAND_IN_STOPS.map((stop, i) => ({
    name: stop.name,
    mode: stop.mode,
    secondMode: stop.secondMode,
    from: i === 0 ? ORIGIN : STAND_IN_STOPS[i - 1].at,
    to: stop.at,
    via: (stop.via ?? []).map((v) => v.at),
  })),
  {
    ...RETURN_LEG,
    from: STAND_IN_STOPS[STAND_IN_STOPS.length - 1].at,
    to: ORIGIN,
    via: RETURN_LEG.via.map((v) => v.at),
  },
]

/**
 * The cameras this ticket has to be judged at, driven by `?view=` so a screenshot is reproducible
 * rather than hand-dragged. #20's ladder, plus **`hops`** — the one camera that frames the three
 * near-parallel speedboat Legs the ticket asks about, and the only place they can be told apart.
 */
export const VIEWS = {
  trip: {
    label: 'trip',
    centre: [56.5, 30] as LngLatTuple,
    zoom: 2.4,
    pitch: 0,
    bearing: 0,
  },
  region: {
    label: 'region',
    centre: [100.2, 8.5] as LngLatTuple,
    zoom: 5.6,
    pitch: 0,
    bearing: 0,
  },
  /** The island-hop chain end to end: Railay down to Lipe, where three boat Legs nearly coincide. */
  hops: {
    label: 'hops',
    centre: [99.2, 7.2] as LngLatTuple,
    zoom: 8.2,
    pitch: 0,
    bearing: 0,
  },
  /** The same chain, pitched — a Path on a pitched camera is a different drawing problem. */
  hopsPitched: {
    label: 'hops pitched',
    centre: [99.2, 7.0] as LngLatTuple,
    zoom: 8.2,
    pitch: 60,
    bearing: -22,
  },
  island: {
    label: 'island',
    centre: [99.2555, 7.3037] as LngLatTuple,
    zoom: 13.2,
    pitch: 50,
    bearing: -22,
  },
  street: {
    label: 'street',
    centre: [99.25546, 7.30365] as LngLatTuple,
    zoom: 18,
    pitch: 60,
    bearing: -22,
  },
} as const

export type ViewKey = keyof typeof VIEWS

export const viewFromUrl = (): ViewKey | undefined => {
  const asked = new URLSearchParams(window.location.search).get('view')
  return asked && asked in VIEWS ? (asked as ViewKey) : undefined
}
