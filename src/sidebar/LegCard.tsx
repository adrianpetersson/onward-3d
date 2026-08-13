/** A Leg in the ribbon: the connector between two Stops, and the form it opens into. */

import type { Dispatch } from 'react'

import type { Leg, Mode } from '../itinerary/model'
import { DateInput, Derived, Field, MoneyInput, Text, money } from './fields'
import type { Action, LegTarget } from './use-itinerary'

const MODES: Mode[] = ['flight', 'train', 'ferry', 'boat', 'bus', 'van']

export const MODE_GLYPH: Record<Mode, string> = {
  flight: '✈',
  train: '🚆',
  ferry: '⛴',
  boat: '🛥',
  bus: '🚌',
  van: '🚐',
}

function hoursAndMinutes(minutes: number | null): string {
  if (minutes === null) return '—'
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return h === 0 ? `${m}m` : m === 0 ? `${h}h` : `${h}h ${m}m`
}

export function LegCard({
  leg,
  target,
  label,
  open,
  onToggle,
  dirty,
  dispatch,
}: {
  leg: Leg
  target: LegTarget
  /** Where this Leg goes, in words — "to Koh Mook", "home". */
  label: string
  open: boolean
  onToggle: () => void
  dirty: boolean
  dispatch: Dispatch<Action>
}) {
  const edit = (patch: Partial<Leg>) =>
    dispatch({ type: 'edit-leg', target, patch })

  return (
    <div className="border-l-2 border-dashed border-black/15 pl-4">
      <button
        onClick={onToggle}
        className="flex w-full items-center gap-2 py-1.5 text-left text-[11px] text-black/55 hover:text-black"
      >
        <span className="w-4 text-[13px]">
          {leg.mode ? MODE_GLYPH[leg.mode] : '·'}
        </span>
        <span className="flex-1 truncate">
          {leg.mode ? (
            <>
              {leg.mode}
              {leg.secondMode && ` + ${leg.secondMode}`}
              {leg.carrier && (
                <span className="text-black/40"> · {leg.carrier}</span>
              )}
              {leg.depart && (
                <span className="text-black/40"> · {leg.depart}</span>
              )}
            </>
          ) : (
            <span className="text-black/30 italic">no mode yet — {label}</span>
          )}
          {dirty && <span className="ml-1.5 text-amber-600">•</span>}
        </span>
        {leg.mode && !leg.booking && (
          <span className="shrink-0 rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] tracking-wide text-amber-800 uppercase">
            to book
          </span>
        )}
      </button>

      {open && (
        <div className="mb-2 rounded-md border border-black/15 bg-white px-3 py-3">
          <Field label={`Mode — ${label}`}>
            <div className="flex flex-wrap gap-1">
              {MODES.map((m) => (
                <button
                  key={m}
                  onClick={() => edit({ mode: leg.mode === m ? null : m })}
                  className={`rounded border px-2 py-1 text-[11px] ${
                    leg.mode === m
                      ? 'border-black bg-black text-white'
                      : 'border-black/15'
                  }`}
                >
                  {MODE_GLYPH[m]} {m}
                </button>
              ))}
            </div>
          </Field>

          {leg.mode && (
            <Field label="And then, on the same ticket">
              <div className="flex flex-wrap gap-1">
                {MODES.map((m) => (
                  <button
                    key={m}
                    onClick={() =>
                      edit({ secondMode: leg.secondMode === m ? null : m })
                    }
                    className={`rounded border px-2 py-1 text-[11px] ${
                      leg.secondMode === m
                        ? 'border-black bg-black text-white'
                        : 'border-black/15'
                    }`}
                  >
                    {MODE_GLYPH[m]}
                  </button>
                ))}
              </div>
            </Field>
          )}

          <div className="flex gap-2">
            <Field label="Departs">
              <Text
                value={leg.depart}
                onChange={(v) => edit({ depart: v })}
                placeholder="19:50"
              />
            </Field>
            <Field label="Arrives">
              <Text
                value={leg.arrive}
                onChange={(v) => edit({ arrive: v })}
                placeholder="09:30"
              />
            </Field>
            <div className="w-24 shrink-0">
              <Field label="Next day">
                <button
                  onClick={() => edit({ dayRoll: leg.dayRoll ? 0 : 1 })}
                  className={`w-full rounded border px-2 py-1 text-[12px] ${
                    leg.dayRoll
                      ? 'border-black bg-black text-white'
                      : 'border-black/15'
                  }`}
                >
                  {leg.dayRoll ? '+1 day' : 'same day'}
                </button>
              </Field>
            </div>
          </div>

          <div className="flex gap-2">
            <Field label="Takes">
              <Text
                value={
                  leg.durationMin === null ? null : String(leg.durationMin)
                }
                onChange={(v) =>
                  edit({ durationMin: v === null ? null : Number(v) || null })
                }
                placeholder="minutes"
              />
            </Field>
            <div className="flex-1">
              <Derived
                label="That is"
                value={hoursAndMinutes(leg.durationMin)}
              />
            </div>
          </div>

          <div className="flex gap-2">
            <Field label="Carrier">
              <Text
                value={leg.carrier}
                onChange={(v) => edit({ carrier: v })}
                placeholder="Bundhaya"
              />
            </Field>
            <Field label="Leaves from">
              <Text
                value={leg.fromPlace}
                onChange={(v) => edit({ fromPlace: v })}
                placeholder="Nopparat Thara"
              />
            </Field>
          </div>

          <Field label="Fare">
            <MoneyInput
              value={leg.price}
              onChange={(v) => edit({ price: v })}
            />
          </Field>

          <Field label="Note">
            <textarea
              className="w-full rounded border border-black/15 bg-white px-2 py-1 text-[12px] outline-none focus:border-black/50"
              rows={2}
              value={leg.note ?? ''}
              placeholder="Ask for a lower berth."
              onChange={(e) => edit({ note: e.target.value || null })}
            />
          </Field>

          <BookingFields
            booking={leg.booking}
            onChange={(booking) => edit({ booking })}
            what="this ticket"
          />
        </div>
      )}
    </div>
  )
}

/**
 * The Booking half of a Leg or a Stay. There is no Booking until there is a reference — that is what
 * separates a fare you have priced from a seat you own.
 */
export function BookingFields({
  booking,
  onChange,
  what,
}: {
  booking: Leg['booking']
  onChange: (booking: Leg['booking']) => void
  what: string
}) {
  if (!booking) {
    return (
      <button
        onClick={() =>
          onChange({
            reference: '',
            platform: null,
            cancelBy: null,
            contact: null,
            detail: null,
          })
        }
        className="mt-1 w-full rounded border border-dashed border-black/20 py-1.5 text-[11px] text-black/45 hover:border-black/40 hover:text-black"
      >
        ＋ I have booked {what}
      </button>
    )
  }

  const edit = (patch: Partial<NonNullable<Leg['booking']>>) =>
    onChange({ ...booking, ...patch })

  return (
    <div className="mt-2 border-t border-black/8 pt-2">
      <div className="mb-1 flex items-baseline justify-between">
        <span className="text-[10px] font-semibold tracking-wide text-black/40 uppercase">
          Booking
        </span>
        <button
          onClick={() => onChange(null)}
          className="text-[10px] text-black/35 hover:text-red-700"
        >
          not booked after all
        </button>
      </div>

      <div className="flex gap-2">
        <Field label="Reference">
          <Text
            value={booking.reference}
            onChange={(v) => edit({ reference: v ?? '' })}
            placeholder="688166919"
          />
        </Field>
        <Field label="Booked with">
          <Text
            value={booking.platform}
            onChange={(v) => edit({ platform: v })}
            placeholder="Agoda"
          />
        </Field>
      </div>

      <div className="flex gap-2">
        <Field label="Free until">
          <DateInput
            value={booking.cancelBy}
            onChange={(v) => edit({ cancelBy: v })}
          />
        </Field>
        <Field label="Contact">
          <Text
            value={booking.contact}
            onChange={(v) => edit({ contact: v })}
            placeholder="+66 …"
          />
        </Field>
      </div>

      <Field label="Anything else on the paperwork">
        <Text
          value={booking.detail}
          onChange={(v) => edit({ detail: v })}
          placeholder="seat 52L · breakfast included"
        />
      </Field>
    </div>
  )
}

export { money }
