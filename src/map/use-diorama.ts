import { useEffect, type RefObject } from 'react'
import { MapLibreMap, NavigationControl } from 'maplibre-gl'

// Side effect, and it has to happen before any map is constructed.
import './worker'
import {
  AO_NIANG,
  DIORAMA_STYLE,
  HILLSHADE,
  HILLSHADE_BEFORE,
  INITIAL_VIEW,
  SEARCH_ATTRIBUTION,
  TERRAIN,
  TERRAIN_SOURCE,
  TERRAIN_SOURCE_ID,
} from './map-config'
import { createModelLayer, type Anchor } from './model-layer'
import type { LngLatTuple } from './model-matrix'
import { lawStore, scaleForLiveLaw } from './scale-law.prototype'
import {
  buildStandInAnchors,
  readSpanOf,
  VIEWS,
  viewFromUrl,
} from './stand-in-trip.prototype'
import { buildStayMarker } from './stay-marker'

/**
 * How many Stay Markers to stand up, from `?markers=N`.
 *
 * This is a measurement affordance, not a feature. #7 has to answer what the frame rate does between
 * one model and ten, and #8 and #9 will each need to ask again as Paths, Vehicles and Pins arrive —
 * so the way to ask is a URL parameter rather than an edit that gets reverted and cannot be repeated.
 * The Itinerary replaces all of this the moment there is one to draw.
 *
 * PROTOTYPE (#20): absent, the map now draws the whole stand-in trip instead of a single tracer —
 * `?markers=N` still gives the ring, which is what the frame-rate numbers were taken on.
 */
const markerCount = (): number | undefined => {
  const asked = Number(
    new URLSearchParams(window.location.search).get('markers'),
  )
  return Number.isFinite(asked) && asked > 0 ? Math.min(asked, 200) : undefined
}

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
export function useDiorama(
  container: RefObject<HTMLDivElement | null>,
  /**
   * Handed the map once it exists, so the sidebar can arm it for a click (`placing.tsx`). Called
   * with `null` on teardown — a stale instance is worse than none.
   *
   * Must be referentially stable: it is an effect dependency, so a fresh closure per render would
   * tear the whole map down and build it again.
   */
  onReady?: (map: MapLibreMap | null) => void,
) {
  useEffect(() => {
    const element = container.current
    if (!element) return

    let live = true
    let unsubscribe: (() => void) | undefined

    // PROTOTYPE (#20): `?view=trip|region|island|street` opens on one of the four cameras the size
    // law has to be judged at, so a screenshot is a URL rather than a hand-dragged approximation.
    const asked = viewFromUrl()
    const opening = asked
      ? {
          center: VIEWS[asked].centre,
          zoom: VIEWS[asked].zoom,
          pitch: VIEWS[asked].pitch,
          bearing: VIEWS[asked].bearing,
        }
      : INITIAL_VIEW

    const map = new MapLibreMap({
      container: element,
      style: DIORAMA_STYLE,
      ...opening,
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

    /*
     * Handed over on construction rather than on `load`, deliberately. Click-to-place is the floor
     * under every other way of getting a coordinate (#13) and it must never be gated behind the
     * network: `load` waits on tiles, so arming on it means a traveller whose tiles never arrive
     * cannot place a Stay at all. Unprojecting a click works from the first frame — only *terrain*
     * accuracy arrives with the DEM, and a sea-level coordinate for the first second is a far smaller
     * cost than a floor that is missing.
     */
    onReady?.(map)

    map.on('load', () => {
      map.addSource(TERRAIN_SOURCE_ID, TERRAIN_SOURCE)
      map.setTerrain(TERRAIN)

      // Reads the source added on the line above, which is the only reason it is not in the style
      // JSON with the rest of the Diorama's look. See `HILLSHADE`.
      map.addLayer(HILLSHADE, HILLSHADE_BEFORE)

      // Added empty and filled in when the GLB lands. The alternative — waiting for the model
      // before adding the layer — leaves a window where the map is interactive and the layer is
      // not in the style, and #8's Paths would have to reproduce the same dance.
      //
      // PROTOTYPE (#20): the size law is injected here, once, and every anchor the layer ever draws
      // goes through it. Whichever law wins, this is the seam it lands on.
      const models = createModelLayer('diorama-models', {
        scaleFor: scaleForLiveLaw,
      })
      map.addLayer(models)

      // PROTOTYPE (#20): the layer only redraws when something asks it to, and switching law from
      // the bar is exactly such a something.
      unsubscribe = lawStore.subscribe(() => map.triggerRepaint())

      const count = markerCount()

      void (
        count === undefined
          ? buildStandInAnchors()
          : Promise.all(
              tracerOrigins(count).map(async (origin, i): Promise<Anchor> => ({
                id: `tracer-${i}`,
                origin,
                content: await buildStayMarker(),
                role: 'stay',
                read: readSpanOf('stay_guesthouse'),
              })),
            )
      ).then((anchors) => {
        if (live) models.setAnchors(anchors)
      })
    })

    return () => {
      live = false
      unsubscribe?.()
      onReady?.(null)
      map.remove()
    }
  }, [container, onReady])
}
