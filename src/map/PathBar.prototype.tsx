import { useCallback, useEffect, useState } from 'react'

import { getController, subscribeToController } from './path-prototype'
import {
  DEFAULT_ARC_RATIO,
  readOptions,
  VARIANTS,
  type SceneOptions,
  type VariantKey,
} from './path-variants.prototype'
import { VIEWS, viewFromUrl, type ViewKey } from './stand-in-trip.prototype'

/**
 * PROTOTYPE for #8 — the switcher bar. Throwaway, dev-only, and never rendered without `?variant=`.
 *
 * The variant is the question; everything to the right of it is a dial on the answer, because three
 * of the ticket's five bullets are quantities rather than choices — how high an arc bows, where the
 * Vehicle sits on it, and whether the Mode needs its own colour when a Vehicle is already standing
 * there saying so.
 */

const VARIANT_KEYS = Object.keys(VARIANTS) as VariantKey[]
const VIEW_KEYS = Object.keys(VIEWS) as ViewKey[]

const writeUrl = (options: SceneOptions, view: ViewKey | undefined) => {
  const params = new URLSearchParams(window.location.search)
  params.set('variant', options.variant)
  params.set('arc', String(options.arc))
  params.set('at', String(options.at))
  params.set('ink', options.ink)
  if (view) params.set('view', view)
  window.history.replaceState(null, '', `?${params.toString()}`)
}

const Pill = ({
  on,
  onClick,
  children,
}: {
  on: boolean
  onClick: () => void
  children: React.ReactNode
}) => (
  <button
    type="button"
    onClick={onClick}
    className={`rounded-full px-2.5 py-1 text-xs transition-colors ${
      on ? 'bg-white text-neutral-900' : 'text-white/70 hover:text-white'
    }`}
  >
    {children}
  </button>
)

export function PathBar() {
  const [options, setOptions] = useState<SceneOptions>(readOptions)
  const [view, setView] = useState<ViewKey | undefined>(viewFromUrl)
  const [, bump] = useState(0)

  useEffect(() => subscribeToController(() => bump((n) => n + 1)), [])

  const change = useCallback(
    (next: Partial<SceneOptions>) => {
      setOptions((current) => {
        const merged = { ...current, ...next }
        writeUrl(merged, view)
        getController()?.apply(merged)
        return merged
      })
    },
    [view],
  )

  const cycle = useCallback(
    (by: number) => {
      const index = VARIANT_KEYS.indexOf(options.variant)
      const next =
        VARIANT_KEYS[(index + by + VARIANT_KEYS.length) % VARIANT_KEYS.length]
      change({ variant: next })
    },
    [change, options.variant],
  )

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target?.isContentEditable
      )
        return

      if (event.key === 'ArrowLeft') cycle(-1)
      if (event.key === 'ArrowRight') cycle(1)
    }

    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [cycle])

  const goTo = (next: ViewKey) => {
    setView(next)
    writeUrl(options, next)
    getController()?.goTo(next)
  }

  const legs = getController()?.legs ?? []
  const lifted = legs.filter((built) => built.lifted).length
  const variant = VARIANTS[options.variant]

  return (
    <div
      data-prototype-bar
      className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex justify-center"
    >
      <div className="pointer-events-auto flex max-w-[95vw] flex-col gap-2 rounded-2xl bg-neutral-900/92 px-3 py-2.5 font-mono text-white shadow-2xl ring-1 ring-white/15 backdrop-blur">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => cycle(-1)}
            className="rounded-full px-2 text-lg leading-none text-white/70 hover:text-white"
            aria-label="Previous variant"
          >
            ←
          </button>

          <div className="min-w-[19rem] text-center text-xs">
            <span className="font-bold">
              {variant.key} — {variant.name}
            </span>
            <div className="text-[11px] text-white/55">{variant.blurb}</div>
          </div>

          <button
            type="button"
            onClick={() => cycle(1)}
            className="rounded-full px-2 text-lg leading-none text-white/70 hover:text-white"
            aria-label="Next variant"
          >
            →
          </button>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-x-1 gap-y-1 border-t border-white/10 pt-2 text-[11px]">
          {VIEW_KEYS.map((key) => (
            <Pill key={key} on={view === key} onClick={() => goTo(key)}>
              {VIEWS[key].label}
            </Pill>
          ))}
        </div>

        <div className="flex flex-wrap items-center justify-center gap-3 border-t border-white/10 pt-2 text-[11px] text-white/70">
          <label className="flex items-center gap-1.5">
            arc
            <input
              type="range"
              min={0}
              max={0.3}
              step={0.01}
              value={options.arc}
              onChange={(e) => change({ arc: Number(e.target.value) })}
              className="w-24 accent-white"
            />
            <span className="w-9 tabular-nums text-white">
              {options.arc.toFixed(2)}
              {options.arc === DEFAULT_ARC_RATIO ? '' : '*'}
            </span>
          </label>

          <label className="flex items-center gap-1.5">
            at
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={options.at}
              onChange={(e) => change({ at: Number(e.target.value) })}
              className="w-24 accent-white"
            />
            <span className="w-8 tabular-nums text-white">
              {options.at.toFixed(2)}
            </span>
          </label>

          <div className="flex items-center gap-1">
            ink
            <Pill
              on={options.ink === 'mode'}
              onClick={() => change({ ink: 'mode' })}
            >
              per Mode
            </Pill>
            <Pill
              on={options.ink === 'one'}
              onClick={() => change({ ink: 'one' })}
            >
              one
            </Pill>
          </div>

          <span className="text-white/45">
            {legs.length} Legs · {lifted} lifted · {legs.length - lifted} on the
            surface
          </span>
        </div>
      </div>
    </div>
  )
}
