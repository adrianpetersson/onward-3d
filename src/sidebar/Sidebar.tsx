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
import { shortDate } from './fields'
import { LegCard } from './LegCard'
import { NameField } from './NameField'
import { StopCard } from './StopCard'
import { RETURN_LEG, useItinerary } from './use-itinerary'

export function Sidebar({
  trip,
  onSave,
  storage,
}: {
  trip: Trip
  /** Persisting is async now (#12), and deliberately not waited on — see `use-store.ts`. */
  onSave: (trip: Trip) => void | Promise<void>
  /** What the footer says about where the trip lives. Composed by `App`, placed here. */
  storage?: React.ReactNode
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
    // Both synchronous, and both before anything is awaited: the draft is committed and the map
    // redraws now, while the store writes the cache and then goes after the file (#12, Q9).
    save()
    void onSave(draft)
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="absolute top-[18px] left-[18px] z-10 rounded-[10px] bg-[#fcfaf5]/93 px-3 py-2 text-[13px] font-medium shadow-[0_8px_24px_rgba(40,36,28,0.28)] backdrop-blur-[10px]"
      >
        ☰ Itinerary
      </button>
    )
  }

  /*
   * It floats: inset from all three edges, rounded, and casting its own shadow onto the Diorama
   * rather than butting against it. #11 compared this against a full-height flush panel and against
   * a solid opaque one, and the floating card is the only one that reads as an object lying *on* the
   * world instead of a wall standing beside it — which is the right relationship, because the map is
   * the interface and this is administration resting on top of it.
   *
   * The translucency is doing real work and is not decoration: at 93% over a blur you can still see
   * the terrain moving underneath while you drag a Stop, so the panel never fully hides the thing it
   * is editing.
   */
  return (
    <aside className="absolute inset-y-[18px] left-[18px] z-10 flex w-[400px] flex-col overflow-hidden rounded-2xl bg-[#fcfaf5]/93 shadow-[0_18px_48px_rgba(40,36,28,0.32),0_2px_6px_rgba(40,36,28,0.18)] backdrop-blur-[10px]">
      <header className="flex items-start justify-between border-b border-[#2b2b28]/10 bg-white/50 px-5 py-4">
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

      {/*
       * `items-start`, and the left column wraps, because the storage line sits under the unsaved
       * count rather than beside it — #11's palette on the border and fill, #12's layout inside.
       */}
      <footer className="flex items-start justify-between gap-3 border-t border-[#2b2b28]/10 bg-white/50 px-5 py-3">
        <div className="min-w-0 flex-1">
          <span className="text-[11px] text-black/50">
            {unsaved === 0
              ? 'No unsaved changes'
              : `${unsaved} unsaved change${unsaved === 1 ? '' : 's'}`}
          </span>
          {storage}
        </div>
        <div className="flex shrink-0 gap-2">
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
  // `{ lng: 0, lat: 0 }` is the not-yet-placed sentinel the whole app reads, so both halves are
  // checked — the same test `StopCard` uses. This box and the coordinate box below must agree about
  // whether home has been placed, or one would offer search while the other showed a coordinate.
  const placed =
    !!trip.origin && (trip.origin.lat !== 0 || trip.origin.lng !== 0)

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
          <NameField
            label="Home"
            what="home"
            value={trip.origin?.name ?? null}
            placeholder="Copenhagen"
            searchable={!placed}
            onChange={(name) =>
              dispatch({
                type: 'edit-trip',
                patch: {
                  // Emptying the name must not delete the place. This used to collapse the whole
                  // Origin to `null` the moment the box went blank — so a select-all-and-retype over
                  // a home that had already been placed threw its coordinate away silently, and then
                  // (because `placed` is derived from it) re-armed search over the empty field. An
                  // Origin only becomes nothing when there is nothing left of it: no name *and* no
                  // coordinate.
                  origin:
                    name || placed
                      ? {
                          name: name ?? '',
                          lng: trip.origin?.lng ?? 0,
                          lat: trip.origin?.lat ?? 0,
                        }
                      : null,
                },
              })
            }
            // An Origin is a city, so it searches exactly like a Stop — but it does not keep the
            // Footprint. A Footprint exists so the camera can frame a Stop it flies to, and the camera
            // never flies home: the Origin is where the long-haul starts, not somewhere you arrive.
            onFind={(find) =>
              dispatch({
                type: 'edit-trip',
                patch: {
                  origin: {
                    name: trip.origin?.name ?? '',
                    lng: find.coord.lng,
                    lat: find.coord.lat,
                  },
                },
              })
            }
          />
          <CoordField
            label="Where it is"
            what="home"
            coord={placed ? trip.origin : null}
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
