import { Group } from 'three'

import { markerAt } from '../itinerary/derive'
import type { Stop, Trip } from '../itinerary/model'
import { buildShadowCatcher, SUN } from './diorama-light'
import type { Anchor } from './model-layer'
import type { LngLatTuple } from './model-matrix'
import { readSpanOf } from './model-scale'
import { isPlaced } from './pin'
import { loadModel } from './models/load'
import { MODEL_ASSETS } from './models/model-assets'

/**
 * The 3D building that stands at a Stop once its Stay is more than a shortlisted idea.
 *
 * This is the tracer #7 fired: the first real model on the map. It stands at true metre scale —
 * 40 m to the parapet on a 17.6 × 20 m footprint — because the model matrix maps one unit to one
 * metre and the tower is measured into the table at real size. #20 rules that it is never
 * exaggerated and simply not drawn below 15 px, which for this model is **z14.8**.
 *
 * ## It is a signal, not a portrait — and that is #21's ruling
 *
 * The building does **not** depict the accommodation. Every non-Shortlisted Stay stands this same
 * hotel tower whether the real bed is a Sukhumvit condo, a George Town shophouse or a hut on Koh
 * Kradan. Its one job is to be *spotted*: it means **a bed is booked here**, and the traveller does
 * not need the map to tell them what they already know they booked.
 *
 * Which is why it is a highrise. Read on its 40 m height it crosses #20's 15 px threshold at z14.8
 * where the guesthouse it replaces crossed at z17 — **a booking announces itself two zoom levels
 * earlier, with `STAY_MIN_PX` untouched.** That is the whole gain, and it is free.
 *
 * **This weakens #20's stated justification and not its conclusion.** ADR 0005 argues a Stay Marker
 * is never exaggerated because it is "a claim about a machine" rather than a symbol of one, which is
 * now only half true — this *is* a symbol. But the measurement that killed exaggeration stands
 * untouched, and it never rested on that distinction: a building sits on the ground and occludes the
 * ground, so inflating it to hold an apparent size buries the coastline it stands on. A Vehicle over
 * water or air does not. See ADR 0008.
 *
 * #9 settled the rest. **Which building depicts which kind of Stay: none of them — there is one
 * building**, and #21 kept that, changing only which one. The Stay's status is carried by the Pin
 * standing above it, which is on screen at every zoom where the building is not. And **how a Stay
 * Marker differs from the Pin**: it does not replace one. It rises underneath it.
 *
 * Orientation is `yaw` 0, pointing the entrance canopy along the anchor's +Z — south on the pitched
 * map. A hotel has no true bearing, so nothing turns it.
 */

/**
 * The radius of ground that has to catch this model's shadow, in metres.
 *
 * Derived rather than picked, because #21 changed the building and a hand-tuned disc would have
 * silently clipped the new shadow in mid-air. The sun sits west-and-north
 * (`SUN.position`), so a model of height `h` throws its shadow `h × horizontal ÷ vertical` across
 * the ground; the disc has to reach the shadow of the *far top corner*, hence the half-diagonal of
 * the footprint on top.
 *
 * Conservative on purpose — it assumes the worst corner lies along the throw, which for a squarish
 * footprint is nearly true. Worth recording that the formula validates against the number #7 chose
 * by eye: for the old 8 m guesthouse it returns 11.2 m, against the 14 m that was shipped.
 *
 * For the 40 m tower it returns ~44 m, which is a **much** bigger flat disc than the guesthouse's,
 * and #7's residual gets correspondingly worse: the catcher is flat, so on a slope it is wrong over
 * three times the area it used to be wrong over.
 */
export const shadowRadiusFor = ([width, height, depth]: readonly [
  number,
  number,
  number,
]): number =>
  Math.hypot(width / 2, depth / 2) +
  height * (Math.hypot(SUN.position[0], SUN.position[2]) / SUN.position[1])

const SHADOW_RADIUS_M = shadowRadiusFor(MODEL_ASSETS.stay_hotel.sizeM)

/**
 * How high a Stay Marker hops when its Stay has no coordinate of its own.
 *
 * Metres. The guesthouse's 6 m was justified as "roughly its own eaves height — so it clears its own
 * roofline", and #21's tower destroys that reasoning rather than rescaling it: clearing a 40 m
 * roofline means an 80 m leap, which is not a hop, it is a launch.
 *
 * So the hop is a quarter of the building's height instead, which keeps it legible against the thing
 * doing it without being comic. **The honest residual is that it is less legible than it was**, and
 * no metre value fixes that: the tower now draws from z14.8, where a 10 m hop is 3.8 px, against the
 * guesthouse's floor of z17 where its 6 m hop was 10 px. Matching 10 px at z14.8 would take a 26 m
 * hop on a 40 m tower. The traveller who wants to see which Stay is unplaced zooms in, and the Pin
 * above it is pulsing at every zoom regardless (#9).
 */
export const JUMP_HEIGHT_M = MODEL_ASSETS.stay_hotel.sizeM[1] / 4

/** One hop. Faster than the Pulse, because a Jump is asking for something and a Pulse is not. */
export const JUMP_MS = 1500

/**
 * How high a jumping Stay Marker is at a moment in time, in metres above the ground.
 *
 * A half-sine rather than a full one: the marker sits **on** the ground for half the cycle, which is
 * what separates a hop from a hover. Pure, and separated from the loop for the same reason
 * `pulseAt` is — it is the only part with arithmetic in it.
 *
 * Animated on the content's own local `+y` rather than through `Anchor.altitudeM`, and the two are
 * genuinely the same thing: after the model matrix's `rotationX(π/2)`, local `+y` **is** mercator Z,
 * scaled by the identical factor the altitude translation uses. Both therefore went through the
 * latitude bug #8 found, and both are fixed by `getMercatorModelMatrix` taking the map centre's
 * latitude. Local `+y` is used because it needs no round trip through the layer's anchor list.
 */
export const jumpAt = (nowMs: number): number => {
  const t = ((nowMs % JUMP_MS) + JUMP_MS) % JUMP_MS
  return Math.max(0, Math.sin((t / JUMP_MS) * Math.PI * 2)) * JUMP_HEIGHT_M
}

export async function buildStayMarker(): Promise<Group> {
  const marker = new Group()
  marker.name = 'stay-marker'

  marker.add(await loadModel('stay_hotel'), buildShadowCatcher(SHADOW_RADIUS_M))

  return marker
}

/** A Stay Marker to draw, and whether it is the unplaced kind that hops. */
export type StayMarker = {
  stop: Stop
  origin: LngLatTuple
  jumping: boolean
}

/**
 * Every Stop that has a building to stand, with the coordinate to stand it on.
 *
 * Reads `markerAt` rather than the Stays directly — the same call the Pin reads — so the building and
 * the Pin above it can never disagree about where the Stop is. That is what #9's single coordinate
 * bought, and routing both through one derivation is what keeps it.
 */
export const stayMarkersOf = (trip: Trip): StayMarker[] =>
  trip.stops.filter(isPlaced).flatMap((stop) => {
    const marker = markerAt(stop)
    if (!marker.building) return []

    return [
      {
        stop,
        origin: [marker.coord.lng, marker.coord.lat] satisfies LngLatTuple,
        jumping: marker.jumping,
      },
    ]
  })

/**
 * The anchor for one Stop's building.
 *
 * `role` and `read` are handed over rather than a multiplier: how big it draws and whether it draws
 * at all is decided in exactly one place (`model-scale.ts`), which is what stops a Stay Marker and a
 * Vehicle drifting apart. See #20.
 */
export async function buildStayAnchor(marker: StayMarker): Promise<Anchor> {
  return {
    id: `stay-${marker.stop.id}`,
    origin: marker.origin,
    content: await buildStayMarker(),
    role: 'stay',
    read: readSpanOf('stay_hotel'),
  }
}
