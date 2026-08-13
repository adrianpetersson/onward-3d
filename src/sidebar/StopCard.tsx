/** A Stop in the ribbon: the marker, the dates, and the form it opens into. */

import type { Dispatch } from 'react'

import { markerAt, nightsAt, perNight } from '../itinerary/derive'
import type { Coord, Stay, StayStatus, Stop } from '../itinerary/model'
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

/** Reads a "lat, lng" paste, or the `!3d…!4d…` pair out of a Google Maps address-bar URL. */
export function parseCoord(input: string): Coord | null {
  const fromUrl = input.match(/!3d(-?\d+\.?\d*)!4d(-?\d+\.?\d*)/)
  if (fromUrl) return { lat: Number(fromUrl[1]), lng: Number(fromUrl[2]) }

  const bare = input.trim().match(/^(-?\d+\.?\d*)\s*,\s*(-?\d+\.?\d*)$/)
  if (bare) return { lat: Number(bare[1]), lng: Number(bare[2]) }

  return null
}

function Marker({ stop }: { stop: Stop }) {
  const marker = markerAt(stop)
  const shape =
    marker.kind === 'stay-marker'
      ? 'size-2.5 rounded-[2px] bg-emerald-600'
      : 'size-2.5 rounded-full bg-amber-500'

  return (
    <span
      title={
        marker.kind === 'stay-marker'
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
  dispatch: Dispatch<Action>
  onDragStart: () => void
  onDrop: () => void
  dragging: boolean
}) {
  const edit = (patch: Partial<Stop>) =>
    dispatch({ type: 'edit-stop', id: stop.id, patch })
  const nights = nightsAt(stop)
  const placed = stop.coord.lat !== 0 || stop.coord.lng !== 0

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
          <Field label="Name">
            <Text value={stop.name} onChange={(v) => edit({ name: v ?? '' })} />
          </Field>

          <div className="flex gap-2">
            <Field label="Arrival">
              <DateInput
                value={stop.arrival}
                onChange={(v) => edit({ arrival: v })}
              />
            </Field>
            <Field label="Departure">
              <DateInput
                value={stop.departure}
                onChange={(v) => edit({ departure: v })}
              />
            </Field>
            <div className="w-16 shrink-0">
              <Derived label="Nights" value={nights ?? '—'} />
            </div>
          </div>

          <Field label="Where it is">
            <Text
              value={placed ? `${stop.coord.lat}, ${stop.coord.lng}` : null}
              placeholder="paste a coordinate or a Google Maps link"
              onChange={(v) => {
                const coord = v ? parseCoord(v) : null
                if (coord) edit({ coord })
              }}
            />
          </Field>
          {!placed && (
            <p className="-mt-1 mb-2 text-[10.5px] text-black/40">
              Nothing is drawn until this Stop has a coordinate.
            </p>
          )}

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
          onClick={() =>
            dispatch({ type: 'remove-stay', stopId: stop.id, index })
          }
          className="ml-auto text-[10.5px] text-black/30 hover:text-red-700"
        >
          remove
        </button>
      </div>

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

      <Field label="Where the bed actually is">
        <Text
          value={stay.coord ? `${stay.coord.lat}, ${stay.coord.lng}` : null}
          placeholder="paste the Google Maps link"
          onChange={(v) => {
            const coord = v ? parseCoord(v) : null
            if (coord) edit({ coord })
          }}
        />
      </Field>
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
      />
    </div>
  )
}
