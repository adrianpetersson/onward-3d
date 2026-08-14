import type { LngLatTuple } from './model-matrix'

/**
 * PROTOTYPE for #8 — the shape of a Path, before anything decides how to draw it.
 *
 * A Path is "a bird's path between two Stops, not a routed road or rail alignment" (`CONTEXT.md`), so
 * the line between two ends is a **great circle** and not a straight line in whatever projection
 * happens to be on. Copenhagen → Bangkok is the case that proves it: the straight mercator line runs
 * over Kazakhstan and is 400 km longer than the route an aircraft actually flies.
 *
 * Everything here is geometry only. Whether a Path is painted on the ground or lifted into the air,
 * and how wide or what colour it is, belongs to the variants.
 */

const EARTH_RADIUS_M = 6371008.8

const toRad = (deg: number) => (deg * Math.PI) / 180
const toDeg = (rad: number) => (rad * 180) / Math.PI

/** One vertex of a drawn Path. */
export type PathPoint = {
  at: LngLatTuple
  /** Metres above **sea level**. 0 on a Path that hugs the surface. */
  altitudeM: number
}

export function greatCircleDistanceM(
  [lng1, lat1]: LngLatTuple,
  [lng2, lat2]: LngLatTuple,
): number {
  const φ1 = toRad(lat1)
  const φ2 = toRad(lat2)
  const Δφ = toRad(lat2 - lat1)
  const Δλ = toRad(lng2 - lng1)

  const a =
    Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2

  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(a)))
}

/**
 * A point a fraction `f` of the way along the great circle between two ends.
 *
 * Spherical interpolation rather than a lerp of the two lng/lat pairs — averaging coordinates gives
 * a point that is not on the route at all, and on the CPH → BKK Leg it misses by several hundred km.
 */
export function interpolate(
  [lng1, lat1]: LngLatTuple,
  [lng2, lat2]: LngLatTuple,
  f: number,
): LngLatTuple {
  const φ1 = toRad(lat1)
  const λ1 = toRad(lng1)
  const φ2 = toRad(lat2)
  const λ2 = toRad(lng2)

  const δ = greatCircleDistanceM([lng1, lat1], [lng2, lat2]) / EARTH_RADIUS_M

  // Coincident ends: the sines below both go to zero and the ratios are 0/0.
  if (δ < 1e-12) return [lng1, lat1]

  const a = Math.sin((1 - f) * δ) / Math.sin(δ)
  const b = Math.sin(f * δ) / Math.sin(δ)

  const x = a * Math.cos(φ1) * Math.cos(λ1) + b * Math.cos(φ2) * Math.cos(λ2)
  const y = a * Math.cos(φ1) * Math.sin(λ1) + b * Math.cos(φ2) * Math.sin(λ2)
  const z = a * Math.sin(φ1) + b * Math.sin(φ2)

  return [toDeg(Math.atan2(y, x)), toDeg(Math.atan2(z, Math.hypot(x, y)))]
}

/** Initial bearing in degrees clockwise from north — the compass heading a Vehicle here would fly. */
export function bearing(
  [lng1, lat1]: LngLatTuple,
  [lng2, lat2]: LngLatTuple,
): number {
  const φ1 = toRad(lat1)
  const φ2 = toRad(lat2)
  const Δλ = toRad(lng2 - lng1)

  const y = Math.sin(Δλ) * Math.cos(φ2)
  const x =
    Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ)

  return (toDeg(Math.atan2(y, x)) + 360) % 360
}

/** One vertex per this many metres, so a short hop is not over-tessellated and a long haul is smooth. */
const METRES_PER_SEGMENT = 40_000
const MIN_SEGMENTS = 2
const MAX_SEGMENTS = 192

/**
 * The floor a **lifted** Path is tessellated to, whatever its length.
 *
 * Distance alone is the wrong ruler once a Path leaves the ground, and this cost a wrong drawing
 * before it was fixed: a 60 km boat hop is two 40 km segments, so its dome was sampled at three
 * points and rendered as a **triangle** — a shape that reads as a kink in a straight line rather
 * than as an arc, exactly where the arc was the thing being judged. A surface Path has no such
 * problem, because between two densified points the great circle really is almost straight.
 *
 * 48 is the smoothness of the curve rather than the accuracy of the route, so it does not scale with
 * length: a half-sine is smooth to the eye by about 32 segments and 8,600 km buys its own from
 * `METRES_PER_SEGMENT` anyway.
 */
const MIN_LIFTED_SEGMENTS = 48

/**
 * Keeps longitudes running continuously rather than wrapping at the antimeridian.
 *
 * A Path drawn straight from a GeoJSON `LineString` whose longitudes jump +179 → −179 is rendered as
 * a line all the way back across the world. Unwrapping is what stops that, and it costs nothing on
 * every Leg that never goes near ±180.
 */
const unwrapped = (lng: number, previous: number): number =>
  lng - 360 * Math.round((lng - previous) / 360)

/**
 * The vertices of one Leg's Path, densified along the great circle and lifted into a dome.
 *
 * `ends` is the Leg's own chain — departure, its Vias in order, arrival. **The dome is per
 * sub-segment, not per Leg**: a flight with a layover in Beijing genuinely lands there, so it bows
 * twice, and the Via is visible in the drawing rather than only in the sidebar. A Leg with no Via is
 * one segment and the distinction does not arise.
 *
 * `arcRatio` is the apex height as a fraction of that sub-segment's own great-circle distance, which
 * makes the arc **scale-invariant**: the same dome shape whether the Leg is 40 km or 8,600 km, and at
 * every zoom, because the height and the span scale together. A fixed height in metres cannot do
 * that — the constant that lifts a long-haul clear of the ground buries a boat hop, and #20 already
 * measured what a single constant does across this range. `0` hugs the surface.
 */
export function buildPath(
  ends: readonly LngLatTuple[],
  arcRatio: number,
): PathPoint[] {
  const points: PathPoint[] = []

  for (let leg = 0; leg < ends.length - 1; leg++) {
    const from = ends[leg]
    const to = ends[leg + 1]
    const distanceM = greatCircleDistanceM(from, to)

    const segments = Math.min(
      MAX_SEGMENTS,
      Math.max(
        arcRatio > 0 ? MIN_LIFTED_SEGMENTS : MIN_SEGMENTS,
        Math.ceil(distanceM / METRES_PER_SEGMENT),
      ),
    )

    // Skip the join vertex on every sub-segment after the first — it is the previous one's last.
    for (let i = leg === 0 ? 0 : 1; i <= segments; i++) {
      const f = i / segments
      const [lng, lat] = interpolate(from, to, f)
      const previous = points.at(-1)?.at[0]

      points.push({
        at: [previous === undefined ? lng : unwrapped(lng, previous), lat],
        // A sine dome: zero at both ends, apex exactly `arcRatio × distance` at the midpoint, and
        // tangent to the ground at each end so a Vehicle at f≈0 is not already pointing at the sky.
        altitudeM: arcRatio * distanceM * Math.sin(Math.PI * f),
      })
    }
  }

  return points
}

/** Where a Path is `f` of the way along, by vertex count — good enough when vertices are even. */
export function alongPath(
  path: readonly PathPoint[],
  f: number,
): { point: PathPoint; index: number } {
  const index = Math.min(
    path.length - 1,
    Math.max(0, Math.round(f * (path.length - 1))),
  )
  return { point: path[index], index }
}

/**
 * How a Vehicle sitting at `index` should be turned, in the anchor's own local frame.
 *
 * `yaw` is radians about local Y and `climb` radians about local X, both derived from the Path's
 * tangent rather than from the Leg's endpoints — so a Vehicle on a bowed Path points along the
 * bow, and one on a Path bending through a Via points along the bend.
 *
 * **`yaw = π − bearing` and there is no projection-dependent sign.** The local frame is `+x` east,
 * `+y` up, `+z` south under *both* mercator and globe — pinned in `model-matrix.test.ts` — and every
 * model in the set faces `+z` (#17). A rotation of `α` about Y takes the nose from `+z` to
 * `(sin α, 0, cos α)`, and a compass bearing `θ` wants `(sin θ, 0, −cos θ)`, which gives `α = π − θ`.
 * #2 expected the mirrored mercator frame to flip this sign; what it flips is **chirality**, so an
 * asymmetric model renders mirrored while its heading stays true.
 */
export function orientationAt(
  path: readonly PathPoint[],
  index: number,
): { yaw: number; climb: number } {
  const a = path[Math.max(0, index - 1)]
  const b = path[Math.min(path.length - 1, index + 1)]

  const runM = greatCircleDistanceM(a.at, b.at)
  const riseM = b.altitudeM - a.altitudeM

  return {
    yaw: Math.PI - toRad(bearing(a.at, b.at)),
    climb: runM < 1 ? 0 : Math.atan2(riseM, runM),
  }
}
