import { describe, expect, it } from 'vitest'
import { MercatorCoordinate } from 'maplibre-gl'
import { Matrix4, Vector3 } from 'three'

import {
  EARTH_RADIUS_M,
  getGlobeModelMatrix,
  getMercatorModelMatrix,
  getModelMatrix,
  meterInMercatorUnits,
  type LngLatTuple,
} from './model-matrix'

/**
 * These matrices are hand copies of maths MapLibre keeps to itself, so the tests check them against
 * MapLibre's own public projection wherever they can, and against the sphere by hand where they
 * cannot. If a MapLibre upgrade ever moves the maths underneath us, this file is what notices.
 */

const KOH_MOOK: LngLatTuple = [99.2967, 7.3797]
const COPENHAGEN: LngLatTuple = [12.5683, 55.6761]
const PLACES: Array<[name: string, place: LngLatTuple]> = [
  ['Koh Mook', KOH_MOOK],
  ['Copenhagen', COPENHAGEN],
]

const modelOrigin = (matrix: Matrix4) => new Vector3().applyMatrix4(matrix)

/** How long one model unit is, along one axis, after the matrix has had its way with it. */
const unitLength = (matrix: Matrix4, axis: Vector3) =>
  axis.clone().applyMatrix4(matrix).sub(modelOrigin(matrix)).length()

const AXES = [new Vector3(1, 0, 0), new Vector3(0, 1, 0), new Vector3(0, 0, 1)]

describe('the earth MapLibre thinks it is drawing', () => {
  it('has the radius this module hard-codes', () => {
    // One metre of altitude at the equator is 1/circumference of a mercator unit, so MapLibre's own
    // projection can be asked what radius it believes in.
    const oneMetreAtTheEquator = MercatorCoordinate.fromLngLat(
      { lng: 0, lat: 0 },
      1,
    ).z

    expect(1 / (oneMetreAtTheEquator * 2 * Math.PI)).toBeCloseTo(
      EARTH_RADIUS_M,
      6,
    )
  })
})

describe('getMercatorModelMatrix', () => {
  it.each(PLACES)('puts %s where MapLibre puts it', (_name, place) => {
    for (const altitudeM of [0, 120, 3599]) {
      const expected = MercatorCoordinate.fromLngLat(
        { lng: place[0], lat: place[1] },
        altitudeM,
      )
      const actual = modelOrigin(getMercatorModelMatrix(place, altitudeM))

      expect(actual.x).toBeCloseTo(expected.x, 12)
      expect(actual.y).toBeCloseTo(expected.y, 12)
      expect(actual.z).toBeCloseTo(expected.z, 12)
    }
  })

  it.each(PLACES)('makes one model unit one metre at %s', (_name, place) => {
    const matrix = getMercatorModelMatrix(place)
    const expected = MercatorCoordinate.fromLngLat({
      lng: place[0],
      lat: place[1],
    }).meterInMercatorCoordinateUnits()

    expect(meterInMercatorUnits(place[1])).toBeCloseTo(expected, 15)
    for (const axis of AXES) {
      expect(unitLength(matrix, axis)).toBeCloseTo(expected, 15)
    }
  })

  it('is a mirrored frame', () => {
    // The negative X scale is MapLibre's, not a slip. Asymmetric geometry renders back-to-front
    // here, which is why #8 owns heading rather than this file.
    expect(getMercatorModelMatrix(KOH_MOOK).determinant()).toBeLessThan(0)
  })

  it('reads altitude as metres above sea level', () => {
    const scale = meterInMercatorUnits(KOH_MOOK[1])
    const atSeaLevel = modelOrigin(getMercatorModelMatrix(KOH_MOOK, 0))
    const aKilometreUp = modelOrigin(getMercatorModelMatrix(KOH_MOOK, 1000))

    expect(aKilometreUp.z - atSeaLevel.z).toBeCloseTo(1000 * scale, 15)
    expect(aKilometreUp.x).toBeCloseTo(atSeaLevel.x, 15)
    expect(aKilometreUp.y).toBeCloseTo(atSeaLevel.y, 15)
  })
})

describe('getGlobeModelMatrix', () => {
  it.each(PLACES)('puts %s on the unit sphere', (_name, place) => {
    for (const altitudeM of [0, 120, 3599]) {
      const [lng, lat] = place
      const radius = 1 + altitudeM / EARTH_RADIUS_M
      const phi = (lat * Math.PI) / 180
      const lambda = (lng * Math.PI) / 180
      const actual = modelOrigin(getGlobeModelMatrix(place, altitudeM))

      expect(actual.x).toBeCloseTo(
        radius * Math.cos(phi) * Math.sin(lambda),
        12,
      )
      expect(actual.y).toBeCloseTo(radius * Math.sin(phi), 12)
      expect(actual.z).toBeCloseTo(
        radius * Math.cos(phi) * Math.cos(lambda),
        12,
      )
      expect(actual.length()).toBeCloseTo(radius, 12)
    }
  })

  it.each(PLACES)('makes one model unit one metre at %s', (_name, place) => {
    const matrix = getGlobeModelMatrix(place)

    for (const axis of AXES) {
      expect(unitLength(matrix, axis)).toBeCloseTo(1 / EARTH_RADIUS_M, 15)
    }
  })

  it('is not a mirrored frame, unlike mercator', () => {
    expect(getGlobeModelMatrix(KOH_MOOK).determinant()).toBeGreaterThan(0)
  })

  it('reads altitude as metres above sea level', () => {
    const atSeaLevel = modelOrigin(getGlobeModelMatrix(KOH_MOOK, 0)).length()
    const aKilometreUp = modelOrigin(
      getGlobeModelMatrix(KOH_MOOK, 1000),
    ).length()

    expect(aKilometreUp - atSeaLevel).toBeCloseTo(1000 / EARTH_RADIUS_M, 12)
  })
})

describe('getModelMatrix', () => {
  const elements = (matrix: Matrix4) => matrix.elements.slice()

  it('draws in the mercator frame when MapLibre says mercator', () => {
    expect(elements(getModelMatrix(KOH_MOOK, 40, 0))).toEqual(
      elements(getMercatorModelMatrix(KOH_MOOK, 40)),
    )
  })

  it('draws in the globe frame when MapLibre says globe', () => {
    expect(elements(getModelMatrix(KOH_MOOK, 40, 1))).toEqual(
      elements(getGlobeModelMatrix(KOH_MOOK, 40)),
    )
  })

  it('stays in the globe frame mid-handover', () => {
    // MapLibre interpolates this value across the transition. Anything above zero is still globe,
    // and treating a fraction as mercator is what makes a model jump at the handover.
    expect(elements(getModelMatrix(KOH_MOOK, 40, 0.5))).toEqual(
      elements(getGlobeModelMatrix(KOH_MOOK, 40)),
    )
  })
})
