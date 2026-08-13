/**
 * PROTOTYPE — throwaway.
 *
 * VARIANT B — "Ledger". The Itinerary as the table it already is. The real trip lives today as a
 * markdown table with a row per place and a row per movement, and this variant takes that seriously:
 * everything is visible at once, nothing is behind a disclosure triangle, and the eye can run down a
 * column to find the one leg that still has no reference number.
 *
 * Its four structural claims:
 *   · Editing is **in the cell**. Click, type, tab away — it is committed.
 *   · The panel **pushes** the map rather than covering it. Both are always fully usable.
 *   · Order changes with **explicit up/down controls**, not drag.
 *   · **No Save button anywhere.** Every edit commits on blur and the map redraws behind you.
 */

import { Fragment, useEffect, useState } from 'react'

import {
  legsOf,
  money,
  nightsAt,
  shortDate,
  time,
  MODE_GLYPH,
  SEA_TRIP,
  type Leg,
  type Mode,
  type Stop,
  type Trip,
} from './itinerary-fixture'

const MODES: Mode[] = [
  'flight',
  'train',
  'ferry',
  'boat',
  'bus',
  'van',
  'transfer',
]
const WIDTH = 620

export const NAME =
  'Ledger — everything visible, cell edit, pushes the map, no save'

export function VariantB({ onWidth }: { onWidth: (px: number) => void }) {
  const [trip, setTrip] = useState<Trip>(SEA_TRIP)
  const [open, setOpen] = useState(true)
  const [lastCommit, setLastCommit] = useState<string | null>(null)

  // Push: the map is inset by the panel's width and gets the rest.
  useEffect(() => onWidth(open ? WIDTH : 0), [open, onWidth])

  const commit = (what: string) =>
    setLastCommit(`${what} · committed, map redrawn`)

  const editStop = (id: string, patch: Partial<Stop>, what: string) => {
    setTrip((t) => ({
      ...t,
      stops: t.stops.map((s) => (s.id === id ? { ...s, ...patch } : s)),
    }))
    commit(what)
  }

  const editLeg = (key: string, patch: Partial<Leg>, what: string) => {
    setTrip((t) => ({
      ...t,
      legs: t.legs.some((l) => l.key === key)
        ? t.legs.map((l) => (l.key === key ? { ...l, ...patch } : l))
        : [...t.legs, { key, mode: 'transfer', booked: false, ...patch }],
    }))
    commit(what)
  }

  const shift = (index: number, by: number) => {
    setTrip((t) => {
      const stops = [...t.stops]
      const target = index + by
      if (target < 0 || target >= stops.length) return t
      ;[stops[index], stops[target]] = [stops[target], stops[index]]
      return { ...t, stops }
    })
    commit('Order changed')
  }

  const insertAfter = (index: number) => {
    setTrip((t) => {
      const stops = [...t.stops]
      stops.splice(index + 1, 0, {
        id: `new-${stops.length}-${index}`,
        name: '',
        country: '',
        arrival: null,
        departure: null,
        lng: 0,
        lat: 0,
      })
      return { ...t, stops }
    })
    commit('Stop inserted')
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="absolute top-4 left-4 z-10 rounded bg-white/95 px-3 py-2 text-sm font-medium shadow-lg"
      >
        ☰ Itinerary
      </button>
    )
  }

  const pairs = legsOf(trip)
  const total = trip.stops
    .filter((s) => !s.layover)
    .reduce((n, s) => n + nightsAt(s), 0)

  return (
    <aside
      className="absolute inset-y-0 left-0 z-10 flex flex-col border-r border-black/15 bg-[#fbfaf7]"
      style={{ width: WIDTH }}
    >
      <header className="flex items-center justify-between border-b border-black/10 px-4 py-3">
        <div>
          <h1 className="text-[14px] font-semibold">{trip.name}</h1>
          <p className="text-[11px] text-black/45">
            {trip.stops.filter((s) => !s.layover).length} stops · {total} nights
            · every change is live
          </p>
        </div>
        <button
          onClick={() => setOpen(false)}
          className="text-black/40 hover:text-black"
        >
          ⟨
        </button>
      </header>

      <div className="flex-1 overflow-auto">
        <table className="w-full border-collapse text-[11.5px]">
          <thead className="sticky top-0 z-10 bg-[#f2efe9] text-left text-[10px] tracking-wide text-black/45 uppercase">
            <tr>
              <th className="w-12 px-2 py-2 font-medium"></th>
              <th className="px-2 py-2 font-medium">Place / movement</th>
              <th className="w-24 px-2 py-2 font-medium">In</th>
              <th className="w-24 px-2 py-2 font-medium">Out</th>
              <th className="w-10 px-2 py-2 text-right font-medium">Nts</th>
              <th className="w-28 px-2 py-2 font-medium">Ref</th>
              <th className="w-24 px-2 py-2 text-right font-medium">Cost</th>
            </tr>
          </thead>
          <tbody>
            {trip.stops.map((stop, i) => {
              const pair = pairs[i]
              const nights = nightsAt(stop)

              return (
                <Fragment key={stop.id}>
                  <tr
                    className={`border-b border-black/6 ${stop.layover ? 'text-black/40' : ''} hover:bg-black/[0.025]`}
                  >
                    <td className="px-2 py-1.5 align-top">
                      <div className="flex items-center gap-0.5">
                        <button
                          onClick={() => shift(i, -1)}
                          className="text-[9px] text-black/25 hover:text-black"
                          title="Move up"
                        >
                          ▲
                        </button>
                        <button
                          onClick={() => shift(i, 1)}
                          className="text-[9px] text-black/25 hover:text-black"
                          title="Move down"
                        >
                          ▼
                        </button>
                        <span
                          className={`ml-1 size-2 rounded-full ${
                            stop.layover
                              ? 'ring-1 ring-black/20'
                              : stop.stay?.status === 'booked'
                                ? 'bg-emerald-600'
                                : 'animate-pulse bg-amber-500'
                          }`}
                        />
                      </div>
                    </td>
                    <td className="px-2 py-1.5">
                      <Cell
                        value={stop.name}
                        placeholder="new stop"
                        bold
                        onCommit={(v) =>
                          editStop(
                            stop.id,
                            { name: v },
                            `${v || 'Stop'} renamed`,
                          )
                        }
                      />
                      {!stop.layover && (
                        <div className="mt-0.5 flex items-center gap-1 text-[10.5px] text-black/45">
                          <span
                            className={
                              stop.stay?.status === 'booked'
                                ? 'text-emerald-700'
                                : stop.stay?.status === 'placeholder'
                                  ? 'text-amber-700'
                                  : ''
                            }
                          >
                            {stop.stay?.status === 'booked'
                              ? '▪'
                              : stop.stay?.status === 'placeholder'
                                ? '▫'
                                : '○'}
                          </span>
                          <span className="min-w-0 flex-1 truncate">
                            <Cell
                              value={stop.stay?.name ?? ''}
                              placeholder="no stay yet"
                              onCommit={(v) =>
                                editStop(
                                  stop.id,
                                  {
                                    stay: {
                                      status: 'shortlisted',
                                      ...stop.stay,
                                      name: v,
                                    },
                                  },
                                  'Stay set',
                                )
                              }
                            />
                          </span>
                          {stop.stay?.cancelBy && (
                            <span className="shrink-0 rounded bg-red-50 px-1 text-[9.5px] whitespace-nowrap text-red-700">
                              cancel by {shortDate(stop.stay.cancelBy)}
                            </span>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="px-2 py-1.5 align-top text-black/60">
                      <Cell
                        value={stop.arrival?.slice(0, 10) ?? ''}
                        type="date"
                        display={
                          stop.layover
                            ? time(stop.arrival)
                            : shortDate(stop.arrival)
                        }
                        onCommit={(v) =>
                          editStop(stop.id, { arrival: v }, 'Arrival changed')
                        }
                      />
                    </td>
                    <td className="px-2 py-1.5 align-top text-black/60">
                      <Cell
                        value={stop.departure?.slice(0, 10) ?? ''}
                        type="date"
                        display={
                          stop.layover
                            ? time(stop.departure)
                            : shortDate(stop.departure)
                        }
                        onCommit={(v) =>
                          editStop(
                            stop.id,
                            { departure: v },
                            'Departure changed',
                          )
                        }
                      />
                    </td>
                    <td className="px-2 py-1.5 text-right align-top text-black/35">
                      {stop.layover ? '—' : nights}
                    </td>
                    <td className="px-2 py-1.5 align-top font-mono text-[10.5px] text-black/55">
                      {stop.stay?.reference ?? ''}
                    </td>
                    <td className="px-2 py-1.5 text-right align-top text-black/55">
                      {stop.stay?.price ? money(stop.stay.price) : ''}
                    </td>
                  </tr>

                  {pair && (
                    <tr
                      key={`${stop.id}-leg`}
                      className="border-b border-black/6 bg-black/[0.02]"
                    >
                      <td className="px-2 py-1 text-center">
                        <button
                          onClick={() => insertAfter(i)}
                          className="text-[11px] text-black/20 hover:text-black"
                          title="Insert a stop here"
                        >
                          ＋
                        </button>
                      </td>
                      <td className="px-2 py-1" colSpan={3}>
                        <div className="flex items-center gap-1.5">
                          <select
                            value={pair.leg?.mode ?? ''}
                            onChange={(e) =>
                              editLeg(
                                `${pair.from.id}->${pair.to.id}`,
                                { mode: e.target.value as Mode },
                                'Mode changed',
                              )
                            }
                            className="rounded border border-black/12 bg-white px-1 py-0.5 text-[10.5px]"
                          >
                            <option value="">mode…</option>
                            {MODES.map((m) => (
                              <option key={m} value={m}>
                                {MODE_GLYPH[m]} {m}
                              </option>
                            ))}
                          </select>
                          {pair.leg?.alsoMode && (
                            <span className="rounded bg-black/8 px-1 text-[10px] text-black/55">
                              + {MODE_GLYPH[pair.leg.alsoMode]}{' '}
                              {pair.leg.alsoMode}
                            </span>
                          )}
                          <span className="min-w-0 shrink truncate">
                            <Cell
                              value={pair.leg?.carrier ?? ''}
                              placeholder="carrier"
                              onCommit={(v) =>
                                editLeg(
                                  `${pair.from.id}->${pair.to.id}`,
                                  { carrier: v },
                                  'Carrier set',
                                )
                              }
                            />
                          </span>
                          {pair.leg?.service && (
                            <span className="font-mono text-[10.5px] text-black/60">
                              {pair.leg.service}
                            </span>
                          )}
                          {pair.leg?.departAt && (
                            <span className="text-[10.5px] text-black/40">
                              {time(pair.leg.departAt)}
                              {pair.leg.arriveAt &&
                                `–${time(pair.leg.arriveAt)}`}
                            </span>
                          )}
                          {pair.leg?.callsAt && (
                            <span className="text-[10px] text-black/30">
                              via {pair.leg.callsAt.join(', ')}
                            </span>
                          )}
                          {pair.leg && !pair.leg.booked && (
                            <span className="rounded-full bg-amber-100 px-1.5 text-[9px] tracking-wide text-amber-800 uppercase">
                              to book
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-2 py-1 text-right text-[10px] text-black/30">
                        {pair.leg?.seat}
                      </td>
                      <td className="px-2 py-1 font-mono text-[10.5px] text-black/55">
                        {pair.leg?.reference ?? ''}
                      </td>
                      <td className="px-2 py-1 text-right text-black/55">
                        {pair.leg?.price ? money(pair.leg.price) : ''}
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>

      <footer className="border-t border-black/10 bg-white/60 px-4 py-2 text-[11px] text-black/45">
        {lastCommit ?? 'Click any cell to edit it. There is no save.'}
      </footer>
    </aside>
  )
}

/** Click-to-edit cell. Commits on blur or Enter; Escape reverts. */
function Cell({
  value,
  onCommit,
  placeholder,
  bold,
  type = 'text',
  display,
}: {
  value: string
  onCommit: (v: string) => void
  placeholder?: string
  bold?: boolean
  type?: string
  display?: string
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)

  if (editing) {
    return (
      <input
        autoFocus
        type={type}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          setEditing(false)
          if (draft !== value) onCommit(draft)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur()
          if (e.key === 'Escape') {
            setDraft(value)
            setEditing(false)
          }
        }}
        className="w-full rounded border border-black/30 bg-white px-1 py-0.5 text-[11.5px] outline-none"
      />
    )
  }

  return (
    <span
      tabIndex={0}
      onClick={() => {
        setDraft(value)
        setEditing(true)
      }}
      onFocus={() => {
        setDraft(value)
        setEditing(true)
      }}
      className={`-mx-1 cursor-text rounded px-1 hover:bg-black/6 ${bold ? 'font-medium' : ''} ${
        !value ? 'text-black/25 italic' : ''
      }`}
    >
      {display || value || placeholder}
    </span>
  )
}
