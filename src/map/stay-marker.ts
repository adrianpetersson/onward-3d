import { Group } from 'three'

import { buildShadowCatcher } from './diorama-light'
import { loadModel } from './models/load'

/**
 * The 3D building that stands at a Stop once its Stay is booked.
 *
 * This is the tracer #7 exists to fire: the first real model on the map, replacing the scaffold's
 * proof triangle. It stands at true metre scale — 8 m to the ridge, 6.1 m to the eaves, on a
 * 4.4 × 8.9 m footprint — because the model matrix maps one unit to one metre and the guesthouse was
 * measured into the table at real size.
 *
 * Two things are deliberately *not* decided here, and both belong to #9: which building depicts
 * which kind of Stay, and how a Stay Marker differs from the Pin it replaces. #9 also owns the
 * `Jump` that marks a Stay with no coordinate of its own.
 *
 * Orientation is `yaw` 0, which points the gable along the anchor's +Z — south on the pitched map.
 * A guesthouse has no true bearing, so nothing turns it until #8 needs the same machinery to aim a
 * Vehicle along its Path.
 */

/** Wide enough for the shadow of an 8 m ridge in the late afternoon, and no wider. */
const SHADOW_RADIUS_M = 14

export async function buildStayMarker(): Promise<Group> {
  const marker = new Group()
  marker.name = 'stay-marker'

  marker.add(
    await loadModel('stay_guesthouse'),
    buildShadowCatcher(SHADOW_RADIUS_M),
  )

  return marker
}
