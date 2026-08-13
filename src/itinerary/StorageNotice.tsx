/**
 * What Onward says about where the trip lives.
 *
 * All of it is understated by design: in the ordinary case the footer shows a filename and nothing
 * else, because the trip being safe is not news. Only the states the traveller can act on — a write
 * that failed, a file that has gone, a browser that cannot keep one — get a warning and a verb.
 *
 * The one modal in the whole app lives here, and it earns that by being the only moment where guessing
 * would cost real work: two copies of the Itinerary disagree, and only the traveller knows which of
 * them he meant.
 */

import { tripNights } from './derive'
import type { StoreConflict, StorageState } from './use-store'
import { openTripOf, type StoreEnvelope } from './store'

/** `2026-08-13T14:22:09.114Z` → `14:22 today`. `''` → `never`, which is a real answer here. */
function whenSaved(savedAt: string): string {
  if (!savedAt) return 'never'

  const at = new Date(savedAt)
  if (Number.isNaN(at.getTime())) return 'an unknown time'

  const time = at.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  })
  const sameDay = at.toDateString() === new Date().toDateString()

  return sameDay
    ? `${time} today`
    : `${time} on ${at.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`
}

/** "8 stops · 23 nights", the shape of a copy at a glance — enough to tell two of them apart. */
function summarise(envelope: StoreEnvelope): string {
  const trip = openTripOf(envelope)
  if (!trip) return 'no trip'

  const stops = `${trip.stops.length} ${trip.stops.length === 1 ? 'stop' : 'stops'}`
  const nights = tripNights(trip)

  return nights === null ? stops : `${stops} · ${nights} nights`
}

export function StorageLine({
  state,
  cached,
  onRetry,
  onRelink,
}: {
  state: StorageState
  cached: boolean
  onRetry: () => void
  onRelink: () => void
}) {
  const warning = (body: React.ReactNode) => (
    <p className="mt-1 text-[10.5px] leading-snug text-amber-700">⚠ {body}</p>
  )

  const action = (label: string, onClick: () => void) => (
    <button onClick={onClick} className="underline hover:no-underline">
      {label}
    </button>
  )

  return (
    <>
      {state.kind === 'unsupported' &&
        warning(
          <>
            this browser can’t keep a file copy — open Onward in Chrome or Edge
            to store your trip on disk
          </>,
        )}

      {state.kind === 'cache-only' &&
        warning(
          <>
            this trip is only in this browser —{' '}
            {action('choose a file…', onRetry)} to keep it on disk
          </>,
        )}

      {state.kind === 'stale' &&
        warning(
          <>
            couldn’t write {state.filename} — {state.detail}.{' '}
            {action('Try again', onRetry)}
          </>,
        )}

      {state.kind === 'gone' &&
        warning(
          <>
            {state.filename} can’t be read — {state.detail}.{' '}
            {action('Choose a file…', onRelink)}
          </>,
        )}

      {state.kind === 'linked' && (
        <p className="mt-1 text-[10.5px] text-black/35">{state.filename}</p>
      )}

      {/* Orthogonal to the file: the cache can be refused while the file is perfectly healthy. */}
      {!cached &&
        warning(
          <>
            this browser isn’t keeping a copy — private mode, or site data is
            blocked
          </>,
        )}
    </>
  )
}

export function ConflictDialog({
  conflict,
  onSettle,
}: {
  conflict: StoreConflict
  onSettle: (keep: 'file' | 'mine') => void
}) {
  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/25 backdrop-blur-[2px]">
      <div className="w-[440px] rounded-lg bg-[#fbfaf7] p-5 shadow-[0_8px_40px_rgba(0,0,0,0.3)]">
        <h2 className="text-[14px] font-semibold">Two copies of this trip</h2>
        <p className="mt-1 text-[11.5px] leading-relaxed text-black/55">
          This browser has changes that {conflict.filename} doesn’t — which
          happens when a save couldn’t reach the file, or the file was edited
          somewhere else. Nothing has been overwritten.
        </p>

        <div className="mt-4 space-y-2">
          <Copy
            label="In this browser"
            summary={summarise(conflict.mine)}
            saved={whenSaved(conflict.mine.savedAt)}
          />
          <Copy
            label={conflict.filename}
            summary={summarise(conflict.file)}
            saved={whenSaved(conflict.file.savedAt)}
          />
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={() => onSettle('file')}
            className="rounded px-3 py-1.5 text-[12px] text-black/60 hover:bg-black/5"
          >
            Use the file
          </button>
          <button
            onClick={() => onSettle('mine')}
            className="rounded bg-black px-4 py-1.5 text-[12px] font-medium text-white"
          >
            Use this browser’s copy
          </button>
        </div>
      </div>
    </div>
  )
}

function Copy({
  label,
  summary,
  saved,
}: {
  label: string
  summary: string
  saved: string
}) {
  return (
    <div className="flex items-baseline justify-between rounded border border-black/10 bg-white px-3 py-2">
      <span className="text-[12px] font-medium">{label}</span>
      <span className="text-[11px] text-black/50">
        {summary} · saved {saved}
      </span>
    </div>
  )
}
