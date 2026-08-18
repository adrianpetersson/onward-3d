/**
 * THROWAWAY — the variant bar for #23's Path prototype.
 *
 * Flips `?variant=` and reloads, because the Path layers are added when the style loads and swapping
 * a `line-dasharray` on a live layer is the trap ADR 0011 recorded: `setPaintProperty` on a
 * cross-faded property that was not in the layer's original paint throws inside MapLibre's render
 * loop, every frame, several stack frames from the call site. A reload is a prototype's privilege.
 *
 * Deleted when the winner lands in `path.ts`.
 */

import { useEffect } from 'react'

import {
  VARIANTS,
  VARIANT_KEYS,
  variantFromUrl,
} from './map/path-volume.prototype'

const go = (key: string) => {
  const url = new URL(window.location.href)
  url.searchParams.set('variant', key)
  window.location.assign(url.toString())
}

export function PrototypeSwitcher() {
  const current = variantFromUrl()
  const at = VARIANT_KEYS.indexOf(current.key)

  const step = (by: number) =>
    go(VARIANT_KEYS[(at + by + VARIANT_KEYS.length) % VARIANT_KEYS.length])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      // Don't steal the arrow keys from the sidebar's own inputs.
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      )
        return

      if (event.key === 'ArrowLeft') step(-1)
      if (event.key === 'ArrowRight') step(1)
    }

    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  return (
    <div className="pointer-events-auto fixed bottom-4 left-1/2 z-50 -translate-x-1/2">
      <div className="flex items-center gap-3 rounded-full bg-black/85 px-3 py-2 font-mono text-xs text-white shadow-2xl ring-1 ring-white/20 backdrop-blur">
        <button
          onClick={() => step(-1)}
          className="rounded-full px-2 py-1 hover:bg-white/20"
          aria-label="previous variant"
        >
          ←
        </button>

        <div className="min-w-[26rem] text-center leading-tight">
          <div className="font-semibold">
            {at + 1}/{VARIANT_KEYS.length} · {current.name}
          </div>
          <div className="text-[10px] text-white/60">{current.spends}</div>
        </div>

        <button
          onClick={() => step(1)}
          className="rounded-full px-2 py-1 hover:bg-white/20"
          aria-label="next variant"
        >
          →
        </button>
      </div>

      <div className="mt-1 flex justify-center gap-1">
        {VARIANT_KEYS.map((key) => (
          <button
            key={key}
            onClick={() => go(key)}
            title={VARIANTS[key].name}
            className={`h-1.5 w-6 rounded-full ${
              key === current.key ? 'bg-white' : 'bg-white/30'
            }`}
          />
        ))}
      </div>
    </div>
  )
}
