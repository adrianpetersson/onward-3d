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

/**
 * How far the sun's shadow camera reaches, in metres from the anchor.
 *
 * Chosen when the Stay Marker was an 8 m guesthouse throwing a shadow a few metres long, where 60 m
 * was pure slack. **#21's 40 m hotel tower spends most of that slack**: it throws its shadow ~31 m,
 * so `stay-marker.ts` now sizes its catcher disc at ~44 m, and the widest thing this camera has to
 * contain is that disc. 60 still covers it — the tower's own worst corner projects to 35 m
 * perpendicular to the light — but the margin is 26% rather than the 5× it used to be. **A taller
 * Stay Marker than this one has to raise this number**, and would otherwise lose the far end of its
 * own shadow with nothing logged. Exported and pinned by test against the catcher's own radius, so
 * that sentence is enforced rather than merely written down.
 */
export const SHADOW_EXTENT_M = 60

/** One rig per scene. Lights are not draw calls, so a scene per layer costs nothing to light. */
export function buildDioramaLight(): Group {
  const rig = new Group()
  rig.name = 'diorama-light'

  const sun = new DirectionalLight(SUN.color, SUN.intensity)
  sun.position.set(...SUN.position)
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

  rig.add(sun, new HemisphereLight(SKY.color, SKY.ground, SKY.intensity))

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
export function buildShadowCatcher(radiusM: number): Mesh {
  const catcher = new Mesh(
    new CircleGeometry(radiusM, 48),
    new ShadowMaterial({
      opacity: 0.32,
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
