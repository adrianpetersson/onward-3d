/**
 * PROTOTYPE — #11. The bar that flips between registers.
 *
 * Deliberately ugly and deliberately not part of the thing being judged: a black pill over whatever
 * the register is doing, so nobody mistakes it for a design decision. Changing register reloads the
 * page rather than re-styling in place — the light rig, the terrain exaggeration and the label
 * mechanism are all built once when the map is constructed, and a throwaway is not the place to
 * learn how to hot-swap them.
 */

import { useEffect } from 'react'

import { REGISTERS, currentRegister, TODAY } from './registers'

const ORDER = [TODAY, ...REGISTERS]

const go = (key: string) => {
  const url = new URL(window.location.href)
  if (key === TODAY.key) url.searchParams.delete('variant')
  else url.searchParams.set('variant', key)
  window.location.assign(url)
}

const step = (by: number) => {
  const at = ORDER.findIndex((r) => r.key === currentRegister().key)
  go(ORDER[(at + by + ORDER.length) % ORDER.length].key)
}

export function Switcher() {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target?.closest('input, textarea, select, [contenteditable="true"]'))
        return

      if (event.key === 'ArrowLeft') step(-1)
      if (event.key === 'ArrowRight') step(1)
    }

    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // A stray merge must not put this in front of anyone.
  if (!import.meta.env.DEV) return null

  const register = currentRegister()

  return (
    <div className="pointer-events-auto fixed bottom-5 left-1/2 z-50 flex -translate-x-1/2 items-stretch overflow-hidden rounded-full bg-black/85 font-sans text-white shadow-2xl backdrop-blur">
      <button
        onClick={() => step(-1)}
        aria-label="previous register"
        className="px-4 text-lg hover:bg-white/15"
      >
        ‹
      </button>

      <div className="flex flex-col justify-center px-4 py-2 text-center">
        <span className="text-[12px] leading-tight font-semibold tracking-wide">
          {register.key === TODAY.key
            ? register.name
            : `${register.key} — ${register.name}`}
        </span>
        <span className="max-w-[46ch] text-[10.5px] leading-tight text-white/60">
          {register.claim}
        </span>
      </div>

      <button
        onClick={() => step(1)}
        aria-label="next register"
        className="px-4 text-lg hover:bg-white/15"
      >
        ›
      </button>
    </div>
  )
}
