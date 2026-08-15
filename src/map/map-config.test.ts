import { describe, expect, it } from 'vitest'

import {
  DIORAMA_STYLE,
  GLOBE_BAND,
  GLOBE_CEILING_ZOOM,
  ELEVATION_ATTRIBUTION,
  HILLSHADE,
  INITIAL_VIEW,
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

describe('the globe handover (#14)', () => {
  const projection = DIORAMA_STYLE.projection as unknown as {
    type: [string, unknown, unknown, number, string, number, string]
  }

  it('is a zoom expression, because a bare type never morphs', () => {
    // `{ type: 'globe' }` works and hands over at z11 → z12 — MapLibre's own
    // `createProjectionFromName` substitutes exactly that expression for the string. Spelling it out
    // is what lets the band move; it is not a workaround for something missing.
    expect(projection.type[0]).toBe('interpolate')
    expect(projection.type[2]).toEqual(['zoom'])
  })

  it('goes from a sphere to the pitched map, in that order', () => {
    expect(projection.type[3]).toBe(GLOBE_BAND.from)
    expect(projection.type[4]).toBe('vertical-perspective')
    expect(projection.type[5]).toBe(GLOBE_BAND.to)
    expect(projection.type[6]).toBe('mercator')
  })

  it('hands over before the globe stops rendering', () => {
    // The one relationship worth a test rather than a comment: above `GLOBE_CEILING_ZOOM` the globe
    // draws no tiles whatsoever (#14), so a band that reached it would leave a blank map at the
    // zooms in between. Raising the band without reading that measurement is the mistake this
    // catches.
    expect(GLOBE_BAND.from).toBeLessThan(GLOBE_BAND.to)
    expect(GLOBE_BAND.to).toBeLessThan(GLOBE_CEILING_ZOOM)
  })

  it('is fully handed over before a Stay Marker can be drawn', () => {
    // A Stay Marker crosses its 15 px floor at z17 (#20), which is above the ceiling — so the globe
    // and the buildings are disjoint by construction and can never share a frame. That is what
    // makes the model layer's hard switch on `projectionTransition` harmless.
    expect(GLOBE_BAND.to).toBeLessThan(17)
  })

  it('opens the app on the pitched map, not on a globe', () => {
    // INITIAL_VIEW is z17 (#7 put the camera on Ao Niang), which is above both the band and the
    // ceiling — so the first frame anyone sees is the pitched Diorama, and the globe is somewhere
    // you have to zoom out to.
    expect(INITIAL_VIEW.zoom).toBeGreaterThan(GLOBE_BAND.to)
  })
})
