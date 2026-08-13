/**
 * PROTOTYPE — throwaway.
 *
 * VARIANT A — "Rail". The Itinerary is one continuous ribbon: Stops and Legs alternate down a single
 * scrolling column, and the Leg is visibly the thing *between* two Stops rather than a row of its own.
 *
 * Its four structural claims, each of which A is the only variant to make:
 *   · Editing happens **inline, in place** — the ribbon accordions open, nothing navigates.
 *   · The panel **overlays** the map. The camera never moves; the map just loses some width.
 *   · Order changes by **dragging** a Stop.
 *   · **One global Save**, with a dirty count. Nothing commits until you press it.
 */

import { useEffect, useState } from 'react'

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

export const NAME = 'Rail — one ribbon, inline edit, overlay, global save'

export function VariantA({ onWidth }: { onWidth: (px: number) => void }) {
  const [trip, setTrip] = useState<Trip>(SEA_TRIP)
  const [open, setOpen] = useState(true)
  const [expanded, setExpanded] = useState<string | null>('kradan')
  const [dirty, setDirty] = useState<Set<string>>(new Set())
  const [dragging, setDragging] = useState<string | null>(null)

  // Overlay: the panel sits on top, so the map keeps its full width underneath.
  useEffect(() => onWidth(0), [onWidth])

  const touch = (id: string) => setDirty((d) => new Set(d).add(id))

  const editStop = (id: string, patch: Partial<Stop>) => {
    setTrip((t) => ({
      ...t,
      stops: t.stops.map((s) => (s.id === id ? { ...s, ...patch } : s)),
    }))
    touch(id)
  }

  const editLeg = (key: string, patch: Partial<Leg>) => {
    setTrip((t) => ({
      ...t,
      legs: t.legs.some((l) => l.key === key)
        ? t.legs.map((l) => (l.key === key ? { ...l, ...patch } : l))
        : [...t.legs, { key, mode: 'transfer', booked: false, ...patch }],
    }))
    touch(key)
  }

  const move = (fromId: string, toId: string) => {
    if (fromId === toId) return
    setTrip((t) => {
      const stops = [...t.stops]
      const from = stops.findIndex((s) => s.id === fromId)
      const to = stops.findIndex((s) => s.id === toId)
      const [moved] = stops.splice(from, 1)
      stops.splice(to, 0, moved)
      return { ...t, stops }
    })
    touch('order')
  }

  const insertAfter = (index: number) => {
    setTrip((t) => {
      const stops = [...t.stops]
      stops.splice(index + 1, 0, {
        id: `new-${stops.length}`,
        name: '',
        country: '',
        arrival: null,
        departure: null,
        lng: 0,
        lat: 0,
      })
      return { ...t, stops }
    })
    touch('order')
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

  return (
    <aside className="absolute inset-y-0 left-0 z-10 flex w-[420px] flex-col bg-[#fbfaf7]/97 shadow-[4px_0_24px_rgba(0,0,0,0.18)] backdrop-blur-sm">
      <header className="flex items-baseline justify-between border-b border-black/10 px-5 py-4">
        <div>
          <h1 className="text-[15px] leading-tight font-semibold">
            {trip.name}
          </h1>
          <p className="mt-0.5 text-[11px] text-black/45">
            {trip.stops.length} stops · {pairs.length} legs · 13 Dec – 6 Jan
          </p>
        </div>
        <button
          onClick={() => setOpen(false)}
          className="text-black/40 hover:text-black"
        >
          ✕
        </button>
      </header>

      <div className="flex-1 overflow-y-auto px-5 py-4">
        {trip.stops.map((stop, i) => {
          const pair = pairs[i]
          const isOpen = expanded === stop.id
          const nights = nightsAt(stop)

          return (
            <div key={stop.id}>
              {/* ── the Stop ── */}
              <div
                draggable
                onDragStart={() => setDragging(stop.id)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => dragging && move(dragging, stop.id)}
                className={`group relative rounded-md border transition ${
                  isOpen
                    ? 'border-black/20 bg-white shadow-sm'
                    : 'border-transparent hover:bg-black/[0.03]'
                } ${dragging === stop.id ? 'opacity-40' : ''}`}
              >
                <button
                  onClick={() => setExpanded(isOpen ? null : stop.id)}
                  className="flex w-full items-center gap-3 px-3 py-2.5 text-left"
                >
                  <span className="cursor-grab text-black/20 group-hover:text-black/40">
                    ⣿
                  </span>
                  <span
                    className={`size-2.5 shrink-0 rounded-full ${
                      stop.layover
                        ? 'bg-transparent ring-1 ring-black/25'
                        : stop.stay?.status === 'booked'
                          ? 'bg-emerald-600'
                          : 'animate-pulse bg-amber-500'
                    }`}
                  />
                  <span className="flex-1">
                    <span className="block text-[13px] font-medium">
                      {stop.name || (
                        <span className="text-black/30">New stop</span>
                      )}
                      {dirty.has(stop.id) && (
                        <span className="ml-1.5 text-amber-600">•</span>
                      )}
                    </span>
                    <span className="block text-[11px] text-black/45">
                      {stop.layover
                        ? `layover · ${time(stop.arrival)}–${time(stop.departure)}`
                        : `${shortDate(stop.arrival)} – ${shortDate(stop.departure)} · ${nights} ${nights === 1 ? 'night' : 'nights'}`}
                    </span>
                  </span>
                  <span className="text-[10px] text-black/30">
                    {isOpen ? '▲' : '▼'}
                  </span>
                </button>

                {isOpen && (
                  <div className="border-t border-black/8 px-3 py-3">
                    <Field label="Name">
                      <input
                        value={stop.name}
                        onChange={(e) =>
                          editStop(stop.id, { name: e.target.value })
                        }
                        className="w-full rounded border border-black/15 px-2 py-1 text-[12px]"
                      />
                    </Field>
                    <div className="flex gap-2">
                      <Field label="Arrival">
                        <input
                          type="date"
                          value={stop.arrival?.slice(0, 10) ?? ''}
                          onChange={(e) =>
                            editStop(stop.id, { arrival: e.target.value })
                          }
                          className="w-full rounded border border-black/15 px-2 py-1 text-[12px]"
                        />
                      </Field>
                      <Field label="Departure">
                        <input
                          type="date"
                          value={stop.departure?.slice(0, 10) ?? ''}
                          onChange={(e) =>
                            editStop(stop.id, { departure: e.target.value })
                          }
                          className="w-full rounded border border-black/15 px-2 py-1 text-[12px]"
                        />
                      </Field>
                      <div className="w-16 shrink-0">
                        <p className="mb-1 text-[10px] tracking-wide text-black/40 uppercase">
                          Nights
                        </p>
                        <p className="rounded bg-black/5 px-2 py-1 text-center text-[12px] text-black/50">
                          {nights}
                        </p>
                      </div>
                    </div>
                    <Field label="Coordinate">
                      <div className="flex gap-2">
                        <input
                          readOnly
                          value={
                            stop.lng
                              ? `${stop.lat.toFixed(4)}, ${stop.lng.toFixed(4)}`
                              : ''
                          }
                          placeholder="search for a place…"
                          className="w-full rounded border border-black/15 bg-black/[0.03] px-2 py-1 text-[12px] text-black/60"
                        />
                        <button className="shrink-0 rounded border border-black/15 px-2 text-[11px]">
                          Search
                        </button>
                      </div>
                    </Field>

                    <p className="mt-4 mb-1.5 text-[10px] font-semibold tracking-wide text-black/40 uppercase">
                      Stay
                    </p>
                    {stop.layover ? (
                      <p className="text-[11px] text-black/35 italic">
                        A layover has no Stay.
                      </p>
                    ) : (
                      <>
                        <Field label="Name">
                          <input
                            value={stop.stay?.name ?? ''}
                            onChange={(e) =>
                              editStop(stop.id, {
                                stay: {
                                  status: 'shortlisted',
                                  ...stop.stay,
                                  name: e.target.value,
                                },
                              })
                            }
                            className="w-full rounded border border-black/15 px-2 py-1 text-[12px]"
                          />
                        </Field>
                        <div className="flex gap-2">
                          <Field label="Price">
                            <input
                              value={
                                stop.stay?.price ? money(stop.stay.price) : ''
                              }
                              readOnly
                              className="w-full rounded border border-black/15 px-2 py-1 text-[12px]"
                            />
                          </Field>
                          <Field label="Reference">
                            <input
                              value={stop.stay?.reference ?? ''}
                              readOnly
                              className="w-full rounded border border-black/15 px-2 py-1 text-[12px]"
                            />
                          </Field>
                        </div>
                        <div className="flex gap-2">
                          <Field label="Free cancellation">
                            <input
                              type="date"
                              value={stop.stay?.cancelBy ?? ''}
                              readOnly
                              className="w-full rounded border border-black/15 px-2 py-1 text-[12px]"
                            />
                          </Field>
                          <Field label="Status">
                            <div className="rounded border border-black/15 px-2 py-1 text-[12px]">
                              {stop.stay?.status ?? 'none'}
                            </div>
                          </Field>
                        </div>
                        <Field label="Google Maps link">
                          <input
                            placeholder="paste a link to place the Stay Marker…"
                            defaultValue={
                              stop.stay?.lat
                                ? `${stop.stay.lat}, ${stop.stay.lng}`
                                : ''
                            }
                            className="w-full rounded border border-black/15 px-2 py-1 text-[12px]"
                          />
                        </Field>
                        {stop.stay?.note && (
                          <p className="mt-2 text-[11px] leading-snug text-black/45">
                            {stop.stay.note}
                          </p>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>

              {/* ── the gap: insert point + the Leg that lives in it ── */}
              {pair && (
                <div className="group/gap relative py-1 pl-[26px]">
                  <button
                    onClick={() => insertAfter(i)}
                    className="absolute top-0 left-0 z-10 hidden size-5 items-center justify-center rounded-full border border-black/15 bg-white text-[11px] text-black/50 group-hover/gap:flex"
                    title="Insert a stop here"
                  >
                    +
                  </button>
                  <LegRow
                    leg={pair.leg}
                    legKey={`${pair.from.id}->${pair.to.id}`}
                    dirty={dirty}
                    expanded={expanded}
                    setExpanded={setExpanded}
                    editLeg={editLeg}
                  />
                </div>
              )}
            </div>
          )
        })}
      </div>

      <footer className="flex items-center justify-between border-t border-black/10 bg-white/60 px-5 py-3">
        <span className="text-[11px] text-black/50">
          {dirty.size === 0
            ? 'No unsaved changes'
            : `${dirty.size} unsaved change${dirty.size === 1 ? '' : 's'}`}
        </span>
        <div className="flex gap-2">
          <button
            onClick={() => {
              setTrip(SEA_TRIP)
              setDirty(new Set())
            }}
            className="rounded px-3 py-1.5 text-[12px] text-black/50 hover:bg-black/5"
          >
            Discard
          </button>
          <button
            onClick={() => setDirty(new Set())}
            disabled={dirty.size === 0}
            className="rounded bg-black px-4 py-1.5 text-[12px] font-medium text-white disabled:bg-black/20"
          >
            Save &amp; redraw
          </button>
        </div>
      </footer>
    </aside>
  )
}

function LegRow({
  leg,
  legKey,
  dirty,
  expanded,
  setExpanded,
  editLeg,
}: {
  leg: Leg | undefined
  legKey: string
  dirty: Set<string>
  expanded: string | null
  setExpanded: (id: string | null) => void
  editLeg: (key: string, patch: Partial<Leg>) => void
}) {
  const isOpen = expanded === legKey

  return (
    <div className="border-l-2 border-dashed border-black/15 pl-4">
      <button
        onClick={() => setExpanded(isOpen ? null : legKey)}
        className="flex w-full items-center gap-2 py-1 text-left text-[11px] text-black/55 hover:text-black"
      >
        <span className="text-[13px]">{leg ? MODE_GLYPH[leg.mode] : '＋'}</span>
        <span className="flex-1">
          {leg ? (
            <>
              {leg.mode}
              {leg.alsoMode && ` + ${leg.alsoMode}`}
              {leg.service && ` · ${leg.service}`}
              {leg.departAt && ` · ${time(leg.departAt)}`}
              {leg.callsAt && (
                <span className="text-black/35">
                  {' '}
                  · calls at {leg.callsAt.join(', ')}
                </span>
              )}
            </>
          ) : (
            <span className="text-black/35">Mode not set</span>
          )}
          {dirty.has(legKey) && (
            <span className="ml-1.5 text-amber-600">•</span>
          )}
        </span>
        {leg && !leg.booked && (
          <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] tracking-wide text-amber-800 uppercase">
            to book
          </span>
        )}
      </button>

      {isOpen && (
        <div className="mb-2 rounded-md border border-black/15 bg-white px-3 py-3">
          <Field label="Mode">
            <div className="flex flex-wrap gap-1">
              {MODES.map((m) => (
                <button
                  key={m}
                  onClick={() => editLeg(legKey, { mode: m })}
                  className={`rounded border px-2 py-1 text-[11px] ${
                    leg?.mode === m
                      ? 'border-black bg-black text-white'
                      : 'border-black/15'
                  }`}
                >
                  {MODE_GLYPH[m]} {m}
                </button>
              ))}
            </div>
          </Field>
          <div className="flex gap-2">
            <Field label="Departs">
              <input
                value={time(leg?.departAt) || ''}
                onChange={(e) => editLeg(legKey, { departAt: e.target.value })}
                className="w-full rounded border border-black/15 px-2 py-1 text-[12px]"
              />
            </Field>
            <Field label="Arrives">
              <input
                value={time(leg?.arriveAt) || ''}
                onChange={(e) => editLeg(legKey, { arriveAt: e.target.value })}
                className="w-full rounded border border-black/15 px-2 py-1 text-[12px]"
              />
            </Field>
          </div>
          <div className="flex gap-2">
            <Field label="Carrier">
              <input
                value={leg?.carrier ?? ''}
                onChange={(e) => editLeg(legKey, { carrier: e.target.value })}
                className="w-full rounded border border-black/15 px-2 py-1 text-[12px]"
              />
            </Field>
            <Field label="Service">
              <input
                value={leg?.service ?? ''}
                onChange={(e) => editLeg(legKey, { service: e.target.value })}
                className="w-full rounded border border-black/15 px-2 py-1 text-[12px]"
              />
            </Field>
          </div>
          <div className="flex gap-2">
            <Field label="Reference">
              <input
                value={leg?.reference ?? ''}
                onChange={(e) => editLeg(legKey, { reference: e.target.value })}
                className="w-full rounded border border-black/15 px-2 py-1 text-[12px]"
              />
            </Field>
            <Field label="Seat">
              <input
                value={leg?.seat ?? ''}
                onChange={(e) => editLeg(legKey, { seat: e.target.value })}
                className="w-full rounded border border-black/15 px-2 py-1 text-[12px]"
              />
            </Field>
            <Field label="Price">
              <input
                value={money(leg?.price)}
                readOnly
                className="w-full rounded border border-black/15 px-2 py-1 text-[12px]"
              />
            </Field>
          </div>
          {leg?.note && (
            <p className="mt-2 text-[11px] leading-snug text-black/45">
              {leg.note}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

function Field({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="mb-2 flex-1">
      <p className="mb-1 text-[10px] tracking-wide text-black/40 uppercase">
        {label}
      </p>
      {children}
    </div>
  )
}
