import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  clearBackoff,
  mergeFinds,
  readFinds,
  searchPlaces,
  searchQueries,
  searchUrl,
} from './search'

/**
 * Every fixture below is a real Photon response, captured on 14 Aug 2026 against the live endpoint
 * with `osm_tag=place&lang=en`. None was invented to suit the code — the whole point of
 * [#18](https://github.com/adrianpetersson/onward/issues/18) is that the plausible-looking assumption
 * ([#3](https://github.com/adrianpetersson/onward/issues/3)'s "Photon resolves Koh Mook") failed on
 * contact with the actual itinerary.
 *
 * The four that matter, and what each one is here to stop:
 *
 * - **Ko Lipe** — `Koh Lipe` answers with four hamlets in **Liberia** and not one Thai result.
 * - **Ko Kradan** — `Koh Kradan` answers with **nothing at all**.
 * - **Koh Rong** — genuinely spelled with the `h`, in Cambodia. A one-way `Koh`→`Ko` rewrite sends it
 *   to a village in Chiang Rai, 900 km away and in the wrong country.
 * - **Phi Phi** — the dangerous one. `Koh` gives Don, where you sleep; `Ko` gives Leh, which is
 *   uninhabited. Both are `place/island` in Krabi Province, and no row could tell them apart by
 *   anything but the last word of the name.
 */

const feature = (props: Record<string, unknown>, lng: number, lat: number) => ({
  properties: props,
  geometry: { type: 'Point', coordinates: [lng, lat] },
})

const page = (...features: unknown[]) => ({ features })

/** `?q=Ko Muk` — the relation, the label node 350 m away, and Ko Muk Yai returned twice. */
const KO_MUK = page(
  feature(
    {
      osm_type: 'R',
      osm_id: 12088737,
      osm_key: 'place',
      osm_value: 'island',
      name: 'Ko Muk',
      state: 'Trang Province',
      country: 'Thailand',
      extent: [99.280672, 7.390932, 99.315247, 7.352792],
    },
    99.297303,
    7.371831,
  ),
  feature(
    {
      osm_type: 'N',
      osm_id: 11403190737,
      osm_key: 'place',
      osm_value: 'island',
      name: 'Ko Muk',
      state: 'Trang Province',
      country: 'Thailand',
    },
    99.294327,
    7.373236,
  ),
  feature(
    {
      osm_type: 'W',
      osm_id: 23588703,
      osm_key: 'place',
      osm_value: 'islet',
      name: 'Ko Muk Yai',
      state: 'Phang-nga Province',
      country: 'Thailand',
      extent: [98.3752, 9.021935, 98.378483, 9.0187],
    },
    98.376948,
    9.020416,
  ),
  feature(
    {
      osm_type: 'W',
      osm_id: 23588703,
      osm_key: 'place',
      osm_value: 'islet',
      name: 'Ko Muk Yai',
      state: 'Phang-nga Province',
      country: 'Thailand',
      extent: [98.3752, 9.021935, 98.378483, 9.0187],
    },
    98.376948,
    9.020416,
  ),
)

/** `?q=Koh Lipe` — Liberia, all the way down. */
const KOH_LIPE = page(
  feature(
    {
      osm_type: 'N',
      osm_id: 3118642210,
      osm_key: 'place',
      osm_value: 'hamlet',
      name: 'Kohn',
      state: 'Grand Bassa',
      country: 'Liberia',
    },
    -10.012238,
    6.081244,
  ),
  feature(
    {
      osm_type: 'N',
      osm_id: 3146525724,
      osm_key: 'place',
      osm_value: 'hamlet',
      name: 'Philip Kohoe',
      state: 'Bong',
      country: 'Liberia',
    },
    -9.434156,
    6.823644,
  ),
)

/** `?q=Ko Lipe` — the island, first, with its footprint. */
const KO_LIPE = page(
  feature(
    {
      osm_type: 'R',
      osm_id: 15406584,
      osm_key: 'place',
      osm_value: 'island',
      name: 'Ko Lipe',
      state: 'Satun Province',
      country: 'Thailand',
      extent: [99.283827, 6.495815, 99.311195, 6.479417],
    },
    99.302466,
    6.487591,
  ),
  feature(
    {
      osm_type: 'N',
      osm_id: 13308797764,
      osm_key: 'place',
      osm_value: 'locality',
      name: 'K lipe',
      state: 'Region of Košice',
      country: 'Slovakia',
    },
    20.500091,
    48.908145,
  ),
)

const PHI_PHI_DON = feature(
  {
    osm_type: 'R',
    osm_id: 6099581,
    osm_key: 'place',
    osm_value: 'island',
    name: 'Ko Phi Phi Don',
    state: 'Krabi Province',
    country: 'Thailand',
    extent: [98.755506, 7.787487, 98.792247, 7.717351],
  },
  98.776643,
  7.75224,
)

const PHI_PHI_LEH = feature(
  {
    osm_type: 'R',
    osm_id: 6099533,
    osm_key: 'place',
    osm_value: 'island',
    name: 'Ko Phi Phi Leh',
    state: 'Krabi Province',
    country: 'Thailand',
    extent: [98.761519, 7.699328, 98.771473, 7.671351],
  },
  98.765764,
  7.685351,
)

describe('searchQueries', () => {
  it('sends the second spelling for a Thai island the h hides', () => {
    // `Koh Kradan` returns nothing at all; `Ko Kradan` returns the island, rank 1.
    expect(searchQueries('Koh Kradan')).toEqual(['Koh Kradan', 'Ko Kradan'])
  })

  it('rewrites in the other direction too, for Cambodia', () => {
    // The rewrite is bidirectional or `Koh Rong` is unreachable: it is spelled with the h in OSM,
    // and `Ko Rong` resolves to Ban Rong Ko in Chiang Rai — 900 km away, wrong country.
    expect(searchQueries('Ko Rong')).toEqual(['Ko Rong', 'Koh Rong'])
  })

  it('sends one query when the rewrite changes nothing', () => {
    // Being fair to a donated endpoint means not doubling every request for no reason. `Bangkok`
    // ends in `kok`, which is exactly why the rewrite is anchored to word boundaries.
    expect(searchQueries('Bangkok')).toEqual(['Bangkok'])
    expect(searchQueries('Kuala Lumpur')).toEqual(['Kuala Lumpur'])
  })

  it('holds its fire below three characters', () => {
    expect(searchQueries('Ko')).toEqual([])
    expect(searchQueries('  ')).toEqual([])
  })

  it('keeps the traveller casing and collapses their whitespace', () => {
    expect(searchQueries('koh  lipe')).toEqual(['koh lipe', 'ko lipe'])
  })
})

describe('searchUrl', () => {
  it('filters to places and asks for English', () => {
    const url = new URL(searchUrl('Ko Lipe'))
    expect(url.searchParams.get('q')).toBe('Ko Lipe')
    expect(url.searchParams.get('osm_tag')).toBe('place')
    // Without this Photon answers in Thai script *and* ranks Bangkok below three Indonesian villages.
    expect(url.searchParams.get('lang')).toBe('en')
  })
})

describe('readFinds', () => {
  it('names the edges of a footprint rather than trusting their order', () => {
    const [island] = readFinds(KO_MUK)

    expect(island.name).toBe('Ko Muk')
    expect(island.kind).toBe('island')
    expect(island.where).toBe('Trang Province, Thailand')
    expect(island.coord).toEqual({ lng: 99.297303, lat: 7.371831 })
    // Photon sends `[west, north, east, south]`. Transposing this would frame a camera on the wrong
    // side of the world, and nothing downstream could tell.
    expect(island.footprint).toEqual({
      west: 99.280672,
      north: 7.390932,
      east: 99.315247,
      south: 7.352792,
    })
  })

  it('leaves a label node without a footprint rather than inventing one', () => {
    expect(readFinds(KO_MUK)[1].footprint).toBeNull()
  })

  it('drops a footprint whose edges are impossible', () => {
    const swapped = page(
      feature(
        {
          osm_type: 'R',
          osm_id: 1,
          osm_value: 'island',
          name: 'X',
          extent: [99.315247, 7.352792, 99.280672, 7.390932],
        },
        99.29,
        7.37,
      ),
    )
    // Dropped, not repaired: it is an optional convenience, and a silently corrected one is a lie.
    expect(readFinds(swapped)[0].footprint).toBeNull()
  })

  it('skips a feature with no name or no position', () => {
    const junk = page(feature({ osm_id: 1, osm_value: 'island' }, 99, 7), {
      properties: { name: 'Nowhere' },
      geometry: null,
    })
    expect(readFinds(junk)).toEqual([])
  })

  it('survives a body that is not a FeatureCollection at all', () => {
    expect(readFinds(null)).toEqual([])
    expect(readFinds({ error: 'throttled' })).toEqual([])
  })
})

describe('mergeFinds', () => {
  it('collapses the island relation and its label node into one row', () => {
    const finds = mergeFinds([readFinds(KO_MUK)], 'Koh Mook')
    const muks = finds.filter((find) => find.name === 'Ko Muk')

    // Both records are identical in name, type, province, postcode and country — 350 m apart and
    // indistinguishable on a row. Showing both would be a coin flip dressed as a choice.
    expect(muks).toHaveLength(1)
    // The one kept is the mapped polygon, which is also the one that knows how big the island is.
    expect(muks[0].footprint).not.toBeNull()
  })

  it('collapses a record Photon returned twice in one response', () => {
    // Ko Muk Yai really does arrive twice from `?q=Ko Muk`, same osm id both times.
    const yais = mergeFinds([readFinds(KO_MUK)], 'Ko Muk').filter(
      (find) => find.name === 'Ko Muk Yai',
    )
    expect(yais).toHaveLength(1)
  })

  it('keeps two islands 180 km apart as two rows', () => {
    const names = mergeFinds([readFinds(KO_MUK)], 'Ko Muk').map((f) => f.name)
    expect(names).toContain('Ko Muk')
    expect(names).toContain('Ko Muk Yai')
  })

  it('ranks the island the traveller meant above four hamlets in Liberia', () => {
    const finds = mergeFinds(
      [readFinds(KOH_LIPE), readFinds(KO_LIPE)],
      'Koh Lipe',
    )

    // This is the test the ranking rule exists for. Interleaving alone puts `Kohn` first, because it
    // is rank 1 of what the traveller literally typed. `Ko Lipe` shares every word of the query once
    // the h is discounted; `Kohn` shares none.
    expect(finds[0].name).toBe('Ko Lipe')
    expect(finds[0].where).toBe('Satun Province, Thailand')
  })

  it('keeps Phi Phi Don and Phi Phi Leh as two rows, and neither is chosen', () => {
    const finds = mergeFinds(
      [readFinds(page(PHI_PHI_DON)), readFinds(page(PHI_PHI_LEH, PHI_PHI_DON))],
      'Koh Phi Phi',
    )
    const names = finds.map((find) => find.name)

    // Don is where the guesthouses are; Leh is uninhabited. Both are `place/island` in Krabi
    // Province, so the *only* thing that separates them is the last word — which is why the row
    // shows the name and why the code must never pick between them.
    expect(names).toEqual(['Ko Phi Phi Don', 'Ko Phi Phi Leh'])
    // Don arrived from both spellings; it is one row, not two.
    expect(names.filter((name) => name === 'Ko Phi Phi Don')).toHaveLength(1)
  })

  it('leaves order alone when every result matches what was typed', () => {
    const finds = mergeFinds([readFinds(KO_LIPE)], 'Ko Lipe')
    expect(finds.map((find) => find.name)).toEqual(['Ko Lipe', 'K lipe'])
  })
})

describe('searchPlaces', () => {
  afterEach(() => {
    clearBackoff()
    vi.unstubAllGlobals()
  })

  const ok = (body: unknown) => ({ ok: true, json: async () => body })

  it('merges both spellings into one list', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) =>
        ok(url.includes('q=Koh+Lipe') ? KOH_LIPE : KO_LIPE),
      ),
    )

    const outcome = await searchPlaces('Koh Lipe')

    expect(outcome.state).toBe('found')
    expect(outcome.state === 'found' && outcome.finds[0].name).toBe('Ko Lipe')
  })

  it('reports nothing found rather than failing', async () => {
    // `Koh Kradan` under `osm_tag=place` really does return an empty feature list.
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ok(page())),
    )
    expect((await searchPlaces('Nowhere At All')).state).toBe('none')
  })

  it('does not ask at all below the minimum', async () => {
    const fetcher = vi.fn()
    vi.stubGlobal('fetch', fetcher)

    expect((await searchPlaces('Ko')).state).toBe('none')
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('treats a dead endpoint as an outcome, not an exception', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 429 })),
    )
    expect((await searchPlaces('Ko Lipe')).state).toBe('unavailable')
  })

  it('keeps one spelling’s results when the other spelling fails', async () => {
    // The failure mode this replaced `Promise.all` to avoid. Only one of the two queries holds the
    // answer — `Ko Lipe` finds the island, `Koh Lipe` finds Liberia — so all-or-nothing meant the
    // *wrong* request timing out could discard the right one and report an outage.
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.includes('q=Koh+Lipe')) throw new Error('network down')
        return ok(KO_LIPE)
      }),
    )

    const outcome = await searchPlaces('Koh Lipe')

    expect(outcome.state).toBe('found')
    expect(outcome.state === 'found' && outcome.finds[0].name).toBe('Ko Lipe')
  })

  it('will not call an empty half-search "nothing found"', async () => {
    // One spelling answers with nothing, the other never answers at all. Reporting "no place by that
    // name" here is a claim about the request that failed — and it would send the traveller off to
    // paste a link over a spelling that was never actually tried.
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.includes('q=Koh+Kradan')) return ok(page())
        throw new Error('network down')
      }),
    )

    expect((await searchPlaces('Koh Kradan')).state).toBe('unavailable')
  })

  it('stops asking for 30 seconds once Photon has said no', async () => {
    const fetcher = vi.fn(async () => {
      throw new Error('network down')
    })
    vi.stubGlobal('fetch', fetcher)

    let clock = 1_000_000
    const now = () => clock

    // Two calls per attempt: `Ko Lipe` and `Koh Lipe` go out together.
    expect((await searchPlaces('Ko Lipe', undefined, now)).state).toBe(
      'unavailable',
    )
    expect(fetcher).toHaveBeenCalledTimes(2)

    // A debounced field retries every 350 ms for as long as someone keeps typing. Aiming that at an
    // endpoint that has already refused is the "extensive usage" its terms of use ask us to avoid.
    clock += 5_000
    expect((await searchPlaces('Ko Lipe', undefined, now)).state).toBe(
      'unavailable',
    )
    expect(fetcher).toHaveBeenCalledTimes(2)

    clock += 30_000
    await searchPlaces('Ko Lipe', undefined, now)
    expect(fetcher).toHaveBeenCalledTimes(4)
  })

  it('rethrows an abort, so a superseded keystroke is not mistaken for an outage', async () => {
    const controller = new AbortController()
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        controller.abort()
        const error = new Error('aborted')
        error.name = 'AbortError'
        throw error
      }),
    )

    await expect(searchPlaces('Ko Lipe', controller.signal)).rejects.toThrow()
    // And crucially it did not arm the backoff — the request was cancelled by us, not refused by them.
    const fetcher = vi.fn(async () => ok(KO_LIPE))
    vi.stubGlobal('fetch', fetcher)
    await searchPlaces('Ko Lipe')
    expect(fetcher).toHaveBeenCalled()
  })
})
