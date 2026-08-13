/**
 * PROTOTYPE — throwaway.
 *
 * VARIANT C — "Focus". The map is the interface, so the sidebar refuses to become the interface. It
 * stays a thin index of places; the moment you want to *edit* something, a card opens over the map
 * next to what you are editing and the camera goes there.
 *
 * Its four structural claims:
 *   · The list carries **place and dates only**. No references, no prices, no modes.
 *   · Editing happens in a **floating card**, one entity at a time, anchored to the map.
 *   · Order is **derived from the dates** and cannot be dragged. Move a date, the trip re-sorts.
 *   · **Save per card**, and the card is the commit boundary — close it and you are asked.
 */

import { useEffect, useMemo, useState } from 'react'

import {
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
const WIDTH = 260

export const NAME =
  'Focus — thin index, card over the map, date-sorted, save per card'

type Selection =
  { kind: 'stop'; id: string } | { kind: 'leg'; key: string } | null

export function VariantC({ onWidth }: { onWidth: (px: number) => void }) {
  const [trip, setTrip] = useState<Trip>(SEA_TRIP)
  const [selected, setSelected] = useState<Selection>({
    kind: 'stop',
    id: 'kradan',
  })
  const [camera, setCamera] = useState<string | null>('Koh Kradan')

  useEffect(() => onWidth(WIDTH), [onWidth])

  // The order is not stored. It falls out of the dates, every render.
  const ordered = useMemo(
    () =>
      [...trip.stops].sort((a, b) => {
        const at = a.arrival ?? a.departure ?? ''
        const bt = b.arrival ?? b.departure ?? ''
        return at.localeCompare(bt)
      }),
    [trip.stops],
  )

  const pairs = ordered.slice(0, -1).map((from, i) => {
    const to = ordered[i + 1]
    return {
      from,
      to,
      leg: trip.legs.find((l) => l.key === `${from.id}->${to.id}`),
    }
  })

  const saveStop = (id: string, patch: Partial<Stop>) => {
    setTrip((t) => ({
      ...t,
      stops: t.stops.map((s) => (s.id === id ? { ...s, ...patch } : s)),
    }))
  }

  const saveLeg = (key: string, patch: Partial<Leg>) => {
    setTrip((t) => ({
      ...t,
      legs: t.legs.some((l) => l.key === key)
        ? t.legs.map((l) => (l.key === key ? { ...l, ...patch } : l))
        : [...t.legs, { key, mode: 'transfer', booked: false, ...patch }],
    }))
  }

  const addStop = () => {
    const id = `new-${trip.stops.length}`
    setTrip((t) => ({
      ...t,
      stops: [
        ...t.stops,
        {
          id,
          name: '',
          country: '',
          arrival: null,
          departure: null,
          lng: 0,
          lat: 0,
        },
      ],
    }))
    setSelected({ kind: 'stop', id })
  }

  const selectedStop =
    selected?.kind === 'stop'
      ? trip.stops.find((s) => s.id === selected.id)
      : undefined
  const selectedPair =
    selected?.kind === 'leg'
      ? pairs.find((p) => `${p.from.id}->${p.to.id}` === selected.key)
      : undefined

  return (
    <>
      <aside
        className="absolute inset-y-0 left-0 z-10 flex flex-col border-r border-black/10 bg-[#fbfaf7]/95 backdrop-blur-sm"
        style={{ width: WIDTH }}
      >
        <header className="border-b border-black/10 px-4 py-3">
          <h1 className="text-[13px] leading-tight font-semibold">
            {trip.name}
          </h1>
          <p className="mt-0.5 text-[10.5px] text-black/40">
            Sorted by date · drag does nothing here
          </p>
        </header>

        <div className="flex-1 overflow-y-auto py-2">
          {ordered.map((stop, i) => {
            const pair = pairs[i]
            const isSel = selected?.kind === 'stop' && selected.id === stop.id
            const legKey = pair ? `${pair.from.id}->${pair.to.id}` : null
            const legSel =
              legKey && selected?.kind === 'leg' && selected.key === legKey

            return (
              <div key={stop.id}>
                <button
                  onClick={() => {
                    setSelected({ kind: 'stop', id: stop.id })
                    setCamera(stop.name || 'the new stop')
                  }}
                  className={`flex w-full items-center gap-2.5 px-4 py-2 text-left ${
                    isSel ? 'bg-black text-white' : 'hover:bg-black/[0.04]'
                  }`}
                >
                  <span
                    className={`size-2 shrink-0 rounded-full ${
                      stop.layover
                        ? `ring-1 ${isSel ? 'ring-white/40' : 'ring-black/20'}`
                        : stop.stay?.status === 'booked'
                          ? 'bg-emerald-500'
                          : 'animate-pulse bg-amber-500'
                    }`}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12.5px] font-medium">
                      {stop.name || (
                        <span className="opacity-40">Untitled stop</span>
                      )}
                    </span>
                    <span
                      className={`block text-[10.5px] ${isSel ? 'text-white/55' : 'text-black/40'}`}
                    >
                      {stop.layover
                        ? 'layover'
                        : `${shortDate(stop.arrival)} · ${nightsAt(stop)}n`}
                    </span>
                  </span>
                </button>

                {pair && legKey && (
                  <button
                    onClick={() => {
                      setSelected({ kind: 'leg', key: legKey })
                      setCamera(`${pair.from.name} → ${pair.to.name}`)
                    }}
                    className={`flex w-full items-center gap-2 py-0.5 pl-[26px] text-left text-[10.5px] ${
                      legSel
                        ? 'font-medium text-black'
                        : 'text-black/35 hover:text-black/70'
                    }`}
                  >
                    <span className="text-black/20">│</span>
                    <span>{pair.leg ? MODE_GLYPH[pair.leg.mode] : '？'}</span>
                    <span className="truncate">
                      {pair.leg?.mode ?? 'set mode'}
                      {pair.leg?.alsoMode && ` + ${pair.leg.alsoMode}`}
                    </span>
                  </button>
                )}
              </div>
            )
          })}

          <button
            onClick={addStop}
            className="mt-2 w-full px-4 py-2 text-left text-[11.5px] text-black/40 hover:bg-black/[0.04] hover:text-black"
          >
            ＋ Add a stop
          </button>
        </div>

        <footer className="border-t border-black/10 px-4 py-2 text-[10px] leading-snug text-black/35">
          Order comes from the dates. To move a stop, change when you are there.
        </footer>
      </aside>

      {camera && (
        <div
          className="absolute top-4 z-20 rounded-full bg-black/75 px-3 py-1 text-[11px] text-white"
          style={{ left: WIDTH + 16 }}
        >
          camera → {camera}
        </div>
      )}

      {selectedStop && (
        <Card
          title={selectedStop.name || 'New stop'}
          subtitle={
            selectedStop.layover
              ? 'Layover'
              : `${nightsAt(selectedStop)} nights`
          }
          onClose={() => setSelected(null)}
        >
          <Row label="Name">
            <input
              defaultValue={selectedStop.name}
              key={`${selectedStop.id}-name`}
              onBlur={(e) =>
                saveStop(selectedStop.id, { name: e.target.value })
              }
              className="w-full rounded border border-black/15 px-2 py-1 text-[12px]"
            />
          </Row>
          <div className="flex gap-2">
            <Row label="Arrival">
              <input
                type="date"
                defaultValue={selectedStop.arrival?.slice(0, 10) ?? ''}
                key={`${selectedStop.id}-arr`}
                onBlur={(e) =>
                  saveStop(selectedStop.id, { arrival: e.target.value })
                }
                className="w-full rounded border border-black/15 px-2 py-1 text-[12px]"
              />
            </Row>
            <Row label="Departure">
              <input
                type="date"
                defaultValue={selectedStop.departure?.slice(0, 10) ?? ''}
                key={`${selectedStop.id}-dep`}
                onBlur={(e) =>
                  saveStop(selectedStop.id, { departure: e.target.value })
                }
                className="w-full rounded border border-black/15 px-2 py-1 text-[12px]"
              />
            </Row>
          </div>
          <Row label="Place">
            <div className="flex gap-2">
              <input
                readOnly
                value={
                  selectedStop.lng
                    ? `${selectedStop.lat.toFixed(4)}, ${selectedStop.lng.toFixed(4)}`
                    : ''
                }
                placeholder="search…"
                className="w-full rounded border border-black/15 bg-black/[0.03] px-2 py-1 text-[12px] text-black/60"
              />
              <button className="shrink-0 rounded border border-black/15 px-2 text-[11px]">
                Search
              </button>
            </div>
          </Row>

          {!selectedStop.layover && (
            <>
              <p className="mt-3 mb-1.5 border-t border-black/8 pt-3 text-[10px] font-semibold tracking-wide text-black/40 uppercase">
                Stay
              </p>
              <Row label="Name">
                <input
                  defaultValue={selectedStop.stay?.name ?? ''}
                  key={`${selectedStop.id}-stay`}
                  className="w-full rounded border border-black/15 px-2 py-1 text-[12px]"
                />
              </Row>
              <div className="flex gap-2">
                <Row label="Price">
                  <input
                    defaultValue={
                      selectedStop.stay?.price
                        ? money(selectedStop.stay.price)
                        : ''
                    }
                    key={`${selectedStop.id}-price`}
                    className="w-full rounded border border-black/15 px-2 py-1 text-[12px]"
                  />
                </Row>
                <Row label="Reference">
                  <input
                    defaultValue={selectedStop.stay?.reference ?? ''}
                    key={`${selectedStop.id}-ref`}
                    className="w-full rounded border border-black/15 px-2 py-1 text-[12px]"
                  />
                </Row>
              </div>
              <Row label="Google Maps link">
                <input
                  placeholder="paste to place the Stay Marker…"
                  defaultValue={
                    selectedStop.stay?.lat
                      ? `${selectedStop.stay.lat}, ${selectedStop.stay.lng}`
                      : ''
                  }
                  key={`${selectedStop.id}-link`}
                  className="w-full rounded border border-black/15 px-2 py-1 text-[12px]"
                />
              </Row>
              {selectedStop.stay?.cancelBy && (
                <p className="mt-1 text-[11px] text-red-700">
                  Free cancellation until{' '}
                  {shortDate(selectedStop.stay.cancelBy)}
                </p>
              )}
            </>
          )}
        </Card>
      )}

      {selectedPair && (
        <Card
          title={`${selectedPair.from.name} → ${selectedPair.to.name}`}
          subtitle={selectedPair.leg ? selectedPair.leg.mode : 'No mode set'}
          onClose={() => setSelected(null)}
        >
          <Row label="Mode">
            <div className="flex flex-wrap gap-1">
              {MODES.map((m) => (
                <button
                  key={m}
                  onClick={() =>
                    saveLeg(`${selectedPair.from.id}->${selectedPair.to.id}`, {
                      mode: m,
                    })
                  }
                  className={`rounded border px-2 py-1 text-[11px] ${
                    selectedPair.leg?.mode === m
                      ? 'border-black bg-black text-white'
                      : 'border-black/15'
                  }`}
                >
                  {MODE_GLYPH[m]} {m}
                </button>
              ))}
            </div>
          </Row>
          <div className="flex gap-2">
            <Row label="Departs">
              <input
                defaultValue={time(selectedPair.leg?.departAt)}
                key={`${selectedPair.from.id}-dep`}
                className="w-full rounded border border-black/15 px-2 py-1 text-[12px]"
              />
            </Row>
            <Row label="Arrives">
              <input
                defaultValue={time(selectedPair.leg?.arriveAt)}
                key={`${selectedPair.from.id}-arr`}
                className="w-full rounded border border-black/15 px-2 py-1 text-[12px]"
              />
            </Row>
          </div>
          <div className="flex gap-2">
            <Row label="Carrier">
              <input
                defaultValue={selectedPair.leg?.carrier ?? ''}
                key={`${selectedPair.from.id}-car`}
                className="w-full rounded border border-black/15 px-2 py-1 text-[12px]"
              />
            </Row>
            <Row label="Reference">
              <input
                defaultValue={selectedPair.leg?.reference ?? ''}
                key={`${selectedPair.from.id}-ref`}
                className="w-full rounded border border-black/15 px-2 py-1 text-[12px]"
              />
            </Row>
          </div>
          {selectedPair.leg?.note && (
            <p className="mt-2 text-[11px] leading-snug text-black/45">
              {selectedPair.leg.note}
            </p>
          )}
        </Card>
      )}
    </>
  )
}

function Card({
  title,
  subtitle,
  onClose,
  children,
}: {
  title: string
  subtitle: string
  onClose: () => void
  children: React.ReactNode
}) {
  return (
    <div
      className="absolute top-16 z-20 w-[340px] rounded-lg border border-black/12 bg-white shadow-[0_12px_40px_rgba(0,0,0,0.25)]"
      style={{ left: WIDTH + 40 }}
    >
      <header className="flex items-start justify-between border-b border-black/8 px-4 py-3">
        <div>
          <h2 className="text-[13px] leading-tight font-semibold">{title}</h2>
          <p className="text-[10.5px] text-black/40">{subtitle}</p>
        </div>
        <button onClick={onClose} className="text-black/30 hover:text-black">
          ✕
        </button>
      </header>
      <div className="px-4 py-3">{children}</div>
      <footer className="flex justify-end gap-2 border-t border-black/8 px-4 py-2.5">
        <button
          onClick={onClose}
          className="rounded px-3 py-1 text-[11.5px] text-black/50"
        >
          Cancel
        </button>
        <button
          onClick={onClose}
          className="rounded bg-black px-3.5 py-1 text-[11.5px] font-medium text-white"
        >
          Save
        </button>
      </footer>
    </div>
  )
}

function Row({
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
