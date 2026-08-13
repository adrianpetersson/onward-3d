/**
 * Standing the store up, and reporting honestly on what is protecting the trip.
 *
 * The order of operations here is the whole of #12's save ruling: **the cache is written
 * synchronously, the Itinerary commits and the map redraws, and only then does the file write
 * happen.** By the time anything is on screen the save has already succeeded — the cache holds it —
 * so the file is a second, slower guarantee rather than the thing being waited on. A failed file write
 * therefore raises a warning and never rolls anything back.
 *
 * Two consequences worth knowing before changing anything in here:
 *
 * - **The first render already has the Itinerary.** `localStorage` is synchronous, so the initial
 *   state comes from it directly. There is no loading state to design and no frame where the Diorama
 *   is handed an empty Trip.
 * - **The file picker and the permission prompt must run inside the click.** Nothing is awaited before
 *   them in `save`, which is why the cache write below is deliberately not awaited.
 */

import { useCallback, useEffect, useRef, useState } from 'react'

import { newTrip } from './create'
import { openCache } from './cache-store'
import {
  createFileStore,
  fileStoreSupported,
  suggestFilename,
  type FileLink,
} from './file-store'
import type { Trip } from './model'
import {
  envelopeOf,
  openTripOf,
  resolve,
  sameStore,
  withOpenTrip,
  type StoreEnvelope,
} from './store'

/**
 * What the sidebar footer says about where the trip lives. Every state is one the traveller can act
 * on, or one that changes what he should expect — there is no state here whose only content is
 * reassurance about machinery.
 */
export type StorageState =
  /** No picker in this browser. The app works; the durable copy is not on offer. */
  | { kind: 'unsupported' }
  /** Chromium, and no file named yet. The next Save asks — so this needs no warning of its own. */
  | { kind: 'unlinked' }
  /**
   * Saved, but into the cache only — the traveller dismissed the file dialog. Distinct from `unlinked`
   * because it is the one state that has to offer its own way back to the picker: `commit` clears the
   * unsaved count before the dialog even opens, which disables Save, so without a control of its own
   * there would be no route left to a durable copy.
   */
  | { kind: 'cache-only' }
  | { kind: 'linked'; filename: string }
  /** The last file write failed. The cache still holds the trip; the file is behind. */
  | { kind: 'stale'; filename: string; detail: string }
  /** Linked to a file that can no longer be read — moved, renamed, or deleted. */
  | { kind: 'gone'; filename: string; detail: string }

/**
 * Two copies that disagree, put to the traveller rather than resolved behind his back.
 *
 * `mine` is what this browser holds. It reaches this state in only two ways, and both mean the durable
 * copy and the working copy have diverged in a way that would cost someone real work to guess at.
 */
export type StoreConflict = {
  filename: string
  file: StoreEnvelope
  mine: StoreEnvelope
}

const now = () => new Date().toISOString()

const firstEnvelope = (): StoreEnvelope => {
  const trip = newTrip()
  // No `savedAt` yet: nothing has been saved, and claiming a time would make an untouched trip look
  // newer than a real file the traveller is about to link.
  return envelopeOf([trip], trip.id, '')
}

export function useStore() {
  // Created once and kept: the file store holds the live handle and its permission state, and the
  // cache probe writes to `localStorage`, so neither may repeat on a render. `useState`'s lazy
  // initialiser rather than a ref, because these two ARE read during render — a ref would be the
  // wrong tool and the lint rule is right to say so.
  const [cache] = useState(openCache)
  const [file] = useState(createFileStore)

  const [envelope, setEnvelope] = useState<StoreEnvelope>(() => {
    const read = cache.store.readSync()
    return read.state === 'ok' ? read.envelope : firstEnvelope()
  })

  /**
   * Bumped whenever the Itinerary is replaced from outside the sidebar's own editing — adopting the
   * file, or recovering one. The sidebar keeps a draft in a reducer seeded from its prop, so it has to
   * be remounted rather than asked politely to notice.
   */
  const [generation, setGeneration] = useState(0)

  const [state, setState] = useState<StorageState>(() =>
    fileStoreSupported() ? { kind: 'unlinked' } : { kind: 'unsupported' },
  )
  const [conflict, setConflict] = useState<StoreConflict | null>(null)

  /**
   * The envelope as it stands, readable from a callback without re-creating every callback on every
   * change. Both writers — `save` and `adopt` — set it themselves as they go, because a save must see
   * its own previous write immediately rather than one render later. The effect is insurance for any
   * future path that changes the envelope without going through them.
   */
  const held = useRef(envelope)
  useEffect(() => {
    held.current = envelope
  }, [envelope])

  /**
   * Whether this session has reconciled with the file yet. Until it has, a write could overwrite a
   * file that moved on while this browser was closed — so the first write checks first.
   */
  const reconciled = useRef(false)

  /** The `savedAt` this session started from. What "the file has moved on since" is measured against. */
  const baseline = useRef(envelope.savedAt)

  const adopt = useCallback(
    (next: StoreEnvelope) => {
      setEnvelope(next)
      held.current = next
      baseline.current = next.savedAt
      setGeneration((n) => n + 1)
      void cache.store.write(next)
    },
    [cache],
  )

  // Picks up a file remembered from a previous session. `queryPermission` only reports, so this is
  // safe without a gesture — and where permission survived, the file is read and reconciled at once.
  useEffect(() => {
    let live = true

    void (async () => {
      const link = await file.recall()
      if (!live || !link) return

      if (link.permission !== 'granted') {
        // Remembered but not yet permitted. The first Save asks; until then the cache is in charge.
        setState({ kind: 'linked', filename: link.filename })
        return
      }

      const read = await file.read()
      if (!live) return

      if (read.state === 'refused') {
        setState({
          kind: 'gone',
          filename: link.filename,
          detail: read.detail ?? 'could not be read',
        })
        return
      }

      setState({ kind: 'linked', filename: link.filename })
      reconciled.current = true

      const decision = resolve(
        read.state === 'ok' ? read.envelope : null,
        held.current,
      )

      if (decision?.use === 'ask') {
        setConflict({
          filename: link.filename,
          file: decision.file,
          mine: decision.cache,
        })
        reconciled.current = false
      } else if (
        decision?.use === 'file' &&
        !sameStore(decision.envelope, held.current)
      ) {
        // Only when the file genuinely differs. `resolve` says "use the file" for equal `savedAt` too,
        // which is what a normal reload looks like — and adopting there would remount the sidebar and
        // silently discard anything typed since the page painted, to install a copy of what is already
        // on screen.
        adopt(decision.envelope)
      }
    })()

    return () => {
      live = false
    }
  }, [file, adopt])

  /**
   * Everything after the cache write. Split out because the failure modes are all its own: a cancelled
   * dialog is not an error, a withdrawn permission is not a missing file, and none of them undo a save
   * that has already happened.
   */
  const persistToFile = useCallback(
    async (next: StoreEnvelope, trip: Trip) => {
      let link: FileLink | null = file.link()

      try {
        if (!link) link = await file.attach(suggestFilename(trip.name))
        else if (link.permission !== 'granted') {
          const granted = await file.grant()
          if (granted !== 'granted') {
            setState({
              kind: 'stale',
              filename: link.filename,
              detail: 'permission to write it was declined',
            })
            return
          }
          link = file.link()
        }
      } catch (error) {
        // A cancelled picker is a decision, not a fault — but it is not nothing either: the trip has
        // just been saved into the cache alone, which is the situation #12 exists to end. `cache-only`
        // says so and carries the way back, because Save is already disabled by the commit that
        // preceded this dialog.
        if (error instanceof DOMException && error.name === 'AbortError') {
          setState({ kind: 'cache-only' })
          return
        }
        throw error
      }

      if (!link) return

      // The check that stops a stale browser copy silently overwriting a file that moved on — see
      // `reconciled`. Only ever runs once per session, and only before the first write.
      if (!reconciled.current) {
        const read = await file.read()

        // A file that cannot be READ must not be WRITTEN. `parse.ts` refuses a newer file precisely so
        // its unknown fields are never dropped and then written back over the original — and falling
        // through to the write here would do exactly that, replacing a later build's file (or somebody
        // else's JSON) with this one and reporting success.
        if (read.state === 'refused') {
          setState({
            kind: 'gone',
            filename: link.filename,
            detail: read.detail ?? 'could not be read',
          })
          return
        }

        if (read.state === 'ok' && read.envelope.savedAt > baseline.current) {
          setConflict({
            filename: link.filename,
            file: read.envelope,
            mine: next,
          })
          return
        }

        reconciled.current = true
      }

      await file.write(next)
      setState({ kind: 'linked', filename: link.filename })
    },
    [file],
  )

  const save = useCallback(
    async (trip: Trip) => {
      const next = withOpenTrip(held.current, trip, now())
      setEnvelope(next)
      held.current = next

      // Not awaited, and that is the point: `createCacheStore.write` runs synchronously up to its
      // `setItem`, so the trip is persisted before this line yields — which leaves the user gesture
      // intact for the file picker and the permission prompt inside `persistToFile`.
      void cache.store.write(next)

      if (!fileStoreSupported()) return

      try {
        await persistToFile(next, trip)
      } catch (error) {
        const link = file.link()
        setState({
          kind: 'stale',
          filename: link?.filename ?? 'the file',
          detail: error instanceof Error ? error.message : 'the write failed',
        })
      }
    },
    [cache, file, persistToFile],
  )

  /** Retries whatever failed, from a click — so a permission prompt is allowed to appear. */
  const retry = useCallback(async () => {
    const trip = openTripOf(held.current)
    if (trip) await save(trip)
  }, [save])

  /** Names a different file, or re-links one that moved. From a click. */
  const relink = useCallback(async () => {
    try {
      const link = await file.choose()
      const read = await file.read()

      if (read.state === 'ok') {
        reconciled.current = true
        setState({ kind: 'linked', filename: link.filename })
        adopt(read.envelope)
        return
      }

      // An empty or unreadable pick is not adopted — the trip in hand is not thrown away for it.
      setState(
        read.state === 'empty'
          ? { kind: 'linked', filename: link.filename }
          : {
              kind: 'gone',
              filename: link.filename,
              detail: read.detail ?? 'is not an Onward file',
            },
      )
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return
      throw error
    }
  }, [file, adopt])

  const settle = useCallback(
    async (keep: 'file' | 'mine') => {
      const pending = conflict
      setConflict(null)
      if (!pending) return

      reconciled.current = true

      if (keep === 'file') {
        adopt(pending.file)
        return
      }

      const mine = envelopeOf(
        pending.mine.trips,
        pending.mine.openTripId,
        now(),
      )
      adopt(mine)

      try {
        await file.write(mine)
        setState({ kind: 'linked', filename: pending.filename })
      } catch (error) {
        setState({
          kind: 'stale',
          filename: pending.filename,
          detail: error instanceof Error ? error.message : 'the write failed',
        })
      }
    },
    [conflict, file, adopt],
  )

  return {
    /** The Trip the sidebar edits. Never null: an empty store opens on a blank Trip. */
    trip: openTripOf(envelope) ?? newTrip(),
    /** Remount key for the sidebar, so a Trip replaced from the file reaches its draft. */
    generation,
    state,
    /** False where `localStorage` refused us — private modes, blocked site data. */
    cached: cache.persistent,
    conflict,
    save,
    retry,
    relink,
    settle,
  }
}
