/**
 * The cache: one `localStorage` key holding the whole envelope.
 *
 * It is a cache and not the store, which is what makes losing it survivable — the file on disk is the
 * truth (see `store.ts`). What it buys is the thing a file cannot: **a synchronous read**. The
 * envelope is a few KB, `localStorage.getItem` is synchronous, and so the first React render already
 * has the Itinerary in hand. There is no loading state, no skeleton, and no frame in which the
 * Diorama is asked to draw a trip that has not arrived yet.
 *
 * One key rather than a key per Trip: the envelope is small, and a single `setItem` either lands whole
 * or does not land at all. Split across keys, a write interrupted between them leaves two Trips
 * disagreeing about which one is open.
 *
 * `Storage` is a parameter rather than a global so this is testable in Vitest's `node` environment,
 * where there is no `localStorage` at all — and so that the one environment where reaching for it
 * *throws* rather than returning null has exactly one place to be handled (`openCache`).
 */

import { readEnvelope, writeEnvelope } from './parse'
import type { StoreBackend, StoreEnvelope, StoreRead } from './store'

export const STORE_KEY = 'onward:store'

export type CacheStore = StoreBackend & {
  /**
   * The read the first render uses. Async `read` exists to satisfy `StoreBackend`; this is the one
   * that makes the cache worth having.
   */
  readSync: () => StoreRead
}

export function createCacheStore(
  storage: Storage,
  key: string = STORE_KEY,
): CacheStore {
  const readSync = (): StoreRead => {
    try {
      return readEnvelope(storage.getItem(key))
    } catch {
      // A storage that throws on read is a storage that is not there. The file is unaffected, and
      // saying "empty" here lets the session run on whatever the file gives us.
      return { state: 'empty' }
    }
  }

  return {
    readSync,
    read: async () => readSync(),
    write: async (envelope: StoreEnvelope) => {
      storage.setItem(key, writeEnvelope(envelope))
    },
  }
}

/**
 * A cache that forgets, for the browsers that will not give us one.
 *
 * Safari in private mode historically threw on `setItem` once its tiny quota was reached, and touching
 * `window.localStorage` at all can throw where site data is blocked outright. Both cases end here: the
 * Itinerary lives in React state for the session and, on Chromium, the file still makes it durable.
 */
export function createMemoryStore(): CacheStore {
  let held: string | null = null

  const readSync = (): StoreRead => readEnvelope(held)

  return {
    readSync,
    read: async () => readSync(),
    write: async (envelope: StoreEnvelope) => {
      held = writeEnvelope(envelope)
    },
  }
}

/**
 * The cache this browser can actually offer.
 *
 * Deliberately probes with a real write rather than a feature check: `'localStorage' in window` is
 * true in the very modes that refuse to store anything, so the only honest test is to use it.
 */
export function openCache(): { store: CacheStore; persistent: boolean } {
  try {
    const probe = `${STORE_KEY}:probe`
    window.localStorage.setItem(probe, '1')
    window.localStorage.removeItem(probe)
    return { store: createCacheStore(window.localStorage), persistent: true }
  } catch {
    return { store: createMemoryStore(), persistent: false }
  }
}
