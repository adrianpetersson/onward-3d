import { useEffect, useState, useSyncExternalStore } from 'react'
import type { MapLibreMap } from 'maplibre-gl'

import {
  LAWS,
  lastReadouts,
  lawStore,
  type ScaleReadout,
} from './scale-law.prototype'
import { VIEWS, type ViewKey } from './stand-in-trip.prototype'

/**
 * PROTOTYPE for #20 — the switcher and the readout. Throwaway, and gated to dev builds so a stray
 * merge cannot ship it.
 *
 * Two jobs. The bar flips the size law **without touching the camera**, because two laws are only
 * comparable on the same view. The readout puts the numbers on screen — every anchor's true apparent
 * size, what the law multiplied it by, and what it therefore draws at — because "does that look
 * right" and "is that 3 px or 40 px" are different questions and the second one is the evidence.
 */

const px = (value: number | undefined, digits = 1) =>
  value === undefined ? '—' : value.toFixed(digits)

const metres = (value: number) =>
  value >= 1000 ? `${(value / 1000).toFixed(1)} km` : `${value.toFixed(0)} m`

const multiplier = (k: number) =>
  k >= 1000
    ? `×${(k / 1000).toFixed(1)}k`
    : k >= 10
      ? `×${k.toFixed(0)}`
      : `×${k.toFixed(2)}`

function Readout({
  rows,
  zoom,
  pitch,
}: {
  rows: ScaleReadout[]
  zoom: number
  pitch: number
}) {
  return (
    <div className="pointer-events-auto max-h-[46vh] w-[27rem] overflow-y-auto rounded-lg bg-neutral-900/90 p-3 font-mono text-[11px] leading-tight text-neutral-200 shadow-xl">
      <div className="mb-2 flex justify-between font-sans text-neutral-400">
        <span>
          z{zoom.toFixed(2)} · pitch {pitch.toFixed(0)}°
        </span>
        <span>{rows.length} anchors</span>
      </div>

      <table className="w-full tabular-nums">
        <thead className="text-neutral-500">
          <tr className="text-left">
            <th className="font-normal">anchor</th>
            <th className="font-normal">true</th>
            <th className="font-normal">law</th>
            <th className="font-normal">drawn</th>
            <th className="font-normal">size</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.id}
              className={row.role === 'stay' ? '' : 'text-amber-300/90'}
            >
              <td className="pr-2">{row.id.replace(/^(stay|vehicle)-/, '')}</td>
              <td className="pr-2 text-neutral-400">{px(row.truePx, 2)}px</td>
              <td className="pr-2">{multiplier(row.k)}</td>
              <td className="pr-2">
                {px(row.truePx === undefined ? undefined : row.truePx * row.k)}
                px
              </td>
              <td className="text-neutral-400">{metres(row.readM * row.k)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function ScaleLawBar({ map }: { map: MapLibreMap | null }) {
  const law = useSyncExternalStore(lawStore.subscribe, lawStore.current)

  const [rows, setRows] = useState<ScaleReadout[]>([])
  const [camera, setCamera] = useState({ zoom: 0, pitch: 0 })

  // Polled rather than pushed: the readout is written inside a render pass, and a setState per frame
  // per anchor would cost more than the layer it is measuring.
  useEffect(() => {
    if (!map) return

    const tick = setInterval(() => {
      setRows(lastReadouts())
      setCamera({ zoom: map.getZoom(), pitch: map.getPitch() })
    }, 200)

    return () => clearInterval(tick)
  }, [map])

  const step = (by: number) => {
    const at = LAWS.findIndex((candidate) => candidate.key === law.key)
    lawStore.set(LAWS[(at + by + LAWS.length) % LAWS.length].key)
  }

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const on = event.target
      if (
        on instanceof HTMLElement &&
        (on.tagName === 'INPUT' ||
          on.tagName === 'TEXTAREA' ||
          on.isContentEditable)
      ) {
        return
      }

      if (event.key === 'ArrowLeft') step(-1)
      if (event.key === 'ArrowRight') step(1)
    }

    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const go = (key: ViewKey) => {
    const view = VIEWS[key]
    map?.jumpTo({
      center: view.centre,
      zoom: view.zoom,
      pitch: view.pitch,
      bearing: view.bearing,
    })

    const url = new URL(window.location.href)
    url.searchParams.set('view', key)
    window.history.replaceState(null, '', url)
  }

  return (
    <>
      <div className="pointer-events-none absolute bottom-4 left-4 z-50">
        <Readout rows={rows} zoom={camera.zoom} pitch={camera.pitch} />
      </div>

      <div className="pointer-events-none absolute inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2">
        <div className="pointer-events-auto flex gap-1 rounded-full bg-neutral-900/90 p-1 text-xs text-neutral-300 shadow-xl">
          {(Object.keys(VIEWS) as ViewKey[]).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => go(key)}
              className="rounded-full px-3 py-1 hover:bg-neutral-700"
            >
              {VIEWS[key].label}
            </button>
          ))}
        </div>

        <div className="pointer-events-auto flex max-w-[36rem] items-center gap-3 rounded-full bg-neutral-900/95 py-2 pr-2 pl-2 text-neutral-100 shadow-xl">
          <button
            type="button"
            onClick={() => step(-1)}
            className="size-7 rounded-full bg-neutral-700 hover:bg-neutral-600"
            aria-label="previous law"
          >
            ◀
          </button>

          <div className="min-w-0">
            <div className="text-sm font-semibold">
              {law.key} — {law.name}
            </div>
            <div className="text-[11px] leading-snug text-neutral-400">
              {law.note}
            </div>
          </div>

          <button
            type="button"
            onClick={() => step(1)}
            className="size-7 shrink-0 rounded-full bg-neutral-700 hover:bg-neutral-600"
            aria-label="next law"
          >
            ▶
          </button>
        </div>
      </div>
    </>
  )
}
