import { Group, Mesh, type Object3D } from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'

import { MODEL_ASSETS, type ModelAssetKey } from './model-assets'
import { modelUrl } from './index'

/**
 * Turns a key in the model table into a three.js object standing at true metre scale, ready to be
 * dropped into an anchor.
 *
 * Everything this does comes off `MODEL_ASSETS`, which #17 measured from the shipped GLBs at build
 * time. Nothing is measured here: reading a bounding box at runtime would mean paying for the same
 * answer on every load, and getting a worse one, because the table also records which axis the
 * scale was solved for and no bounding box can say that.
 */

const loader = new GLTFLoader()

/**
 * Parsed models, keyed by asset. Ten Stay Markers are ten clones of one parse: `Object3D.clone()`
 * shares geometry and material, so the atlas uploads to the GPU once however many stand on the map.
 *
 * The consequence is that **a clone must never be disposed** — its geometry belongs to the cache and
 * to every sibling. Anchors therefore drop their content without disposing it, and the whole cache
 * goes at once (`disposeModelCache`) or, in practice, with the GL context.
 */
const parsed = new Map<ModelAssetKey, Promise<Group>>()

const parse = (key: ModelAssetKey): Promise<Group> => {
  const pending =
    parsed.get(key) ??
    loader.loadAsync(modelUrl(key)).then((gltf) => gltf.scene)
  parsed.set(key, pending)
  return pending
}

/**
 * A model at true metre scale, standing on y = 0, facing +Z.
 *
 * The returned Group is the caller's to move; the asset transform lives on the child inside it, so
 * positioning or turning a Vehicle never has to know what `scale` or `yOffset` the table applied.
 *
 * GLTFLoader already assigns sRGB to a `baseColorTexture` (it has since r152), so the atlas needs no
 * colour-space handling here despite #17's warning — that warning is aimed at a hand-rolled loader.
 */
export async function loadModel(key: ModelAssetKey): Promise<Group> {
  const asset = MODEL_ASSETS[key]
  const model = (await parse(key)).clone(true)

  model.scale.setScalar(asset.scale)
  // Metres, because the parent frame is metres — the table states `yOffset` in the same units the
  // model matrix speaks, so it applies outside the source-unit scale rather than through it.
  model.position.y = asset.yOffset
  model.rotation.y = asset.yaw

  model.traverse((node: Object3D) => {
    if (node instanceof Mesh) node.castShadow = true
  })

  const group = new Group()
  group.name = asset.id
  group.add(model)

  return group
}

/** Drops every parsed model. Only teardown wants this; a live map shares them. */
export function disposeModelCache(): void {
  for (const pending of parsed.values()) {
    void pending.then((model) =>
      model.traverse((node: Object3D) => {
        if (!(node instanceof Mesh)) return
        node.geometry.dispose()
        for (const material of [node.material].flat()) material.dispose()
      }),
    )
  }
  parsed.clear()
}
