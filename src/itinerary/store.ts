/**
 * Where the Itinerary lives.
 *
 * **The file on the traveller's own disk is the source of truth; `localStorage` is a cache.** That
 * inversion is the whole of [#12](https://github.com/adrianpetersson/onward/issues/12), and it exists
 * because no browser storage engine is durable: OPFS, IndexedDB and `localStorage` all sit in one
 * evictable origin bucket that "clear site data" empties, that WebKit's storage policy expires after
 * seven days without interaction, and that Chrome evicts whole-origin under disk pressure. Swapping
 * engine changes nothing — SQLite over OPFS is measurably *worse*, being quota-managed where
 * `localStorage` is not. Durability requires leaving the device, and the cheapest way off it that
 * needs no server, no key and no account is a file the traveller picked. See ADR 0004.
 *
 * ## The seam
 *
 * `StoreBackend` is deliberately async on both halves even though `localStorage` is synchronous. A
 * network-backed store is the one shape this MVP is most likely to grow into
 * ([ADR 0002](../../docs/adr/0002-no-backend-localstorage-and-one-edge-function.md) says that arrives
 * as a fresh effort, not this one), and an async port means it arrives as a third implementation
 * rather than as a change to every caller.
 *
 * What sits above this seam — the envelope, the defaulting read in `parse.ts`, the migration chain —
 * is not MVP scaffolding. A Postgres row holding a trip as `jsonb` has exactly the same problem of
 * rows written by older builds, and `schemaVersion` plus migrate-on-read is exactly its answer.
 */

import type { Trip } from './model'

/**
 * Bumped only for a change the defaulting read in `parse.ts` cannot absorb on its own — a rename or a
 * restructure. **Adding a field is not one of those**: a missing field takes its default and an
 * unknown field is ignored, so old files keep loading untouched. Every bump owes a `MIGRATIONS` entry.
 */
export const CURRENT_SCHEMA_VERSION = 1

/**
 * Stamped on every envelope so the recovery picker can refuse a JSON file that is not ours with a
 * sentence rather than a stack trace. It is a guard, not a format declaration.
 */
export const STORE_KIND = 'onward-store'

/**
 * What is written, to the file and to the cache alike — one artifact, not two. There is no separate
 * export format because there is no export: the file *is* the store, so a shape that only the
 * download path understood would have nothing to describe.
 *
 * `trips` is a list, and `openTripId` names the one the sidebar is editing, even though the MVP shows
 * exactly one Trip. That is the single concession v1 makes to the eventual multi-trip UI, and it is
 * the reason multi-trip is later a change of interface rather than a migration of everybody's file.
 */
export type StoreEnvelope = {
  kind: typeof STORE_KIND
  schemaVersion: number
  /**
   * ISO 8601, UTC, rewritten on every save. It exists for exactly one job: deciding which of two
   * disagreeing copies is the more recent (see `resolve`). ISO 8601 in UTC sorts lexicographically in
   * chronological order, which is why the comparisons below are plain string comparisons — the same
   * property `derive.ts` leans on for `cancelBy`.
   */
  savedAt: string
  openTripId: string | null
  trips: Trip[]
}

/** Why a stored value could not be turned into an Itinerary. */
export type RefusedReason =
  /** Valid JSON, but not ours — the traveller picked the wrong file. */
  | 'not-onward'
  /** Written by a later build of Onward. Refused rather than silently stripped of its new fields. */
  | 'too-new'
  /** Not JSON at all, or JSON that is not an object. */
  | 'unreadable'

/**
 * The outcome of reading a store. Three states rather than a nullable envelope, because *nothing
 * saved yet* and *saved but unusable* need different words in front of the traveller: one is a new
 * trip, the other is a warning that something they own is not being read.
 */
export type StoreRead =
  | { state: 'empty' }
  | { state: 'ok'; envelope: StoreEnvelope }
  | { state: 'refused'; reason: RefusedReason; detail: string | null }

export interface StoreBackend {
  /** Reads whatever is there. Never throws: an unusable store is a `refused` read, not an error. */
  read(): Promise<StoreRead>
  /** Throws on failure, so the caller can say which copy is stale. */
  write(envelope: StoreEnvelope): Promise<void>
}

/** A fresh envelope around the trips as they now stand. */
export function envelopeOf(
  trips: Trip[],
  openTripId: string | null,
  savedAt: string,
): StoreEnvelope {
  return {
    kind: STORE_KIND,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    savedAt,
    openTripId,
    trips,
  }
}

/**
 * Which copy to believe when the file and the cache disagree.
 *
 * The file is the source of truth, so it wins by default — a file newer than the cache is the normal
 * case and means the traveller edited on another machine and let Dropbox carry it over. There is
 * exactly one situation where believing the file destroys work: the cache being **strictly** newer,
 * which happens only when the previous session's file write failed. That one is asked about, because
 * it is also the only signal that the durable copy has been silently stale since then.
 *
 * An envelope whose `savedAt` is unknown (an older file, or a hand-edited one) sorts before every
 * real timestamp, so it loses the comparison and surfaces the ambiguity instead of hiding it.
 */
export type Resolution =
  | { use: 'file'; envelope: StoreEnvelope }
  | { use: 'cache'; envelope: StoreEnvelope }
  | { use: 'ask'; file: StoreEnvelope; cache: StoreEnvelope }

export function resolve(
  file: StoreEnvelope | null,
  cache: StoreEnvelope | null,
): Resolution | null {
  if (!file) return cache ? { use: 'cache', envelope: cache } : null
  if (!cache) return { use: 'file', envelope: file }

  return cache.savedAt > file.savedAt
    ? { use: 'ask', file, cache }
    : { use: 'file', envelope: file }
}

/**
 * Whether two envelopes hold the same Itinerary.
 *
 * Needed because `resolve` says "use the file" whenever the cache is not strictly newer — and the
 * commonest case by far is the two being the *same* save, with equal `savedAt`. Adopting then would
 * remount the sidebar and throw away whatever the traveller had begun typing since the page painted,
 * to replace an Itinerary with a copy of itself.
 */
export function sameStore(a: StoreEnvelope, b: StoreEnvelope): boolean {
  return (
    a.savedAt === b.savedAt &&
    a.openTripId === b.openTripId &&
    JSON.stringify(a.trips) === JSON.stringify(b.trips)
  )
}

/**
 * The Trip the sidebar is editing, and the rest of the file left strictly alone.
 *
 * A one-Trip UI over a many-Trip file is how a second trip gets silently deleted: read one, write one,
 * and everything else in the envelope is gone. So the envelope stays whole in state and a save
 * replaces only the open Trip inside it.
 */
export function openTripOf(envelope: StoreEnvelope): Trip | null {
  return (
    envelope.trips.find((trip) => trip.id === envelope.openTripId) ??
    envelope.trips.at(0) ??
    null
  )
}

/** The envelope with `trip` put back in its place, appended if the file has never seen it. */
export function withOpenTrip(
  envelope: StoreEnvelope,
  trip: Trip,
  savedAt: string,
): StoreEnvelope {
  const known = envelope.trips.some((t) => t.id === trip.id)

  return envelopeOf(
    known
      ? envelope.trips.map((t) => (t.id === trip.id ? trip : t))
      : [...envelope.trips, trip],
    trip.id,
    savedAt,
  )
}
