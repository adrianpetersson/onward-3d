/**
 * The name of a Stop, and — while it has nowhere to stand — the box you find it in.
 *
 * Search lives here rather than beside the coordinate because **the name and the search query are the
 * same string**. Putting it in the coordinate box below would have the traveller type `Ao Nang` twice,
 * the second time into a field whose placeholder asks for a URL.
 *
 * Two rules shape the rest, and both come out of
 * [#18](https://github.com/adrianpetersson/onward/issues/18):
 *
 * **Picking a result never touches the text.** It lands a coordinate and a Footprint, and leaves
 * `Koh Mook` saying `Koh Mook`. OSM calls it `Ko Muk`, which is on the row that was picked and on the
 * map's own labels ([#11](https://github.com/adrianpetersson/onward/issues/11)) — both true, neither
 * overwriting a field the traveller owns. Adopting OSM's name would also rename `Ao Nang` to
 * `Ban Ao Nang`, which is what nobody calls it.
 *
 * **Search stops the moment the Stop is placed.** `searchable` goes false and this becomes a plain
 * text field again. Otherwise every later rename would open a dropdown over a Stop that was placed
 * correctly weeks ago, one stray Enter from silently moving a Stay Marker off its beach — the same
 * shape as the quiet data loss [#12](https://github.com/adrianpetersson/onward/issues/12)'s review
 * turned up. Re-placing a Stop is the coordinate box's job, which is where it belongs.
 */

import { useEffect, useState } from 'react'

import {
  MIN_QUERY,
  searchPlaces,
  type Find,
  type SearchOutcome,
} from '../itinerary/search'
import { Field } from './fields'

/**
 * Long enough that typing a name is one search rather than eight, short enough that the list is there
 * by the time you have stopped. Photon is built for typeahead — its own tagline is "search-as-you-type"
 * — so the restraint here is about being a fair guest on a donated endpoint, not about permission.
 */
const DEBOUNCE_MS = 350

/** How many rows the list shows. See the note where it is applied. */
const MAX_ROWS = 6

const INPUT =
  'w-full rounded border border-black/15 bg-white px-2 py-1 text-[12px] outline-none focus:border-black/50'

export function NameField({
  label,
  value,
  placeholder,
  searchable,
  what,
  onChange,
  onFind,
}: {
  label: string
  value: string | null
  placeholder?: string
  /** False once the thing has a coordinate — see the note above. */
  searchable: boolean
  /** Named in the copy, so each message says what it is about to place. */
  what: string
  onChange: (value: string | null) => void
  /** The traveller picked a row. The caller takes its coordinate and Footprint, never its name. */
  onFind: (find: Find) => void
}) {
  /**
   * The answer **and the question it answers**.
   *
   * Keeping the query beside the result is what makes a stale list impossible. Holding the outcome
   * alone left the previous query's rows on screen for the whole 350 ms a new query is debouncing —
   * so typing `Ko Lipe`, then clearing it and typing `Bangkok`, and pressing Enter before the pause
   * elapsed, placed Bangkok on Ko Lipe. Rendering is gated on the two matching, so a result can only
   * ever be shown against the text it was fetched for.
   */
  const [answer, setAnswer] = useState<{
    query: string
    outcome: SearchOutcome
  } | null>(null)
  const [active, setActive] = useState(0)
  /**
   * Whether the traveller has typed here since the field last went quiet — the difference between a
   * query and a name that merely happens to be sitting in the box.
   *
   * Without it the effect fires on **mount**, so simply opening a saved Stop that has a name but no
   * coordinate sent two requests and popped a dropdown nobody asked for. It also does the cancelling:
   * dismissing sets it false, which changes the effect's dependencies and runs its cleanup, so Escape
   * genuinely aborts the pending request instead of leaving it to reopen the list 350 ms later.
   */
  const [typing, setTyping] = useState(false)

  const query = value?.trim() ?? ''

  useEffect(() => {
    // Nothing to clear on the way out: what is shown is *derived* below from whether the answer still
    // matches the question. A shorter query, a dismissal or a placement all stop it being shown
    // without anyone having to remember to unset it.
    if (!typing || !searchable || query.length < MIN_QUERY) return

    const controller = new AbortController()
    const timer = setTimeout(() => {
      searchPlaces(query, controller.signal)
        .then((outcome) => {
          if (!controller.signal.aborted) {
            setAnswer({ query, outcome })
            setActive(0)
          }
        })
        // The only rejection is an abort, which means a newer keystroke has already taken over.
        .catch(() => {})
    }, DEBOUNCE_MS)

    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [query, searchable, typing])

  const outcome =
    typing && searchable && answer?.query === query ? answer.outcome : null

  /**
   * Two queries of five can offer ten rows, and `Koh Lipe` really does — one island and nine hamlets
   * in Liberia, Kosovo, Slovakia and Poland. The ranking rule puts the island first; this stops the
   * tail of near-misses burying the rest of the card while it does.
   */
  const finds =
    outcome?.state === 'found' ? outcome.finds.slice(0, MAX_ROWS) : []

  /** Close the list, cancel whatever is in flight, and wait to be typed at again. */
  const dismiss = () => {
    setTyping(false)
    setAnswer(null)
  }

  const pick = (find: Find) => {
    dismiss()
    onFind(find)
  }

  return (
    <>
      <Field label={label}>
        <input
          className={INPUT}
          value={value ?? ''}
          placeholder={placeholder}
          autoComplete="off"
          onChange={(event) => {
            setTyping(true)
            onChange(event.target.value || null)
          }}
          // Clicking a row cannot blur — its `mousedown` calls `preventDefault` — so leaving the
          // field is unambiguously "never mind", and a list left open over a card is not a state the
          // traveller has to find a way out of.
          onBlur={dismiss}
          onKeyDown={(event) => {
            if (event.key === 'Escape') return dismiss()
            if (finds.length === 0) return

            if (event.key === 'ArrowDown') {
              event.preventDefault()
              setActive((at) => (at + 1) % finds.length)
            } else if (event.key === 'ArrowUp') {
              event.preventDefault()
              setActive((at) => (at - 1 + finds.length) % finds.length)
            } else if (event.key === 'Enter') {
              event.preventDefault()
              pick(finds[active])
            }
          }}
        />
      </Field>

      {searchable && outcome && (
        <div className="-mt-1 mb-2">
          {outcome.state === 'found' && (
            <ul className="overflow-hidden rounded border border-black/15 bg-white shadow-sm">
              {finds.map((find, index) => (
                <li key={find.id}>
                  <button
                    // `mousedown`, not `click`: the input's blur would otherwise tear the list down
                    // before the click landed, and the row under the cursor would do nothing.
                    onMouseDown={(event) => {
                      event.preventDefault()
                      pick(find)
                    }}
                    onMouseEnter={() => setActive(index)}
                    className={`block w-full px-2 py-1.5 text-left text-[12px] ${
                      index === active ? 'bg-black/[0.06]' : ''
                    }`}
                  >
                    <span className="font-medium">{find.name}</span>
                    <span className="text-black/40"> · {find.kind}</span>
                    {/* Four George Towns exist, and only this tells them apart. */}
                    {find.where && (
                      <span className="block text-[10.5px] text-black/45">
                        {find.where}
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}

          {outcome.state === 'none' && (
            <p className="text-[10.5px] leading-relaxed text-black/50">
              No place by that name. Some are not in the map's index at all —
              paste a Google Maps link below, or click the map, to put {what}{' '}
              exactly where it is.
            </p>
          )}

          {outcome.state === 'unavailable' && (
            <p className="text-[10.5px] leading-relaxed text-amber-700">
              Search isn't answering just now — nothing wrong with what you
              typed. Paste a Google Maps link below, or click the map.
            </p>
          )}
        </div>
      )}
    </>
  )
}
