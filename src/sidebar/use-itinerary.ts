/**
 * The sidebar's editing state.
 *
 * Save is explicit ([ADR 0002](../../docs/adr/0002-no-backend-localstorage-and-one-edge-function.md)),
 * so there are two Trips at all times: the **committed** one, which is what the map has drawn, and
 * the **draft** the sidebar is editing. Nothing the traveller types reaches the Diorama until Save,
 * and Discard throws the draft away wholesale.
 *
 * `touched` exists to answer one question in the footer — *how many unsaved changes* — and is
 * deliberately a count of edited entities rather than of keystrokes. Retyping the same value still
 * counts: comparing deeply to decide whether an edit "really" changed anything would make the
 * counter lie about what Save is about to do.
 */

import { useCallback, useMemo, useReducer } from 'react'

import { newLeg, newStay, newStop } from '../itinerary/create'
import type { Leg, Stay, Stop, Trip } from '../itinerary/model'

/** Identifies the one Leg that hangs off the Trip rather than off a Stop. */
export const RETURN_LEG = 'return' as const

export type LegTarget = string | typeof RETURN_LEG

export type Action =
  | { type: 'edit-trip'; patch: Partial<Trip> }
  | { type: 'edit-stop'; id: string; patch: Partial<Stop> }
  | { type: 'edit-leg'; target: LegTarget; patch: Partial<Leg> }
  | { type: 'add-stay'; stopId: string }
  | { type: 'edit-stay'; stopId: string; index: number; patch: Partial<Stay> }
  | { type: 'remove-stay'; stopId: string; index: number }
  | { type: 'insert-stop'; after: number }
  | { type: 'move-stop'; from: number; to: number }
  | { type: 'remove-stop'; id: string }
  | { type: 'save' }
  | { type: 'discard' }

export type State = {
  committed: Trip
  draft: Trip
  touched: Set<string>
}

/** Exported for its tests: the save/discard boundary is the part worth pinning down. */
export function itineraryState(trip: Trip): State {
  return { committed: trip, draft: trip, touched: new Set() }
}

function withStop(trip: Trip, id: string, change: (stop: Stop) => Stop): Trip {
  return {
    ...trip,
    stops: trip.stops.map((s) => (s.id === id ? change(s) : s)),
  }
}

export function reduce(state: State, action: Action): State {
  const touch = (key: string, draft: Trip): State => ({
    ...state,
    draft,
    touched: new Set(state.touched).add(key),
  })

  switch (action.type) {
    case 'edit-trip':
      return touch('trip', { ...state.draft, ...action.patch })

    case 'edit-stop':
      return touch(
        action.id,
        withStop(state.draft, action.id, (stop) => ({
          ...stop,
          ...action.patch,
        })),
      )

    case 'edit-leg': {
      if (action.target === RETURN_LEG) {
        const current = state.draft.returnLeg ?? newLeg()
        return touch(RETURN_LEG, {
          ...state.draft,
          returnLeg: { ...current, ...action.patch },
        })
      }
      return touch(
        action.target,
        withStop(state.draft, action.target, (stop) => ({
          ...stop,
          inbound: { ...stop.inbound, ...action.patch },
        })),
      )
    }

    case 'add-stay':
      return touch(
        action.stopId,
        withStop(state.draft, action.stopId, (stop) => ({
          ...stop,
          stays: [...stop.stays, newStay()],
        })),
      )

    case 'edit-stay':
      return touch(
        action.stopId,
        withStop(state.draft, action.stopId, (stop) => ({
          ...stop,
          stays: stop.stays.map((stay, i) =>
            i === action.index ? { ...stay, ...action.patch } : stay,
          ),
        })),
      )

    case 'remove-stay':
      return touch(
        action.stopId,
        withStop(state.draft, action.stopId, (stop) => ({
          ...stop,
          stays: stop.stays.filter((_, i) => i !== action.index),
        })),
      )

    case 'insert-stop': {
      const stops = [...state.draft.stops]
      const created = newStop()
      stops.splice(action.after + 1, 0, created)
      return touch(created.id, { ...state.draft, stops })
    }

    case 'move-stop': {
      const stops = [...state.draft.stops]
      if (action.from === action.to) return state
      if (action.to < 0 || action.to >= stops.length) return state

      // The inbound Leg travels with its Stop — ADR 0003. It now describes a different movement,
      // which is the known and accepted cost of storing it here rather than against two endpoints.
      const [moved] = stops.splice(action.from, 1)
      stops.splice(action.to, 0, moved)
      return touch('order', { ...state.draft, stops })
    }

    case 'remove-stop':
      return touch('order', {
        ...state.draft,
        stops: state.draft.stops.filter((s) => s.id !== action.id),
      })

    case 'save':
      return { committed: state.draft, draft: state.draft, touched: new Set() }

    case 'discard':
      return { ...state, draft: state.committed, touched: new Set() }
  }
}

export function useItinerary(initial: Trip) {
  const [state, dispatch] = useReducer(reduce, initial, itineraryState)

  const save = useCallback(() => dispatch({ type: 'save' }), [])
  const discard = useCallback(() => dispatch({ type: 'discard' }), [])

  return useMemo(
    () => ({
      /** What the sidebar renders and edits. */
      draft: state.draft,
      /** What the Diorama has drawn. */
      committed: state.committed,
      unsaved: state.touched.size,
      dispatch,
      save,
      discard,
    }),
    [state, save, discard],
  )
}
