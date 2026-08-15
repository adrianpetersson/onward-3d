import { useEffect, useState } from 'react'

import {
  VARIANT_NAME,
  VARIANTS,
  prototypeVariant,
  type Variant,
} from './pin-variants.prototype'

/**
 * PROTOTYPE for #9 — the floating switcher. Dev only, and only with `?variant=` already in the URL.
 *
 * Cycling writes the URL and reloads, rather than swapping in place. A variant installs MapLibre
 * layers, DOM markers and three.js anchors and the honest teardown for all three is a fresh map —
 * this is a prototype, and a reload is one line where a correct teardown is an afternoon.
 */
export function PinBar() {
  const [variant, setVariant] = useState<Variant>(
    () => prototypeVariant() ?? 'A',
  )

  const go = (next: Variant) => {
    const url = new URL(window.location.href)
    url.searchParams.set('variant', next)
    window.location.href = url.toString()
  }

  const step = (by: number) => {
    const at = VARIANTS.indexOf(variant)
    go(VARIANTS[(at + by + VARIANTS.length) % VARIANTS.length])
  }

  useEffect(() => {
    setVariant(prototypeVariant() ?? 'A')
  }, [])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.isContentEditable
      )
        return

      if (event.key === 'ArrowLeft') step(-1)
      if (event.key === 'ArrowRight') step(1)
    }

    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  return (
    <div className="pointer-events-auto fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-full bg-slate-900/95 px-3 py-2 text-sm text-white shadow-lg">
      <button
        type="button"
        onClick={() => step(-1)}
        className="rounded-full px-2 py-1 hover:bg-white/15"
        aria-label="Previous variant"
      >
        ←
      </button>

      <span className="tabular-nums">
        <strong>{variant}</strong> — {VARIANT_NAME[variant]}
      </span>

      <button
        type="button"
        onClick={() => step(1)}
        className="rounded-full px-2 py-1 hover:bg-white/15"
        aria-label="Next variant"
      >
        →
      </button>
    </div>
  )
}
