/**
 * The guard in front of anything that destroys a Booking.
 *
 * Its job is **not** to ask whether you are sure — [#19](https://github.com/adrianpetersson/onward/issues/19)
 * settled that it is to hand back what it is about to take. A Booking exists at Agoda or at Air China;
 * the reference, the deadline and the phone number are the only copy Onward holds, and a still-open
 * cancellation window is money that comes back only if the traveller goes somewhere else and asks for
 * it. So the panel reads the reference out, says how long the window has left, and names the platform
 * to ask — and then gets out of the way.
 *
 * It is therefore silent whenever nothing committed would die, which on the real trip is five Stops out
 * of eight — it speaks at Koh Kradan and Koh Lipe, where a bed is committed, and at **Bangkok**, whose
 * inbound Leg carries the flight out of Copenhagen. A guard that fires on every removal is a guard that
 * gets dismissed on the one that mattered, which is exactly how a live 772 SEK booking went missing
 * from the planning documents.
 *
 * Inline rather than a modal. `StorageNotice.tsx` holds the only modal in the app and states what
 * earns one; this does not clear that bar, and a modal would cover the Itinerary the traveller is
 * checking the Stop against.
 */

import { useState } from 'react'

import type { Loss } from '../itinerary/derive'
import { money, shortDate } from './fields'

/**
 * Local state for one destructive control. There is no shared "something is being removed" flag: two
 * cards may be mid-question at once and neither is the other's business — the same reasoning
 * `placing.tsx` gives for not exposing an `armedBy`.
 */
export function useRemoving(losses: Loss[]) {
  const [confirming, setConfirming] = useState(false)

  return {
    /*
     * The panel may not outlive what it is asking about, so this is **derived** rather than read
     * straight out of state. `losses` is recomputed from the draft on every render while the flag is
     * sticky, and a Stop's last Booking can be cleared from inside the same open card — through
     * "not booked after all" — while the Stop's own panel is up. Read raw, it went on asking about
     * "0 bookings" over an empty list, with a live red button on a removal that destroyed nothing.
     *
     * Deriving it rather than resetting the flag in an effect is not only lint's preference
     * (`react-hooks/set-state-in-effect`): an effect fires *after* the render that emptied `losses`,
     * and one frame of a panel counting zero is one too many.
     */
    confirming: confirming && losses.length > 0,
    /**
     * Removes outright when nothing committed would die, and otherwise opens the panel. The whole
     * trigger rule, in one place, so three call sites cannot drift apart.
     */
    attempt: (remove: () => void) =>
      losses.length === 0 ? remove() : setConfirming(true),
    dismiss: () => setConfirming(false),
  }
}

/**
 * What is still worth doing about this Booking, before the note of it goes.
 *
 * Every sentence here has to be true at all three controls, which is what the earlier wording got
 * wrong: it ended "or you keep paying for a stop that is no longer here", and neither removing a Stay
 * nor forgetting a Booking removes a Stop — at the Booking control it contradicted its own heading.
 * So the clause says what the click actually fails to do, and that holds everywhere.
 */
function Deadline({ loss }: { loss: Loss }) {
  if (loss.deadline === 'live')
    return (
      <>
        Still free to cancel until {shortDate(loss.cancelBy)} —{' '}
        {loss.platform ? `cancel it on ${loss.platform}` : 'cancel it'} first,
        because removing it here cancels nothing.
      </>
    )

  if (loss.deadline === 'passed')
    return (
      <>
        The free-cancellation window closed on {shortDate(loss.cancelBy)}, so
        there is nothing left to get back.
      </>
    )

  return <>Never refundable, so there is nothing to get back.</>
}

/** "Ao Niang Beach Resort", "the boat in", "the way in" — whichever this Booking has to offer. */
function nameOf(loss: Loss): string {
  if (loss.kind === 'leg')
    return loss.name ? `the ${loss.name} in` : 'the way in'
  return loss.name ?? 'an unnamed stay'
}

function LossRow({ loss }: { loss: Loss }) {
  return (
    <li className="rounded border border-amber-700/15 bg-white/70 px-2 py-1.5">
      <span className="block text-[11px] font-medium">{nameOf(loss)}</span>
      <span className="block text-[10.5px] text-black/55">
        {loss.platform ? `${loss.platform} ` : ''}
        {loss.reference || 'no reference typed yet'}
        {loss.price && ` · ${money(loss.price)}`}
      </span>
      <span
        className={`mt-0.5 block text-[10.5px] leading-snug ${
          loss.deadline === 'live' ? 'text-amber-800' : 'text-black/45'
        }`}
      >
        <Deadline loss={loss} />
      </span>
    </li>
  )
}

export function LossPanel({
  heading,
  losses,
  confirmLabel,
  onRemove,
  onDismiss,
}: {
  /** The whole sentence, written at the call site — what is going, and what it takes. */
  heading: string
  losses: Loss[]
  confirmLabel: string
  onRemove: () => void
  onDismiss: () => void
}) {
  return (
    <div className="mt-2 rounded border border-amber-700/30 bg-amber-50/70 px-2.5 py-2">
      <p className="text-[11px] leading-snug font-medium text-amber-900">
        ⚠ {heading}
      </p>
      {/*
       * This used to promise Discard as the undo, and that was false in the state it fired in most
       * often: Discard reverts the draft to the last *saved* Trip, so a Stop or a Booking created
       * since that save is not brought back by it — it is thrown away a second time. What is
       * unconditionally true is the thing the panel exists to say.
       */}
      <p className="mt-1 text-[10.5px] leading-snug text-black/55">
        What goes is Onward’s note of it. The booking itself stands until
        somebody cancels it.
      </p>

      <ul className="mt-2 space-y-1.5">
        {losses.map((loss, i) => (
          <LossRow key={i} loss={loss} />
        ))}
      </ul>

      <div className="mt-2.5 flex justify-end gap-2">
        <button
          onClick={onDismiss}
          className="rounded px-2.5 py-1 text-[11px] text-black/55 hover:bg-black/5"
        >
          Keep it
        </button>
        <button
          onClick={() => {
            // Dismissed *first*, and not merely for tidiness: `StayFields` is keyed by index, so
            // removing one Stay re-renders this same component instance as the Stay that took its
            // place. Left open, the panel would be asking about a row nobody clicked.
            onDismiss()
            onRemove()
          }}
          className="rounded bg-red-800 px-3 py-1 text-[11px] font-medium text-white hover:bg-red-900"
        >
          {confirmLabel}
        </button>
      </div>
    </div>
  )
}
