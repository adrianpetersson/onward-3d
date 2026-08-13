import { Camera, Matrix4, Object3D, Scene, WebGLRenderer } from 'three'
import type {
  CustomLayerInterface,
  CustomRenderMethodInput,
  Map as MapLibreMap,
} from 'maplibre-gl'

import { buildDioramaLight } from './diorama-light'
import { getModelMatrix, type LngLatTuple } from './model-matrix'

/**
 * A three.js scene drawn straight into MapLibre's own GL context, holding any number of models each
 * anchored to its own real coordinate.
 *
 * This is a raw `CustomLayerInterface` and there is deliberately no bridge library behind it: every
 * candidate is either dead for MapLibre, mercator-only, or a wrapper over this same interface. The
 * layer is small enough to own outright, and owning it is what buys occlusion against both the
 * globe's limb and 3D terrain. See #2.
 *
 * ## Why one layer holds every model, rather than one layer per model
 *
 * A model matrix is built for a single coordinate, and it maps one unit to one metre **at that
 * coordinate's latitude** — so a second Stop cannot simply be offset from the first in local metres.
 * Under the globe frame it is not even close. Every anchor genuinely needs its own matrix.
 *
 * That leaves two shapes, and the difference is not cosmetic. A layer per model means a
 * `WebGLRenderer` per model over one shared context, each with its own program cache and its own
 * state cache to invalidate — ten of them for a ten-Stop trip. This layer instead keeps **one
 * renderer and one scene**, and draws each anchor as its own pass with its own projection matrix.
 * The draw calls are the same; the renderers, the light rigs and the state churn are not. #8 and #9
 * hang their Paths, Vehicles and Pins off `setAnchors` rather than adding layers of their own.
 *
 * Anchors all sit at the scene's origin and overlap — they are separated by the matrix each is drawn
 * under, never by position — so a single light rig and a single shadow camera serve all of them.
 *
 * ## One anchor is in the scene at a time, and that is a performance decision
 *
 * The obvious way to draw N anchors from one scene is to hold them all in it and toggle `visible`
 * per pass. It is also quadratic: `renderer.render` walks the whole graph every call, so N anchors
 * cost N traversals of N anchors.
 *
 * So the scene holds the light rig permanently and exactly one anchor's content at a time, added
 * before its pass and removed after. Measured at 1440 × 900 on an M1 Pro, median layer time per
 * frame:
 *
 * | anchors | all in scene, toggled | one in scene |
 * | ------- | --------------------- | ------------ |
 * | 10      | 1.5 ms                | 1.4 ms       |
 * | 30      | 4.2 ms                | 3.9 ms       |
 * | 100     | 17.2 ms               | 13.2 ms      |
 * | 200     | 43.1 ms               | 25.8 ms      |
 *
 * That takes the growth from superlinear to flat at **~0.13 ms per anchor**, which is a whole
 * `renderer.render` — state reset, shadow pass and draw calls. A ten-Stop trip spends 1.4 ms a
 * frame and never leaves the vsync cap; the 60 fps ceiling is around 100 anchors.
 *
 * The shadow pass is *not* what costs: turning shadows off entirely moves 100 anchors by 0.1 ms.
 * The way to go faster, if #8 ever needs to, is fewer passes — not cheaper ones.
 */

export type Anchor = {
  id: string
  /** Where this anchor's local origin stands. */
  origin: LngLatTuple
  /**
   * Metres above the **ground**, not above sea level. The layer adds the terrain elevation
   * underneath, because MapLibre measures a model's altitude from sea level and will not drape a
   * custom layer onto its own DEM.
   */
  altitudeM?: number
  /** Y-up, metres, standing on y = 0. */
  content: Object3D
}

export type ModelLayer = CustomLayerInterface & {
  /** Replaces everything the layer draws. Safe to call before the layer is added to a map. */
  setAnchors: (anchors: readonly Anchor[]) => void
}

export function createModelLayer(id: string): ModelLayer {
  let map: MapLibreMap | undefined
  let renderer: WebGLRenderer | undefined

  const scene = new Scene()
  scene.add(buildDioramaLight())

  // MapLibre owns the projection, so the camera never computes one of its own — `render` assigns
  // the matrix directly. A bare Camera is what MapLibre's own three.js examples use.
  const camera = new Camera()

  let anchors: readonly Anchor[] = []

  const setAnchors = (next: readonly Anchor[]) => {
    // Deliberately not disposed: geometry and materials are shared clones owned by the model
    // cache, and disposing one anchor's copy would empty the buffers out from under its siblings.
    // See `models/load.ts`.
    anchors = next
    map?.triggerRepaint()
  }

  return {
    id,
    type: 'custom',
    // Without '3d' the layer draws into a depth buffer that has neither the globe nor the terrain
    // in it, and the model floats in front of everything.
    renderingMode: '3d',
    setAnchors,

    onAdd(addedTo: MapLibreMap, gl: WebGL2RenderingContext) {
      map = addedTo

      renderer = new WebGLRenderer({ canvas: addedTo.getCanvas(), context: gl })
      renderer.autoClear = false
      renderer.shadowMap.enabled = true
    },

    render(gl: WebGL2RenderingContext, args: CustomRenderMethodInput) {
      if (!map || !renderer || anchors.length === 0) return

      const { mainMatrix, projectionTransition } = args.defaultProjectionData

      // MapLibre left the GL state as it pleased; three.js has to stop trusting its own cache.
      // Once per frame, not once per anchor — nothing but three.js runs in between.
      renderer.resetState()

      // Shadow maps render to an offscreen target and three.js unbinds to the *default*
      // framebuffer afterwards, which is not necessarily where MapLibre was drawing: with terrain
      // on, the map is composited through one of its own. Put back whatever was bound.
      const target = gl.getParameter(
        gl.FRAMEBUFFER_BINDING,
      ) as WebGLFramebuffer | null

      for (const anchor of anchors) {
        // Queried every frame rather than once on add: the DEM streams in, so an early answer is
        // null and a later one is the real hillside. Null means no terrain, which means sea level.
        const groundM = map.queryTerrainElevation(anchor.origin) ?? 0

        camera.projectionMatrix = new Matrix4()
          .fromArray(mainMatrix)
          .multiply(
            getModelMatrix(
              anchor.origin,
              groundM + (anchor.altitudeM ?? 0),
              projectionTransition,
            ),
          )

        // Every anchor stands at the scene origin, so the only thing separating them is the matrix
        // above — which means exactly one may be in the scene per pass.
        scene.add(anchor.content)
        renderer.render(scene, camera)
        scene.remove(anchor.content)
      }

      gl.bindFramebuffer(gl.FRAMEBUFFER, target)
    },

    onRemove() {
      anchors = []
      renderer?.dispose()
      renderer = undefined
      map = undefined
    },
  }
}
