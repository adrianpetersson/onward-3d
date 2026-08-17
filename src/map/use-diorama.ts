import { useEffect, useRef, type RefObject } from 'react'
import { MapLibreMap, NavigationControl } from 'maplibre-gl'

import type { Trip } from '../itinerary/model'

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
import { drawItinerary, type Drawing } from './draw-itinerary'
import { FrameControl } from './FrameControl'
import { frameTrip, initialCamera } from './frame'
import { createModelLayer, type Anchor } from './model-layer'
import type { LngLatTuple } from './model-matrix'
import { readSpanOf, scaleForDiorama } from './model-scale'
import { buildStayMarker } from './stay-marker'

/**
 * How many Stay Markers to stand up, from `?markers=N`.
 *
 * This is a measurement affordance, not a feature. #7 has to answer what the frame rate does between
 * one model and ten, and #8 and #9 will each need to ask again as Paths, Vehicles and Pins arrive —
 * so the way to ask is a URL parameter rather than an edit that gets reverted and cannot be repeated.
 * The Itinerary replaces all of this the moment there is one to draw.
 */
const markerCount = (): number | null => {
  const raw = new URLSearchParams(window.location.search).get('markers')
  if (raw === null) return null

  const asked = Number(raw)
  return Number.isFinite(asked) && asked > 0 ? Math.min(asked, 200) : 1
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
   * The Itinerary to draw. A save commits a new Trip and the Diorama redraws from it — which is
   * ruling 12, "save is explicit, and a save re-renders the map", arriving as a prop rather than as
   * an event.
   */
  trip: Trip,
  /**
   * Handed the map once it exists, so the sidebar can arm it for a click (`placing.tsx`). Called
   * with `null` on teardown — a stale instance is worse than none.
   *
   * Must be referentially stable: it is an effect dependency, so a fresh closure per render would
   * tear the whole map down and build it again.
   */
  onReady?: (map: MapLibreMap | null) => void,
  /**
   * The store's `generation`, which bumps **only** when the Itinerary is replaced from outside the
   * sidebar's own editing — the file adopted on load, or one recovered after a conflict. Never on a
   * save.
   *
   * That distinction is exactly what the camera wants (#24). A save must not re-frame; an adoption
   * must, because the Trip on screen has just been replaced by a different one and the camera would
   * otherwise be left framing the Trip that is gone — or, on a machine with no cache yet, sitting on
   * the empty-state globe with a full Itinerary loaded underneath it.
   */
  generation = 0,
) {
  const drawing = useRef<Drawing | undefined>(undefined)
  /** The live map, for the effects below — the one above owns its lifetime and never re-runs. */
  const instance = useRef<MapLibreMap | undefined>(undefined)
  // The style may still be loading when the first Trip arrives — and it always is, because the cache
  // read is synchronous and the first render already holds the Itinerary (#12).
  const latest = useRef(trip)

  useEffect(() => {
    const element = container.current
    if (!element) return

    let live = true

    // The tracer keeps its own camera: `?markers=` stands a ring of Stay Markers at Ao Niang and is
    // measured at z17 pitched 60, which is #7's view and nothing to do with the Itinerary. Framing an
    // empty Trip there would put the ring off-screen behind a globe and quietly destroy the
    // affordance.
    const camera =
      markerCount() !== null
        ? INITIAL_VIEW
        : initialCamera(
            latest.current,
            element.clientWidth,
            element.clientHeight,
          )

    const map = new MapLibreMap({
      container: element,
      style: DIORAMA_STYLE,
      ...camera,
      // three.js shares this context, and the model layer wants its edges smoothed.
      canvasContextAttributes: { antialias: true },
      attributionControl: {
        // Credit has to be readable without the viewer poking at the map first.
        compact: false,
        customAttribution: SEARCH_ATTRIBUTION,
      },
    })

    instance.current = map

    map.addControl(new NavigationControl({ visualizePitch: true }), 'top-right')

    // Reads `latest` rather than closing over `trip`: this effect runs once and the control outlives
    // every Trip that passes through it, so closing over the Trip that happened to exist at
    // construction would frame an Itinerary the traveller has since edited and saved.
    map.addControl(
      new FrameControl(() => frameTrip(map, latest.current)),
      'top-right',
    )

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
      // The size law is injected here, once, and every anchor the layer ever draws goes through it
      // (#20). #8 and #9 add anchors, not laws.
      const models = createModelLayer('diorama-models', {
        scaleFor: scaleForDiorama,
      })
      map.addLayer(models)

      // The tracer's ring of Stay Markers, kept only behind `?markers=` — it is a measurement
      // affordance and #9 will need it again. With no parameter the map draws the real Itinerary,
      // which is what #7 meant by "the Itinerary replaces all of this the moment there is one".
      const asked = markerCount()
      if (asked !== null) {
        void Promise.all(
          tracerOrigins(asked).map(async (origin, i): Promise<Anchor> => ({
            id: `tracer-${i}`,
            origin,
            content: await buildStayMarker(),
            role: 'stay',
            read: readSpanOf('stay_hotel'),
          })),
        ).then((anchors) => {
          if (live) models.setAnchors(anchors)
        })
        return
      }

      drawing.current = drawItinerary(map, models)
      drawing.current.redraw(latest.current)
    })

    return () => {
      live = false
      instance.current = undefined
      // Before `map.remove()`: the Pulse and the Jump run on `requestAnimationFrame`, and a frame
      // that lands after the map is gone calls `setPaintProperty` on a torn-down style.
      drawing.current?.stop()
      drawing.current = undefined
      onReady?.(null)
      map.remove()
    }
  }, [container, onReady])

  // Redraws on every committed Trip, and does **not** rebuild the map: the effect above owns the
  // MapLibre instance and has an empty dependency list on purpose. A Trip that arrives before the
  // style has loaded is held in `latest` and drawn by the `load` handler instead.
  useEffect(() => {
    latest.current = trip
    drawing.current?.redraw(trip)
  }, [trip])

  // Re-frames when — and only when — the Itinerary is replaced from outside the sidebar (#24).
  //
  // `framed` starts at the generation the map was constructed at, so the first run is a no-op: the
  // constructor has already framed that Trip and re-framing it here would be a second camera move on
  // load, animated, over the top of the one that is already correct. Every later bump is a genuine
  // adoption — the traveller's file arriving, or a conflict resolved — and gets the fly.
  const framed = useRef(generation)
  useEffect(() => {
    if (generation === framed.current) return
    framed.current = generation

    const map = instance.current
    if (map) frameTrip(map, trip)
  }, [generation, trip])
}
