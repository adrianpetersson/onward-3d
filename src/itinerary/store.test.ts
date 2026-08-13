import { describe, expect, it } from 'vitest'

import { newTrip } from './create'
import type { Trip } from './model'
import {
  CURRENT_SCHEMA_VERSION,
  STORE_KIND,
  envelopeOf,
  openTripOf,
  resolve,
  sameStore,
  withOpenTrip,
} from './store'

const trip = (id: string, name = ''): Trip => ({ ...newTrip(), id, name })

const at = (savedAt: string, trips: Trip[] = [trip('t1')]) =>
  envelopeOf(trips, trips.at(0)?.id ?? null, savedAt)

describe('envelopeOf', () => {
  it('stamps the kind and the current version, so a reader can refuse a stranger', () => {
    const envelope = at('2026-08-13T10:00:00.000Z')

    expect(envelope.kind).toBe(STORE_KIND)
    expect(envelope.schemaVersion).toBe(CURRENT_SCHEMA_VERSION)
  })
})

/**
 * The rule from #12: the file is the source of truth, so it wins — except in the one case where
 * believing it destroys work, which is the cache being strictly newer. That happens only when the
 * previous session's file write failed, and it is also the only signal that the durable copy has been
 * quietly stale ever since. So it is asked about rather than resolved.
 */
describe('resolve', () => {
  const older = '2026-08-13T09:00:00.000Z'
  const newer = '2026-08-13T14:22:00.000Z'

  it('has nothing to say when neither copy exists', () => {
    expect(resolve(null, null)).toBeNull()
  })

  it('uses the cache when there is no file yet', () => {
    expect(resolve(null, at(newer))).toEqual({
      use: 'cache',
      envelope: at(newer),
    })
  })

  it('uses the file when this browser has no copy', () => {
    expect(resolve(at(older), null)).toEqual({
      use: 'file',
      envelope: at(older),
    })
  })

  it('uses the file when it is newer — the normal case, edited elsewhere', () => {
    expect(resolve(at(newer), at(older))?.use).toBe('file')
  })

  it('uses the file when the two agree', () => {
    expect(resolve(at(newer), at(newer))?.use).toBe('file')
  })

  it('asks when the cache is strictly newer, and hands back both copies', () => {
    const decision = resolve(at(older), at(newer))

    expect(decision).toEqual({ use: 'ask', file: at(older), cache: at(newer) })
  })

  /**
   * A file with no `savedAt` — hand-edited, or written before the field existed — must lose rather than
   * silently win, so the ambiguity reaches the traveller.
   */
  it('asks when the file cannot say when it was written', () => {
    expect(resolve(at(''), at(older))?.use).toBe('ask')
  })

  it('does not ask when neither copy can say', () => {
    expect(resolve(at(''), at(''))?.use).toBe('file')
  })
})

/**
 * The guard that stops a normal reload from throwing away typing. `resolve` says "use the file" for
 * equal `savedAt` — which is what every ordinary reload looks like — so adopting on that answer alone
 * would remount the sidebar to install a copy of what is already on screen.
 */
describe('sameStore', () => {
  const stamp = '2026-08-13T10:00:00.000Z'

  it('is true for the same save read from two places', () => {
    expect(sameStore(at(stamp), at(stamp))).toBe(true)
  })

  it('is false when the trips differ, even at the same instant', () => {
    expect(
      sameStore(
        at(stamp, [trip('t1', 'Asia')]),
        at(stamp, [trip('t1', 'Peru')]),
      ),
    ).toBe(false)
  })

  it('is false when a sibling Trip is present in one and not the other', () => {
    const one = envelopeOf([trip('a')], 'a', stamp)
    const two = envelopeOf([trip('a'), trip('b')], 'a', stamp)

    expect(sameStore(one, two)).toBe(false)
  })

  it('is false when a different Trip is open', () => {
    const trips = [trip('a'), trip('b')]

    expect(
      sameStore(envelopeOf(trips, 'a', stamp), envelopeOf(trips, 'b', stamp)),
    ).toBe(false)
  })

  it('is false when the save times differ', () => {
    expect(sameStore(at(stamp), at('2026-08-13T14:00:00.000Z'))).toBe(false)
  })
})

describe('openTripOf', () => {
  it('finds the Trip the envelope points at, not merely the first', () => {
    const trips = [trip('a'), trip('b'), trip('c')]

    expect(openTripOf(envelopeOf(trips, 'b', ''))?.id).toBe('b')
  })

  it('falls back to the first when the pointer names nothing', () => {
    const trips = [trip('a'), trip('b')]

    expect(openTripOf(envelopeOf(trips, 'gone', ''))?.id).toBe('a')
  })

  it('has no Trip to offer for an empty store', () => {
    expect(openTripOf(envelopeOf([], null, ''))).toBeNull()
  })
})

/**
 * The guard against the bug a one-Trip UI over a many-Trip file invites: read one Trip, write one Trip,
 * and every other Trip in the file is silently deleted. The envelope has to stay whole.
 */
describe('withOpenTrip', () => {
  it('replaces only the open Trip and leaves its siblings untouched', () => {
    const before = envelopeOf(
      [trip('a', 'Asia'), trip('b', 'Peru'), trip('c', 'Japan')],
      'b',
      '',
    )

    const after = withOpenTrip(
      before,
      trip('b', 'Peru, rewritten'),
      '2026-08-13T14:00:00.000Z',
    )

    expect(after.trips.map((t) => t.name)).toEqual([
      'Asia',
      'Peru, rewritten',
      'Japan',
    ])
    expect(after.openTripId).toBe('b')
  })

  it('appends a Trip the file has never seen', () => {
    const before = envelopeOf([trip('a', 'Asia')], 'a', '')
    const after = withOpenTrip(before, trip('new', 'Chile'), '')

    expect(after.trips.map((t) => t.id)).toEqual(['a', 'new'])
    expect(after.openTripId).toBe('new')
  })

  it('records the moment of the save, which is what resolve compares', () => {
    const after = withOpenTrip(
      envelopeOf([trip('a')], 'a', '2026-08-13T09:00:00.000Z'),
      trip('a'),
      '2026-08-13T14:00:00.000Z',
    )

    expect(after.savedAt).toBe('2026-08-13T14:00:00.000Z')
  })

  it('does not mutate the envelope it was handed', () => {
    const before = envelopeOf([trip('a', 'Asia')], 'a', '')
    withOpenTrip(before, trip('a', 'changed'), 'now')

    expect(before.trips[0].name).toBe('Asia')
  })
})
