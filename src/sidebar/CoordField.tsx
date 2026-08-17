/**
 * The one box a coordinate arrives through, and the ladder it climbs down when a paste falls short.
 *
 * Two rules hold across every rung, and the whole component is shaped by them: **the app never
 * scolds, and it never silently guesses.** A marker the traveller did not confirm standing in the
 * wrong bay is worse than being asked. So a clean paste places immediately with an Undo, a camera
 * position is offered but never taken, and every failure ends on "or click the map" — which is the
 * floor, always available, and never gated behind a failed paste.
 *
 * The rungs and their copy come from
 * [#5](https://github.com/adrianpetersson/onward/issues/5)'s specification, minus its short-link
 * resolver: Onward ships no server-side code, so a `maps.app.goo.gl` link is told the truth rather
 * than fetched ([ADR 0002](../../docs/adr/0002-no-backend-localstorage-and-one-edge-function.md)).
 *
 * **On a Stop and the Origin this box is `fallback`, and hidden until it is asked for**
 * ([#25](https://github.com/adrianpetersson/onward/issues/25)). Standing it open under the Name field
 * did not read as *the other way to place this* — it read as **the next step**. Two labelled inputs
 * stacked look like a form, and a form gets completed top to bottom, so the card asked a traveller who
 * had just typed `Copenhagen` to go and fetch a Google Maps link as well. A Stay passes no `fallback`
 * and is unchanged: search is Stops and the Origin only (#18 — `osm_tag=place` cannot find a beach
 * hut), so for a Stay this box is not the fallback, it is the only path.
 */

import { useState } from 'react'

import { formatCoord, readMapsLink, type Reading } from '../itinerary/maps-link'
import type { Coord } from '../itinerary/model'
import { usePlacing } from '../map/placing'
import { Field } from './fields'

const INPUT =
  'w-full rounded border border-black/15 bg-white px-2 py-1 text-[12px] outline-none focus:border-black/50'

export function CoordField({
  label,
  coord,
  onPlace,
  what,
  fallback = false,
  open = false,
  onOpen,
}: {
  label: string
  coord: Coord | null
  /**
   * Called with a coordinate to stand at, or `null` to go back to unplaced. `name` is the place's own
   * Google name where the link carried one — always a prefill the caller may decline, never a value
   * this field commits on its own.
   */
  onPlace: (coord: Coord | null, name: string | null) => void
  /** Named in the fallback copy, so each message says what it is about to place. */
  what: string
  /**
   * Whether something else places this thing in the ordinary case, so this box is the way out rather
   * than the way in. Opt-in, and off by default: a Stay has no search, and demoting the one field it
   * can be placed through would leave it with none.
   */
  fallback?: boolean
  /**
   * `fallback` only: whether the box is showing. Held by the card rather than here because the search
   * that fails is this field's **sibling** — see `onStuck` in `NameField`.
   */
  open?: boolean
  onOpen?: () => void
}) {
  const placing = usePlacing()
  const [typed, setTyped] = useState<string | null>(null)
  const [reading, setReading] = useState<Reading | null>(null)
  /**
   * What was there before the last placement, so a wrong paste is one click from undone. Wrapped
   * rather than bare because `null` is a legitimate thing to go back to — unplaced — and an offer to
   * undo must only appear once something has actually been placed.
   */
  const [undo, setUndo] = useState<{ was: Coord | null } | null>(null)
  /**
   * Whether *this* field is the one waiting for the click. `placing.armed` is Trip-wide, so reading it
   * directly had every field on the card announcing "click the map where the bed is" at once.
   */
  const [waiting, setWaiting] = useState(false)

  const place = (next: Coord | null, name: string | null) => {
    setUndo({ was: coord })
    setTyped(null)
    setReading(null)
    onPlace(next, name)
  }

  const read = (value: string) => {
    setTyped(value)
    const next = readMapsLink(value)
    setReading(next)

    // The box reflows to the canonical coordinate on success (`place` clears what was typed): the
    // paste has been understood, and holding a 200-character URL in the field only hides the answer.
    if (next.rung === 'place') place(next.coord, next.name)
  }

  const pick = async () => {
    setReading(null)
    setWaiting(true)
    // Resolves with `null` when the traveller pressed Escape, said never mind, or armed another
    // field instead — all three end the wait without placing anything.
    const picked = await placing.pick()
    setWaiting(false)
    if (picked) place(picked, null)
  }

  /**
   * A placed thing always shows its box, whatever `fallback` says: the coordinate in it is the
   * confirmation that the search landed where it claimed, and re-placing a Stop that came down on the
   * wrong island is the one repair nothing else offers. So only the *unplaced* card is tidied, which is
   * the only state that ever misled anyone.
   */
  const showing = !fallback || open || coord !== null

  if (!showing) {
    return (
      // "by name" rather than a bare "can't find it?" because this line is the traveller's first hint
      // that the field above searches at all — it has to make sense read on its own, and it sits a
      // date row away from the box it refers to.
      <p className="mb-2 text-[10.5px] text-black/40">
        <button onClick={onOpen} className="underline hover:text-black">
          can’t find it by name? paste a link or click the map
        </button>
      </p>
    )
  }

  return (
    <>
      <Field label={label}>
        <input
          className={INPUT}
          value={typed ?? (coord ? formatCoord(coord) : '')}
          placeholder="paste the Google Maps link, or a coordinate"
          onChange={(event) => read(event.target.value)}
        />
      </Field>

      <div className="-mt-1 mb-2 text-[10.5px] leading-relaxed">
        {waiting ? (
          <span className="text-black/60">
            Click the map where {what} is.{' '}
            <button
              onClick={placing.cancel}
              className="text-black/40 underline hover:text-black"
            >
              never mind
            </button>
          </span>
        ) : (
          <>
            {reading && <Ladder reading={reading} what={what} onUse={place} />}
            <div className="flex gap-2 text-black/40">
              <button
                onClick={pick}
                disabled={!placing.ready}
                className="underline hover:text-black disabled:no-underline disabled:opacity-50"
              >
                click the map instead
              </button>
              {undo && (
                <button
                  onClick={() => {
                    onPlace(undo.was, null)
                    setUndo(null)
                    setTyped(null)
                    setReading(null)
                  }}
                  className="underline hover:text-black"
                >
                  undo
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </>
  )
}

/**
 * What to say about a paste that did not simply work.
 *
 * Every message names the repair and none of them apologises. Rung 0 says nothing at all — the
 * coordinate now sitting in the box above is the whole of the feedback.
 */
function Ladder({
  reading,
  what,
  onUse,
}: {
  reading: Reading
  what: string
  onUse: (coord: Coord, name: string | null) => void
}) {
  switch (reading.rung) {
    case 'place':
      return null

    case 'camera':
      return (
        <p className="mb-1 text-amber-700">
          That link points at a map view, not a place —{' '}
          {formatCoord(reading.coord)} is where the camera was, which is often
          not where {what} is.{' '}
          <button
            onClick={() => onUse(reading.coord, reading.name)}
            className="underline hover:text-black"
          >
            use it anyway
          </button>
          , or click the map.
        </p>
      )

    case 'identity':
      return (
        <p className="mb-1 text-amber-700">
          I can see which place this is
          {reading.name ? ` — ${reading.name} — ` : ' '}
          but the link carries no position.{' '}
          {reading.openUrl && (
            <>
              <a
                href={reading.openUrl}
                target="_blank"
                rel="noreferrer"
                className="underline hover:text-black"
              >
                Open it in Google Maps
              </a>
              , share again from the place’s own page, or{' '}
            </>
          )}
          click the map.
        </p>
      )

    case 'directions':
      return (
        <p className="mb-1 text-amber-700">
          That’s a directions link — it has a start and an end, and {what} is
          one place. Paste a link to the place itself, or click the map.
        </p>
      )

    case 'short-link':
      return (
        <p className="mb-1 text-amber-700">
          A <code>maps.app.goo.gl</code> link can’t be read in a browser, and
          Onward has no server to read it for you. Open it, then copy the full
          URL out of the address bar — or click the map.
        </p>
      )

    case 'unrecognised':
      return (
        <p className="mb-1 text-black/50">
          That doesn’t look like a Google Maps link. Coordinates work too —{' '}
          <code>7.3032, 99.2553</code> — or click the map.
        </p>
      )
  }
}
