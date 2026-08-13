/**
 * The file on the traveller's own disk — the source of truth.
 *
 * It is a real file in a real folder, so putting it in Dropbox or iCloud means the trip is covered by
 * backups that already exist and that no browser can evict. That is the entire point: see `store.ts`
 * for why no amount of browser storage achieves it.
 *
 * ## Two things the browser insists on, which shape everything here
 *
 * **A handle must be remembered somewhere, and it cannot be a string.** A `FileSystemFileHandle` is
 * not a path — there is no path to keep — but it *is* structured-cloneable, so IndexedDB can hold the
 * handle itself across sessions. That is the only reason reopening the app does not mean reopening a
 * file dialog.
 *
 * **Permission needs a user gesture, and reading a file on load is not one.** After a browser restart
 * `queryPermission` answers `'prompt'`, and `requestPermission` throws unless it is called during a
 * genuine interaction. Rather than put a "reconnect" button in front of the traveller, the app asks on
 * the first **Save** of a session — a click, therefore a gesture, and the moment where wanting the file
 * written is the whole intent. Everything before that runs off the cache.
 *
 * The consequence is that the calls below split into two kinds, and the comments say which: those safe
 * to make on load, and those that must happen inside a click.
 */

import { readEnvelope, writeEnvelope } from './parse'
import type { StoreBackend, StoreEnvelope, StoreRead } from './store'

/**
 * The File System Access pickers and the permission pair are not in TypeScript's DOM library — it
 * carries the parts of the file-system spec that OPFS needs and stops there. Declared locally rather
 * than pulled in as a dependency: this is the whole of the surface Onward touches.
 */
type FilePickerOptions = {
  suggestedName?: string
  types?: { description: string; accept: Record<string, string[]> }[]
  excludeAcceptAllOption?: boolean
  id?: string
}

type PermissionRequest = { mode: 'read' | 'readwrite' }

type StoreFileHandle = FileSystemFileHandle & {
  queryPermission?: (request: PermissionRequest) => Promise<PermissionState>
  requestPermission?: (request: PermissionRequest) => Promise<PermissionState>
}

declare global {
  interface Window {
    showSaveFilePicker?: (
      options?: FilePickerOptions,
    ) => Promise<StoreFileHandle>
    showOpenFilePicker?: (
      options?: FilePickerOptions & { multiple?: boolean },
    ) => Promise<StoreFileHandle[]>
  }
}

/**
 * Chromium only, and desktop only. Firefox and Safari implement the file-system handles that OPFS
 * needs but not the pickers, so there is no way to reach a file the traveller chose — those browsers
 * run on the cache alone and say so. Not a scope ruling: the app works, the durable copy does not.
 */
export function fileStoreSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.showSaveFilePicker === 'function'
  )
}

const PICKER: FilePickerOptions = {
  types: [
    {
      description: 'Onward itinerary',
      accept: { 'application/json': ['.json'] },
    },
  ],
  // Reopens the picker wherever the traveller last put one, rather than at the default download folder.
  id: 'onward-store',
}

/** `Southeast Asia` → `southeast-asia.json`. A filename he would have typed himself. */
export function suggestFilename(tripName: string): string {
  const slug = tripName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

  return `${slug || 'itinerary'}.json`
}

// ---------------------------------------------------------------------------
// Remembering the handle
// ---------------------------------------------------------------------------

const DB_NAME = 'onward'
const DB_VERSION = 1
const HANDLES = 'handles'
const HANDLE_KEY = 'store-file'

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(HANDLES)) db.createObjectStore(HANDLES)
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
    // An upgrade held up by a connection elsewhere would otherwise leave this promise pending for
    // ever. Failing fast is safe: nothing here is load-bearing enough to wait on.
    request.onblocked = () => reject(new Error('IndexedDB is blocked'))
  })
}

function transact<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return openDatabase().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const request = run(db.transaction(HANDLES, mode).objectStore(HANDLES))
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error)
      }),
  )
}

// ---------------------------------------------------------------------------

export type FileLink = {
  /** What to call it in front of the traveller. The only human-readable part of a handle. */
  filename: string
  permission: PermissionState
}

export type FileStore = StoreBackend & {
  /** What is linked right now, without touching the disk or the browser's permission state. */
  link: () => FileLink | null
  /**
   * Picks up a handle remembered from a previous session. **Safe on load** — `queryPermission` only
   * reports, it never prompts, so this cannot fail for want of a gesture.
   */
  recall: () => Promise<FileLink | null>
  /** **Inside a click only.** The save dialog: names a new file and links it. */
  attach: (suggestedName: string) => Promise<FileLink>
  /** **Inside a click only.** The open dialog: links a file that already exists. */
  choose: () => Promise<FileLink>
  /** **Inside a click only.** Turns a remembered `'prompt'` into a `'granted'`. */
  grant: () => Promise<PermissionState>
  /** Drops the link. Used when the file has gone and a new one has to be named. */
  forget: () => Promise<void>
}

export function createFileStore(): FileStore {
  let handle: StoreFileHandle | null = null
  let permission: PermissionState = 'prompt'

  const link = (): FileLink | null =>
    handle ? { filename: handle.name, permission } : null

  /**
   * Links a handle for this session, and asks IndexedDB to keep it for the next one.
   *
   * **Deliberately not awaited.** Remembering is next session's convenience; the write the traveller
   * just asked for must not queue behind it. IndexedDB can not only fail — a handle from a mocked
   * environment is not structured-cloneable — it can *hang*, when an upgrade or a delete is blocked by
   * another connection, and an awaited hang here would stall the save with no error to show for it.
   */
  const remember = (
    next: StoreFileHandle,
    state: PermissionState,
  ): FileLink => {
    handle = next
    permission = state

    void transact('readwrite', (store) => store.put(next, HANDLE_KEY)).catch(
      () => {
        // Not remembered, still linked. The traveller is asked for the file again next session rather
        // than losing anything now.
      },
    )

    return { filename: next.name, permission }
  }

  return {
    link,

    recall: async () => {
      if (!fileStoreSupported()) return null

      try {
        const stored = await transact<StoreFileHandle | undefined>(
          'readonly',
          (store) => store.get(HANDLE_KEY),
        )
        if (!stored) return null

        handle = stored
        permission =
          (await stored.queryPermission?.({ mode: 'readwrite' })) ?? 'prompt'
        return link()
      } catch {
        return null
      }
    },

    attach: async (suggestedName) => {
      const picked = await window.showSaveFilePicker!({
        ...PICKER,
        suggestedName,
      })
      // The save dialog grants write access as part of the pick, so there is nothing left to ask.
      return remember(picked, 'granted')
    },

    choose: async () => {
      const [picked] = await window.showOpenFilePicker!({
        ...PICKER,
        multiple: false,
      })
      const state =
        (await picked.requestPermission?.({ mode: 'readwrite' })) ?? 'granted'
      return remember(picked, state)
    },

    grant: async () => {
      if (!handle) return 'denied'
      permission =
        (await handle.requestPermission?.({ mode: 'readwrite' })) ?? 'granted'
      return permission
    },

    forget: async () => {
      handle = null
      permission = 'prompt'
      try {
        await transact('readwrite', (store) => store.delete(HANDLE_KEY))
      } catch {
        // Nothing to do: the in-memory link is already gone, which is what the caller wanted.
      }
    },

    read: async (): Promise<StoreRead> => {
      if (!handle) return { state: 'empty' }

      try {
        return readEnvelope(await (await handle.getFile()).text())
      } catch (error) {
        // Moved, renamed, deleted, or permission withdrawn between the check and the read. Reported
        // rather than thrown: the cache still has the Itinerary, and the caller says so in the footer.
        return {
          state: 'refused',
          reason: 'unreadable',
          detail: error instanceof Error ? error.message : 'could not be read',
        }
      }
    },

    write: async (envelope: StoreEnvelope) => {
      if (!handle) throw new Error('No file is linked')

      const writable = await handle.createWritable()

      // `close()` is what commits, and `createWritable` starts from an EMPTY file rather than the
      // existing contents — so closing after a failed write would commit nothing and destroy the
      // trip. The failure path must abort instead, which discards the whole attempt and leaves the
      // file exactly as it was.
      try {
        await writable.write(writeEnvelope(envelope))
        await writable.close()
      } catch (error) {
        await writable.abort().catch(() => {
          // Already broken; the original failure is the one worth reporting.
        })
        throw error
      }
    },
  }
}
