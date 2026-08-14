import { Vector4 } from 'three'

import type { Anchor, ReadSpan, ScaleContext, ScaleFor } from './model-layer'
import { EARTH_RADIUS_M } from './model-matrix'
import type { ModelRole } from './models/model-assets'

/**
 * PROTOTYPE for #20 — five candidate answers to "how big does a model look when the map is not at
 * street zoom", switchable live from the bar so the same camera can be judged under each.
 *
 * Throwaway. This branch is the primary source; `main` keeps only the law that wins, under a name
 * that is not `.prototype`.
 *
 * ## The thing being decided
 *
 * `MODEL_ASSETS` states true metres and the model matrix maps one unit to one metre, so a Stay Marker
 * is an honest 8 m building — which #7 measured at **5.9 px at z16, 1.5 px at z14 and 0.0 px at z6**.
 * A Vehicle is worse: a 4.9 m longtail on a 1,000 km Path is never visible at any zoom that shows the
 * Path. So something has to multiply the model, and it has to be **one** rule applied in one place or
 * #8 and #9 will each invent their own.
 *
 * ## Two families, and the difference is depth
 *
 * A law can read either of two numbers, and they are not the same question:
 *
 * - **Screen-driven** (`pin`, `screen`) measures the anchor's *actual* apparent size this frame, by
 *   projecting a stick of its own metres through the very matrix it is about to be drawn under. That
 *   is pitch-aware and perspective-aware — so it holds a marker near the horizon at the same
 *   apparent size as one in the foreground, which guarantees legibility and **flattens the depth
 *   cue**.
 * - **Zoom-driven** (`floor`) computes what the model covers from zoom and latitude alone, ignoring
 *   where on screen it sits. Every anchor at a given latitude gets the same multiplier, so **near
 *   models stay bigger than far ones** — perspective survives, and a marker at the horizon may still
 *   be too small to read.
 *
 * `fixed` reads neither and is here to be proved wrong: Onward spans z1–z20, a factor of ~500,000 in
 * metres per pixel, so no constant can be both visible at trip zoom and sane at street zoom.
 */

/** What each role should measure on screen, in CSS pixels, under the laws that target a size. */
const TARGET_PX: Record<ModelRole, number> = {
  stay: 48,
  vehicle: 40,
}

/**
 * The straw man's constants, chosen as favourably as they can be: the Stay Marker's is what makes it
 * read at island zoom (z13), the Vehicle's what makes it read at country zoom (z8).
 */
const FIXED_K: Record<ModelRole, number> = {
  stay: 50,
  vehicle: 200,
}

/**
 * How many pixels a Stay Marker has to cover before it is drawn at all, from `?stayFrom=`.
 *
 * **A pixel count rather than a zoom level, and that is the point.** The judgement being made is
 * "is this big enough to be a building yet", which is about apparent size, not about zoom — and the
 * two only coincide for one model height. Today's 8.9 m guesthouse crosses 15 px at **z17**; a 40 m
 * highrise would cross it at z15 and appear four zoom levels earlier, without this number moving.
 *
 * Below the threshold a Pin holds the Stop (#9's to draw).
 */
const STAY_MIN_PX = Number(
  new URLSearchParams(window.location.search).get('stayFrom') ?? 15,
)

const EARTH_CIRCUMFERENCE_M = 2 * Math.PI * EARTH_RADIUS_M

/** MapLibre's tile size in CSS pixels, which is what its zoom is defined against. */
const TILE_PX = 512

/**
 * Metres per CSS pixel at a latitude and zoom, ignoring pitch — the answer for a model sitting at
 * the camera's focal plane, and the number the zoom-driven family reads.
 */
export const metresPerPixel = (lat: number, zoom: number): number =>
  (EARTH_CIRCUMFERENCE_M * Math.cos((lat * Math.PI) / 180)) /
  (TILE_PX * 2 ** zoom)

const AXIS_UNIT: Record<ReadSpan['axis'], [number, number, number]> = {
  x: [1, 0, 0],
  y: [0, 1, 0],
  z: [0, 0, 1],
}

/**
 * How many CSS pixels the model's own read span covers on screen right now, at true scale.
 *
 * Measured rather than derived: `ctx.place` maps this anchor's local metres straight to clip space,
 * so projecting the two ends of the span through it and taking the screen distance is exact — it
 * carries pitch, perspective, terrain elevation and the globe/mercator handover for free, none of
 * which a zoom formula knows about.
 *
 * `undefined` when either end is behind the camera, where there is no honest answer and the caller
 * should leave the model alone.
 */
const spanPx = (read: ReadSpan, ctx: ScaleContext): number | undefined => {
  const [ax, ay, az] = AXIS_UNIT[read.axis]

  // Vector4 deliberately: three's Vector3.applyMatrix4 divides by w and hides the sign, which is
  // exactly the information needed to spot an anchor behind the camera.
  const foot = new Vector4(0, 0, 0, 1).applyMatrix4(ctx.place)
  const head = new Vector4(
    ax * read.metres,
    ay * read.metres,
    az * read.metres,
    1,
  ).applyMatrix4(ctx.place)

  if (foot.w <= 0 || head.w <= 0) return undefined

  const dx = ((head.x / head.w - foot.x / foot.w) * ctx.viewport.width) / 2
  const dy = ((head.y / head.w - foot.y / foot.w) * ctx.viewport.height) / 2

  const px = Math.hypot(dx, dy)
  return Number.isFinite(px) ? px : undefined
}

export type ScaleReadout = {
  id: string
  role: ModelRole
  /** The model's largest real dimension, in metres. */
  readM: number
  /** That dimension's apparent size at true scale, in CSS pixels. */
  truePx: number | undefined
  /** What it would cover from zoom alone, ignoring perspective. */
  zoomPx: number
  /** What the law multiplied it by. */
  k: number
}

const readouts = new Map<string, ScaleReadout>()

/** PROTOTYPE — what the last frame's laws worked out, for the bar's readout. */
export const lastReadouts = (): ScaleReadout[] => [...readouts.values()]

type Core = (input: {
  role: ModelRole
  readM: number
  truePx: number | undefined
  zoomPx: number
  zoom: number
}) => number

export type ScaleLaw = {
  key: string
  name: string
  note: string
  scaleFor: ScaleFor
}

/** Wraps a law's arithmetic in the measuring and the recording every law shares. */
const law = (
  key: string,
  name: string,
  note: string,
  core: Core,
): ScaleLaw => ({
  key,
  name,
  note,
  scaleFor: (anchor: Anchor, ctx: ScaleContext) => {
    const { read, role } = anchor
    if (!read || !role) return 1

    const truePx = spanPx(read, ctx)
    const zoomPx = read.metres / metresPerPixel(anchor.origin[1], ctx.zoom)
    const k = core({ role, readM: read.metres, truePx, zoomPx, zoom: ctx.zoom })

    // 0 is a real answer — "not at this zoom" — so only a broken number falls back to true scale.
    const settled = k === 0 || (Number.isFinite(k) && k > 0) ? k : 1

    readouts.set(anchor.id, {
      id: anchor.id,
      role,
      readM: read.metres,
      truePx,
      zoomPx,
      k: settled,
    })

    return settled
  },
})

export const LAWS: readonly ScaleLaw[] = [
  law(
    'true',
    'True metres',
    'What ships today: no multiplier at all. The baseline #20 exists to replace.',
    () => 1,
  ),
  law(
    'pin',
    'Pin — constant apparent size',
    'Every model always measures the same on screen. Zooming in never arrives anywhere: at street zoom the hut is shrunk below the real bungalows next to it.',
    ({ role, truePx }) => (truePx ? TARGET_PX[role] / truePx : 1),
  ),
  law(
    'floor',
    'Floor — true metres, zoom-driven ratchet',
    'max(1, target ÷ what this zoom covers). Grows only as far as legibility needs, then hands back to true scale at street zoom. One multiplier per latitude, so perspective survives.',
    ({ role, zoomPx }) => Math.max(1, TARGET_PX[role] / zoomPx),
  ),
  law(
    'screen',
    'Floor — true metres, screen-driven ratchet',
    'Same ratchet, but measured per anchor on screen. Every marker is legible even at the horizon, and they all end up the same size — the depth cue goes.',
    ({ role, truePx }) => (truePx ? Math.max(1, TARGET_PX[role] / truePx) : 1),
  ),
  law(
    'fixed',
    'Fixed exaggeration per role',
    'One constant per role, zoom-independent: Stay ×50, Vehicle ×200. Here to be disproved at both ends of the zoom range.',
    ({ role }) => FIXED_K[role],
  ),
  law(
    'role',
    'Role split — Vehicles float, Stay Markers stay honest',
    `A Vehicle takes the floor so its Mode reads at any zoom that shows its Path. A Stay Marker never exaggerates at all: true metres, and not drawn until it covers ${STAY_MIN_PX} px — z17 for today's guesthouse. A Pin holds the Stop until then.`,
    ({ role, zoomPx }) =>
      role === 'vehicle'
        ? Math.max(1, TARGET_PX[role] / zoomPx)
        : zoomPx >= STAY_MIN_PX
          ? 1
          : 0,
  ),
]

const DEFAULT_LAW = 'true'

const lawFor = (key: string | null): ScaleLaw =>
  LAWS.find((candidate) => candidate.key === key) ??
  LAWS.find((candidate) => candidate.key === DEFAULT_LAW)!

/**
 * PROTOTYPE — which law is live, held outside React so the layer can read it inside a render pass
 * and the bar can change it without remounting the map. Switching mid-camera is the whole point:
 * two laws are only comparable on the same view.
 */
export const lawStore = (() => {
  let current = lawFor(
    new URLSearchParams(window.location.search).get('law') ?? DEFAULT_LAW,
  )
  const listeners = new Set<() => void>()

  return {
    current: () => current,
    set(key: string) {
      current = lawFor(key)

      const url = new URL(window.location.href)
      url.searchParams.set('law', current.key)
      window.history.replaceState(null, '', url)

      for (const listener of listeners) listener()
    },
    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
})()

/** The one function handed to the model layer: whatever law is live this frame. */
export const scaleForLiveLaw: ScaleFor = (anchor, ctx) =>
  lawStore.current().scaleFor(anchor, ctx)

// PROTOTYPE — the same affordance `?markers=` is: the numbers behind a screenshot should be readable
// off the page rather than eyeballed off it, and a law comparison should be repeatable.
if (import.meta.env.DEV) {
  ;(
    window as unknown as {
      __law: { set: (key: string) => void; readouts: () => ScaleReadout[] }
    }
  ).__law = { set: lawStore.set, readouts: lastReadouts }
}
