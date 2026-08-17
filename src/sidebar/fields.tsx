/** The small, dull inputs the sidebar is built out of. No logic lives here. */

import type { ReactNode } from 'react'

import type { Money } from '../itinerary/model'

export function Field({
  label,
  children,
}: {
  label: string
  children: ReactNode
}) {
  return (
    <label className="mb-2 block flex-1">
      <span className="mb-1 block text-[10px] tracking-wide text-black/40 uppercase">
        {label}
      </span>
      {children}
    </label>
  )
}

/** A read-only field, for facts the Itinerary derives rather than stores. */
export function Derived({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="mb-2">
      <span className="mb-1 block text-[10px] tracking-wide text-black/40 uppercase">
        {label}
      </span>
      <span className="block rounded bg-black/5 px-2 py-1 text-[12px] text-black/50">
        {value}
      </span>
    </div>
  )
}

/**
 * Split in two so a field can swap its colours without fighting its own base class. Appending
 * `bg-amber-50` to a string that already says `bg-white` leaves two utilities of equal specificity,
 * and the winner is decided by the order Tailwind emits them rather than the order they are written
 * in — which is how the below-floor mark below came out invisible the first time.
 */
const INPUT_SHELL = 'w-full rounded border px-2 py-1 text-[12px] outline-none'
const INPUT_SKIN = 'border-black/15 bg-white focus:border-black/50'
const INPUT = `${INPUT_SHELL} ${INPUT_SKIN}`

export function Text({
  value,
  onChange,
  placeholder,
}: {
  value: string | null
  onChange: (value: string | null) => void
  placeholder?: string
}) {
  return (
    <input
      className={INPUT}
      value={value ?? ''}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value || null)}
    />
  )
}

/**
 * A date, and the date it follows.
 *
 * `min` is doing two jobs here and the second is the one worth having. It forbids the obvious
 * mistake — a departure before its own arrival — but it also **anchors the picker**: Chromium clamps
 * the month the calendar opens on into `[min, max]` and then pre-selects the nearest valid day, so a
 * Departure carrying its own Arrival as `min` opens on December 2026 with the 14th already under the
 * cursor, where an unconstrained one opens four months adrift on today. Nothing is written to the
 * Stop until the traveller commits, which is what makes this an anchor and not a prefill — and
 * `create.ts` is deliberate that a new Stop stays empty rather than plausible.
 *
 * It is deliberately a **soft** floor. `min` disables the wrong days in the picker but does not stop
 * a date being typed or pasted past it — measured: assigning `2026-12-01` under `min="2026-12-14"`
 * keeps the value and reports `rangeUnderflow`. So the mis-click is impossible and the deliberate
 * out-of-order edit is only marked, which is the right way round for a traveller who realises the
 * whole leg shifts a day and starts from the wrong end.
 *
 * The mark is computed rather than left to `:invalid`, which also matches a half-typed date and
 * would flash red through every normal entry.
 */
export function DateInput({
  value,
  onChange,
  min,
}: {
  value: string | null
  onChange: (value: string | null) => void
  /** The date this one may not fall below — and the month its picker opens on. */
  min?: string | null
}) {
  const belowFloor = !!(value && min && value < min)

  return (
    <input
      type="date"
      className={`${INPUT_SHELL} ${
        belowFloor ? 'border-amber-600 bg-amber-50' : INPUT_SKIN
      }`}
      title={
        belowFloor ? `This is before ${min}, the date it follows.` : undefined
      }
      value={value ?? ''}
      min={min ?? undefined}
      onChange={(e) => onChange(e.target.value || null)}
    />
  )
}

/**
 * Amount and currency together, because they are one fact. Four currencies appear on a single trip
 * and none is ever converted, so the code is typed rather than picked from a list of the world's.
 */
export function MoneyInput({
  value,
  onChange,
}: {
  value: Money | null
  onChange: (value: Money | null) => void
}) {
  return (
    <div className="flex gap-1">
      <input
        className={INPUT}
        inputMode="decimal"
        value={value?.amount ?? ''}
        placeholder="0"
        onChange={(e) => {
          const amount = Number(e.target.value)
          if (e.target.value === '') return onChange(null)
          if (Number.isNaN(amount)) return
          onChange({ amount, currency: value?.currency ?? 'SEK' })
        }}
      />
      <input
        className={`${INPUT} w-16 shrink-0 uppercase`}
        value={value?.currency ?? ''}
        placeholder="SEK"
        maxLength={3}
        onChange={(e) =>
          onChange({
            amount: value?.amount ?? 0,
            currency: e.target.value.toUpperCase(),
          })
        }
      />
    </div>
  )
}

export function money(value: Money | null): string {
  if (!value) return '—'
  return `${value.amount.toLocaleString('en-GB')} ${value.currency}`
}

export function shortDate(value: string | null): string {
  if (!value) return '—'
  const [y, m, d] = value.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  })
}
