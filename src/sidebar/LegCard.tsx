/**
 * A Leg in the ribbon: the connector between two Stops, and the form it opens into.
 *
 * The form asks **four things** — how you go, when, what it cost, and anything worth remembering —
 * and keeps the rest one click away. Which four is not a matter of taste: it was measured across the
 * nine Legs of the real trip, and `leg-fields.ts` holds both the split and the numbers behind it
 * ([#28](https://github.com/adrianpetersson/onward/issues/28)). Nothing is deleted, because `edit-leg`
 * patches over the existing Leg — a field this card stops rendering keeps its value — and nothing is
 * silently hidden either: the closed service row says what it is holding.
 */

import { useState } from 'react'
import type { Dispatch } from 'react'

import type { Leg, Mode } from '../itinerary/model'
import { DateInput, Field, MoneyInput, Text, money } from './fields'
import { hoursAndMinutes, offersDayRoll, serviceSummary } from './leg-fields'
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
              {/* The duration too, because it is the fact most Legs actually have: five of the real
                  trip's nine know how long they take and never when they leave, so without it their
                  closed row is the bare word "boat". */}
              {leg.durationMin !== null && (
                <span className="text-black/40">
                  {' '}
                  · {hoursAndMinutes(leg.durationMin)}
                </span>
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
          {/*
           * One row, glyphs only, each naming itself on hover. Six labelled buttons wrapped to two
           * rows, which is a lot of card spent saying what "clicking one icon" already implies — and
           * the labels were carrying `🚐` against `🚌`, a distinction the real trip never even asks
           * for (#15: nothing on it is a bus).
           */}
          <Field label={`Mode — ${label}`}>
            <div className="flex gap-1">
              {MODES.map((m) => (
                <button
                  key={m}
                  title={m}
                  aria-label={m}
                  onClick={() => edit({ mode: leg.mode === m ? null : m })}
                  /*
                   * Selected is a black edge and a faint fill, not the `bg-black text-white` the rest
                   * of the sidebar uses for a chosen chip: `✈` and `⛴` render as monochrome text
                   * glyphs rather than colour emoji, so black-on-black would have made two of the six
                   * Modes vanish at exactly the moment they were picked.
                   */
                  className={`flex-1 rounded border py-1 text-[14px] ${
                    leg.mode === m
                      ? 'border-black bg-black/[0.06]'
                      : 'border-black/15 opacity-40 hover:opacity-75'
                  }`}
                >
                  {MODE_GLYPH[m]}
                </button>
              ))}
            </div>
          </Field>

          {/*
           * The three facts about the same clock, in one row. `Takes` is here rather than folded away
           * because it is filled on every Leg of the real trip and is the *only* quantitative fact on
           * five of them — see `leg-fields.ts`. Its `That is` echo used to cost a labelled field of
           * its own and now rides beside the input it describes.
           */}
          <div className="flex gap-2">
            <Field label="Departs">
              <Text
                value={leg.depart}
                onChange={(v) => edit({ depart: v })}
                placeholder="19:50"
              />
            </Field>
            <Field label="Arrives">
              <div className="flex gap-1">
                <Text
                  value={leg.arrive}
                  onChange={(v) => edit({ arrive: v })}
                  placeholder="09:30"
                />
                {/* The `+1` modifies the arrival, so it stands on it rather than in a field of its
                    own — and it appears only where it could mean anything. */}
                {offersDayRoll(leg) && (
                  <button
                    title={
                      leg.dayRoll
                        ? 'Arrives the next day'
                        : 'Arrives the same day'
                    }
                    onClick={() => edit({ dayRoll: leg.dayRoll ? 0 : 1 })}
                    className={`shrink-0 rounded border px-1.5 text-[11px] ${
                      leg.dayRoll
                        ? 'border-black bg-black text-white'
                        : 'border-black/15 text-black/35'
                    }`}
                  >
                    +1
                  </button>
                )}
              </div>
            </Field>
            <Field label="Takes">
              <div className="flex items-center gap-1.5">
                <Text
                  value={
                    leg.durationMin === null ? null : String(leg.durationMin)
                  }
                  onChange={(v) =>
                    edit({ durationMin: v === null ? null : Number(v) || null })
                  }
                  placeholder="min"
                />
                <span className="shrink-0 text-[10.5px] text-black/40 tabular-nums">
                  {hoursAndMinutes(leg.durationMin)}
                </span>
              </div>
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

          <ServiceFields leg={leg} edit={edit} />

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
 * The service behind the Leg: who runs it, where it physically leaves from, and the second vehicle a
 * single ticket sometimes covers.
 *
 * All three are real and all three are demoted, because they are what you learn when you go to book
 * rather than what you know when you are laying a trip out — five of the real trip's nine Legs have a
 * carrier and only one has a second Mode. `carrier` deliberately does **not** move inside the Booking
 * block, though it reads like paperwork: `model.ts` rules it "known before any ticket exists, so it
 * cannot belong to the Booking", and burying it there would make it unreachable until the traveller
 * claimed to have booked something.
 *
 * The closed row states what it holds rather than merely offering to open. A fold that gave no sign of
 * a filled `carrier` would read as having lost it — the same shape of lie
 * [#30](https://github.com/adrianpetersson/onward/issues/30) records elsewhere in this card.
 */
function ServiceFields({
  leg,
  edit,
}: {
  leg: Leg
  edit: (patch: Partial<Leg>) => void
}) {
  const [open, setOpen] = useState(false)
  const summary = serviceSummary(leg)

  return (
    <>
      <button
        onClick={() => setOpen(!open)}
        className={`mt-1 flex w-full items-baseline gap-1.5 rounded border border-dashed px-2 py-1.5 text-left text-[11px] ${
          summary
            ? 'border-black/15 text-black/60 hover:border-black/40'
            : 'border-black/20 text-black/45 hover:border-black/40 hover:text-black'
        }`}
      >
        <span className="shrink-0 text-black/35">{open ? '－' : '＋'}</span>
        <span className="min-w-0 flex-1 truncate">
          {summary ?? 'Who runs it, and where it leaves from'}
        </span>
      </button>

      {open && (
        <div className="mt-1.5 rounded border border-black/12 px-2.5 py-2">
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

          {/*
           * Gated on there being a Mode for it to come *after* — but on `secondMode` too, so a Leg
           * that arrived from a file with a second vehicle and no first can still be corrected.
           */}
          {(leg.mode || leg.secondMode) && (
            <Field label="And then, on the same ticket">
              <div className="flex gap-1">
                {MODES.map((m) => (
                  <button
                    key={m}
                    title={m}
                    aria-label={m}
                    onClick={() =>
                      edit({ secondMode: leg.secondMode === m ? null : m })
                    }
                    className={`flex-1 rounded border py-1 text-[13px] ${
                      leg.secondMode === m
                        ? 'border-black bg-black/[0.06]'
                        : 'border-black/15 opacity-40 hover:opacity-75'
                    }`}
                  >
                    {MODE_GLYPH[m]}
                  </button>
                ))}
              </div>
            </Field>
          )}
        </div>
      )}
    </>
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
          {/*
           * The one date field with no floor, and it is not an oversight. `min` can only anchor a
           * picker when the floor is in the *future* — it clamps the opening month up, never down —
           * and a cancellation deadline's only honest floor is the past: `atRisk` is built on
           * deadlines that have already lapsed, so forbidding them would delete the fact it reads.
           * A `max` of the arrival would be defensible and would buy nothing, because today already
           * sits below it and the picker opens on today regardless.
           */}
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
