import { describe, expect, it } from 'vitest'

import {
  DIORAMA_STYLE,
  ELEVATION_ATTRIBUTION,
  HILLSHADE,
  SEARCH_ATTRIBUTION,
  TERRAIN,
  TERRAIN_SOURCE,
  TERRAIN_SOURCE_ID,
} from './map-config'

/**
 * The provider config has two failure modes that produce no error at all — wrong terrain encoding
 * renders as noise, and a missing `maxzoom` 404s only at street level. Both are cheaper to assert
 * than to notice by eye.
 */

describe('terrain source', () => {
  it('decodes Terrarium, not Mapbox', () => {
    // The spec default is 'mapbox'. Getting this wrong renders garbage hills and throws nothing.
    expect(TERRAIN_SOURCE.encoding).toBe('terrarium')
  })

  it('asks for the 256 px tiles S3 actually serves', () => {
    expect(TERRAIN_SOURCE.tileSize).toBe(256)
  })

  it('stops at z15, where the tileset stops', () => {
    // The spec default is 22, which means 404s exactly at the zoom Onward dives to.
    expect(TERRAIN_SOURCE.maxzoom).toBe(15)
  })

  it('is the source the terrain actually points at', () => {
    expect(TERRAIN.source).toBe(TERRAIN_SOURCE_ID)
  })

  it('carries the elevation credit MapLibre will surface for us', () => {
    expect(TERRAIN_SOURCE.attribution).toBe(ELEVATION_ATTRIBUTION)
    expect(ELEVATION_ATTRIBUTION).toContain('Mapzen')
  })
})

describe('the Diorama style', () => {
  const asJson = JSON.stringify(DIORAMA_STYLE)

  it('draws from OpenFreeMap alone', () => {
    expect(Object.keys(DIORAMA_STYLE.sources)).toEqual(['openmaptiles'])
    expect(asJson).toContain('https://tiles.openfreemap.org/planet')
  })

  it('takes its glyphs and sprites from the same keyless host', () => {
    expect(DIORAMA_STYLE.glyphs).toContain('tiles.openfreemap.org')
    expect(DIORAMA_STYLE.sprite).toContain('tiles.openfreemap.org')
  })

  it.each(['key=', 'api_key', 'apikey', 'access_token', 'MAPTILER'])(
    'spends no API key: no %s anywhere in the style',
    (secretish) => {
      // The free-key allowance went unspent on purpose. A keyed URL creeping into the style is the
      // one way this project would acquire a credential to leak.
      expect(asJson.toLowerCase()).not.toContain(secretish.toLowerCase())
    },
  )

  it('has the 3D buildings lifted in from Liberty', () => {
    const buildings = DIORAMA_STYLE.layers.find(
      (layer) => layer.id === 'building-3d',
    )

    expect(buildings?.type).toBe('fill-extrusion')
  })

  it.each([
    'highway-shield-non-us',
    'highway-shield-us-interstate',
    'road_shield_us',
    'highway-name-path',
    'highway-name-minor',
    'highway-name-major',
  ])('has %s stripped out', (layerId) => {
    expect(DIORAMA_STYLE.layers.map((layer) => layer.id)).not.toContain(layerId)
  })

  it('keeps the place labels, which are how you know where you are', () => {
    const places = DIORAMA_STYLE.layers.filter(
      (layer) => layer.id.startsWith('label_') && layer.type === 'symbol',
    )

    expect(places.length).toBeGreaterThan(0)
  })
})

describe('the hillshade', () => {
  it('shades the same DEM the terrain is displacing', () => {
    expect(HILLSHADE.source).toBe(TERRAIN_SOURCE_ID)
  })

  it('stops before the DEM runs out and MapLibre starts inventing hills', () => {
    // Past the tileset's own maxzoom a hillshade overzooms into large soft blobs — at z18.9 they
    // fill the sea off Ao Niang. One level of overzoom is still clean; two is not. Ramping
    // `hillshade-exaggeration` down with a zoom expression does *not* fix it, so this cap is the
    // only thing standing between the Diorama and that artefact.
    const demMax = TERRAIN_SOURCE.maxzoom ?? Infinity
    expect(HILLSHADE.maxzoom).toBeLessThanOrEqual(demMax + 1)
  })
})

describe('search credit', () => {
  it('names Photon and links the OSM licence', () => {
    expect(SEARCH_ATTRIBUTION).toContain('Photon')
    expect(SEARCH_ATTRIBUTION).toContain(
      'https://www.openstreetmap.org/copyright',
    )
  })
})
