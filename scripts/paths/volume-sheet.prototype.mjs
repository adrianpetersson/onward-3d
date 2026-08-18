/**
 * THROWAWAY (#23) — contact sheets for the six Path variants.
 *
 *     node scripts/paths/volume-sheet.prototype.mjs
 *
 * The thing being judged is a band 7 px wide, so a 1400 x 900 frame viewed whole tells you nothing:
 * the three tones that make a Path read as an object are individually a pixel or two. Each sheet
 * therefore **crops and magnifies** — and picks the crop window itself, by finding the densest patch
 * of Path ink in the control frame and applying the same window to every variant, so the six cells
 * are the same piece of map.
 *
 * Composed with the repo's own PNG reader (`png.mjs`, #22) and writer
 * (`scripts/models/lib/raster.mjs`, #17). No browser, no dev server — the frames are already taken.
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import { existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

import { readPng } from './png.mjs'
import {
  createCanvas,
  drawRect,
  drawText,
  encodePng,
} from '../models/lib/raster.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const DIR = join(HERE, '..', '..', 'docs', 'paths-volume')

const SS = 2 // raster.mjs supersamples by this, and a blit has to match it.

const VARIANTS = [
  ['shipped', 'SHIPPED - FLAT, CASED'],
  ['wall', 'WALL - VOLUME, MODE INKS'],
  ['green-bed', 'GREEN BED - MODE ON TOP'],
  ['one-green', 'ONE GREEN - COLOUR SPENT'],
  ['green-ramp', 'GREEN RAMP - ONE FAMILY'],
  ['green-solid', 'GREEN SOLID - ONE COLOUR, NO DASH'],
  ['extruded', 'EXTRUDED - NO DASH'],
]

const INK = [38, 42, 46]
const FAINT = [176, 180, 184]
const PAPER = [250, 249, 246]

// Every ink a Path can be drawn in, across all six variants — the mask below is "is this pixel part
// of some Path", and it has to be true for the control frame the window is chosen from.
const PATH_INKS = [
  '#2f4f4f', // shipped casing
  '#1b2f2f', // wall
  '#d9694a',
  '#7a5c8e',
  '#2f7f86',
  '#46a0a6',
  '#c0883a',
  '#a86b2d',
  '#9a9086',
].map((hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)))

const near = (rgb, target, tolerance) =>
  Math.abs(rgb[0] - target[0]) +
    Math.abs(rgb[1] - target[1]) +
    Math.abs(rgb[2] - target[2]) <
  tolerance

/** Where the most Path ink is, in a window of the given size. Integral image, so it is one pass. */
function bestWindow(png, w, h) {
  const { width, height } = png
  const mask = new Int32Array((width + 1) * (height + 1))

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const rgb = png.at(x, y)
      const hit = PATH_INKS.some((ink) => near(rgb, ink, 60)) ? 1 : 0
      mask[(y + 1) * (width + 1) + (x + 1)] =
        hit +
        mask[y * (width + 1) + (x + 1)] +
        mask[(y + 1) * (width + 1) + x] -
        mask[y * (width + 1) + x]
    }
  }

  const sum = (x, y) =>
    mask[(y + h) * (width + 1) + x + w] -
    mask[y * (width + 1) + x + w] -
    mask[(y + h) * (width + 1) + x] +
    mask[y * (width + 1) + x]

  let best = { x: 0, y: 0, n: -1 }
  for (let y = 0; y + h < height; y += 4) {
    for (let x = 0; x + w < width; x += 4) {
      const n = sum(x, y)
      if (n > best.n) best = { x, y, n }
    }
  }
  return best
}

/** Blit a magnified crop into the supersampled canvas at an output-pixel origin. */
function blit(canvas, png, crop, at, scale) {
  const step = scale * SS
  for (let sy = 0; sy < crop.h; sy++) {
    for (let sx = 0; sx < crop.w; sx++) {
      const px = crop.x + sx
      const py = crop.y + sy
      const rgb =
        px < png.width && py < png.height ? png.at(px, py) : [255, 0, 255]

      const ox = (at[0] + sx * scale) * SS
      const oy = (at[1] + sy * scale) * SS

      for (let dy = 0; dy < step; dy++) {
        const row = (oy + dy) * canvas.width
        for (let dx = 0; dx < step; dx++) {
          const i = (row + ox + dx) * 3
          canvas.pixels[i] = rgb[0]
          canvas.pixels[i + 1] = rgb[1]
          canvas.pixels[i + 2] = rgb[2]
        }
      }
    }
  }
}

function sheet({ camera, crop, scale, title, subtitle, out }) {
  const control = join(DIR, `${camera}-shipped.png`)
  if (!existsSync(control)) {
    console.log(`skip ${out} — ${camera}-shipped.png not taken`)
    return
  }

  const found = bestWindow(readPng(control), crop.w, crop.h)
  const window = { ...found, w: crop.w, h: crop.h }

  const cellW = crop.w * scale
  const cellH = crop.h * scale
  const GAP = 16
  const LABEL = 14
  const TOP = 46

  const cols = 3
  const rows = Math.ceil(VARIANTS.length / cols)
  const width = cols * cellW + (cols + 1) * GAP
  const height = TOP + rows * (cellH + LABEL + GAP) + GAP

  const canvas = createCanvas(width, height, PAPER)

  drawText(canvas, title, [GAP, 12], INK, SS * 2)
  drawText(canvas, subtitle, [GAP, 30], FAINT, SS)

  VARIANTS.forEach(([key, label], i) => {
    const col = i % cols
    const row = Math.floor(i / cols)
    const x = GAP + col * (cellW + GAP)
    const y = TOP + row * (cellH + LABEL + GAP)

    drawText(canvas, label, [x, y], INK, SS)

    const file = join(DIR, `${camera}-${key}.png`)
    if (existsSync(file)) {
      blit(canvas, readPng(file), window, [x, y + LABEL], scale)
    } else {
      drawText(canvas, 'MISSING', [x + 8, y + LABEL + 8], FAINT, SS)
    }

    drawRect(
      canvas,
      [x - 1, y + LABEL - 1],
      [x + cellW, y + LABEL + cellH],
      FAINT,
      1,
    )
  })

  mkdirSync(DIR, { recursive: true })
  writeFileSync(join(DIR, out), encodePng(canvas))
  console.log(
    `${out}  window ${window.x},${window.y} ${crop.w}x${crop.h} @${scale}x  (${found.n} path px)`,
  )
}

// Two magnifications, because they answer different questions. The wide crop says whether a variant
// reads as a *track* across a piece of map; the tight one says whether the three tones that make it
// an object are actually distinguishable.
sheet({
  camera: 'islands',
  crop: { w: 300, h: 190 },
  scale: 2,
  title: 'THE ISLAND CHAIN, Z8.6 - DOES IT READ AS A TRACK',
  subtitle:
    'THREE BOAT LEGS AND A FERRY OVER WATER - THE PAIRING #22 WAS FILED ON',
  out: 'sheet-islands.png',
})

sheet({
  camera: 'islands',
  crop: { w: 74, h: 48 },
  scale: 9,
  title: 'THE BAND ITSELF, Z8.6 - IS THERE VOLUME IN IT',
  subtitle: 'LIT TOP FACE, EDGE, SHADED SIDE - OR JUST INK',
  out: 'sheet-band.png',
})

sheet({
  camera: 'load',
  crop: { w: 300, h: 190 },
  scale: 2,
  title: 'THE APP OPENING FRAME, Z5.63 - THE FIRST PICTURE ONWARD DRAWS',
  subtitle: 'NINE LEGS SPANNING 5.1 PX TO 2406 PX IN ONE FRAME',
  out: 'sheet-load.png',
})

sheet({
  camera: 'kradan',
  crop: { w: 300, h: 190 },
  scale: 2,
  title: 'KOH KRADAN, Z15.4 PITCHED 60 - STREET ZOOM ON TERRAIN',
  subtitle: 'WHERE AN EXTRUSION SHOULD WIN AND THE DRAPE SHOULD SHOW',
  out: 'sheet-kradan.png',
})

sheet({
  camera: 'allmodes-islands',
  crop: { w: 300, h: 190 },
  scale: 2,
  title: 'ALL SEVEN MODES, Z8.6 - CAN YOU STILL TELL THEM APART',
  subtitle: 'FLIGHT TRAIN FERRY BOAT BUS VAN AND ONE LEG WITH NO MODE',
  out: 'sheet-allmodes.png',
})
