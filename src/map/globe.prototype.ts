import type { Map as MapLibreMap, ProjectionSpecification } from 'maplibre-gl'

/**
 * PROTOTYPE for #14 — the globe, the handover, and the one measurement that settles it.
 *
 * ## What the source already says, before anything is drawn
 *
 * Two things about maplibre-gl 6.3.0 change this ticket's shape and neither is in the ticket:
 *
 * 1. **`{ type: 'globe' }` never becomes mercator.** `ProjectionDefinition.parse('globe')` returns
 *    `{ from: 'globe', to: 'globe', transition: 1 }`, and `GlobeProjection.transitionState` reads
 *    `from === 'mercator' ? 0 : 1` — so it is pinned at 1 at every zoom. **The zoom-driven handover
 *    is not automatic and is not a MapLibre default: the app authors it**, as a zoom expression over
 *    the `projection.type` property, which the style spec declares `interpolated: true` on `zoom`.
 *    That is what `handoverProjection` below builds, and it is why the range is a URL parameter —
 *    "at what zoom does the handover happen" is a number this ticket has to *choose*.
 *
 * 2. **A custom layer never sees a fractional transition.** `GlobeTransform.getProjectionDataForCustomLayer`
 *    returns the *vertical-perspective* transform's data whenever `isGlobeRendering` — which is
 *    `_globeness > 0` — and that data hard-codes `projectionTransition: applyGlobeMatrix ? 1 : 0`.
 *    The fractional `_globeness` reaches MapLibre's own layers through `getProjectionData`, and
 *    never reaches `render()`. So #2's "INFERRED fixed, not observed" reading of `{0, 1}` is right,
 *    and the reason is worse than the guess: **`mainMatrix` is the pure globe matrix for the whole
 *    morph while the tiles underneath are blended part-way to mercator.** MapLibre hands the layer
 *    `fallbackMatrix` (the mercator matrix) to blend with — and hands it no blend factor to do it.
 *
 * If that reading is right, a model must sit somewhere other than its own coordinate for the length
 * of the morph and snap into place at the end. `probeDrift` measures exactly that, in pixels,
 * against `map.project()` — the same ruler #2 and #7 used.
 */

/** `?globe=` — absent means the real app, so the prototype cannot be tripped over by accident. */
export function globeRequested(): string | null {
  return new URLSearchParams(window.location.search).get('globe')
}

/**
 * The projection for a `?globe=` value.
 *
 * - `on` — `{ type: 'globe' }`, which is a globe at every zoom and never hands over. Here to be
 *   looked at, because it is what anyone would write first.
 * - `4-7` (the default) — a zoom expression: vertical-perspective below 4, mercator above 7, and a
 *   continuous morph between. **This is the only thing in 6.3.0 that produces a handover at all.**
 */
export function handoverProjection(value: string): ProjectionSpecification {
  if (value === 'on') return { type: 'globe' }

  const [from, to] = value.split('-').map(Number)
  const lo = Number.isFinite(from) ? from : 4
  const hi = Number.isFinite(to) ? to : 7

  return {
    type: [
      'interpolate',
      ['linear'],
      ['zoom'],
      lo,
      'vertical-perspective',
      hi,
      'mercator',
    ],
  } as unknown as ProjectionSpecification
}

export type DriftSample = {
  t: number
  zoom: number
  /** What the custom layer was handed. Expected to be 0 or 1 and never between. */
  projectionTransition: number
  /** Where the matrix chain actually puts the anchor, in CSS pixels. */
  drawnPx: [number, number] | null
  /** Where MapLibre says that same coordinate is, in CSS pixels. */
  truePx: [number, number]
  /** The distance between them — 0 is agreement, anything else is the model in the wrong place. */
  driftPx: number | null
}

declare global {
  interface Window {
    __globeProbe?: {
      samples: DriftSample[]
      recording: boolean
      start: () => void
      stop: () => DriftSample[]
    }
  }
}

/** Installed once, in dev only. The Playwright run drives it. */
export function installProbe() {
  if (window.__globeProbe) return

  window.__globeProbe = {
    samples: [],
    recording: false,
    start() {
      this.samples = []
      this.recording = true
    },
    stop() {
      this.recording = false
      return this.samples
    },
  }
}

/**
 * One frame's worth of "is the model where its coordinate is".
 *
 * Called from the model layer's `render` with the fully-composed matrix, so it measures the same
 * thing the eye sees rather than a re-derivation of it. Cheap enough to leave on: one matrix apply
 * and one `map.project` for a single anchor.
 */
export function probeDrift(
  map: MapLibreMap,
  origin: [number, number],
  clip: { x: number; y: number; z: number; w: number },
  projectionTransition: number,
) {
  const probe = window.__globeProbe
  if (!probe?.recording) return

  const canvas = map.getCanvas()
  const width = canvas.clientWidth
  const height = canvas.clientHeight

  const drawnPx: [number, number] | null =
    clip.w === 0
      ? null
      : [
          ((clip.x / clip.w) * 0.5 + 0.5) * width,
          (1 - ((clip.y / clip.w) * 0.5 + 0.5)) * height,
        ]

  const projected = map.project({ lng: origin[0], lat: origin[1] })
  const truePx: [number, number] = [projected.x, projected.y]

  probe.samples.push({
    t: performance.now(),
    zoom: map.getZoom(),
    projectionTransition,
    drawnPx,
    truePx,
    driftPx: drawnPx
      ? Math.hypot(drawnPx[0] - truePx[0], drawnPx[1] - truePx[1])
      : null,
  })
}
