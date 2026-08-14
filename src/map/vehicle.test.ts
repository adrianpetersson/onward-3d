import { describe, expect, it } from 'vitest'

import type { Coord } from '../itinerary/model'
import { bearing, densify, greatCircleDistanceM, type DrawnPath } from './path'
import { placeVehicle, yawFor } from './vehicle'

/**
 * Heading, pinned — because the failure mode is a plane pointing the wrong way and nothing else.
 *
 * There is no type error and no thrown exception for a Vehicle facing north up a Path running east.
 * #2 predicted the sign of this would differ between mercator and globe; #7 measured that it does
 * not, and these are the arithmetic that claim rests on.
 */

const at = (lng: number, lat: number): Coord => ({ lng, lat })

/** Where a model's nose ends up in the anchor's local frame after a yaw: `+z` turned by `α`. */
const noseAfter = (yaw: number) => ({
  x: Math.sin(yaw),
  z: Math.cos(yaw),
})

describe('yawFor', () => {
  it('leaves a model facing +z — local south — for a Leg heading due south', () => {
    const yaw = yawFor(at(0, 1), at(0, 0))
    const nose = noseAfter(yaw)

    expect(nose.x).toBeCloseTo(0, 9)
    expect(nose.z).toBeCloseTo(1, 9)
  })

  it('turns a model onto +x — local east — for a Leg heading due east', () => {
    const yaw = yawFor(at(0, 0), at(10, 0))
    const nose = noseAfter(yaw)

    expect(nose.x).toBeCloseTo(1, 9)
    expect(nose.z).toBeCloseTo(0, 9)
  })

  it('turns a model onto −z — local north — for a Leg heading due north', () => {
    const nose = noseAfter(yawFor(at(0, 0), at(0, 10)))

    expect(nose.x).toBeCloseTo(0, 9)
    expect(nose.z).toBeCloseTo(-1, 9)
  })

  it('is π minus the bearing, in radians, at an arbitrary heading', () => {
    const from = at(12.5683, 55.6761)
    const to = at(100.5018, 13.7563)

    expect(yawFor(from, to)).toBeCloseTo(
      Math.PI - (bearing(from, to) * Math.PI) / 180,
      12,
    )
  })

  it('turns the opposite way for the opposite Leg', () => {
    const north = yawFor(at(0, 0), at(0, 10))
    const south = yawFor(at(0, 10), at(0, 0))

    expect(Math.abs(north - south)).toBeCloseTo(Math.PI, 9)
  })
})

/**
 * Where a Vehicle ends up standing.
 *
 * `buildVehicle` loads a GLB, which no unit test can do — which is exactly why `placeVehicle` is a
 * separate function. Both bugs this module has had were in its arithmetic, and neither was reachable
 * by a test while it sat behind a network fetch.
 */

const pathThrough = (
  ends: readonly Coord[],
  mode: DrawnPath['mode'],
): DrawnPath => {
  const points = densify(ends)

  return {
    id: 'test',
    mode,
    points,
    lengthM: ends
      .slice(1)
      .reduce((total, end, i) => total + greatCircleDistanceM(ends[i], end), 0),
  }
}

/** How far along its own Path, 0 to 1, a coordinate sits — measured by arc length, not by index. */
const fractionAlong = (path: DrawnPath, at: Coord): number => {
  let before = 0
  let total = 0
  let reached = false

  for (let i = 1; i < path.points.length; i++) {
    const step = greatCircleDistanceM(path.points[i - 1], path.points[i])
    if (!reached) {
      const toHere = greatCircleDistanceM(path.points[i - 1], at)
      if (toHere <= step + 1) {
        before = total + toHere
        reached = true
      }
    }
    total += step
  }

  return before / total
}

describe('where a Vehicle stands', () => {
  it('stands at the midpoint whatever the segment count', () => {
    /*
     * The bug this pins: `standing` used to snap to the nearest densified vertex, and an odd segment
     * count has no vertex at the middle. `Math.round` breaks the tie upward, so the Vehicle drifted
     * toward the arriving Stop by half a segment — 15 km on Railay → Koh Kradan (3 segments), 20 km
     * on Langkawi → George Town. Always past the middle, always the same way, on roughly half of all
     * Legs. These lengths are chosen to span every segment count from 2 to 6.
     */
    const RAILAY = { lng: 98.838, lat: 8.011 }

    for (const km of [50, 91, 118, 150, 190, 230]) {
      const to = {
        lng: RAILAY.lng + km / 111 / Math.cos((8 * Math.PI) / 180),
        lat: 8.011,
      }
      const path = pathThrough([RAILAY, to], 'boat')
      const placed = placeVehicle(path)!

      const at = { lng: placed.origin[0], lat: placed.origin[1] }
      expect(fractionAlong(path, at)).toBeCloseTo(0.5, 2)
    }
  })

  it('keeps a Vehicle inside ±180 on a Leg that crosses the antimeridian', () => {
    /*
     * The Path stays unwrapped so the line does not jump back across the world — `densify` runs Nadi
     * → Apia out to 188° on purpose. An anchor cannot: MapLibre builds the custom layer's matrix for
     * wrap 0 only, so an origin at 183° puts the Vehicle one whole world east of its own Path.
     */
    const path = pathThrough(
      [
        { lng: 177.44, lat: -17.75 },
        { lng: -171.76, lat: -13.85 },
      ],
      'flight',
    )

    expect(path.points.at(-1)!.lng).toBeGreaterThan(180)

    const placed = placeVehicle(path)!
    expect(placed.origin[0]).toBeGreaterThanOrEqual(-180)
    expect(placed.origin[0]).toBeLessThanOrEqual(180)

    // The unwrapped Path runs 177.44 → 188.24, so its middle is 182.89 — which is this, one world
    // west. Wrapping is a translation of exactly 360°, so it never moves the Vehicle off its Path.
    expect(placed.origin[0]).toBeCloseTo(-177.11, 1)
    expect(
      fractionAlong(path, {
        lng: placed.origin[0] + 360,
        lat: placed.origin[1],
      }),
    ).toBeCloseTo(0.5, 2)
  })

  it('draws no Vehicle for a Leg whose Mode is not known yet', () => {
    const path = pathThrough(
      [
        { lng: 98.838, lat: 8.011 },
        { lng: 99.255, lat: 7.304 },
      ],
      'unknown',
    )

    expect(placeVehicle(path)).toBeNull()
  })
})
