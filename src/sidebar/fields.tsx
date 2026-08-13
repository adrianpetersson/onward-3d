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

const INPUT =
  'w-full rounded border border-black/15 bg-white px-2 py-1 text-[12px] outline-none focus:border-black/50'

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

export function DateInput({
  value,
  onChange,
}: {
  value: string | null
  onChange: (value: string | null) => void
}) {
  return (
    <input
      type="date"
      className={INPUT}
      value={value ?? ''}
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
