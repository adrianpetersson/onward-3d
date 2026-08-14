import type { GeoJSONSource, Map as MapLibreMap } from 'maplibre-gl'

import { createDioramaLayer } from './diorama-layer.prototype'
import { scaleForDiorama } from './model-scale'
import {
  ALL_MODES,
  buildAnchors,
  buildLegs,
  inkHexFor,
  liftedPaths,
  mountSurfacePaths,
  readOptions,
  surfaceGeoJson,
  surfaceSourceId,
  type BuiltLeg,
  type SceneOptions,
} from './path-variants.prototype'
import { VIEWS, viewFromUrl, type ViewKey } from './stand-in-trip.prototype'

/**
 * PROTOTYPE for #8 — stands the variants up on the real map and gives the switcher bar something to
 * drive.
 *
 * Everything reachable from here is throwaway. The only production file that knows this exists is
 * `use-diorama.ts`, which hands the map over when `?variant=` is in the URL and otherwise never
 * calls in — so the app on `main` behaves exactly as it did.
 */

export type PathController = {
  apply: (options: SceneOptions) => void
  goTo: (view: ViewKey) => void
  /** What the last `apply` actually built, for the bar's state readout. */
  readonly legs: readonly BuiltLeg[]
}

let controller: PathController | null = null
const listeners = new Set<() => void>()

export const getController = (): PathController | null => controller

export const subscribeToController = (listener: () => void): (() => void) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function mountPathPrototype(map: MapLibreMap): void {
  const layer = createDioramaLayer('proto-diorama', {
    scaleFor: scaleForDiorama,
  })
  map.addLayer(layer)

  let legs: BuiltLeg[] = []
  let generation = 0

  const apply = (options: SceneOptions) => {
    const mine = ++generation
    legs = buildLegs(options)

    mountSurfacePaths(map, legs, options)

    for (const mode of ALL_MODES) {
      map
        .getSource<GeoJSONSource>(surfaceSourceId(mode))
        ?.setData(surfaceGeoJson(legs, mode))
      map.setPaintProperty(
        `proto-path-${mode}`,
        'line-color',
        inkHexFor(mode, options.ink),
      )
    }

    layer.setPaths(liftedPaths(legs, options))

    void buildAnchors(legs, options).then((anchors) => {
      // A second `apply` may have landed while the models were loading.
      if (mine === generation) layer.setAnchors(anchors)
    })

    for (const listener of listeners) listener()
  }

  const goTo = (view: ViewKey) => {
    const { centre, zoom, pitch, bearing } = VIEWS[view]
    map.jumpTo({ center: centre, zoom, pitch, bearing })
  }

  controller = {
    apply,
    goTo,
    get legs() {
      return legs
    },
  }

  apply(readOptions())

  const view = viewFromUrl()
  if (view) goTo(view)

  for (const listener of listeners) listener()
}
