import { describe, expect, it } from 'vitest'

import { STORE_KEY, createCacheStore, createMemoryStore } from './cache-store'
import { newTrip } from './create'
import { envelopeOf } from './store'

/**
 * `Storage` is a parameter precisely so this can run in Vitest's `node` environment, where there is no
 * `localStorage` — and so the browsers that refuse one have exactly one place to be handled.
 */
function fakeStorage(
  over: { onWrite?: () => void; onRead?: () => void } = {},
): Storage {
  const held = new Map<string, string>()

  return {
    get length() {
      return held.size
    },
    key: (i) => [...held.keys()][i] ?? null,
    getItem: (key) => {
      over.onRead?.()
      return held.get(key) ?? null
    },
    setItem: (key, value) => {
      over.onWrite?.()
      held.set(key, value)
    },
    removeItem: (key) => void held.delete(key),
    clear: () => held.clear(),
  }
}

const anEnvelope = (savedAt = '2026-08-13T10:00:00.000Z') => {
  const trip = { ...newTrip(), id: 'trip-1', name: 'Southeast Asia' }
  return envelopeOf([trip], trip.id, savedAt)
}

describe('the cache', () => {
  it('reads back exactly what it wrote', async () => {
    const storage = fakeStorage()
    const store = createCacheStore(storage)
    const envelope = anEnvelope()

    await store.write(envelope)

    expect(store.readSync()).toEqual({ state: 'ok', envelope })
  })

  it('is empty before anything has been saved', () => {
    expect(createCacheStore(fakeStorage()).readSync()).toEqual({
      state: 'empty',
    })
  })

  it('holds the whole envelope under one key, so a write lands whole or not at all', async () => {
    const storage = fakeStorage()
    await createCacheStore(storage).write(anEnvelope())

    expect(storage.length).toBe(1)
    expect(storage.key(0)).toBe(STORE_KEY)
  })

  /**
   * The synchronous read is the entire reason a cache exists beside the file: it means the first React
   * render already holds the Itinerary, so there is no loading state and no frame in which the Diorama
   * is handed an empty Trip.
   */
  it('answers synchronously, which is what the first render depends on', async () => {
    const store = createCacheStore(fakeStorage())
    await store.write(anEnvelope())

    // No await: if this ever became async, the loading-state-free first render goes with it.
    const read = store.readSync()

    expect(read.state).toBe('ok')
  })

  it('reports a stored value it cannot read, rather than throwing at the caller', async () => {
    const storage = fakeStorage()
    storage.setItem(STORE_KEY, 'half a fi')

    expect(createCacheStore(storage).readSync()).toMatchObject({
      state: 'refused',
      reason: 'unreadable',
    })
  })

  /** Site data blocked outright: reading throws. The file is unaffected, so the session carries on. */
  it('treats a storage that throws on read as an absent one', () => {
    const storage = fakeStorage({
      onRead: () => {
        throw new DOMException('denied', 'SecurityError')
      },
    })

    expect(createCacheStore(storage).readSync()).toEqual({ state: 'empty' })
  })

  /** A write that throws must reach the caller: it is what raises the warning in the footer. */
  it('lets a failed write surface, because someone has to be told', async () => {
    const store = createCacheStore(
      fakeStorage({
        onWrite: () => {
          throw new DOMException('full', 'QuotaExceededError')
        },
      }),
    )

    await expect(store.write(anEnvelope())).rejects.toThrow()
  })

  it('keeps trips apart under different keys', async () => {
    const storage = fakeStorage()
    const a = createCacheStore(storage, 'onward:a')
    const b = createCacheStore(storage, 'onward:b')

    await a.write(anEnvelope('2026-01-01T00:00:00.000Z'))

    expect(a.readSync().state).toBe('ok')
    expect(b.readSync().state).toBe('empty')
  })
})

describe('the cache that forgets', () => {
  it('round-trips within the session', async () => {
    const store = createMemoryStore()
    const envelope = anEnvelope()

    await store.write(envelope)

    expect(store.readSync()).toEqual({ state: 'ok', envelope })
  })

  it('starts empty, and never throws', async () => {
    const store = createMemoryStore()

    expect(store.readSync()).toEqual({ state: 'empty' })
    await expect(store.write(anEnvelope())).resolves.toBeUndefined()
  })
})
