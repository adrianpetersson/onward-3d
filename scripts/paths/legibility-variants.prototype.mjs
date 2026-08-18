/**
 * THROWAWAY (#23) — #22's legibility measurement, run once per variant.
 *
 *     python3 scripts/paths/measure-variants.prototype.py   # takes the frames
 *     node scripts/paths/legibility-variants.prototype.mjs
 *
 * Same method as `legibility.mjs` and deliberately the same numbers, so a variant can be compared
 * against what ADR 0011 recorded: up to 24 crossings per Leg, each classified by **nearest ink** so
 * one emphatic Leg cannot vouch for its neighbours, scored as ΔE76 between the frame with the Path
 * drawn and the frame without.
 *
 * The one thing it adds is that the ink table is **per variant**. `legibility.mjs` hardcodes the
 * shipped palette, so pointed at a green variant it classifies every Path pixel as ground and
 * reports a perfectly visible Leg as absent — which it did, before this existed.
 */

import { readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

import { readPng } from './png.mjs'

const DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'docs',
  'paths-volume',
  'measure',
)

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

const SHIPPED = {
  flight: '#d9694a',
  train: '#7a5c8e',
  ferry: '#2f7f86',
  boat: '#46a0a6',
  bus: '#c0883a',
  van: '#a86b2d',
  unknown: '#9a9086',
}
const RAMP = {
  flight: '#8fc74f',
  train: '#2f7d3a',
  ferry: '#2f8f78',
  boat: '#57c2a0',
  bus: '#6f8f2a',
  van: '#46601f',
  unknown: '#6b7d68',
}
const ONE_GREEN = Object.fromEntries(
  Object.keys(SHIPPED).map((m) => [m, '#3f8a59']),
)

/** Each variant's own palette, and the darks under it — both count as "this Leg drew here". */
const PALETTE = {
  shipped: { inks: SHIPPED, darks: ['#2f4f4f'] },
  wall: { inks: SHIPPED, darks: ['#2f4f4f', '#1b2f2f'] },
  'green-bed': { inks: SHIPPED, darks: ['#22402c', '#13251a'] },
  'one-green': { inks: ONE_GREEN, darks: ['#22402c', '#13251a'] },
  'green-ramp': { inks: RAMP, darks: ['#22402c', '#13251a'] },
  'green-solid': { inks: ONE_GREEN, darks: ['#22402c', '#13251a'] },
  extruded: { inks: ONE_GREEN, darks: [] },
}

const FIND = 10
const UNAMBIGUOUS = 25

/**
 * Nearest ink wins, and it has to be this Leg's own or one of the darks beneath it.
 *
 * The 22 threshold is #22's. Anything further from every ink than that is ground, which is what stops
 * a search box scoring the brightest thing near it — the trap that once had four separate Legs all
 * reporting an identical ΔE 78.2, every one of them actually the coral flight passing overhead.
 */
const classifier = (variant) => {
  const inks = Object.entries(PALETTE[variant].inks).map(([m, h]) => [
    m,
    hex(h),
  ])
  const darks = PALETTE[variant].darks.map((h) => ['dark', hex(h)])
  const all = [...inks, ...darks]

  return (p) => {
    let best = { name: null, d: Infinity }
    for (const [name, ink] of all) {
      const d = deltaE(p, ink)
      if (d < best.d) best = { name, d }
    }
    return best.d < 22 ? best.name : null
  }
}

function measure(camera, variant) {
  const on = join(DIR, `${camera}-${variant}-on.png`)
  const off = join(DIR, `${camera}-${variant}-off.png`)
  const spots = join(DIR, `samples-${camera}.json`)
  if (![on, off, spots].every(existsSync)) return null

  const drawn = readPng(on)
  const bare = readPng(off)
  const legs = JSON.parse(readFileSync(spots, 'utf8'))
  const nearestInk = classifier(variant)

  const perLeg = []
  let samples = 0
  let found = 0
  let strong = 0

  for (const leg of legs) {
    const peaks = leg.samples.map((s) => {
      let best = 0
      for (let dy = -FIND; dy <= FIND; dy++) {
        for (let dx = -FIND; dx <= FIND; dx++) {
          const x = Math.round(s.x) + dx
          const y = Math.round(s.y) + dy
          if (x < 0 || y < 0 || x >= drawn.width || y >= drawn.height) continue

          const mine = nearestInk(drawn.at(x, y))
          if (mine !== leg.mode && mine !== 'dark') continue

          best = Math.max(best, deltaE(drawn.at(x, y), bare.at(x, y)))
        }
      }
      return best
    })

    const hit = peaks.filter((d) => d > 6)
    const sorted = [...hit].sort((a, b) => a - b)
    perLeg.push({
      mode: leg.mode,
      n: peaks.length,
      found: hit.length,
      strong: peaks.filter((d) => d >= UNAMBIGUOUS).length,
      median: sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0,
    })

    samples += peaks.length
    found += hit.length
    strong += peaks.filter((d) => d >= UNAMBIGUOUS).length
  }

  return { samples, found, strong, perLeg }
}

for (const camera of ['load', 'islands']) {
  console.log(`\n=== ${camera} ===`)
  console.log(
    'variant      unambiguous   drew something   worst Leg (median ΔE)',
  )

  for (const variant of Object.keys(PALETTE)) {
    const r = measure(camera, variant)
    if (!r) {
      console.log(`${variant.padEnd(12)}  frames not taken`)
      continue
    }

    const worst = r.perLeg
      .filter((l) => l.n > 0)
      .sort((a, b) => a.median - b.median)[0]

    console.log(
      `${variant.padEnd(12)} ${String(`${r.strong}/${r.samples}`).padStart(11)}   ` +
        `${String(`${r.found}/${r.samples}`).padStart(14)}   ` +
        `${worst.mode} ${worst.median.toFixed(1)}`,
    )

    // `--detail` prints every Leg, which is how "33/74" turns into "which Legs went missing".
    if (process.argv.includes('--detail')) {
      for (const l of r.perLeg) {
        console.log(
          `             ${l.mode.padEnd(8)} ${String(`${l.strong}/${l.n}`).padStart(6)}  median ΔE ${l.median.toFixed(1)}`,
        )
      }
    }
  }
}
