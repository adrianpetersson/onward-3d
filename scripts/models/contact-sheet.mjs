/**
 * Draws the model set so a human can check it.
 *
 * Two sheets, answering the two halves of #17's "tuned by eye against a reference cube at a known
 * ground size":
 *
 * - **contact-sheet.png** — every model fitted to its own cell, side and top view, so the front end
 *   of each Vehicle is visible. +Z always points right, which is the whole convention: a nose
 *   pointing right needs no yaw, a nose pointing left needs π.
 * - **scale-sheet.png** — every model on one ground line at one metres-per-pixel, so the set can be
 *   judged as a set. This is the sheet that says whether the Diorama reads as one world.
 *
 * Both carry a 5 m reference cube. Re-run after any change to sources.json:
 *
 *   node scripts/models/contact-sheet.mjs
 */

import { NodeIO } from '@gltf-transform/core'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import {
  collectTriangles,
  createCanvas,
  drawLine,
  drawRect,
  drawText,
  encodePng,
  fillTriangle,
} from './lib/raster.mjs'
import { loadSources, repoPath } from './lib/pipeline.mjs'

const io = new NodeIO()
const MODELS_DIR = repoPath('src/map/models')
const OUT_DIR = repoPath('docs/models')

const INK = [40, 44, 48]
const FAINT = [206, 208, 210]
const REFERENCE = [232, 122, 44]
const GROUND = [150, 154, 158]

const LIGHT = (() => {
  const v = [0.42, 0.82, 0.4]
  const length = Math.hypot(...v)
  return v.map((value) => value / length)
})()

const SHORT_NAMES = {
  'boat-speed': 'boat',
  ferry: 'ferry',
  'train-sleeper-nose': 'slp-a',
  'train-sleeper-middle': 'slp-b',
  'train-sleeper-tail': 'slp-c',
  'train-intercity-nose': 'ic-a',
  'train-intercity-middle': 'ic-b',
  'train-intercity-tail': 'ic-c',
  van: 'van',
  'stay-hotel': 'stay',
  airliner: 'plane',
}

/* -------------------------------------------------------------------------- */
/*  Views                                                                     */
/* -------------------------------------------------------------------------- */

/** Side elevation: +Z to the right, +Y up, camera off +X. */
const SIDE = {
  screenX: (p) => p[2],
  screenY: (p) => p[1],
  depth: (p) => p[0],
}

/** Plan: +Z to the right, +X down the image, camera above. */
const PLAN = {
  screenX: (p) => p[2],
  screenY: (p) => -p[0],
  depth: (p) => p[1],
}

/** Head-on: +X to the right, +Y up, camera off +Z. Tells wings from fins. */
const FRONT = {
  screenX: (p) => p[0],
  screenY: (p) => p[1],
  depth: (p) => p[2],
}

const shade = (normal, factor) => {
  const lambert = Math.max(
    0,
    normal.reduce((sum, n, i) => sum + n * LIGHT[i], 0),
  )
  const level = 0.32 + 0.68 * lambert
  // Factors are linear; the sheet is only ever read by eye, so an approximate gamma is plenty.
  return factor
    .slice(0, 3)
    .map((channel) =>
      Math.min(
        255,
        Math.round(255 * Math.pow(channel, 1 / 2.2) * level * 0.92),
      ),
    )
}

/**
 * Draws triangles into a panel.
 *
 * `pxPerM` fixed → the panel shares a scale with its neighbours. `pxPerM` omitted → the model is
 * fitted to the panel, which is what makes a 6 m boat and a 60 m airliner both legible.
 */
function renderView(
  canvas,
  triangles,
  panel,
  view,
  { pxPerM, includeGround = true } = {},
) {
  const xs = triangles.flatMap((t) => t.points.map(view.screenX))
  const ys = triangles.flatMap((t) => t.points.map(view.screenY))
  if (includeGround) ys.push(0)

  const bounds = {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys),
  }

  const margin = 6
  const scale =
    pxPerM ??
    Math.min(
      (panel.width - margin * 2) / (bounds.maxX - bounds.minX || 1),
      (panel.height - margin * 2) / (bounds.maxY - bounds.minY || 1),
    )

  // Centre horizontally, sit on the bottom of the panel vertically.
  const originX =
    panel.x + panel.width / 2 - ((bounds.minX + bounds.maxX) / 2) * scale
  const originY = panel.y + panel.height - margin + bounds.minY * scale

  const project = (point) => [
    (originX + view.screenX(point) * scale) * 2,
    (originY - view.screenY(point) * scale) * 2,
  ]

  if (includeGround) {
    const groundY = originY * 2
    drawLine(
      canvas,
      [panel.x * 2, groundY],
      [(panel.x + panel.width) * 2, groundY],
      GROUND,
      1,
    )
  }

  // Painter's algorithm: far triangles first. No z-buffer, and none needed for a silhouette.
  for (const triangle of [...triangles].sort(
    (a, b) =>
      a.points.reduce((sum, p) => sum + view.depth(p), 0) -
      b.points.reduce((sum, p) => sum + view.depth(p), 0),
  )) {
    const [a, b, c] = triangle.points.map(project)
    fillTriangle(canvas, a, b, c, shade(triangle.normal, triangle.factor))
  }

  return { scale, project, originX, originY }
}

/** The 5 m reference cube, drawn in the panel's own corner rather than in the model's way. */
function drawReferenceCube(canvas, panel, pxPerM, label = '5M') {
  const side = 5 * pxPerM
  const x = panel.x + 4
  const y = panel.y + panel.height - 4

  drawRect(
    canvas,
    [x * 2, (y - side) * 2],
    [(x + side) * 2, y * 2],
    REFERENCE,
    1,
  )
  drawText(canvas, label, [x + 2, y - side - 9], REFERENCE, 1)
}

/* -------------------------------------------------------------------------- */
/*  Sheet A — one cell per model                                              */
/* -------------------------------------------------------------------------- */

const sources = await loadSources()

const loaded = []
for (const asset of sources.assets) {
  loaded.push({
    asset,
    document: await io.read(join(MODELS_DIR, `${asset.id}.glb`)),
  })
}

/**
 * Scale comes from the generated table, so the sheets and the app cannot drift apart.
 *
 * Imported, not recomputed, and deliberately **not** guarded with a fallback. An earlier version
 * swallowed a failed import and quietly fell back to a scale of 1, which drew every model in source
 * units under captions that said metres — a sheet that lies is worse than no sheet, and these are
 * committed as the evidence for the scale table. Run the build first.
 */
const { MODEL_ASSETS } = await import(
  new URL('../../src/map/models/model-assets.ts', import.meta.url).href
)

const scaleFor = (asset) => {
  const entry = Object.values(MODEL_ASSETS).find(
    (candidate) => candidate.id === asset.id,
  )
  if (!entry) {
    throw new Error(
      `${asset.id} is in sources.json but not in the generated table. ` +
        `Run: node scripts/models/build.mjs`,
    )
  }
  return entry.scale
}

/**
 * `--only <id>` renders one asset big, in three elevations.
 *
 * A cell on the sheet is enough to tell a bow from a stern on most of the set, but not on the
 * chunkier models, and not on an aircraft where a swept wing seen edge-on reads like a fin. Three
 * elevations at 3× the size settles it.
 */
const only = process.argv.includes('--only')
  ? process.argv[process.argv.indexOf('--only') + 1]
  : null

if (only) {
  const found = loaded.find(({ asset }) => asset.id === only)
  if (!found) throw new Error(`--only ${only}: not an asset in sources.json`)

  const triangles = collectTriangles(found.document, scaleFor(found.asset))
  const canvas = createCanvas(1080, 760)

  drawText(
    canvas,
    `${only} - three elevations - +z points right`,
    [12, 10],
    INK,
    2,
  )

  const panels = [
    [
      'side elevation: z right, y up',
      { x: 12, y: 34, width: 1056, height: 300 },
      SIDE,
    ],
    [
      'plan: z right, x down',
      { x: 12, y: 348, width: 1056, height: 200 },
      PLAN,
    ],
    [
      'head-on: x right, y up, camera off +z',
      { x: 12, y: 562, width: 1056, height: 190 },
      FRONT,
    ],
  ]

  for (const [label, panel, view] of panels) {
    drawRect(
      canvas,
      [panel.x * 2, panel.y * 2],
      [(panel.x + panel.width) * 2, (panel.y + panel.height) * 2],
      FAINT,
      1,
    )
    drawText(canvas, label, [panel.x + 6, panel.y + 6], GROUND, 1)
    const drawn = renderView(canvas, triangles, panel, view, {
      includeGround: view !== PLAN,
    })
    drawReferenceCube(canvas, panel, drawn.scale)
  }

  await mkdir(OUT_DIR, { recursive: true })
  await writeFile(join(OUT_DIR, `inspect-${only}.png`), encodePng(canvas))
  console.log(`docs/models/inspect-${only}.png`)
  process.exit(0)
}

const COLUMNS = 3
const CELL = { width: 352, height: 268 }
const ROWS = Math.ceil(loaded.length / COLUMNS)

const sheet = createCanvas(COLUMNS * CELL.width, ROWS * CELL.height + 26)

drawText(
  sheet,
  'onward model contact sheet - +z points right - side view above plan view',
  [10, 9],
  INK,
  1,
)

const measured = []

for (const [index, { asset, document }] of loaded.entries()) {
  const column = index % COLUMNS
  const row = Math.floor(index / COLUMNS)
  const cellX = column * CELL.width
  const cellY = row * CELL.height + 26

  const scale = scaleFor(asset)
  const triangles = collectTriangles(document, scale ?? 1)

  drawRect(
    sheet,
    [(cellX + 2) * 2, (cellY + 2) * 2],
    [(cellX + CELL.width - 2) * 2, (cellY + CELL.height - 2) * 2],
    FAINT,
    1,
  )

  drawText(sheet, `${asset.id}`, [cellX + 8, cellY + 8], INK, 2)

  const sidePanel = {
    x: cellX + 8,
    y: cellY + 24,
    width: CELL.width - 16,
    height: 148,
  }
  const planPanel = {
    x: cellX + 8,
    y: cellY + 176,
    width: CELL.width - 16,
    height: 84,
  }

  const side = renderView(sheet, triangles, sidePanel, SIDE)
  drawReferenceCube(sheet, sidePanel, side.scale)
  drawText(
    sheet,
    '+z >',
    [sidePanel.x + sidePanel.width - 26, sidePanel.y + 2],
    REFERENCE,
    1,
  )

  renderView(sheet, triangles, planPanel, PLAN, { includeGround: false })

  const xs = triangles.flatMap((t) => t.points.map((p) => p[2]))
  const ys = triangles.flatMap((t) => t.points.map((p) => p[1]))
  measured.push({
    id: asset.id,
    lengthM: Number((Math.max(...xs) - Math.min(...xs)).toFixed(2)),
    heightM: Number((Math.max(...ys) - Math.min(...ys)).toFixed(2)),
    pxPerM: Number(side.scale.toFixed(2)),
  })
}

await mkdir(OUT_DIR, { recursive: true })
await writeFile(join(OUT_DIR, 'contact-sheet.png'), encodePng(sheet))

/* -------------------------------------------------------------------------- */
/*  Sheet B — the whole set on one ground line                                */
/* -------------------------------------------------------------------------- */

const PX_PER_M = 4.6
const GAP_M = 2.5

const totals = loaded.map(({ asset, document }) => {
  const triangles = collectTriangles(document, scaleFor(asset))
  const xs = triangles.flatMap((t) => t.points.map((p) => p[2]))
  const ys = triangles.flatMap((t) => t.points.map((p) => p[1]))
  return {
    asset,
    triangles,
    lengthM: Math.max(...xs) - Math.min(...xs),
    heightM: Math.max(...ys) - Math.min(...ys),
  }
})

const stripWidthM =
  totals.reduce((sum, item) => sum + item.lengthM + GAP_M, GAP_M) + 8
const stripHeightM = Math.max(...totals.map((item) => item.heightM)) + 6

const strip = createCanvas(
  Math.ceil(stripWidthM * PX_PER_M),
  Math.ceil(stripHeightM * PX_PER_M) + 42,
)

drawText(
  strip,
  `onward model set - one ground line - ${PX_PER_M} px per metre - orange square is 5m`,
  [10, 9],
  INK,
  1,
)

const groundY = strip.outHeight - 26
drawLine(strip, [0, groundY * 2], [strip.width, groundY * 2], GROUND, 1)

// 10 m ticks, so a reader can measure anything on the sheet without trusting the caption.
for (let metre = 0; metre <= stripWidthM; metre += 10) {
  const x = metre * PX_PER_M
  drawLine(strip, [x * 2, groundY * 2], [x * 2, (groundY + 5) * 2], FAINT, 1)
  if (metre % 50 === 0)
    drawText(strip, `${metre}M`, [x + 1, groundY + 8], GROUND, 1)
}

let cursorM = 4

for (const { asset, triangles, lengthM } of totals) {
  const panel = {
    x: cursorM * PX_PER_M,
    y: 20,
    width: lengthM * PX_PER_M,
    height: groundY - 20,
  }

  renderView(strip, triangles, panel, SIDE, {
    pxPerM: PX_PER_M,
    includeGround: false,
  })
  drawText(
    strip,
    SHORT_NAMES[asset.id] ?? asset.id,
    [panel.x + 1, groundY + 14],
    INK,
    1,
  )

  cursorM += lengthM + GAP_M
}

drawRect(
  strip,
  [2 * 2, (groundY - 5 * PX_PER_M) * 2],
  [(2 + 5 * PX_PER_M) * 2, groundY * 2],
  REFERENCE,
  1,
)

await writeFile(join(OUT_DIR, 'scale-sheet.png'), encodePng(strip))

console.log('docs/models/contact-sheet.png')
console.log('docs/models/scale-sheet.png')
console.table(measured)
