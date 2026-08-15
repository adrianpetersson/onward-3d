import { Group } from 'three'

import { markerAt } from '../itinerary/derive'
import type { Stop, Trip } from '../itinerary/model'
import { buildShadowCatcher } from './diorama-light'
import type { Anchor } from './model-layer'
import type { LngLatTuple } from './model-matrix'
import { readSpanOf } from './model-scale'
import { isPlaced } from './pin'
import { loadModel } from './models/load'

/**
 * The 3D building that stands at a Stop once its Stay is booked.
 *
 * This is the tracer #7 fired: the first real model on the map. It stands at true metre scale — 8 m
 * to the ridge, 6.1 m to the eaves, on a 4.4 × 8.9 m footprint — because the model matrix maps one
 * unit to one metre and the guesthouse was measured into the table at real size. #20 then ruled that
 * it is never exaggerated and simply not drawn below 15 px, which for this model is z17.
 *
 * #9 settled the two things #7 left here. **Which building depicts which kind of Stay: none of them
 * — there is one building.** The Stay's status is carried by the Pin standing above it, which is on
 * screen at every zoom where the building is not, so putting it on the model too would say the same
 * thing twice and only in the last three zoom levels. And **how a Stay Marker differs from the Pin**:
 * it does not replace one. It rises underneath it.
 *
 * Orientation is `yaw` 0, which points the gable along the anchor's +Z — south on the pitched map. A
 * guesthouse has no true bearing, so nothing turns it.
 */

/** Wide enough for the shadow of an 8 m ridge in the late afternoon, and no wider. */
const SHADOW_RADIUS_M = 14

/**
 * How high a Stay Marker hops when its Booking has no coordinate of its own.
 *
 * Metres, and roughly the guesthouse's own eaves height — so it clears its own roofline, which is
 * what makes the hop read as a hop rather than a shiver, and lands back on the ground rather than
 * hovering above it.
 */
export const JUMP_HEIGHT_M = 6

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

  marker.add(
    await loadModel('stay_guesthouse'),
    buildShadowCatcher(SHADOW_RADIUS_M),
  )

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
    read: readSpanOf('stay_guesthouse'),
  }
}
