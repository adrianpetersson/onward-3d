import { useEffect, type RefObject } from 'react'
import { MapLibreMap, NavigationControl } from 'maplibre-gl'

// Side effect, and it has to happen before any map is constructed.
import './worker'
import {
  DIORAMA_STYLE,
  INITIAL_VIEW,
  KOH_MOOK,
  SEARCH_ATTRIBUTION,
  TERRAIN,
  TERRAIN_SOURCE,
  TERRAIN_SOURCE_ID,
} from './map-config'
import { createModelLayer } from './model-layer'
import { buildProofTriangle } from './proof-triangle'

/**
 * Stands the Diorama up inside a container element and tears it down again.
 *
 * React owns the element; MapLibre owns everything inside it. Nothing about the map is React state,
 * which is why this is a hook with an empty dependency list rather than a component tree — the map
 * is created once and mutated in place.
 */
export function useDiorama(
  container: RefObject<HTMLDivElement | null>,
  /** Filled with the live map so a caller can drive the camera and force a resize. */
  mapRef?: RefObject<MapLibreMap | null>,
) {
  useEffect(() => {
    const element = container.current
    if (!element) return

    const map = new MapLibreMap({
      container: element,
      style: DIORAMA_STYLE,
      ...INITIAL_VIEW,
      // three.js shares this context, and the model layer wants its edges smoothed.
      canvasContextAttributes: { antialias: true },
      attributionControl: {
        // Credit has to be readable without the viewer poking at the map first.
        compact: false,
        customAttribution: SEARCH_ATTRIBUTION,
      },
    })

    map.addControl(new NavigationControl({ visualizePitch: true }), 'top-right')

    if (mapRef) mapRef.current = map

    map.on('load', () => {
      map.addSource(TERRAIN_SOURCE_ID, TERRAIN_SOURCE)
      map.setTerrain(TERRAIN)

      map.addLayer(
        createModelLayer({
          id: 'proof-triangle',
          origin: KOH_MOOK,
          build: buildProofTriangle,
        }),
      )
    })

    return () => {
      if (mapRef) mapRef.current = null
      map.remove()
    }
  }, [container, mapRef])
}
