import { Group } from 'three'

import type { Coord, Mode } from '../itinerary/model'
import type { Anchor } from './model-layer'
import type { LngLatTuple } from './model-matrix'
import { readSpanOf } from './model-scale'
import { bearing, interpolate, type DrawnPath } from './path'
import { loadModel } from './models/load'
import type { ModelAssetKey } from './models/model-assets'

/**
 * The 3D model that depicts a Leg's Mode, standing on its Path.
 *
 * "The depiction of a Mode, never the Mode itself" (`CONTEXT.md`) — which is why a Vehicle is
 * exaggerated to a floor of 40 px by #20's law while a Stay Marker never is, and why nothing here
 * cares what a real aircraft is doing at the halfway point of a twelve-hour flight.
 */

/** Which model depicts which Mode. A Leg with no Mode draws no Vehicle at all (#10). */
const VEHICLE_FOR: Record<Mode, ModelAssetKey> = {
  flight: 'airliner',
  train: 'train_sleeper_nose',
  ferry: 'ferry',
  boat: 'boat_speed',
  // No CC0 bus exists anywhere #4 checked, and a van is the truer depiction of a Southeast Asian
  // minibus hop in any case.
  bus: 'van',
  van: 'van',
}

/**
 * Where along its Path a Vehicle stands.
 *
 * The midpoint, and the reason is that every other candidate encodes a claim the model does not
 * have. A Vehicle at the departure end sits on top of the Stop it is leaving and fights the Pin or
 * Stay Marker standing there (#9); one placed by elapsed time would need a departure clock, an
 * arrival clock and a time zone, and `model.ts` deliberately stores no offset because none is
 * knowable client-side. The midpoint is the one point on a Leg that belongs to the Leg rather than
 * to either of its ends.
 */
const AT = 0.5

/**
 * How a Vehicle is turned so it points along its Path rather than due north.
 *
 * **`yaw = π − bearing`, with no projection-dependent sign**, and that is worth stating because #2
 * predicted the opposite. The anchor's local frame is `+x` east, `+y` up, `+z` south under *both*
 * mercator and globe (pinned in `model-matrix.test.ts`), and every model in the set faces `+z`
 * (#17). A rotation of `α` about Y takes the nose from `+z` to `(sin α, 0, cos α)`; a compass
 * bearing `θ` wants `(sin θ, 0, −cos θ)`; so `α = π − θ` everywhere. What the mirrored mercator
 * frame flips is **chirality** — an asymmetric model renders mirrored — not heading.
 *
 * The bearing is taken from the Path's own tangent rather than from the Leg's two endpoints, so a
 * Vehicle on a Path bending through a Via points along the bend and not at the far end.
 */
export const yawFor = (from: Coord, to: Coord): number =>
  Math.PI - (bearing(from, to) * Math.PI) / 180

/**
 * Where a Vehicle stands, and the two vertices whose tangent gives its heading.
 *
 * The exact fractional point rather than the nearest densified vertex, and that is not fussiness:
 * snapping with `Math.round` has no vertex to land on whenever the segment count is odd, and JS
 * rounds the half **up** — so the Vehicle drifts toward the arriving Stop by half a segment, every
 * time. On the real trip that is `Railay → Koh Kradan` (3 segments) standing at **2/3** of its Path,
 * 15 km past the middle, and `Langkawi → George Town` 20 km past. Roughly half of all Legs are
 * affected, and always in the same direction — which is exactly what `AT` exists to avoid, since a
 * Vehicle nearer an end fights the Pin or Stay Marker standing there (#9).
 */
const standing = (points: readonly Coord[]) => {
  const f = AT * (points.length - 1)
  const index = Math.min(points.length - 2, Math.max(0, Math.floor(f)))

  const from = points[index]
  const to = points[index + 1]

  return { at: interpolate(from, to, f - index), from, to }
}

/**
 * Brings a longitude back into [−180, 180].
 *
 * The **Path** stays unwrapped, deliberately — `densify` runs longitudes continuously past ±180 so
 * a Leg crossing the antimeridian is not drawn all the way back around the world. An **anchor**
 * cannot: MapLibre builds the custom layer's matrix for wrap 0 only, so an origin at 183° lands the
 * Vehicle exactly one world width east of the Path it is supposed to stand on — 32,768 px at z6, and
 * off screen for any camera that frames the Leg. Mercator only; the globe frame is 360-periodic and
 * immune.
 *
 * `bearing` needs no such treatment: it uses Δλ only through `sin` and `cos`, which are periodic.
 */
const wrapLng = (lng: number) => ((((lng + 180) % 360) + 360) % 360) - 180

/**
 * Where a Vehicle goes and which way it faces — the whole placement decision, and no model.
 *
 * Separated from `buildVehicle` because everything interesting here is arithmetic and everything
 * uninteresting is a network fetch. Both bugs this module has had were in these six lines, and
 * neither was reachable by a test while they were behind a GLB load.
 *
 * `null` where the Leg draws no Vehicle at all.
 */
export function placeVehicle(
  path: DrawnPath,
): { origin: LngLatTuple; yaw: number } | null {
  // No honest default exists — guessing `flight` would stand a plane on a twenty-minute island hop.
  if (path.mode === 'unknown') return null
  if (path.points.length < 2) return null

  const { at, from, to } = standing(path.points)

  return {
    origin: [wrapLng(at.lng), at.lat] satisfies LngLatTuple,
    yaw: yawFor(from, to),
  }
}

/**
 * The anchor for one Leg's Vehicle, or `null` where the Leg draws none.
 *
 * `pathM` is handed to the size law rather than used here: **how big a Vehicle draws, and whether it
 * draws at all, is decided in exactly one place** (`model-scale.ts`), so a Vehicle and a Stay Marker
 * cannot drift apart. See #20.
 */
export async function buildVehicle(path: DrawnPath): Promise<Anchor | null> {
  const placed = placeVehicle(path)
  if (!placed) return null

  // Narrowed by `placeVehicle`, which returns null for the one Mode that has no model.
  const key = VEHICLE_FOR[path.mode as Mode]

  const heading = new Group()
  heading.add(await loadModel(key))
  heading.rotation.y = placed.yaw

  return {
    id: `vehicle-${path.id}`,
    origin: placed.origin,
    content: heading,
    role: 'vehicle',
    read: readSpanOf(key),
    pathM: path.lengthM,
  }
}
