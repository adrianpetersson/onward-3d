/**
 * Every Leg of the real Itinerary, measured where it crosses the screen.
 *
 * #22's Done-when is "every Leg… unambiguously visible", which is nine separate claims rather than
 * one. Each Leg is sampled at up to 24 crossings spread along whatever of it is on screen, in the
 * frame with the Path drawn and the frame without — so what is reported is exactly what drawing that
 * Leg did to the picture, over whatever it happens to lie on.
 *
 * Three things this has to get right, all of which it got wrong first:
 *
 * - **One crossing is not enough.** A Path is dashed, so a single sample can land in a gap and
 *   report a perfectly visible Leg as absent. Hence 24, and a hit rate rather than a verdict.
 * - The crossing is **found rather than projected**. `map.project()` and the drawn line disagree by
 *   a few pixels over hilly ground, because a line layer is draped onto the terrain and a projected
 *   point is not. The offset is not along the Leg's normal, so the search has to be a box.
 * - The pixel found must be **this Leg's own ink**. A plain search box scores the brightest change
 *   nearby, and the Copenhagen long-haul crosses the island chain: four Legs came back reporting an
 *   identical ΔE 78.2, which is coral-on-water — the flight, found and counted as the boat. Nearest
 *   ink wins, and it has to be this Mode's.
 */

import { readFileSync } from 'node:fs'

import { readPng } from './png.mjs'

const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16))

const srgb = (c) => {
  const s = c / 255
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
}
const lab = (rgb) => {
  const [r, g, b] = rgb.map(srgb)
  const x = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047
  const y = 0.2126 * r + 0.7152 * g + 0.0722 * b
  const z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116)
  return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))]
}
const deltaE = (a, b) => {
  const [l1, a1, b1] = lab(a)
  const [l2, a2, b2] = lab(b)
  return Math.hypot(l1 - l2, a1 - a2, b1 - b2)
}

const INK = {
  flight: hex('#d9694a'),
  train: hex('#7a5c8e'),
  ferry: hex('#2f7f86'),
  boat: hex('#46a0a6'),
  bus: hex('#c0883a'),
  van: hex('#a86b2d'),
  unknown: hex('#9a9086'),
}

const [, , onPath, offPath, legsPath, casingHex] = process.argv
const on = readPng(onPath)
const off = readPng(offPath)
const legs = JSON.parse(readFileSync(legsPath, 'utf8'))
const CASING = casingHex ? hex(casingHex) : null

/** Which of the map's inks is this pixel closest to? Anything far from all of them is ground. */
const nearestInk = (p) => {
  const all = Object.entries(INK)
  if (CASING) all.push(['casing', CASING])
  let best = { name: null, d: Infinity }
  for (const [name, ink] of all) {
    const d = deltaE(p, ink)
    if (d < best.d) best = { name, d }
  }
  return best.d < 22 ? best.name : null
}

const FIND = 10
const UNAMBIGUOUS = 25

console.log('mode      crossings   found   unambiguous   median ΔE   peak ΔE')

let allFound = 0
let allSamples = 0
let allUnambiguous = 0

for (const leg of legs) {
  const peaks = []

  for (const s of leg.samples) {
    let best = 0
    for (let dy = -FIND; dy <= FIND; dy++) {
      for (let dx = -FIND; dx <= FIND; dx++) {
        const x = Math.round(s.x) + dx
        const y = Math.round(s.y) + dy
        if (x < 0 || y < 0 || x >= on.width || y >= on.height) continue

        const mine = nearestInk(on.at(x, y))
        if (mine !== leg.mode && mine !== 'casing') continue

        best = Math.max(best, deltaE(on.at(x, y), off.at(x, y)))
      }
    }
    peaks.push(best)
  }

  const found = peaks.filter((d) => d > 6)
  const strong = peaks.filter((d) => d >= UNAMBIGUOUS)
  const sorted = [...found].sort((a, b) => a - b)
  const median = sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0

  allSamples += peaks.length
  allFound += found.length
  allUnambiguous += strong.length

  console.log(
    `${leg.mode.padEnd(9)} ${String(peaks.length).padStart(9)}   ${String(found.length).padStart(5)}   ${String(strong.length).padStart(11)}   ${median.toFixed(1).padStart(9)}   ${Math.max(
      0,
      ...peaks,
    )
      .toFixed(1)
      .padStart(7)}`,
  )
}

console.log(
  `\n  ${allFound}/${allSamples} crossings drew something; ${allUnambiguous}/${allSamples} were unambiguous (ΔE ≥ ${UNAMBIGUOUS})`,
)
