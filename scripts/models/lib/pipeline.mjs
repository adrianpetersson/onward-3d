/**
 * Shared plumbing for the model pipeline: argument parsing, the scratch directory, archive
 * extraction, and the geometry measurements the scale table is derived from.
 *
 * Nothing here is application code — it runs at author time, on a developer's machine, and none of
 * it ships in the bundle.
 */

import { execFile } from 'node:child_process'
import { readdir, readFile, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const exec = promisify(execFile)

/** `--scratch <dir> --force` — no dependency, and no cleverness beyond what the two scripts use. */
export function parseArgs(argv = process.argv.slice(2)) {
  const args = {}
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--force') args.force = true
    else if (argv[i] === '--scratch') args.scratch = argv[++i]
    else throw new Error(`Unrecognised argument: ${argv[i]}`)
  }
  return args
}

/**
 * Archives live outside the repo, and stay there. #17 is explicit that the processed GLBs are
 * committed and the 13.78 MB of archives are not.
 */
export const defaultScratchDir = () =>
  process.env.ONWARD_MODEL_SCRATCH ?? join(tmpdir(), 'onward-models')

export const loadSources = async () =>
  JSON.parse(
    await readFile(new URL('../sources.json', import.meta.url), 'utf8'),
  )

/**
 * A path inside the repo.
 *
 * Via `fileURLToPath` rather than `URL.pathname`, which stays percent-encoded — a checkout under a
 * directory with a space in it would have written every output to a path with `%20` in the name.
 */
export const repoPath = (...parts) =>
  join(fileURLToPath(new URL('../../../', import.meta.url)), ...parts)

/**
 * The rotation about Y, in radians, that brings a model's nose onto +Z — the convention the whole set
 * follows.
 *
 * One knob, not two. An earlier version declared the fuselage's axis and its direction separately and
 * got the composition wrong: rotating +X by +π/2 about Y lands it on **−Z**, not +Z, so a model
 * declared as nose-along-+X would have been built facing backwards. Naming the nose direction outright
 * makes the rotation a lookup with nothing to compose.
 */
export function yawToFaceZ(forward) {
  const yaw = { '+z': 0, '-z': Math.PI, '+x': -Math.PI / 2, '-x': Math.PI / 2 }[
    forward
  ]
  if (yaw === undefined) {
    throw new Error(`forward must be one of +z, -z, +x, -x — got ${forward}`)
  }
  return yaw
}

/**
 * Unpacks a zip with whatever the machine has. macOS ships both `unzip` and a libarchive `tar`
 * that reads zips; a pipeline that runs once per pack update does not deserve a dependency.
 */
export async function extractArchive(archive, into) {
  try {
    await exec('unzip', ['-q', '-o', archive, '-d', into])
  } catch {
    await exec('tar', ['-xf', archive, '-C', into])
  }
}

/** Every file under a directory, recursively — the extraction layouts are not worth trusting. */
export async function walk(dir) {
  const found = []
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) found.push(...(await walk(path)))
    else found.push(path)
  }
  return found
}

export const exists = (path) =>
  stat(path).then(
    () => true,
    () => false,
  )

/* -------------------------------------------------------------------------- */
/*  Measurement                                                               */
/* -------------------------------------------------------------------------- */

/** glTF matrices are column-major 16-element arrays. */
const applyMatrix = (m, [x, y, z]) => [
  m[0] * x + m[4] * y + m[8] * z + m[12],
  m[1] * x + m[5] * y + m[9] * z + m[13],
  m[2] * x + m[6] * y + m[10] * z + m[14],
]

const corners = (min, max) => {
  const points = []
  for (const x of [min[0], max[0]])
    for (const y of [min[1], max[1]])
      for (const z of [min[2], max[2]]) points.push([x, y, z])
  return points
}

/**
 * The world-space bounding box of a Document's default scene.
 *
 * Read from each POSITION accessor's own `min`/`max` — mandatory in glTF for POSITION — pushed
 * through the node's world matrix. This is why the scale table exists: measured across the four
 * kits these boxes disagree by an order of magnitude, so no source unit can be trusted.
 */
export function measureBounds(document) {
  const min = [Infinity, Infinity, Infinity]
  const max = [-Infinity, -Infinity, -Infinity]

  for (const node of document.getRoot().listNodes()) {
    const mesh = node.getMesh()
    if (!mesh) continue

    const matrix = node.getWorldMatrix()

    for (const primitive of mesh.listPrimitives()) {
      const position = primitive.getAttribute('POSITION')
      if (!position) continue

      for (const corner of corners(position.getMin([]), position.getMax([]))) {
        const point = applyMatrix(matrix, corner)
        for (let axis = 0; axis < 3; axis++) {
          min[axis] = Math.min(min[axis], point[axis])
          max[axis] = Math.max(max[axis], point[axis])
        }
      }
    }
  }

  return { min, max, size: max.map((value, axis) => value - min[axis]) }
}

/** Every world-space vertex of the default scene. Slower than bounds; only the taper test needs it. */
export function worldVertices(document) {
  const points = []

  for (const node of document.getRoot().listNodes()) {
    const mesh = node.getMesh()
    if (!mesh) continue

    const matrix = node.getWorldMatrix()

    for (const primitive of mesh.listPrimitives()) {
      const position = primitive.getAttribute('POSITION')
      if (!position) continue

      const vertex = []
      for (let i = 0; i < position.getCount(); i++) {
        position.getElement(i, vertex)
        points.push(applyMatrix(matrix, vertex))
      }
    }
  }

  return points
}

const AXIS = { x: 0, y: 1, z: 2 }

/**
 * Reads the front direction out of the artist's own node names.
 *
 * By far the strongest signal available, and it costs nothing: Kenney names the running gear
 * `wheel-front-right`, `wheels-back` and so on, so the model states which way it faces. Across the
 * van and both train noses — two different kits — front sits at positive Z every time, which is
 * what established +Z as this project's convention.
 *
 * Returns null when a model carries no directional names, which is the case for the single-node
 * watercraft.
 */
export function forwardFromNodeNames(document) {
  const positions = { front: [], back: [] }

  for (const node of document.getRoot().listNodes()) {
    const name = (node.getName() ?? '').toLowerCase()
    const end = /front|bow|nose/.test(name)
      ? 'front'
      : /back|rear|stern|tail/.test(name)
        ? 'back'
        : null
    if (end) positions[end].push(node.getTranslation()[2])
  }

  if (!positions.front.length || !positions.back.length) return null

  const mean = (values) =>
    values.reduce((sum, value) => sum + value, 0) / values.length
  const front = mean(positions.front)
  const back = mean(positions.back)
  if (front === back) return null

  return {
    forward: front > back ? '+z' : '-z',
    frontZ: front,
    backZ: back,
    names: positions,
  }
}

/**
 * Which end of the long axis is the front, measured rather than guessed.
 *
 * Two independent signals, because neither is reliable alone:
 *
 * - **Taper** — a bow or a nose is narrower across the beam than the stern or the wing root.
 * - **Height** — a tail carries the fin, a funnel or the pantograph, so the back end is taller.
 *
 * Both are heuristics on somebody else's art, so the caller records the numbers alongside the
 * verdict and the sign is confirmed by eye once a Vehicle stands on a Path (#8).
 */
export function measureFrontEnd(document, lengthAxis = 'z') {
  const long = AXIS[lengthAxis]
  const cross = long === 2 ? 0 : 2
  const vertical = 1

  const points = worldVertices(document)
  const values = points.map((point) => point[long])
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1

  // The outer fifth at each end: enough vertices to be stable, tight enough to miss the wings.
  const end = (predicate) => {
    const slice = points.filter(predicate)
    const width = Math.max(...slice.map((p) => Math.abs(p[cross]))) * 2
    const height = Math.max(...slice.map((p) => p[vertical]))
    return { width, height, count: slice.length }
  }

  const positive = end((p) => p[long] > max - span * 0.2)
  const negative = end((p) => p[long] < min + span * 0.2)

  const taperSaysPositive = positive.width < negative.width
  const finSaysPositive = positive.height < negative.height

  return {
    positive,
    negative,
    agree: taperSaysPositive === finSaysPositive,
    /** True when +axis is the front, so a model wanting +Z-forward needs no yaw. */
    frontIsPositive: taperSaysPositive,
  }
}
