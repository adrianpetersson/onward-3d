/**
 * The sidebar: the only door data enters Onward through.
 *
 * The Itinerary is one ribbon — Origin, then a Leg and a Stop alternating all the way down, then the
 * Leg home. Legs read as the things *between* Stops because that is what they are, and because a Leg
 * is stored on the Stop it arrives at, dragging a Stop takes its Leg with it
 * ([ADR 0003](../../docs/adr/0003-a-leg-is-stored-on-the-stop-it-arrives-at.md)).
 *
 * It **overlays** the Diorama rather than pushing it: the map is the interface, and narrowing it to
 * make room for administration would be the wrong trade every time. Nothing here touches the map
 * until Save.
 */

import { useState } from 'react'

import {
  orderConflicts,
  tripEnd,
  tripNights,
  tripStart,
} from '../itinerary/derive'
import type { Trip } from '../itinerary/model'
import { CoordField } from './CoordField'
import { Field, Text, shortDate } from './fields'
import { LegCard } from './LegCard'
import { StopCard } from './StopCard'
import { RETURN_LEG, useItinerary } from './use-itinerary'

export function Sidebar({
  trip,
  onSave,
}: {
  trip: Trip
  onSave: (trip: Trip) => void
}) {
  const { draft, unsaved, dispatch, save, discard } = useItinerary(trip)
  const [open, setOpen] = useState(true)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [dragging, setDragging] = useState<number | null>(null)

  const conflicts = new Set(orderConflicts(draft))
  const nights = tripNights(draft)

  const toggle = (key: string) =>
    setExpanded((current) => (current === key ? null : key))

  const commit = () => {
    save()
    onSave(draft)
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="absolute top-4 left-4 z-10 rounded bg-white/95 px-3 py-2 text-[13px] font-medium shadow-lg"
      >
        ☰ Itinerary
      </button>
    )
  }

  return (
    <aside className="absolute inset-y-0 left-0 z-10 flex w-[420px] flex-col bg-[#fbfaf7]/97 shadow-[4px_0_24px_rgba(0,0,0,0.18)] backdrop-blur-sm">
      <header className="flex items-start justify-between border-b border-black/10 px-5 py-4">
        <div className="min-w-0 flex-1">
          <input
            value={draft.name}
            placeholder="Name this trip"
            onChange={(e) =>
              dispatch({ type: 'edit-trip', patch: { name: e.target.value } })
            }
            className="w-full bg-transparent text-[15px] leading-tight font-semibold outline-none placeholder:text-black/25"
          />
          <p className="mt-0.5 text-[11px] text-black/45">
            {draft.stops.length === 0 ? (
              'No stops yet'
            ) : (
              <>
                {draft.stops.length}{' '}
                {draft.stops.length === 1 ? 'stop' : 'stops'}
                {/*
                 * A dragged order that contradicts the dates makes the span run backwards, and
                 * "-4 nights" is not a fact about anybody's trip. The order still wins and still
                 * draws (that is the ruling); the header just stops claiming a span it cannot
                 * honestly compute and points at the Stops carrying the ⚠ instead.
                 */}
                {conflicts.size > 0 ? (
                  <span className="text-amber-700">
                    {' · '}
                    {conflicts.size} {conflicts.size === 1 ? 'stop' : 'stops'}{' '}
                    out of step with the dates
                  </span>
                ) : (
                  <>
                    {nights === null ? '' : ` · ${nights} nights`} ·{' '}
                    {shortDate(tripStart(draft))} – {shortDate(tripEnd(draft))}
                  </>
                )}
              </>
            )}
          </p>
        </div>
        <button
          onClick={() => setOpen(false)}
          className="pl-3 text-black/40 hover:text-black"
        >
          ✕
        </button>
      </header>

      <div className="flex-1 overflow-y-auto px-5 py-4">
        <OriginRow trip={draft} dispatch={dispatch} />

        {draft.stops.map((stop, i) => (
          <div key={stop.id}>
            <div className="py-1 pl-[26px]">
              <LegCard
                leg={stop.inbound}
                target={stop.id}
                label={stop.name ? `to ${stop.name}` : 'to this stop'}
                open={expanded === `leg:${stop.id}`}
                onToggle={() => toggle(`leg:${stop.id}`)}
                dirty={false}
                dispatch={dispatch}
              />
            </div>

            <StopCard
              stop={stop}
              open={expanded === stop.id}
              onToggle={() => toggle(stop.id)}
              dirty={false}
              conflicted={conflicts.has(stop.id)}
              dispatch={dispatch}
              dragging={dragging === i}
              onDragStart={() => setDragging(i)}
              onDrop={() => {
                if (dragging !== null)
                  dispatch({ type: 'move-stop', from: dragging, to: i })
                setDragging(null)
              }}
            />

            <div className="group/gap relative h-4">
              <button
                onClick={() => dispatch({ type: 'insert-stop', after: i })}
                title="Insert a stop here"
                className="absolute top-0 left-0 hidden size-5 items-center justify-center rounded-full border border-black/15 bg-white text-[11px] text-black/50 group-hover/gap:flex"
              >
                ＋
              </button>
            </div>
          </div>
        ))}

        {draft.stops.length === 0 ? (
          <button
            onClick={() => dispatch({ type: 'insert-stop', after: -1 })}
            className="mt-2 w-full rounded border border-dashed border-black/20 py-3 text-[12px] text-black/45 hover:border-black/40 hover:text-black"
          >
            ＋ Add the first stop
          </button>
        ) : (
          <div className="pl-[26px]">
            <LegCard
              leg={
                draft.returnLeg ?? {
                  ...draft.stops[0].inbound,
                  mode: null,
                  booking: null,
                }
              }
              target={RETURN_LEG}
              label="home"
              open={expanded === 'leg:return'}
              onToggle={() => toggle('leg:return')}
              dirty={false}
              dispatch={dispatch}
            />
            {draft.origin && (
              <p className="py-1 pl-4 text-[11px] text-black/45">
                ↩ {draft.origin.name}
              </p>
            )}
          </div>
        )}
      </div>

      <footer className="flex items-center justify-between border-t border-black/10 bg-white/60 px-5 py-3">
        <span className="text-[11px] text-black/50">
          {unsaved === 0
            ? 'No unsaved changes'
            : `${unsaved} unsaved change${unsaved === 1 ? '' : 's'}`}
        </span>
        <div className="flex gap-2">
          <button
            onClick={discard}
            disabled={unsaved === 0}
            className="rounded px-3 py-1.5 text-[12px] text-black/50 hover:bg-black/5 disabled:opacity-40"
          >
            Discard
          </button>
          <button
            onClick={commit}
            disabled={unsaved === 0}
            className="rounded bg-black px-4 py-1.5 text-[12px] font-medium text-white disabled:bg-black/20"
          >
            Save &amp; redraw
          </button>
        </div>
      </footer>
    </aside>
  )
}

/** Home. It opens the ribbon and closes it, and it is never a Stop. */
function OriginRow({
  trip,
  dispatch,
}: {
  trip: Trip
  dispatch: React.Dispatch<import('./use-itinerary').Action>
}) {
  const [open, setOpen] = useState(false)

  return (
    <div className="mb-1">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-3 rounded px-3 py-2 text-left hover:bg-black/[0.03]"
      >
        <span className="w-3 text-center text-black/30">⌂</span>
        <span className="flex-1 text-[12px] text-black/55">
          {/* Placing home by pasting a link creates an Origin before it has a name, so the prompt
              stands until the name does. */}
          {trip.origin?.name || (
            <span className="text-black/30">Where do you set off from?</span>
          )}
        </span>
      </button>

      {open && (
        <div className="mb-2 rounded-md border border-black/15 bg-white px-3 py-3">
          <Field label="Home">
            <Text
              value={trip.origin?.name ?? null}
              placeholder="Copenhagen"
              onChange={(name) =>
                dispatch({
                  type: 'edit-trip',
                  patch: {
                    origin: name
                      ? {
                          name,
                          lng: trip.origin?.lng ?? 0,
                          lat: trip.origin?.lat ?? 0,
                        }
                      : null,
                  },
                })
              }
            />
          </Field>
          <CoordField
            label="Where it is"
            what="home"
            coord={trip.origin && trip.origin.lat !== 0 ? trip.origin : null}
            onPlace={(coord, name) =>
              dispatch({
                type: 'edit-trip',
                patch: {
                  origin: {
                    name: trip.origin?.name || name || '',
                    lng: coord?.lng ?? 0,
                    lat: coord?.lat ?? 0,
                  },
                },
              })
            }
          />
          <p className="text-[10.5px] text-black/40">
            The long-haul out and the long-haul home are drawn from here. It is
            never a Stop — you do not sleep at home on this trip.
          </p>
        </div>
      )}
    </div>
  )
}
