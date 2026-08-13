/**
 * Prints each Vehicle's cross-section along its length, so "which end is the front" is answered
 * with numbers instead of a squint.
 *
 * Written because the taper heuristic in lib/pipeline.mjs got the van backwards: it samples the
 * outer fifth and compares one maximum width, which on a flared bow or a boxy cargo body measures
 * the wrong feature. A station profile shows the whole entry, and a hull's bow is the end whose
 * beam grows *gradually*.
 *
 *   node scripts/models/stations.mjs [id ...]
 */

import { NodeIO } from '@gltf-transform/core'
import { join } from 'node:path'

import { collectTriangles } from './lib/raster.mjs'
import { loadSources, repoPath } from './lib/pipeline.mjs'

const io = new NodeIO()
const wanted = process.argv.slice(2)
const sources = await loadSources()

const STATIONS = 10

for (const asset of sources.assets) {
  if (wanted.length && !wanted.includes(asset.id)) continue
  if (asset.role !== 'vehicle') continue

  const document = await io.read(
    join(repoPath('src/map/models'), `${asset.id}.glb`),
  )
  const points = collectTriangles(document).flatMap(
    (triangle) => triangle.points,
  )

  const zs = points.map((p) => p[2])
  const minZ = Math.min(...zs)
  const maxZ = Math.max(...zs)
  const span = maxZ - minZ

  const profile = []
  for (let station = 0; station < STATIONS; station++) {
    const from = minZ + (span * station) / STATIONS
    const to = minZ + (span * (station + 1)) / STATIONS
    const slice = points.filter((p) => p[2] >= from && p[2] <= to)
    const halfBeam = slice.length
      ? Math.max(...slice.map((p) => Math.abs(p[0])))
      : 0
    const height = slice.length ? Math.max(...slice.map((p) => p[1])) : 0
    profile.push({ halfBeam, height })
  }

  const beams = profile.map((station) => station.halfBeam)
  const maxBeam = Math.max(...beams)

  // How far in from each end the hull reaches 60% of its full beam. The finer end travels further.
  const entry = (order) => {
    const indexed = order === 'forward' ? beams : [...beams].reverse()
    const at = indexed.findIndex((beam) => beam >= maxBeam * 0.6)
    return at === -1 ? STATIONS : at
  }

  const fromNegative = entry('forward')
  const fromPositive = entry('reverse')

  console.log(`\n${asset.id}  (length on z: ${span.toFixed(3)} units)`)
  console.log(
    `  half-beam by station, -z → +z:  ${beams.map((b) => b.toFixed(2)).join('  ')}`,
  )
  console.log(
    `  height by station,    -z → +z:  ${profile.map((s) => s.height.toFixed(2)).join('  ')}`,
  )
  console.log(
    `  stations to 60% beam:  from -z: ${fromNegative}   from +z: ${fromPositive}` +
      `  →  finer end is ${fromPositive > fromNegative ? '+z' : fromPositive < fromNegative ? '-z' : 'a tie'}`,
  )
}
