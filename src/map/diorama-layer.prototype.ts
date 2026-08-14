import { Camera, Matrix4, Scene, Vector2, WebGLRenderer } from 'three'
import { Line2 } from 'three/addons/lines/Line2.js'
import { LineGeometry } from 'three/addons/lines/LineGeometry.js'
import { LineMaterial } from 'three/addons/lines/LineMaterial.js'
import type {
  CustomRenderMethodInput,
  Map as MapLibreMap,
  CustomLayerInterface,
} from 'maplibre-gl'

import { buildDioramaLight } from './diorama-light'
import { EARTH_RADIUS_M, type LngLatTuple } from './model-matrix'
import type { Anchor, ScaleFor } from './model-layer'
import type { PathPoint } from './path-geometry.prototype'

/**
 * PROTOTYPE for #8 — `model-layer.ts` with Paths added, so the three ways of drawing one can be
 * looked at side by side without touching production.
 *
 * The production layer draws **anchors**: one model, one coordinate, one pass, under a matrix that
 * maps one unit to one metre *at that coordinate*. That is exactly the wrong frame for a Path, and
 * the reason is worth stating because it is not obvious: a Path spanning Copenhagen to Bangkok
 * covers 42° of latitude, and one local metre is not one local metre at the other end. Geometry
 * built in a single anchor's metre frame diverges from the truth by kilometres before it is halfway.
 *
 * So a Path is **not an Anchor**. It is drawn in the frame MapLibre itself hands the layer —
 * `mainMatrix`, whose inputs are projection-space rather than local metres — and its vertices are
 * built once per projection rather than once per anchor:
 *
 * - **mercator**: `x, y` are mercator coordinates in `[0, 1]`, `z` is metres (see `Z_METRES` below).
 * - **globe**: unit-sphere coordinates, radius 1 at sea level, which is the frame
 *   `getGlobeModelMatrix` already lands in.
 *
 * One pass per Path either way, so ten Legs cost ten passes on top of #7's ~0.13 ms per anchor.
 */

/**
 * The trap this layer exists to have found: **MapLibre scales a custom layer's altitude by the
 * latitude of the map's centre, not by the latitude of the thing being drawn.**
 *
 * `mercator_transform.ts` builds the custom-layer matrix with
 * `scale = [EXTENT, EXTENT, worldSize / pixelsPerMeter]`, and `pixelsPerMeter` is
 * `mercatorZfromAltitude(1, center.lat) * worldSize` — so the z axis is divided by the circumference
 * **at the camera's centre latitude**. Feed it `altitude / circumferenceAtLatitude(ownLat)`, which is
 * what `getMercatorModelMatrix` does, and the drawn height comes out multiplied by
 * `cos(centreLat) / cos(ownLat)`.
 *
 * That is dormant in production and genuinely fine there: every anchor today sits *on* the ground,
 * where the altitude is tens of metres and the camera is centred on the thing being looked at, so the
 * error is centimetres. #7's 0.001 px agreement was measured with the anchor at the centre, where the
 * two conventions are identical by construction. It stops being dormant the moment a Path is lifted
 * into the air: an arc 1,000 km high, drawn from a camera centred 40° of latitude away, is wrong by
 * hundreds of kilometres at one end and reads as a bow that slides as you pan.
 *
 * The fix is to keep the geometry in **plain metres** and let the frame apply the centre-latitude
 * scale each frame, which is also what makes the vertices camera-independent and cacheable.
 */
const circumferenceAtLatitude = (lat: number) =>
  2 * Math.PI * EARTH_RADIUS_M * Math.cos((lat * Math.PI) / 180)

const mercatorXFromLng = (lng: number) => (180 + lng) / 360

const mercatorYFromLat = (lat: number) =>
  (180 -
    (180 / Math.PI) * Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360))) /
  360

/** A Path the layer draws, with its vertices already densified and lifted by `buildPath`. */
export type DrawnPath = {
  id: string
  points: readonly PathPoint[]
  colour: number
  /** CSS pixels, screen-space — a line's width is not a size the #20 law has anything to say about. */
  widthPx: number
  opacity?: number
}

export type DioramaLayer = CustomLayerInterface & {
  setAnchors: (anchors: readonly Anchor[]) => void
  setPaths: (paths: readonly DrawnPath[]) => void
}

/** Mercator vertices: x/y in [0,1], z in metres — the frame applies the centre-latitude scale. */
const mercatorVertices = (points: readonly PathPoint[]): number[] =>
  points.flatMap(({ at: [lng, lat], altitudeM }) => [
    mercatorXFromLng(lng),
    mercatorYFromLat(lat),
    altitudeM,
  ])

/** Globe vertices: the unit sphere, radius 1 at sea level. */
const globeVertices = (points: readonly PathPoint[]): number[] =>
  points.flatMap(({ at: [lng, lat], altitudeM }) => {
    const λ = (lng * Math.PI) / 180
    const φ = (lat * Math.PI) / 180
    const r = 1 + altitudeM / EARTH_RADIUS_M

    return [
      r * Math.cos(φ) * Math.sin(λ),
      r * Math.sin(φ),
      r * Math.cos(φ) * Math.cos(λ),
    ]
  })

type BuiltPath = { mercator: Line2; globe: Line2; material: LineMaterial }

const buildLines = (path: DrawnPath): BuiltPath => {
  const material = new LineMaterial({
    color: path.colour,
    transparent: path.opacity !== undefined && path.opacity < 1,
    opacity: path.opacity ?? 1,
    // Screen space, which is what a line width means on a map — and the one property in the Diorama
    // that #20's law deliberately says nothing about.
    worldUnits: false,
  })

  const line = (positions: number[]) => {
    const geometry = new LineGeometry()
    geometry.setPositions(positions)
    const built = new Line2(geometry, material)
    // Every vertex is already in projection space; nothing may cull it on a local bounding sphere.
    built.frustumCulled = false
    return built
  }

  return {
    mercator: line(mercatorVertices(path.points)),
    globe: line(globeVertices(path.points)),
    material,
  }
}

export function createDioramaLayer(
  id: string,
  { scaleFor }: { scaleFor?: ScaleFor } = {},
): DioramaLayer {
  let map: MapLibreMap | undefined
  let renderer: WebGLRenderer | undefined

  const scene = new Scene()
  scene.add(buildDioramaLight())

  // A second scene for Paths: they are unlit line geometry, and putting them through the model
  // scene would mean the light rig walking them on every anchor's pass.
  const pathScene = new Scene()

  const camera = new Camera()

  let anchors: readonly Anchor[] = []
  let paths: readonly DrawnPath[] = []
  let built: BuiltPath[] = []

  const setAnchors = (next: readonly Anchor[]) => {
    anchors = next
    map?.triggerRepaint()
  }

  const setPaths = (next: readonly DrawnPath[]) => {
    for (const line of built) {
      line.mercator.geometry.dispose()
      line.globe.geometry.dispose()
      line.material.dispose()
    }

    paths = next
    built = next.map(buildLines)
    map?.triggerRepaint()
  }

  return {
    id,
    type: 'custom',
    renderingMode: '3d',
    setAnchors,
    setPaths,

    onAdd(addedTo: MapLibreMap, gl: WebGL2RenderingContext) {
      map = addedTo
      renderer = new WebGLRenderer({ canvas: addedTo.getCanvas(), context: gl })
      renderer.autoClear = false
      renderer.shadowMap.enabled = true
    },

    render(gl: WebGL2RenderingContext, args: CustomRenderMethodInput) {
      if (!map || !renderer) return
      if (anchors.length === 0 && built.length === 0) return

      const { mainMatrix, projectionTransition } = args.defaultProjectionData
      const onGlobe = projectionTransition > 0

      renderer.resetState()

      const target = gl.getParameter(
        gl.FRAMEBUFFER_BINDING,
      ) as WebGLFramebuffer | null

      const centreLat = map.getCenter().lat
      const ctx = { zoom: map.getZoom() }

      // ---- Paths, in MapLibre's own frame ------------------------------------------------------

      if (built.length > 0) {
        // Metres → whatever the z axis of this frame wants. On the globe the vertices are already
        // unit-sphere, so the frame is used as handed over.
        const frame = new Matrix4().fromArray(mainMatrix)
        if (!onGlobe) {
          frame.multiply(
            new Matrix4().makeScale(
              1,
              1,
              1 / circumferenceAtLatitude(centreLat),
            ),
          )
        }
        camera.projectionMatrix = frame

        const buffer = renderer.getDrawingBufferSize(new Vector2())

        for (const [i, line] of built.entries()) {
          // `linewidth` is measured against `resolution`, which is the drawing buffer — so a CSS
          // pixel costs `devicePixelRatio` of them, or every Path draws half width on a retina
          // screen.
          line.material.resolution.set(buffer.x, buffer.y)
          line.material.linewidth =
            paths[i].widthPx * (window.devicePixelRatio || 1)

          const drawn = onGlobe ? line.globe : line.mercator
          pathScene.add(drawn)
          renderer.render(pathScene, camera)
          pathScene.remove(drawn)
        }
      }

      // ---- Anchors, each in its own local metre frame -------------------------------------------

      for (const anchor of anchors) {
        const k = scaleFor?.(anchor, ctx) ?? 1
        if (k <= 0) continue

        const groundM = map.queryTerrainElevation(anchor.origin) ?? 0
        const altitudeM = groundM + (anchor.altitudeM ?? 0)

        const place = new Matrix4()
          .fromArray(mainMatrix)
          .multiply(
            onGlobe
              ? globeModelMatrix(anchor.origin, altitudeM)
              : mercatorModelMatrix(anchor.origin, altitudeM, centreLat),
          )

        camera.projectionMatrix =
          k === 1 ? place : place.multiply(new Matrix4().makeScale(k, k, k))

        scene.add(anchor.content)
        renderer.render(scene, camera)
        scene.remove(anchor.content)
      }

      gl.bindFramebuffer(gl.FRAMEBUFFER, target)
    },

    onRemove() {
      anchors = []
      setPaths([])
      renderer?.dispose()
      renderer = undefined
      map = undefined
    },
  }
}

/**
 * `getMercatorModelMatrix` with the altitude scaled by the **centre** latitude rather than the
 * anchor's own — see `circumferenceAtLatitude` above for why. Identical to production whenever the
 * camera is centred on the anchor, which is every camera #7 measured.
 */
function mercatorModelMatrix(
  [lng, lat]: LngLatTuple,
  altitudeM: number,
  centreLat: number,
): Matrix4 {
  const scale = 1 / circumferenceAtLatitude(lat)

  return new Matrix4()
    .makeTranslation(
      mercatorXFromLng(lng),
      mercatorYFromLat(lat),
      altitudeM / circumferenceAtLatitude(centreLat),
    )
    .multiply(new Matrix4().makeRotationZ(Math.PI))
    .multiply(new Matrix4().makeRotationX(Math.PI / 2))
    .multiply(new Matrix4().makeScale(-scale, scale, scale))
}

/** Unchanged from production: the globe frame has no centre-latitude term to get wrong. */
function globeModelMatrix([lng, lat]: LngLatTuple, altitudeM: number): Matrix4 {
  const scale = 1 / EARTH_RADIUS_M

  return new Matrix4()
    .makeRotationY((lng / 180) * Math.PI)
    .multiply(new Matrix4().makeRotationX((-lat / 180) * Math.PI))
    .multiply(
      new Matrix4().makeTranslation(0, 0, 1 + altitudeM / EARTH_RADIUS_M),
    )
    .multiply(new Matrix4().makeRotationX(Math.PI / 2))
    .multiply(new Matrix4().makeScale(scale, scale, scale))
}
