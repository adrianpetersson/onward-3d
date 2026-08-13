import {
  BufferGeometry,
  DoubleSide,
  Float32BufferAttribute,
  Mesh,
  MeshBasicMaterial,
} from 'three'

const HALF_BASE_M = 30
const HEIGHT_M = 60

/**
 * The scaffold's proof of life: one triangle, 60 m tall, standing on the ground at a real
 * coordinate. It exists to show that the matrix chain, the custom layer and the terrain query all
 * agree — nothing more. #7 replaces it with the first real Stay Marker.
 *
 * Two details are load-bearing rather than decorative. Geometry is authored **Y-up**, like a GLTF
 * model, because the model matrix rotates Y-up into the map's Z-up. And the material is
 * `DoubleSide`, because the mercator frame is mirrored and front-face culling silently eats
 * geometry that has not accounted for it.
 */
export function buildProofTriangle(): Mesh {
  const geometry = new BufferGeometry()
  geometry.setAttribute(
    'position',
    new Float32BufferAttribute(
      [-HALF_BASE_M, 0, 0, HALF_BASE_M, 0, 0, 0, HEIGHT_M, 0],
      3,
    ),
  )

  // Unlit on purpose: flat colour is the Diorama's register, and it keeps the scaffold from
  // pretending to a lighting model that #11 has not chosen yet.
  const material = new MeshBasicMaterial({ color: 0xff5533, side: DoubleSide })

  return new Mesh(geometry, material)
}
