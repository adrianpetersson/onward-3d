import type { GeoJSONSource, Map as MapLibreMap } from 'maplibre-gl'

import { markerAt } from '../itinerary/derive'
import type { Trip } from '../itinerary/model'
import type { Anchor, ModelLayer } from './model-layer'
import {
  PATH_BEFORE,
  PATH_SOURCE_ID,
  pathData,
  pathsOf,
  type DrawnPath,
} from './path'
// THROWAWAY (#23) — the Path-variant switch. Deleted when the winner lands in `path.ts`.
import {
  PATH_EXTRUSION_SOURCE_ID,
  extrudedPathData,
  variantFromUrl,
} from './path-volume.prototype'
import {
  PIN_HALO_LAYER_ID,
  PIN_SOURCE_ID,
  isPlaced,
  pinCoreLayer,
  pinData,
  pinHaloLayer,
  pinLabelLayer,
  pulseAt,
} from './pin'
import { buildStayAnchor, jumpAt, stayMarkersOf } from './stay-marker'
import { buildVehicle } from './vehicle'

/**
 * The seam between the Itinerary and the Diorama: everything the map draws from a Trip.
 *
 * It exists as its own module rather than inside `use-diorama` because the two answer different
 * questions — that hook stands a map up once and never looks at it again, and this redraws whenever
 * a save lands.
 *
 * ## Three mechanisms, on purpose
 *
 * A **Path** is a MapLibre `line` layer, a **Pin** is a MapLibre `circle` and `symbol`, and a
 * **Vehicle** and a **Stay Marker** are three.js anchors. None of the splits is an accident of
 * history: `path.ts` says why a line wants everything MapLibre already does, `pin.ts` says why a
 * marker wants MapLibre's collision detection and does *not* want the depth a model would bring, and
 * a model is the only one of the three that can be a building. What it costs is this module —
 * something has to hold the halves in step, and a redraw has to touch all of them.
 *
 * ## Layer order is load-bearing
 *
 * Paths go in **under** the place labels (`PATH_BEFORE`), so a Path never runs through the name of
 * the island it arrives at, and the Path's own casing goes under the Path. Pins go in **over** the
 * model layer, which is added before this module runs — so a Pin draws on top of the Stay Marker
 * beneath it, which is exactly #9's ruling and exactly what #11 proved possible.
 *
 * ## The sources are created once and emptied, never removed
 *
 * A Trip with no drawable Leg gets an empty `FeatureCollection` rather than having its source torn
 * down. Add-and-remove churn on a style is where MapLibre gets fragile, and an empty source costs
 * nothing — where a missing one means every redraw has to know whether the layer exists before it
 * can set data.
 */

export type Drawing = {
  /** Replaces everything the map draws from the Trip. Safe to call before the style has loaded. */
  redraw: (trip: Trip) => void
  /**
   * Stops the animation loop.
   *
   * Not optional politeness: the loop calls `setPaintProperty` and `triggerRepaint` on the map, and
   * a frame that lands after `map.remove()` throws inside a callback nothing is catching.
   */
  stop: () => void
}

export function drawItinerary(map: MapLibreMap, models: ModelLayer): Drawing {
  map.addSource(PATH_SOURCE_ID, {
    type: 'geojson',
    data: { type: 'FeatureCollection', features: [] },
  })

  // THROWAWAY (#23): which Path treatment to draw, from `?variant=`. On `main` this is the two
  // lines below and nothing else. Casing first: `addLayer` inserts immediately before its anchor, so
  // adding both against `PATH_BEFORE` in this order leaves the core drawn over its own edge. Layers
  // off one source — the geometry is uploaded once and each extra layer costs a second draw of it,
  // not a second copy.
  const variant = variantFromUrl()
  for (const layer of variant.lines) map.addLayer(layer, PATH_BEFORE)

  // The extrusion route needs its own source, because its width lives in the geometry rather than in
  // a paint property — see `extrudedPathData`.
  if (variant.extrusion) {
    map.addSource(PATH_EXTRUSION_SOURCE_ID, {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] },
    })
    map.addLayer(variant.extrusion, PATH_BEFORE)
  }

  map.addSource(PIN_SOURCE_ID, {
    type: 'geojson',
    data: { type: 'FeatureCollection', features: [] },
  })

  // No `before`: these land on top of the style *and* on top of the model layer, which is what puts
  // a Pin over the building it marks.
  map.addLayer(pinHaloLayer())
  map.addLayer(pinCoreLayer())
  map.addLayer(pinLabelLayer())

  // A redraw that arrives while the previous one is still loading its GLBs must not have its
  // anchors overwritten by the older answer landing late.
  let generation = 0

  let frame: number | undefined
  let pulsing = false
  let jumping: Anchor[] = []

  /**
   * One clock for both animations.
   *
   * Every Pin throbs together and every unplaced building hops together, which reads as one map
   * rather than as several things going wrong independently. It also means one `requestAnimationFrame`
   * chain however many Stops there are.
   *
   * **The cost worth knowing:** while any Stop is unresolved the map never idles, because setting a
   * paint property every frame is itself a repaint. That is most of a planning session. It is a
   * static-scene repaint rather than new work, and nothing measured it against battery.
   */
  const tick = (now: number) => {
    if (pulsing) {
      const { radiusPx, opacity } = pulseAt(now)
      map.setPaintProperty(PIN_HALO_LAYER_ID, 'circle-radius', radiusPx)
      map.setPaintProperty(PIN_HALO_LAYER_ID, 'circle-opacity', opacity)
    }

    if (jumping.length > 0) {
      const height = jumpAt(now)
      for (const anchor of jumping) anchor.content.position.y = height
      map.triggerRepaint()
    }

    frame = requestAnimationFrame(tick)
  }

  /** Runs only while there is something moving, so a fully booked and placed Trip costs no frames. */
  const settle = () => {
    const wanted = pulsing || jumping.length > 0

    if (wanted && frame === undefined) frame = requestAnimationFrame(tick)

    if (!wanted && frame !== undefined) {
      cancelAnimationFrame(frame)
      frame = undefined
    }
  }

  /*
   * THROWAWAY (#23) — the extrusion route's geometry has to be rebuilt whenever the zoom changes,
   * because an extrusion's width is in metres and a line's is in pixels. This handler *is* the cost
   * of that route, made visible: a line layer needs no equivalent, at any zoom.
   */
  let lastPaths: DrawnPath[] = []
  /*
   * Driven off `render` with a zoom guard rather than off `zoomend`, and that is a finding rather
   * than a style choice: on `zoomend` the band came out sized for whatever zoom the last *redraw*
   * happened at, which at the load frame is z5.63 — so viewed at z8.6 it drew **54 px wide instead
   * of 7**, the ratio of the two zooms. An extrusion's width is geometry, so anything that changes
   * the zoom without going through the handler leaves the band the wrong size, silently. A line
   * layer cannot have this bug, because its width is a screen-space paint property.
   */
  let builtAt = Number.NaN
  const reextrude = () => {
    if (!variant.extrusion) return

    const zoom = map.getZoom()
    if (Math.abs(zoom - builtAt) < 0.02) return
    builtAt = zoom

    map
      .getSource<GeoJSONSource>(PATH_EXTRUSION_SOURCE_ID)
      ?.setData(extrudedPathData(lastPaths, map.getCenter().lat, zoom))
  }
  if (variant.extrusion) map.on('render', reextrude)

  const redraw = (trip: Trip) => {
    const mine = ++generation
    const paths = pathsOf(trip)
    const stays = stayMarkersOf(trip)

    map.getSource<GeoJSONSource>(PATH_SOURCE_ID)?.setData(pathData(paths))
    lastPaths = paths
    builtAt = Number.NaN
    reextrude()
    map.getSource<GeoJSONSource>(PIN_SOURCE_ID)?.setData(pinData(trip))

    pulsing = trip.stops.filter(isPlaced).some((stop) => markerAt(stop).pulsing)
    settle()

    // A Path carries its own Mode, which matters more than it looks: `pathsOf` drops any Leg with an
    // end it cannot resolve, so walking `legsOf` in parallel and pairing by index would hand a
    // Vehicle the Mode of a different Leg the moment one Stop has no Origin behind it.
    //
    // Each model fails alone. A bare `Promise.all` rejects whole: one GLB that 404s after a bad
    // deploy would take *every* Vehicle and *every* building with it — and, because `setAnchors`
    // would then never run, the previous Trip's models would be left standing on Paths that no
    // longer exist. Catching per model keeps the rest of the Itinerary on the map.
    const built = [
      ...paths.map((path) =>
        buildVehicle(path).catch((error: unknown) => {
          console.warn(`Onward: no Vehicle for ${path.id}`, error)
          return null
        }),
      ),
      ...stays.map((stay) =>
        buildStayAnchor(stay).catch((error: unknown) => {
          console.warn(`Onward: no Stay Marker for ${stay.stop.id}`, error)
          return null
        }),
      ),
    ]

    void Promise.all(built).then((anchors) => {
      if (mine !== generation) return

      const drawable = anchors.filter((a): a is Anchor => !!a)
      models.setAnchors(drawable)

      // Matched back by id rather than by index: a Vehicle or a building that failed to load has
      // dropped out of the array by now, so the positions no longer line up with `stays`.
      const hops = new Set(
        stays.filter((s) => s.jumping).map((s) => `stay-${s.stop.id}`),
      )
      jumping = drawable.filter((anchor) => hops.has(anchor.id))
      settle()
    })
  }

  const stop = () => {
    // THROWAWAY (#23): the handler calls `setData` on a source, and a zoom that lands after
    // `map.remove()` throws inside a callback nothing is catching — the same reason the Pulse is
    // cancelled below.
    if (variant.extrusion) map.off('render', reextrude)

    // Bumped so a redraw already in flight cannot resurrect the loop when its GLBs land.
    generation++
    pulsing = false
    jumping = []
    settle()
  }

  return { redraw, stop }
}
