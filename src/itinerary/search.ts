/**
 * Finding a Stop by name.
 *
 * The interesting logic is here and pure, and the network call at the bottom is the thin part — same
 * shape as `maps-link.ts`, and for the same reason: what makes this correct is not the fetch, it is
 * the three rules below, each of which was measured against the real Southeast Asia itinerary in
 * [#18](https://github.com/adrianpetersson/onward/issues/18) rather than assumed.
 *
 * **1. `osm_tag=place`, and nothing wider.** Unfiltered, Photon answers "Koh Lipe" with a restaurant
 * in Ontario and "Koh Kradan" with a `tourism/artwork`. Widening to national parks fixes Khao Sok and
 * breaks Taman Negara, and hands back a polygon centroid in the middle of the jungle rather than the
 * village you sleep in. A Stop is where the traveller sleeps; `place` is that and the floor —
 * `maps-link.ts`, or a click — catches the rest.
 *
 * **2. `lang=en`, always.** Without it Photon answers in local script (`เกาะมุก`, `กรุงเทพมหานคร`) *and*
 * ranks worse: "Bangkok" returns three Indonesian villages above the Thai city, and "Copenhagen" a
 * hamlet in New York above København. With it, both are rank 1.
 *
 * **3. Both spellings, because neither wins.** [#3](https://github.com/adrianpetersson/onward/issues/3)
 * recorded that Photon resolves the backpacker's "Koh Mook" where Nominatim needs "Ko Muk", and that
 * one example became a rule. It does not hold: measured across the whole trip, `Koh Kradan` returns
 * **nothing** and `Koh Lipe` returns **four hamlets in Liberia**. Dropping the `h` fixes those — and
 * breaks `Koh Rong`, which is genuinely spelled that way in Cambodia, and quietly swaps `Ko Phi Phi
 * Don` (where you sleep) for `Ko Phi Phi Leh` (uninhabited). So the rewrite is never applied *instead*
 * of what was typed: both go, and the traveller picks. See `mergeFinds`.
 */

import type { Coord, Footprint } from './model'

const ENDPOINT = 'https://photon.komoot.io/api/'

/** Below this a query is a prefix, not a name, and firing on it only spends someone else's server. */
export const MIN_QUERY = 3

/** Per query. Two queries can therefore offer 10 before deduping; the field shows the first few. */
const LIMIT = 5

/**
 * How far apart two records of the same place are allowed to be and still be one row.
 *
 * Photon returns `Ko Muk` twice — once as the mapped island relation, once as a label node 350 m away
 * — identical in name, type, district, province, postcode and country. Nothing a row could display
 * tells them apart, so showing both would hand the traveller a coin flip dressed as a choice.
 */
const SAME_PLACE_M = 1000

/** A place the search turned up. Not part of the Itinerary until the traveller picks it. */
export type Find = {
  /**
   * OSM's own English name — `Ko Muk` for a traveller who typed `Koh Mook`. Displayed on the row and
   * **never written to a Stop's name**: the name is the traveller's, and the map already shows this
   * one in its own labels ([#11](https://github.com/adrianpetersson/onward/issues/11)).
   */
  name: string
  /** `island`, `city`, `village`. What tells `Ko Phi Phi Don` from a hamlet of the same name. */
  kind: string
  /** `Trang Province, Thailand`. What tells four George Towns apart. */
  where: string
  coord: Coord
  /** Only the mapped polygon carries one; a bare label node does not. */
  footprint: Footprint | null
  /** OSM identity, so the same record arriving from both spellings collapses to one row. */
  id: string
}

/** What a search came back with. `unavailable` is a documented state, not an exception — Photon's
 * terms guarantee no availability at all. */
export type SearchOutcome =
  | { state: 'found'; finds: Find[] }
  | { state: 'none' }
  | { state: 'unavailable' }

/**
 * The one or two queries a typed name becomes.
 *
 * The rewrite runs in **both** directions — `Koh`→`Ko` rescues Kradan, Lipe, Samui, Phangan and
 * Chang; `Ko`→`Koh` rescues Cambodia's `Koh Rong`, which a one-way rewrite sends to a village in
 * Chiang Rai 900 km away. When neither word is present the rewrite changes nothing and the second
 * query is not sent, so `Bangkok` stays one request.
 */
export function searchQueries(text: string): string[] {
  const query = text.trim().replace(/\s+/g, ' ')
  if (query.length < MIN_QUERY) return []

  const swapped = /\bkoh\b/i.test(query)
    ? query.replace(/\bkoh\b/gi, (match) => (match[0] === 'K' ? 'Ko' : 'ko'))
    : query.replace(/\bko\b/gi, (match) => (match[0] === 'K' ? 'Koh' : 'koh'))

  return swapped === query ? [query] : [query, swapped]
}

export function searchUrl(query: string): string {
  const url = new URL(ENDPOINT)
  url.searchParams.set('q', query)
  url.searchParams.set('osm_tag', 'place')
  url.searchParams.set('lang', 'en')
  url.searchParams.set('limit', String(LIMIT))
  return url.toString()
}

const num = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null

/**
 * `[west, north, east, south]` into named edges, or nothing.
 *
 * A footprint that fails its own invariants is dropped rather than repaired: it is an optional
 * convenience, and a silently transposed one would frame a camera on the wrong side of the world.
 */
function readFootprint(value: unknown): Footprint | null {
  if (!Array.isArray(value) || value.length !== 4) return null

  const [west, north, east, south] = value.map(num)
  if (west === null || north === null || east === null || south === null) {
    return null
  }
  if (west >= east || south >= north) return null
  if (Math.abs(west) > 180 || Math.abs(east) > 180) return null
  if (Math.abs(north) > 90 || Math.abs(south) > 90) return null

  return { west, north, east, south }
}

/** Photon's JSON into Finds. Anything unreadable is skipped, never guessed at. */
export function readFinds(body: unknown): Find[] {
  const features = (body as { features?: unknown })?.features
  if (!Array.isArray(features)) return []

  return features.flatMap((feature): Find[] => {
    const props = (feature as { properties?: Record<string, unknown> })
      ?.properties
    const coords = (feature as { geometry?: { coordinates?: unknown } })
      ?.geometry?.coordinates
    if (!props || !Array.isArray(coords)) return []

    const lng = num(coords[0])
    const lat = num(coords[1])
    const name = typeof props.name === 'string' ? props.name : null
    if (lng === null || lat === null || !name) return []

    const where = [props.state, props.country]
      .filter((part): part is string => typeof part === 'string' && part !== '')
      .join(', ')

    return [
      {
        name,
        kind:
          typeof props.osm_value === 'string'
            ? props.osm_value.replace(/_/g, ' ')
            : 'place',
        where,
        coord: { lng, lat },
        footprint: readFootprint(props.extent),
        id: `${props.osm_type ?? '?'}${props.osm_id ?? '?'}`,
      },
    ]
  })
}

/** Metres between two coordinates. Equirectangular — at 1 km the earth is flat enough. */
function metresBetween(a: Coord, b: Coord): number {
  const R = 6_371_000
  const lat = ((a.lat + b.lat) / 2) * (Math.PI / 180)
  const x = (b.lng - a.lng) * (Math.PI / 180) * Math.cos(lat)
  const y = (b.lat - a.lat) * (Math.PI / 180)
  return Math.sqrt(x * x + y * y) * R
}

/** Words, lowercased, with the Koh/Ko distinction removed — the comparison the ranking rule needs. */
function wordsOf(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/\bkoh\b/g, 'ko')
    .split(/[^a-z0-9฀-๿]+/)
    .filter(Boolean)
}

/**
 * Both queries' results into one list the traveller can choose from.
 *
 * Three passes, in order:
 *
 * 1. **Interleave**, so neither spelling is privileged — rank 1 of each, then rank 2 of each. There is
 *    no score in Photon's response to merge on, and picking a winner between the spellings is the
 *    guess this whole module exists to avoid.
 * 2. **Dedupe.** By OSM identity first (the same record often arrives from both spellings), then by
 *    name + kind within {@link SAME_PLACE_M}, keeping whichever carries a footprint — which is the
 *    mapped polygon rather than the bare label node, and the better record on every other count too.
 * 3. **Rank.** A result whose name contains every word typed sorts above one that merely
 *    fuzzy-matched. This is what stops `Koh Lipe` opening with four hamlets in Liberia while `Ko Lipe`
 *    sits below them — `Kohn` shares no whole word with the query and `Ko Lipe` shares both. It is a
 *    stable sort, so within each group the interleaved order stands.
 */
export function mergeFinds(pages: Find[][], typed: string): Find[] {
  const interleaved: Find[] = []
  const depth = Math.max(0, ...pages.map((page) => page.length))

  for (let rank = 0; rank < depth; rank++) {
    for (const page of pages) {
      const find = page[rank]
      if (find) interleaved.push(find)
    }
  }

  const kept: Find[] = []
  const seen = new Set<string>()

  for (const find of interleaved) {
    if (seen.has(find.id)) continue
    seen.add(find.id)

    const twin = kept.findIndex(
      (other) =>
        other.name.toLowerCase() === find.name.toLowerCase() &&
        other.kind === find.kind &&
        metresBetween(other.coord, find.coord) < SAME_PLACE_M,
    )

    if (twin === -1) {
      kept.push(find)
    } else if (!kept[twin].footprint && find.footprint) {
      // The mapped polygon supersedes the label node it duplicates; the point moves with it, since a
      // relation's own point is the one Photon considers the place's centre.
      kept[twin] = find
    }
  }

  const wanted = wordsOf(typed)
  const covers = (find: Find) => {
    const words = wordsOf(find.name)
    return wanted.every((word) => words.includes(word))
  }

  return kept
    .map((find, order) => ({ find, order, whole: covers(find) }))
    .sort((a, b) =>
      a.whole === b.whole ? a.order - b.order : a.whole ? -1 : 1,
    )
    .map(({ find }) => find)
}

/**
 * Photon has said no; do not ask again until this moment.
 *
 * Module-level because it is a fact about the world rather than about a field: if the endpoint is
 * throttling us it is throttling every box on the page. A debounced field retries every 350 ms for as
 * long as someone keeps typing, which is exactly the "extensive usage" Photon's terms of use ask us
 * not to aim at it — least of all when it has already answered no.
 */
let quietUntil = 0

const QUIET_MS = 30_000

/** For tests, and for the one case a human would want it: a fresh page load. */
export function clearBackoff(): void {
  quietUntil = 0
}

/**
 * Ask Photon. Rejects only on abort — every other failure is an outcome, because an endpoint that
 * guarantees no availability going quiet is ordinary, not exceptional.
 *
 * The two spellings are **settled independently, not all-or-nothing**. They are separate requests and
 * only one of them tends to hold the answer: `Ko Lipe` finds the island, `Koh Lipe` finds Liberia. On
 * `Promise.all`, the Liberia request failing would have discarded the island along with it and
 * reported an outage — throwing away the right answer because the wrong one timed out. So a page that
 * fails is dropped, and the search is only `unavailable` when **every** query failed.
 */
export async function searchPlaces(
  text: string,
  signal?: AbortSignal,
  now: () => number = Date.now,
): Promise<SearchOutcome> {
  const queries = searchQueries(text)
  if (queries.length === 0) return { state: 'none' }
  if (now() < quietUntil) return { state: 'unavailable' }

  const settled = await Promise.allSettled(
    queries.map(async (query) => {
      const response = await fetch(searchUrl(query), { signal })
      if (!response.ok) throw new Error(String(response.status))
      return readFinds(await response.json())
    }),
  )

  // A superseded keystroke is not an outage. It has to be re-thrown rather than reported, or the
  // backoff below would go quiet for 30 s every time someone typed quickly.
  if (signal?.aborted) throw new DOMException('aborted', 'AbortError')

  const pages = settled
    .filter((page) => page.status === 'fulfilled')
    .map((page) => page.value)

  if (pages.length === 0) {
    quietUntil = now() + QUIET_MS
    return { state: 'unavailable' }
  }

  const finds = mergeFinds(pages, text)
  if (finds.length > 0) return { state: 'found', finds }

  // Nothing came back — but if half the search never answered, "no place by that name" is a claim
  // about the half that did not, and the traveller would go off to paste a link over a spelling that
  // was never actually tried. Only silence from *every* query is evidence of absence.
  return pages.length === settled.length
    ? { state: 'none' }
    : { state: 'unavailable' }
}
