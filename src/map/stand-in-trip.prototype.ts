import { buildStayMarker } from './stay-marker'
import type { Anchor, ReadSpan } from './model-layer'
import type { LngLatTuple } from './model-matrix'
import { MODEL_ASSETS, type ModelAssetKey } from './models/model-assets'
import { loadModel } from './models/load'

/**
 * PROTOTYPE for #20 — the real SEA trip standing in for the Itinerary nobody can draw yet.
 *
 * A size law cannot be judged on one building on one beach: the question is what the Diorama looks
 * like when nine Stops and ten Legs are on screen at once, at trip zoom, island zoom and street zoom.
 * #8 and #9 own the drawing; this file owns *something to look at* in the meantime, and everything
 * about it that is not size is deliberately crude:
 *
 * - a Vehicle sits at the **great-circle midpoint** of its Leg, at ground level, facing `yaw` 0.
 *   Where a Vehicle really goes, how a Path bends and whether a flight is lifted into the air are
 *   #8's, and nothing here should be read as an answer to any of them.
 * - a Leg's Vias are ignored, so the CPH → BKK plane sits over Kazakhstan rather than over Beijing.
 * - a train is one carriage rather than the coupled a/b/c set #17 built it to be.
 * - every Stop gets a Stay Marker, including Bangkok and Kuala Lumpur, where the real Stay is a city
 *   hotel and not a guesthouse. #9 owns which building depicts which kind of Stay.
 *
 * Coordinates are hand-taken from `~/Documents/sea-xmas/itinerary.md`, which is the trip this MVP has
 * to hold. They are good to a few hundred metres, which is far inside what a size law can tell apart.
 */

type Mode = 'flight' | 'boat' | 'ferry' | 'van' | 'train'

const VEHICLE_FOR: Record<Mode, ModelAssetKey> = {
  flight: 'airliner',
  boat: 'boat_speed',
  ferry: 'ferry',
  van: 'van',
  train: 'train_intercity_nose',
}

/** Copenhagen — the Origin. It is not a Stop, so nothing stands on it. */
export const ORIGIN: LngLatTuple = [12.5683, 55.6761]

type StandInStop = {
  name: string
  at: LngLatTuple
  /** The Mode of the Leg *into* this Stop, per ADR 0003. */
  mode: Mode
}

export const STAND_IN_STOPS: readonly StandInStop[] = [
  { name: 'bangkok', at: [100.5018, 13.7563], mode: 'flight' },
  { name: 'railay', at: [98.838, 8.011], mode: 'flight' },
  { name: 'koh-kradan', at: [99.25546, 7.30365], mode: 'boat' },
  { name: 'koh-bulon-le', at: [99.5586, 6.834], mode: 'boat' },
  { name: 'koh-lipe', at: [99.304, 6.488], mode: 'boat' },
  { name: 'langkawi', at: [99.728, 6.29], mode: 'ferry' },
  { name: 'george-town', at: [100.3354, 5.4141], mode: 'ferry' },
  { name: 'teluk-bahang', at: [100.213, 5.457], mode: 'van' },
  { name: 'kuala-lumpur', at: [101.6869, 3.139], mode: 'train' },
]

/** The Leg home, which has no Stop of its own. */
const RETURN_MODE: Mode = 'flight'

const toRad = (deg: number) => (deg * Math.PI) / 180
const toDeg = (rad: number) => (rad * 180) / Math.PI

/** Halfway along the bird's path, which for CPH → BKK is nowhere near the lng/lat average. */
const midpoint = (
  [lng1, lat1]: LngLatTuple,
  [lng2, lat2]: LngLatTuple,
): LngLatTuple => {
  const φ1 = toRad(lat1)
  const φ2 = toRad(lat2)
  const Δλ = toRad(lng2 - lng1)

  const bx = Math.cos(φ2) * Math.cos(Δλ)
  const by = Math.cos(φ2) * Math.sin(Δλ)

  const φ3 = Math.atan2(
    Math.sin(φ1) + Math.sin(φ2),
    Math.hypot(Math.cos(φ1) + bx, by),
  )
  const λ3 = toRad(lng1) + Math.atan2(by, Math.cos(φ1) + bx)

  return [toDeg(λ3), toDeg(φ3)]
}

/**
 * The size a law reads for an asset: its largest real dimension, and which local axis that is.
 *
 * Straight off `MODEL_ASSETS.sizeM`, which #17 measured from the shipped GLB — so the airliner is
 * read on its 60 m wingspan rather than its 46 m length, and no bounding box is parsed at runtime.
 */
export const readSpanOf = (key: ModelAssetKey): ReadSpan => {
  const [x, y, z] = MODEL_ASSETS[key].sizeM
  const metres = Math.max(x, y, z)

  return { axis: metres === x ? 'x' : metres === y ? 'y' : 'z', metres }
}

/**
 * Every anchor the stand-in trip puts on the map: a Stay Marker at each Stop, a Vehicle at the
 * midpoint of each Leg — nine and ten, which is the load a real Itinerary draws.
 */
export async function buildStandInAnchors(): Promise<Anchor[]> {
  const stays = STAND_IN_STOPS.map(async (stop): Promise<Anchor> => ({
    id: `stay-${stop.name}`,
    origin: stop.at,
    content: await buildStayMarker(),
    role: 'stay',
    read: readSpanOf('stay_guesthouse'),
  }))

  const legs = [
    ...STAND_IN_STOPS.map((stop, i) => ({
      name: stop.name,
      mode: stop.mode,
      from: i === 0 ? ORIGIN : STAND_IN_STOPS[i - 1].at,
      to: stop.at,
    })),
    {
      name: 'home',
      mode: RETURN_MODE,
      from: STAND_IN_STOPS[STAND_IN_STOPS.length - 1].at,
      to: ORIGIN,
    },
  ].map(async (leg): Promise<Anchor> => {
    const key = VEHICLE_FOR[leg.mode]

    return {
      id: `vehicle-${leg.name}`,
      origin: midpoint(leg.from, leg.to),
      content: await loadModel(key),
      role: 'vehicle',
      read: readSpanOf(key),
    }
  })

  return Promise.all([...stays, ...legs])
}

/**
 * The three cameras #20 has to be judged at, plus the continental one the long-hauls need. Driven by
 * `?view=` so a screenshot is reproducible rather than hand-dragged.
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
  /**
   * Closer than #7's own ladder went, and the only camera where the two ratchet laws part company: a
   * 48 px target is bigger than a Stay Marker's true apparent size at anything below **z18.7**, so
   * below that every law here is a constant-apparent-size law and they draw pixel-identically. Where
   * a law "arrives at true scale" is only visible past the crossover.
   */
  close: {
    label: 'close',
    centre: [99.25546, 7.30365] as LngLatTuple,
    zoom: 20,
    pitch: 60,
    bearing: -22,
  },
} as const

export type ViewKey = keyof typeof VIEWS

export const viewFromUrl = (): ViewKey | undefined => {
  const asked = new URLSearchParams(window.location.search).get('view')
  return asked && asked in VIEWS ? (asked as ViewKey) : undefined
}
