/** A Stop in the ribbon: the marker, the dates, and the form it opens into. */

import { useCallback, useState, type Dispatch } from 'react'

import {
  lossesOfStay,
  lossesOfStop,
  markerAt,
  nightsAt,
  perNight,
  today,
} from '../itinerary/derive'
import type { Stay, StayStatus, Stop } from '../itinerary/model'
import { CoordField } from './CoordField'
import { LossPanel, useRemoving } from './Removing'
import { NameField } from './NameField'
import {
  DateInput,
  Derived,
  Field,
  MoneyInput,
  Text,
  money,
  shortDate,
} from './fields'
import { BookingFields } from './LegCard'
import type { Action } from './use-itinerary'

const STATUSES: { value: StayStatus; label: string; hint: string }[] = [
  {
    value: 'booked',
    label: 'Booked',
    hint: 'Confirmed. This is where you sleep.',
  },
  {
    value: 'placeholder',
    label: 'Placeholder',
    hint: 'Really booked, but held only so the dates cannot sell out — you mean to replace it.',
  },
  {
    value: 'shortlisted',
    label: 'Shortlisted',
    hint: 'A target. Nothing committed.',
  },
]

/**
 * The row's echo of what the map is standing at this Stop.
 *
 * A square where a building rises, a circle where the Pin is the whole marker — which is #9's shape
 * rather than the old Pin-or-building one: every Stop has a Pin now, so the square means "and a
 * building too" rather than "instead".
 */
function Marker({ stop }: { stop: Stop }) {
  const marker = markerAt(stop)
  const shape = marker.building
    ? 'size-2.5 rounded-[2px] bg-emerald-600'
    : 'size-2.5 rounded-full bg-amber-500'

  return (
    <span
      title={
        marker.building
          ? marker.jumping
            ? 'Booked, but not placed yet — paste a link and the building moves to its own beach'
            : 'Booked and placed'
          : 'Nothing booked here yet'
      }
      className={`${shape} shrink-0 ${marker.pulsing ? 'animate-pulse' : ''} ${
        marker.jumping ? 'animate-bounce' : ''
      }`}
    />
  )
}

export function StopCard({
  stop,
  open,
  onToggle,
  dirty,
  conflicted,
  floor,
  dispatch,
  onDragStart,
  onDrop,
  dragging,
}: {
  stop: Stop
  open: boolean
  onToggle: () => void
  dirty: boolean
  conflicted: boolean
  /** The last date known before this Stop — see `dateFloor`. Anchors both pickers. */
  floor: string | null
  dispatch: Dispatch<Action>
  onDragStart: () => void
  onDrop: () => void
  dragging: boolean
}) {
  const edit = (patch: Partial<Stop>) =>
    dispatch({ type: 'edit-stop', id: stop.id, patch })
  const nights = nightsAt(stop)
  const placed = stop.coord.lat !== 0 || stop.coord.lng !== 0
  /**
   * Whether the traveller has asked for the coordinate box, or a failed search has asked on their
   * behalf. Held here because the search and the box are two components and this is the one thing that
   * sees both. Stable so a message that stays on screen does not re-fire the reveal every render.
   */
  const [showCoord, setShowCoord] = useState(false)
  const revealCoord = useCallback(() => setShowCoord(true), [])
  const losses = lossesOfStop(stop, today())
  const removing = useRemoving(losses)

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDrop}
      className={`group rounded-md border transition ${
        open
          ? 'border-black/20 bg-white shadow-sm'
          : 'border-transparent hover:bg-black/[0.03]'
      } ${dragging ? 'opacity-40' : ''}`}
    >
      <button
        onClick={onToggle}
        className="flex w-full items-center gap-3 px-3 py-2.5 text-left"
      >
        <span className="cursor-grab text-black/20 group-hover:text-black/40">
          ⣿
        </span>
        <Marker stop={stop} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-medium">
            {stop.name || <span className="text-black/30">Untitled stop</span>}
            {dirty && <span className="ml-1.5 text-amber-600">•</span>}
          </span>
          <span className="block text-[11px] text-black/45">
            {stop.arrival || stop.departure
              ? `${shortDate(stop.arrival)} – ${shortDate(stop.departure)}${
                  nights === null
                    ? ''
                    : ` · ${nights} ${nights === 1 ? 'night' : 'nights'}`
                }`
              : 'no dates yet'}
          </span>
        </span>
        {conflicted && (
          <span
            title="This Stop arrives before the one above it. The order you dragged is what draws."
            className="shrink-0 text-[11px] text-amber-600"
          >
            ⚠
          </span>
        )}
        <span className="text-[10px] text-black/30">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="border-t border-black/8 px-3 py-3">
          <NameField
            label="Name"
            what="this stop"
            value={stop.name}
            placeholder="Koh Mook"
            // Once it stands somewhere, this is a plain text field again: renaming a placed Stop must
            // never be able to move it.
            searchable={!placed}
            // A nameless Stop's card opens onto its name — mostly this is the card the ＋ button just
            // made, and the click that made it should land where the typing starts (#27).
            autoFocus={!stop.name}
            onChange={(v) => edit({ name: v ?? '' })}
            // The name stays exactly as typed. Only the position and the size are taken.
            onFind={(find) =>
              edit({ coord: find.coord, footprint: find.footprint })
            }
            onStuck={revealCoord}
          />

          <div className="flex gap-2">
            <Field label="Arrival">
              {/* The Stop in front of this one. `null` on the first, where today is the honest guess. */}
              <DateInput
                value={stop.arrival}
                onChange={(v) => edit({ arrival: v })}
                min={floor}
              />
            </Field>
            <Field label="Departure">
              {/*
               * Its own arrival first — a departure follows the arrival it belongs to, and a Stop is
               * left on or after the day it is reached. Only while this Stop has no arrival does it
               * fall back to the Stop in front, so the chain still anchors on a half-filled trip.
               */}
              <DateInput
                value={stop.departure}
                onChange={(v) => edit({ departure: v })}
                min={stop.arrival ?? floor}
              />
            </Field>
            <div className="w-16 shrink-0">
              <Derived label="Nights" value={nights ?? '—'} />
            </div>
          </div>

          {/*
           * Only once it has a name. A card that says `Copenhagen` and has never been placed is the
           * one that reads as finished when it is not — the traveller typed the name, saw it in the
           * header and on the Leg above, and nothing says the map has no Pin for it. An *empty* card
           * needs no warning that nothing is drawn yet, and putting one there would hand a first-run
           * Stop two lines of muted text under its only input, which is the clutter #25 removed.
           */}
          {!placed && stop.name && (
            <p className="mb-2 text-[10.5px] text-black/45">
              Not placed yet, so nothing is drawn for it.
            </p>
          )}

          <CoordField
            label="Where it is"
            what="this stop"
            fallback
            open={showCoord}
            onOpen={revealCoord}
            coord={placed ? stop.coord : null}
            onPlace={(coord, name) =>
              edit({
                // A Stop's coordinate is not nullable — a Stop that cannot be drawn cannot exist —
                // so unplaced is the origin of the world rather than `null`.
                coord: coord ?? { lng: 0, lat: 0 },
                // A pasted link and a click know where, never how big — and a Footprint left over
                // from an earlier search describes a *different* place the moment the coordinate
                // moves. Better none than one drawn around the wrong island.
                footprint: null,
                ...(name && !stop.name ? { name } : {}),
              })
            }
          />

          <div className="mt-3 border-t border-black/8 pt-3">
            <div className="mb-1.5 flex items-baseline justify-between">
              <span className="text-[10px] font-semibold tracking-wide text-black/40 uppercase">
                Stays
              </span>
              <button
                onClick={() => dispatch({ type: 'add-stay', stopId: stop.id })}
                className="text-[10.5px] text-black/45 hover:text-black"
              >
                ＋ add
              </button>
            </div>

            {stop.stays.length === 0 && (
              <p className="text-[11px] text-black/35 italic">
                Nowhere to sleep yet. This Stop draws a pulsing Pin.
              </p>
            )}

            {stop.stays.map((stay, index) => (
              <StayFields
                key={index}
                stay={stay}
                stop={stop}
                index={index}
                dispatch={dispatch}
              />
            ))}
          </div>

          {/*
           * The way out of the Itinerary, and it lives *inside* the open card on purpose: a removal
           * in the always-visible row would be one stray click away at every scroll position, and
           * this is the one control in the sidebar that can destroy a booking you cannot re-derive.
           */}
          <div className="mt-3 flex justify-end border-t border-black/8 pt-2.5">
            <button
              onClick={() =>
                removing.attempt(() =>
                  dispatch({ type: 'remove-stop', id: stop.id }),
                )
              }
              className="text-[10.5px] text-black/35 hover:text-red-700"
            >
              remove this stop
            </button>
          </div>
          {removing.confirming && (
            <LossPanel
              heading={`Removing ${stop.name || 'this stop'} takes ${
                losses.length === 1 ? 'a booking' : `${losses.length} bookings`
              } with it.`}
              losses={losses}
              confirmLabel="Remove anyway"
              onRemove={() => dispatch({ type: 'remove-stop', id: stop.id })}
              onDismiss={removing.dismiss}
            />
          )}
        </div>
      )}
    </div>
  )
}

function StayFields({
  stay,
  stop,
  index,
  dispatch,
}: {
  stay: Stay
  stop: Stop
  index: number
  dispatch: Dispatch<Action>
}) {
  const edit = (patch: Partial<Stay>) =>
    dispatch({ type: 'edit-stay', stopId: stop.id, index, patch })

  const rate = perNight(stay, stop)
  const losses = lossesOfStay(stay, today())
  const removing = useRemoving(losses)
  const remove = () => dispatch({ type: 'remove-stay', stopId: stop.id, index })

  return (
    <div className="mb-2 rounded border border-black/12 px-2.5 py-2">
      <div className="mb-1.5 flex gap-1">
        {STATUSES.map((s) => (
          <button
            key={s.value}
            title={s.hint}
            onClick={() => edit({ status: s.value })}
            className={`rounded px-2 py-0.5 text-[10.5px] ${
              stay.status === s.value
                ? 'bg-black text-white'
                : 'bg-black/5 text-black/55'
            }`}
          >
            {s.label}
          </button>
        ))}
        <button
          onClick={() => removing.attempt(remove)}
          className="ml-auto text-[10.5px] text-black/30 hover:text-red-700"
        >
          remove
        </button>
      </div>

      {removing.confirming && (
        <LossPanel
          heading={`Removing ${stay.name || 'this stay'} takes its booking with it.`}
          losses={losses}
          confirmLabel="Remove anyway"
          onRemove={remove}
          onDismiss={removing.dismiss}
        />
      )}

      <Field label="Name">
        <Text
          value={stay.name}
          onChange={(v) => edit({ name: v ?? '' })}
          placeholder="Ao Niang Beach Resort"
        />
      </Field>

      <div className="flex gap-2">
        <Field label="Price">
          <MoneyInput value={stay.price} onChange={(v) => edit({ price: v })} />
        </Field>
        <div className="flex-1">
          <Derived
            label="Per night"
            value={
              rate === null
                ? '—'
                : money({
                    amount: Math.round(rate * 100) / 100,
                    currency: stay.price!.currency,
                  })
            }
          />
        </div>
      </div>

      <CoordField
        label="Where the bed actually is"
        what="the bed"
        coord={stay.coord}
        onPlace={(coord, name) =>
          // The name Google carries is offered only into an empty field: a Stay the traveller has
          // already named is named, and "Ao-nieng" is a transliteration of what they booked.
          edit({ coord, ...(name && !stay.name ? { name } : {}) })
        }
      />
      {stay.booking && !stay.coord && (
        <p className="-mt-1 mb-2 text-[10.5px] text-amber-700">
          Booked, but standing on the Stop’s centre — it will jump until you
          place it.
        </p>
      )}

      <BookingFields
        booking={stay.booking}
        onChange={(booking) => edit({ booking })}
        what="this stay"
        kind="stay"
        name={stay.name}
        price={stay.price}
      />
    </div>
  )
}
