import {
  CircleGeometry,
  DirectionalLight,
  Group,
  HemisphereLight,
  Mesh,
  ShadowMaterial,
} from 'three'

/**
 * The light every model in the Diorama is lit by.
 *
 * This exists because the models force it: #17 shipped PBR metallic-roughness materials, and a PBR
 * material in an unlit scene is black. The scaffold's proof triangle sidestepped that with
 * `MeshBasicMaterial`; a GLB cannot. So the first ticket to draw a real model has to choose a light
 * before it can see anything at all.
 *
 * **What the light looks like is #11's to settle, not this file's.** What is settled here is that
 * there is one place to change it, and that the numbers below are a deliberate matte-toy read rather
 * than three.js defaults: a warm key high in the north-west, and a sky/sand hemisphere fill doing the
 * bounce that an ambient term would flatten.
 *
 * ## The frame these directions are in
 *
 * A light's position is in the anchor's local frame, which is Y-up metres. Its axes mean the same
 * thing on the compass under **both** projections — `+x` east, `+y` up, `+z` south — which is not
 * what #2 expected of the mirrored mercator frame and is pinned by test in `model-matrix.test.ts`.
 * The key light below therefore sits in the north-west and stays there across the globe handover;
 * nothing in this file has to watch `projectionTransition`.
 */

/**
 * The whole light, as data. #11 has to compare several of these side by side, and a light that lives
 * in module constants can only ever be the one the last edit left behind.
 */
export type LightSpec = {
  sun: {
    color: number
    intensity: number
    /** Local-frame direction, normalised by three; `+x` east, `+y` up, `+z` south. */
    position: readonly [number, number, number]
  }
  sky: {
    /** Overhead. */
    color: number
    /** Bounce, off whatever the ground is made of. */
    ground: number
    intensity: number
  }
  /** How dark a cast shadow lands on the catcher, 0–1. */
  shadowOpacity: number
}

export const SUN = {
  color: 0xfff4e2,
  intensity: 2.9,
  /** Local-frame position, normalised by three; high, west, and (on the pitched map) north. */
  position: [-0.55, 1.15, -0.7] as const,
}

export const SKY = {
  /** Overhead: a pale tropical sky. */
  color: 0xbfd8f0,
  /** Bounce: warm sand rather than the neutral grey an `AmbientLight` would give. */
  ground: 0xd9c3a1,
  intensity: 1.6,
}

/** #7's light: the matte-toy read the tracer was shot under, and the baseline #11 argues with. */
export const DIORAMA_LIGHT: LightSpec = {
  sun: SUN,
  sky: SKY,
  shadowOpacity: 0.32,
}

/**
 * How far the sun's shadow camera reaches, in metres from the anchor. An 8 m guesthouse throws a
 * shadow a few metres long; 60 m is slack enough for a Stay Marker on a slope without spending the
 * shadow map's resolution on empty sand.
 */
const SHADOW_EXTENT_M = 60

/** One rig per scene. Lights are not draw calls, so a scene per layer costs nothing to light. */
export function buildDioramaLight(spec: LightSpec = DIORAMA_LIGHT): Group {
  const rig = new Group()
  rig.name = 'diorama-light'

  const sun = new DirectionalLight(spec.sun.color, spec.sun.intensity)
  sun.position.set(...spec.sun.position)
  sun.castShadow = true
  sun.shadow.mapSize.set(1024, 1024)

  const { camera } = sun.shadow
  camera.left = -SHADOW_EXTENT_M
  camera.right = SHADOW_EXTENT_M
  camera.top = SHADOW_EXTENT_M
  camera.bottom = -SHADOW_EXTENT_M
  camera.near = -SHADOW_EXTENT_M
  camera.far = SHADOW_EXTENT_M * 4
  // The models are matte and low-poly, so the acne this hides is coarse and a large bias costs
  // nothing in contact accuracy that the eye can find.
  sun.shadow.bias = -0.002

  rig.add(
    sun,
    new HemisphereLight(spec.sky.color, spec.sky.ground, spec.sky.intensity),
  )

  return rig
}

/**
 * A disc of ground that catches a model's shadow and is otherwise invisible.
 *
 * It has to exist because the terrain a Stay Marker stands on belongs to MapLibre, not to three.js —
 * there is no surface in this scene for a shadow to land on, so a model with nothing under it casts
 * into the void and reads as pasted on. The catcher is a `ShadowMaterial` plane: it draws only where
 * the shadow map darkens it, and is fully transparent everywhere else, so the basemap shows through.
 *
 * **It is flat, and the ground may not be.** At sea level on a beach that is exactly right. On a
 * slope the disc will cut into the hillside on one side and hover on the other, which is why it is
 * kept small and why draping it is left as a real limitation rather than papered over.
 */
export function buildShadowCatcher(
  radiusM: number,
  opacity: number = DIORAMA_LIGHT.shadowOpacity,
): Mesh {
  const catcher = new Mesh(
    new CircleGeometry(radiusM, 48),
    new ShadowMaterial({
      opacity,
      // Ground level is exactly where MapLibre's terrain is too, and a tie in the depth buffer
      // flickers. Nudge the catcher back so the terrain always wins the coincident pixels.
      polygonOffset: true,
      polygonOffsetFactor: 1,
      polygonOffsetUnits: 1,
    }),
  )

  // PlaneGeometry is authored in XY; the anchor frame is Y-up, so it has to lie down.
  catcher.rotation.x = -Math.PI / 2
  catcher.receiveShadow = true
  catcher.name = 'shadow-catcher'

  return catcher
}
