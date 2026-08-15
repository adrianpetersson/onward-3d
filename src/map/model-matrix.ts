import { Matrix4 } from 'three'

/**
 * Local copies of the model matrices MapLibre builds internally.
 *
 * MapLibre v5 exposed `map.transform.getMatrixForModel(location, altitude)`. v6 deleted both the
 * helper and the `map.transform` property it hung off, so the maths lives here instead — term for
 * term what `mercator_transform.ts` and `vertical_perspective_transform.ts` do upstream. Nothing in
 * this file touches a MapLibre internal, which is the whole point: the model layer keeps compiling
 * across majors. See #2 and #16.
 *
 * Under both projections the returned matrix maps **one unit to one metre**, so a model authored at
 * true metres needs no per-zoom scale hack and no LOD switch at the globe/mercator handover.
 */

/** MapLibre's own value, from `src/geo/lng_lat.ts`. */
export const EARTH_RADIUS_M = 6371008.8

const EARTH_CIRCUMFERENCE_M = 2 * Math.PI * EARTH_RADIUS_M

/** A position as MapLibre's own `[lng, lat]` tuple. */
export type LngLatTuple = [lng: number, lat: number]

const mercatorXFromLng = (lng: number) => (180 + lng) / 360

const mercatorYFromLat = (lat: number) =>
  (180 -
    (180 / Math.PI) * Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360))) /
  360

const circumferenceAtLatitude = (lat: number) =>
  EARTH_CIRCUMFERENCE_M * Math.cos((lat * Math.PI) / 180)

/** How much of a mercator unit one metre covers at this latitude. */
export const meterInMercatorUnits = (lat: number) =>
  1 / circumferenceAtLatitude(lat)

/**
 * Places a model in the mercator frame — the projection in play once the camera has zoomed past
 * the globe handover, which is where the Diorama spends its time.
 *
 * Note the negative X scale: the mercator frame is **mirrored**, so asymmetric geometry renders
 * back-to-front unless it compensates. Handedness and heading are #8's problem, not this file's.
 *
 * ## Height is measured at the map's centre, not at the model's own latitude
 *
 * `centreLat` is the awkward argument and it is not optional in spirit. Horizontal mercator units
 * genuinely vary with latitude — a metre at 55° N is a larger fraction of the world than a metre at
 * 3° N — so `x` and `y` scale by the **anchor's** latitude. The vertical does not follow, because
 * MapLibre does not build the custom layer's matrix per anchor: `getProjectionDataForCustomLayer`
 * scales Z by `worldSize / pixelsPerMeter` with `pixelsPerMeter = mercatorZfromAltitude(1,
 * center.lat) * worldSize` — one factor for the whole frame, taken from where the camera is looking.
 *
 * Scaling height by the anchor's own latitude therefore draws it `cos(centreLat) / cos(ownLat)` too
 * tall. It is invisible in the one case everything so far was measured in — the camera centred on
 * the model, where the two latitudes are equal, which is exactly where #7 recorded its 0.001 px
 * agreement — and it is over 50% wrong at one end of a Trip that spans 42° of latitude. #8 found it
 * by reading `mercator_transform.ts` and left it for the first ticket that lifts anything off the
 * ground; #9's `Jump` is that ticket.
 */
export function getMercatorModelMatrix(
  [lng, lat]: LngLatTuple,
  altitudeM = 0,
  centreLat = lat,
): Matrix4 {
  const scale = meterInMercatorUnits(lat)
  // The vertical axis answers to the camera's latitude, per the note above.
  const up = meterInMercatorUnits(centreLat)

  return (
    new Matrix4()
      .makeTranslation(
        mercatorXFromLng(lng),
        mercatorYFromLat(lat),
        altitudeM * up,
      )
      .multiply(new Matrix4().makeRotationZ(Math.PI))
      .multiply(new Matrix4().makeRotationX(Math.PI / 2))
      // Local +y is up, and it is the one component that does not use the anchor's own latitude.
      .multiply(new Matrix4().makeScale(-scale, up, scale))
  )
}

/**
 * Places a model on the unit sphere — the projection in play zoomed out, where a Leg arcs across
 * the planet. Unlike the mercator frame this one is not mirrored.
 */
export function getGlobeModelMatrix(
  [lng, lat]: LngLatTuple,
  altitudeM = 0,
): Matrix4 {
  const scale = 1 / EARTH_RADIUS_M

  return new Matrix4()
    .makeRotationY((lng / 180) * Math.PI)
    .multiply(new Matrix4().makeRotationX((-lat / 180) * Math.PI))
    .multiply(
      new Matrix4().makeTranslation(0, 0, 1 + altitudeM / EARTH_RADIUS_M),
    )
    .multiply(new Matrix4().makeRotationX(Math.PI / 2))
    .multiply(new Matrix4().makeScale(scale, scale, scale))
}

/**
 * Picks the frame the current render pass is in.
 *
 * `projectionTransition` comes from the custom layer's own render args and is MapLibre's statement
 * about which projection it is drawing this frame — 0 is mercator, 1 is globe, and it interpolates
 * across the handover. Reading it is what keeps a model in place through the transition.
 *
 * `altitudeM` is metres above **sea level**, not above the terrain. MapLibre does not drape a
 * custom layer onto its own DEM; a model that should sit on the ground has to add the terrain
 * elevation itself.
 */
export function getModelMatrix(
  location: LngLatTuple,
  altitudeM: number,
  projectionTransition: number,
  /** The map centre's latitude, which only the mercator frame needs — see above. */
  centreLat = location[1],
): Matrix4 {
  return projectionTransition > 0
    ? getGlobeModelMatrix(location, altitudeM)
    : getMercatorModelMatrix(location, altitudeM, centreLat)
}
