import type { GeoJSONSource, Map as MapLibreMap } from 'maplibre-gl'

import type { Trip } from '../itinerary/model'
import type { Anchor, ModelLayer } from './model-layer'
import {
  PATH_BEFORE,
  PATH_SOURCE_ID,
  pathData,
  pathLayer,
  pathsOf,
} from './path'
import { buildVehicle } from './vehicle'

/**
 * The seam between the Itinerary and the Diorama: everything the map draws from a Trip.
 *
 * It exists as its own module rather than inside `use-diorama` because the two answer different
 * questions — that hook stands a map up once and never looks at it again, and this redraws whenever
 * a save lands. #9 adds Pins and Stay Markers here, alongside the Vehicles, rather than adding a
 * layer of its own.
 *
 * ## Two mechanisms, on purpose
 *
 * A **Path** is a MapLibre `line` layer and a **Vehicle** is a three.js anchor, and the split is not
 * an accident of history — see `path.ts` for why a line wants everything MapLibre already does and a
 * model wants everything it does not. What it costs is this module: something has to hold the two
 * halves in step, and a redraw has to touch both.
 *
 * ## The source is created once and emptied, never removed
 *
 * A Trip with no drawable Leg gets an empty `FeatureCollection` rather than having its source torn
 * down. Add-and-remove churn on a style is where MapLibre gets fragile, and an empty source costs
 * nothing — where a missing one means every redraw has to know whether the layer exists before it
 * can set data.
 */

export type Drawing = {
  /** Replaces everything the map draws from the Trip. Safe to call before the style has loaded. */
  redraw: (trip: Trip) => void
}

export function drawItinerary(map: MapLibreMap, models: ModelLayer): Drawing {
  map.addSource(PATH_SOURCE_ID, {
    type: 'geojson',
    data: { type: 'FeatureCollection', features: [] },
  })
  map.addLayer(pathLayer(), PATH_BEFORE)

  // A redraw that arrives while the previous one is still loading its GLBs must not have its
  // anchors overwritten by the older answer landing late.
  let generation = 0

  const redraw = (trip: Trip) => {
    const mine = ++generation
    const paths = pathsOf(trip)

    map.getSource<GeoJSONSource>(PATH_SOURCE_ID)?.setData(pathData(paths))

    // A Path carries its own Mode, which matters more than it looks: `pathsOf` drops any Leg with an
    // end it cannot resolve, so walking `legsOf` in parallel and pairing by index would hand a
    // Vehicle the Mode of a different Leg the moment one Stop has no Origin behind it.
    //
    // Each Vehicle fails alone. A bare `Promise.all` rejects whole: one GLB that 404s after a bad
    // deploy would take *every* Vehicle with it — the flight and the trains gone because a ferry
    // model is missing — and, because `setAnchors` would then never run, the previous Trip's
    // Vehicles would be left standing on Paths that no longer exist. Catching per Vehicle keeps the
    // rest of the Itinerary on the map and keeps the redraw honest.
    void Promise.all(
      paths.map((path) =>
        buildVehicle(path).catch((error: unknown) => {
          console.warn(`Onward: no Vehicle for ${path.id}`, error)
          return null
        }),
      ),
    ).then((built) => {
      if (mine !== generation) return
      models.setAnchors(built.filter((anchor): anchor is Anchor => !!anchor))
    })
  }

  return { redraw }
}
