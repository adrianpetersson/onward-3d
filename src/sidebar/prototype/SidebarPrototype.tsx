/**
 * PROTOTYPE — throwaway. Delete this whole folder when #10 is folded into the real sidebar.
 *
 * Three variants of the sidebar, switchable via `?variant=`, mounted over the existing Diorama.
 * The bar at the bottom is deliberately ugly so it is never mistaken for the design under test.
 */

import { useEffect, useState } from 'react'

import { NAME as NAME_A, VariantA } from './VariantA-Rail'
import { NAME as NAME_B, VariantB } from './VariantB-Ledger'
import { NAME as NAME_C, VariantC } from './VariantC-Focus'

const VARIANTS = {
  A: { name: NAME_A, Component: VariantA },
  B: { name: NAME_B, Component: VariantB },
  C: { name: NAME_C, Component: VariantC },
} as const

type Key = keyof typeof VARIANTS
const KEYS = Object.keys(VARIANTS) as Key[]

function readVariant(): Key {
  const raw = new URLSearchParams(window.location.search)
    .get('variant')
    ?.toUpperCase()
  return KEYS.includes(raw as Key) ? (raw as Key) : 'A'
}

/**
 * @param onInset - how far the map should be pushed from the left. Variants that overlay report 0;
 *                  variants that push report their own width.
 */
export function SidebarPrototype({
  onInset,
}: {
  onInset: (px: number) => void
}) {
  const [variant, setVariant] = useState<Key>(readVariant)

  const go = (next: Key) => {
    const url = new URL(window.location.href)
    url.searchParams.set('variant', next)
    window.history.replaceState(null, '', url)
    setVariant(next)
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement
      if (
        el instanceof HTMLInputElement ||
        el instanceof HTMLTextAreaElement ||
        el instanceof HTMLSelectElement ||
        (el as HTMLElement | null)?.isContentEditable
      ) {
        return
      }
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
      const i = KEYS.indexOf(variant)
      go(
        KEYS[
          (i + (e.key === 'ArrowRight' ? 1 : KEYS.length - 1)) % KEYS.length
        ],
      )
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [variant])

  const { name, Component } = VARIANTS[variant]

  return (
    <>
      <Component onWidth={onInset} />

      {import.meta.env.MODE !== 'production' && (
        <div className="pointer-events-auto absolute bottom-5 left-1/2 z-50 flex -translate-x-1/2 items-center gap-1 rounded-full bg-fuchsia-700 px-2 py-1.5 text-white shadow-2xl">
          <button
            onClick={() =>
              go(KEYS[(KEYS.indexOf(variant) + KEYS.length - 1) % KEYS.length])
            }
            className="rounded-full px-2 py-0.5 hover:bg-white/20"
          >
            ←
          </button>
          <span className="px-2 text-[12px] font-medium whitespace-nowrap">
            {variant} — {name}
          </span>
          <button
            onClick={() => go(KEYS[(KEYS.indexOf(variant) + 1) % KEYS.length])}
            className="rounded-full px-2 py-0.5 hover:bg-white/20"
          >
            →
          </button>
        </div>
      )}
    </>
  )
}
