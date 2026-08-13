import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { modelAssets } from '../../src/map/models/model-assets.ts'

/**
 * Guards the one thing about the shipped models that fails silently.
 *
 * Every Kenney GLB arrives declaring its texture atlas as an external relative URI
 * (`Textures/colormap.png`). Served that way the browser 404s the atlas and the model renders
 * untextured — no error, no warning, nothing in the console. `build.mjs` repacks each model with the
 * atlas inside it, and this asserts the repack actually happened, so a future change to the pipeline
 * cannot quietly start shipping bare models again. It is the reason #17 existed.
 *
 * The GLB reader below is deliberately a second, independent implementation rather than an import
 * from the pipeline: a test that reuses the generator's parser inherits the generator's bugs.
 *
 * This file lives with the pipeline rather than under `src/` because it touches the filesystem, and
 * `tsconfig.json` keeps node types out of the browser-only app. `vite.config.ts` includes it.
 */

const MODELS_DIR = join(import.meta.dirname, '../../src/map/models')

/** Reads a GLB container: 12-byte header, then length-prefixed chunks. */
function readGlb(file) {
  const glb = readFileSync(join(MODELS_DIR, file))

  expect(glb.subarray(0, 4).toString('ascii'), `${file}: GLB magic`).toBe(
    'glTF',
  )
  expect(glb.readUInt32LE(4), `${file}: GLB version`).toBe(2)
  expect(glb.readUInt32LE(8), `${file}: header length matches file size`).toBe(
    glb.length,
  )

  let offset = 12
  let json = null
  let binByteLength = 0

  while (offset < glb.length) {
    const chunkLength = glb.readUInt32LE(offset)
    const chunkType = glb.subarray(offset + 4, offset + 8).toString('ascii')
    const body = glb.subarray(offset + 8, offset + 8 + chunkLength)

    if (chunkType === 'JSON') json = JSON.parse(body.toString('utf8'))
    if (chunkType === 'BIN\0') binByteLength = chunkLength

    offset += 8 + chunkLength
  }

  if (!json) throw new Error(`${file}: no JSON chunk`)
  return { json, binByteLength, bytes: glb.length }
}

const onDisk = readdirSync(MODELS_DIR)
  .filter((name) => name.endsWith('.glb'))
  .sort()

/* -- Just enough 4×4 to walk a glTF node hierarchy, column-major as the spec stores it. -------- */

const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]

const multiply = (a, b) => {
  const out = new Array(16).fill(0)
  for (let column = 0; column < 4; column++) {
    for (let row = 0; row < 4; row++) {
      for (let k = 0; k < 4; k++) {
        out[column * 4 + row] += a[k * 4 + row] * b[column * 4 + k]
      }
    }
  }
  return out
}

/** A node's own transform: an explicit `matrix`, or its translation/rotation/scale triple. */
function localMatrix(node) {
  if (node.matrix) return node.matrix

  const [x, y, z, w] = node.rotation ?? [0, 0, 0, 1]
  const [sx, sy, sz] = node.scale ?? [1, 1, 1]
  const [tx, ty, tz] = node.translation ?? [0, 0, 0]

  // Quaternion to a rotation basis, each column then scaled.
  return [
    (1 - 2 * (y * y + z * z)) * sx,
    2 * (x * y + z * w) * sx,
    2 * (x * z - y * w) * sx,
    0,
    2 * (x * y - z * w) * sy,
    (1 - 2 * (x * x + z * z)) * sy,
    2 * (y * z + x * w) * sy,
    0,
    2 * (x * z + y * w) * sz,
    2 * (y * z - x * w) * sz,
    (1 - 2 * (x * x + y * y)) * sz,
    0,
    tx,
    ty,
    tz,
    1,
  ]
}

const transform = (m, [x, y, z]) => [
  m[0] * x + m[4] * y + m[8] * z + m[12],
  m[1] * x + m[5] * y + m[9] * z + m[13],
  m[2] * x + m[6] * y + m[10] * z + m[14],
]

const corners = (min, max) => {
  const points = []
  for (const x of [min[0], max[0]]) {
    for (const y of [min[1], max[1]]) {
      for (const z of [min[2], max[2]]) points.push([x, y, z])
    }
  }
  return points
}

describe('the shipped model set', () => {
  it('has a GLB for every table entry, and an entry for every GLB', () => {
    // Catches drift between sources.json and what was committed, in both directions.
    expect(onDisk).toEqual(
      modelAssets()
        .map((asset) => asset.file)
        .sort(),
    )
  })

  it('stays inside the weight the research promised', () => {
    const total = onDisk.reduce(
      (bytes, file) => bytes + readFileSync(join(MODELS_DIR, file)).length,
      0,
    )

    // #4 costed the full set with three-piece trainsets at ~1.21 MB against a 13.78 MB download. The
    // real figure is ~1.26 MB: the airliner ships unindexed so each triangle keeps its own face
    // normal, the OBJ having supplied none. The ceiling is there to catch someone dropping in a model
    // an order of magnitude heavier, not to police tens of kB.
    expect(total).toBeLessThan(1_500_000)
  })
})

describe.each(modelAssets())('$id', (asset) => {
  const { json, binByteLength } = readGlb(asset.file)

  it('carries its texture inside the file rather than as an external URI', () => {
    for (const image of json.images ?? []) {
      expect(
        image.uri,
        `${asset.file}: images[].uri must be absent — an external atlas 404s in the browser`,
      ).toBeUndefined()
      expect(
        image.bufferView,
        `${asset.file}: image must resolve to a bufferView`,
      ).toBeTypeOf('number')
      expect(image.mimeType).toMatch(/^image\//)
    }
  })

  it('resolves every buffer inside the file', () => {
    for (const buffer of json.buffers ?? []) {
      expect(
        buffer.uri,
        `${asset.file}: buffers[].uri must be absent`,
      ).toBeUndefined()
    }
    expect(
      binByteLength,
      `${asset.file}: must carry a binary chunk`,
    ).toBeGreaterThan(0)
  })

  it('has geometry to draw', () => {
    const primitives = (json.meshes ?? []).flatMap((mesh) => mesh.primitives)
    expect(primitives.length).toBeGreaterThan(0)
    for (const primitive of primitives) {
      expect(primitive.attributes.POSITION).toBeTypeOf('number')
    }
  })

  it('reads at the size the table claims', () => {
    // End-to-end check of the scale column, and the reason it is worth the arithmetic below: take
    // each POSITION accessor's own min/max — mandatory in glTF — push its corners through the node
    // hierarchy, and confirm the world-space extent times `scale` is the metre figure advertised.
    //
    // The hierarchy is not decoration. Kenney's models are assemblies: `van.glb` alone has five
    // nodes, its wheels translated ±0.76 along Z and its body lifted 0.2 along Y. Reading the
    // accessors flat gets the van's height wrong by 19 cm.
    const axis = { x: 0, y: 1, z: 2 }[asset.readsAtAxis]
    let min = Infinity
    let max = -Infinity

    const visit = (nodeIndex, parent) => {
      const node = json.nodes[nodeIndex]
      const world = multiply(parent, localMatrix(node))

      if (node.mesh !== undefined) {
        for (const primitive of json.meshes[node.mesh].primitives) {
          const accessor = json.accessors[primitive.attributes.POSITION]
          for (const corner of corners(accessor.min, accessor.max)) {
            const value = transform(world, corner)[axis]
            min = Math.min(min, value)
            max = Math.max(max, value)
          }
        }
      }

      for (const child of node.children ?? []) visit(child, world)
    }

    const scene = json.scenes[json.scene ?? 0]
    for (const nodeIndex of scene.nodes) visit(nodeIndex, IDENTITY)

    expect((max - min) * asset.scale).toBeCloseTo(asset.readsAtM, 1)
  })
})
