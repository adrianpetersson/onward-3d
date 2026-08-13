import { Camera, Matrix4, Object3D, Scene, WebGLRenderer } from 'three'
import type {
  CustomLayerInterface,
  CustomRenderMethodInput,
  Map as MapLibreMap,
} from 'maplibre-gl'

import { getModelMatrix, type LngLatTuple } from './model-matrix'

/**
 * A three.js scene anchored to a real coordinate, drawn straight into MapLibre's own GL context.
 *
 * This is a raw `CustomLayerInterface` and there is deliberately no bridge library behind it: every
 * candidate is either dead for MapLibre, mercator-only, or a wrapper over this same interface. The
 * layer is small enough to own outright, and owning it is what buys occlusion against both the
 * globe's limb and 3D terrain. See #2.
 */
export type ModelLayerOptions = {
  id: string
  /** Where the scene's local origin stands. */
  origin: LngLatTuple
  /**
   * Metres above the ground. The layer adds the terrain elevation underneath, because MapLibre
   * measures a model's altitude from sea level and will not drape it onto its own DEM.
   */
  altitudeM?: number
  /** Builds the scene's contents. Called once, when the layer is added. */
  build: () => Object3D
}

export function createModelLayer({
  id,
  origin,
  altitudeM = 0,
  build,
}: ModelLayerOptions): CustomLayerInterface {
  let map: MapLibreMap
  let renderer: WebGLRenderer
  let scene: Scene
  let content: Object3D

  // MapLibre owns the projection, so the camera never computes one of its own — `render` assigns
  // the matrix directly. A bare Camera is what MapLibre's own three.js examples use.
  const camera = new Camera()

  return {
    id,
    type: 'custom',
    // Without '3d' the layer draws into a depth buffer that has neither the globe nor the terrain
    // in it, and the model floats in front of everything.
    renderingMode: '3d',

    onAdd(addedTo: MapLibreMap, gl: WebGL2RenderingContext) {
      map = addedTo
      scene = new Scene()
      content = build()
      scene.add(content)

      renderer = new WebGLRenderer({ canvas: map.getCanvas(), context: gl })
      renderer.autoClear = false
    },

    render(_gl: WebGL2RenderingContext, args: CustomRenderMethodInput) {
      const { mainMatrix, projectionTransition } = args.defaultProjectionData

      // Queried every frame rather than once on add: the DEM streams in, so an early answer is
      // null and a later one is the real hillside. Null means no terrain, which means sea level.
      const groundM = map.queryTerrainElevation(origin) ?? 0

      const model = getModelMatrix(
        origin,
        groundM + altitudeM,
        projectionTransition,
      )

      camera.projectionMatrix = new Matrix4()
        .fromArray(mainMatrix)
        .multiply(model)

      // MapLibre left the GL state as it pleased; three.js has to stop trusting its own cache.
      renderer.resetState()
      renderer.render(scene, camera)
    },

    onRemove() {
      scene.remove(content)
      content.traverse((node) => {
        if ('geometry' in node) (node.geometry as { dispose(): void }).dispose()
        if ('material' in node) (node.material as { dispose(): void }).dispose()
      })
      renderer.dispose()
    },
  }
}
