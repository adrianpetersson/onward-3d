import { useEffect, type RefObject } from 'react'
import { MapLibreMap, NavigationControl } from 'maplibre-gl'

// Side effect, and it has to happen before any map is constructed.
import './worker'
import {
  AO_NIANG,
  DIORAMA_STYLE,
  INITIAL_VIEW,
  SEARCH_ATTRIBUTION,
  TERRAIN,
  TERRAIN_SOURCE,
  TERRAIN_SOURCE_ID,
} from './map-config'
import { createModelLayer, type Anchor } from './model-layer'
import type { LngLatTuple } from './model-matrix'
import {
  addDomLabels,
  addSymbolLabels,
  buildSpriteLabel,
  type LabelPoint,
} from './prototype-11/labels'
import { applyRegisterOnLoad, currentRegister } from './prototype-11/registers'
import { buildStayMarker } from './stay-marker'

/**
 * How many Stay Markers to stand up, from `?markers=N`.
 *
 * This is a measurement affordance, not a feature. #7 has to answer what the frame rate does between
 * one model and ten, and #8 and #9 will each need to ask again as Paths, Vehicles and Pins arrive —
 * so the way to ask is a URL parameter rather than an edit that gets reverted and cannot be repeated.
 * The Itinerary replaces all of this the moment there is one to draw.
 */
const markerCount = (): number => {
  const asked = Number(
    new URLSearchParams(window.location.search).get('markers'),
  )
  return Number.isFinite(asked) && asked > 0 ? Math.min(asked, 200) : 1
}

/**
 * Names for the tracer ring, so #11's three label mechanisms have something to say. Real Stops off
 * the trip this MVP has to hold — a made-up string is the wrong length and flatters the layout.
 */
const TRACER_NAMES = [
  'Ao Niang Resort',
  'Koh Kradan',
  'Koh Mook',
  'Sivalai Beach',
  'Charlie Beach',
  'Trang',
  'Koh Lanta',
  'Railay',
  'Ao Nang',
  'Krabi Town',
]

/** A ring of tracer coordinates around Ao Niang, ~200 m out, so every marker is on screen at once. */
const tracerOrigins = (count: number): LngLatTuple[] => {
  if (count === 1) return [AO_NIANG]

  const [lng, lat] = AO_NIANG
  const RADIUS_DEG = 0.0018

  return Array.from({ length: count }, (_, i) => {
    const angle = (i / count) * Math.PI * 2
    // cos(lat) keeps the ring round rather than an ellipse — 7° N, so it barely matters, but the
    // next tracer may not be near the equator.
    return [
      lng + (RADIUS_DEG * Math.cos(angle)) / Math.cos((lat * Math.PI) / 180),
      lat + RADIUS_DEG * Math.sin(angle),
    ] satisfies LngLatTuple
  })
}

/**
 * Stands the Diorama up inside a container element and tears it down again.
 *
 * React owns the element; MapLibre owns everything inside it. Nothing about the map is React state,
 * which is why this is a hook with an empty dependency list rather than a component tree — the map
 * is created once and mutated in place.
 */
export function useDiorama(container: RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    const element = container.current
    if (!element) return

    let live = true

    // PROTOTYPE — #11. Without `?variant=` this is `TODAY`, whose style is the identity and whose
    // light is #7's, so the unstyled map is still exactly the unstyled map.
    const register = currentRegister()
    document.documentElement.classList.add(register.chrome)

    const map = new MapLibreMap({
      container: element,
      style: register.style(DIORAMA_STYLE),
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

    // The other half of `?markers=`: every number #7 recorded was taken by reaching the map and
    // the layer from the console, and #8 and #9 will have to take them again. Dev only — the
    // deployed bundle has no handle on it.
    if (import.meta.env.DEV) {
      ;(window as unknown as { __diorama: MapLibreMap }).__diorama = map
    }

    map.on('load', () => {
      map.addSource(TERRAIN_SOURCE_ID, TERRAIN_SOURCE)
      map.setTerrain({ ...TERRAIN, exaggeration: register.exaggeration })

      // PROTOTYPE — #11. B's hillshade reads this source, so it can only go in once it exists.
      applyRegisterOnLoad(map, register)

      // Added empty and filled in when the GLB lands. The alternative — waiting for the model
      // before adding the layer — leaves a window where the map is interactive and the layer is
      // not in the style, and #8's Paths would have to reproduce the same dance.
      const models = createModelLayer('diorama-models', register.light)
      map.addLayer(models)

      const origins = tracerOrigins(markerCount())
      const points: LabelPoint[] = origins.map((origin, i) => ({
        id: `tracer-${i}`,
        origin,
        name: TRACER_NAMES[i % TRACER_NAMES.length],
      }))

      // PROTOTYPE — #11. Deliberately added *after* the model layer: the question is whether
      // MapLibre lets a symbol layer draw over a custom 3D one, and asking it any other way
      // answers a different question.
      if (register.labels === 'symbol') addSymbolLabels(map, points)
      if (register.labels === 'dom') addDomLabels(map, points)

      void Promise.all(
        points.map(async (point): Promise<Anchor> => {
          const content = await buildStayMarker(register.light.shadowOpacity)
          if (register.labels === 'sprite')
            content.add(buildSpriteLabel(point.name))
          return { id: point.id, origin: point.origin, content }
        }),
      ).then((anchors) => {
        if (live) models.setAnchors(anchors)
      })
    })

    return () => {
      live = false
      map.remove()
    }
  }, [container])
}
