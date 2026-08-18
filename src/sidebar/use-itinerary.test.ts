import { describe, expect, it } from 'vitest'

import { newStop, newTrip } from '../itinerary/create'
import { staleLegs } from '../itinerary/derive'
import type { Trip } from '../itinerary/model'
import {
  itineraryState,
  reduce,
  RETURN_LEG,
  type Action,
  type State,
} from './use-itinerary'

function tripOf(...names: string[]): Trip {
  return {
    ...newTrip(),
    name: 'Test',
    stops: names.map((name) => ({ ...newStop(), name })),
  }
}

function run(state: State, ...actions: Action[]): State {
  return actions.reduce(reduce, state)
}

describe('the save boundary', () => {
  it('keeps edits out of the committed Trip until Save', () => {
    const trip = tripOf('Bangkok')
    const edited = run(itineraryState(trip), {
      type: 'edit-stop',
      id: trip.stops[0].id,
      patch: { name: 'Bangkok, but renamed' },
    })

    expect(edited.draft.stops[0].name).toBe('Bangkok, but renamed')
    // The Diorama has not seen it. That is the whole point of an explicit save.
    expect(edited.committed.stops[0].name).toBe('Bangkok')
  })

  it('moves the draft across on Save', () => {
    const trip = tripOf('Bangkok')
    const saved = run(
      itineraryState(trip),
      { type: 'edit-stop', id: trip.stops[0].id, patch: { name: 'Ao Nang' } },
      { type: 'save' },
    )

    expect(saved.committed.stops[0].name).toBe('Ao Nang')
    expect(saved.touched.size).toBe(0)
  })

  it('throws the draft away on Discard', () => {
    const trip = tripOf('Bangkok')
    const discarded = run(
      itineraryState(trip),
      { type: 'edit-stop', id: trip.stops[0].id, patch: { name: 'Ao Nang' } },
      { type: 'insert-stop', after: 0 },
      { type: 'discard' },
    )

    expect(discarded.draft).toBe(trip)
    expect(discarded.draft.stops).toHaveLength(1)
    expect(discarded.touched.size).toBe(0)
  })
})

describe('the unsaved count', () => {
  it('counts entities, not keystrokes', () => {
    const trip = tripOf('Bangkok')
    const id = trip.stops[0].id

    const typed = run(
      itineraryState(trip),
      { type: 'edit-stop', id, patch: { name: 'B' } },
      { type: 'edit-stop', id, patch: { name: 'Ba' } },
      { type: 'edit-stop', id, patch: { name: 'Ban' } },
    )

    expect(typed.touched.size).toBe(1)
  })

  it('counts a Leg separately from the Stop it arrives at', () => {
    const trip = tripOf('Bangkok', 'Ao Nang')
    const [bangkok, aoNang] = trip.stops

    const edited = run(
      itineraryState(trip),
      { type: 'edit-stop', id: bangkok.id, patch: { name: 'BKK' } },
      { type: 'edit-leg', target: aoNang.id, patch: { mode: 'train' } },
    )

    expect(edited.touched.size).toBe(2)
  })
})

describe('editing a Leg', () => {
  it('writes through to the Stop it arrives at', () => {
    const trip = tripOf('Bangkok', 'Ao Nang')
    const edited = run(itineraryState(trip), {
      type: 'edit-leg',
      target: trip.stops[1].id,
      patch: { mode: 'train', secondMode: 'van' },
    })

    expect(edited.draft.stops[1].inbound).toMatchObject({
      mode: 'train',
      secondMode: 'van',
    })
    // The Leg into Bangkok is untouched — Legs are not shared between Stops.
    expect(edited.draft.stops[0].inbound.mode).toBeNull()
  })

  it('creates the return Leg on first edit', () => {
    const edited = run(itineraryState(tripOf('Bangkok')), {
      type: 'edit-leg',
      target: RETURN_LEG,
      patch: { mode: 'flight' },
    })

    expect(edited.draft.returnLeg).toMatchObject({ mode: 'flight' })
  })
})

describe('reordering', () => {
  it('carries a Stop’s inbound Leg with it', () => {
    const trip = tripOf('Bangkok', 'Ao Nang', 'Koh Kradan')
    const withMode = run(itineraryState(trip), {
      type: 'edit-leg',
      target: trip.stops[2].id,
      patch: { mode: 'boat', carrier: 'Bundhaya' },
    })

    const moved = run(withMode, { type: 'move-stop', from: 2, to: 0 })

    expect(moved.draft.stops[0].name).toBe('Koh Kradan')
    expect(moved.draft.stops[0].inbound).toMatchObject({
      mode: 'boat',
      carrier: 'Bundhaya',
    })
  })

  it('refuses to move a Stop off either end', () => {
    const state = itineraryState(tripOf('Bangkok', 'Ao Nang'))

    expect(run(state, { type: 'move-stop', from: 0, to: -1 })).toBe(state)
    expect(run(state, { type: 'move-stop', from: 1, to: 2 })).toBe(state)
  })
})

describe('inserting and removing', () => {
  it('drops a blank Stop into the gap, with no Mode guessed for its Leg', () => {
    const inserted = run(itineraryState(tripOf('Bangkok', 'Koh Kradan')), {
      type: 'insert-stop',
      after: 0,
    })

    expect(inserted.draft.stops.map((s) => s.name)).toEqual([
      'Bangkok',
      '',
      'Koh Kradan',
    ])
    // A guessed Mode would stand a Vehicle on a Path the traveller never described.
    expect(inserted.draft.stops[1].inbound.mode).toBeNull()
  })

  it('takes the Stop the caller made, so its card can be opened by id (#27)', () => {
    const created = newStop()
    const inserted = run(itineraryState(tripOf('Bangkok')), {
      type: 'insert-stop',
      after: 0,
      stop: created,
    })

    expect(inserted.draft.stops[1].id).toBe(created.id)
    expect(inserted.touched.has(created.id)).toBe(true)
  })

  it('takes the Stop’s Stays and inbound Leg with it when removed', () => {
    const trip = tripOf('Bangkok', 'Koh Kradan')
    const removed = run(
      itineraryState(trip),
      { type: 'add-stay', stopId: trip.stops[1].id },
      { type: 'remove-stop', id: trip.stops[1].id },
    )

    expect(removed.draft.stops).toHaveLength(1)
    expect(
      removed.draft.stops.find((s) => s.id === trip.stops[1].id),
    ).toBeUndefined()
  })
})

describe('Stays', () => {
  it('adds one Shortlisted, so nothing is claimed to be booked', () => {
    const trip = tripOf('Langkawi')
    const added = run(itineraryState(trip), {
      type: 'add-stay',
      stopId: trip.stops[0].id,
    })

    expect(added.draft.stops[0].stays).toHaveLength(1)
    expect(added.draft.stops[0].stays[0]).toMatchObject({
      status: 'shortlisted',
      booking: null,
    })
  })

  it('holds two at once, for the window where a replacement is booked and the incumbent is not yet cancelled', () => {
    const trip = tripOf('Koh Lipe')
    const id = trip.stops[0].id

    const both = run(
      itineraryState(trip),
      { type: 'add-stay', stopId: id },
      {
        type: 'edit-stay',
        stopId: id,
        index: 0,
        patch: { name: 'The Noi', status: 'placeholder' },
      },
      { type: 'add-stay', stopId: id },
      {
        type: 'edit-stay',
        stopId: id,
        index: 1,
        patch: { name: 'The replacement', status: 'booked' },
      },
    )

    expect(both.draft.stops[0].stays.map((s) => s.status)).toEqual([
      'placeholder',
      'booked',
    ])
  })

  it('removes the right one by position', () => {
    const trip = tripOf('Koh Lipe')
    const id = trip.stops[0].id

    const left = run(
      itineraryState(trip),
      { type: 'add-stay', stopId: id },
      { type: 'edit-stay', stopId: id, index: 0, patch: { name: 'First' } },
      { type: 'add-stay', stopId: id },
      { type: 'edit-stay', stopId: id, index: 1, patch: { name: 'Second' } },
      { type: 'remove-stay', stopId: id, index: 0 },
    )

    expect(left.draft.stops[0].stays.map((s) => s.name)).toEqual(['Second'])
  })
})

describe('what the reducer leaves for the stale-Leg report to find', () => {
  it('reports the follower of a removed Stop, against the committed order', () => {
    const trip = tripOf('Bangkok', 'Ao Nang', 'Koh Kradan')
    const removed = run(itineraryState(trip), {
      type: 'remove-stop',
      id: trip.stops[1].id,
    })

    expect(staleLegs(removed.draft, removed.committed)).toEqual([
      { stopId: trip.stops[2].id, wasFrom: 'Ao Nang', nowFrom: 'Bangkok' },
    ])
  })

  it('reports three Legs from one drag', () => {
    const trip = tripOf('Bangkok', 'Ao Nang', 'Koh Kradan', 'Koh Mook')
    const dragged = run(itineraryState(trip), {
      type: 'move-stop',
      from: 2,
      to: 0,
    })

    expect(
      staleLegs(dragged.draft, dragged.committed).map((l) => l.stopId),
    ).toEqual([trip.stops[2].id, trip.stops[0].id, trip.stops[3].id])
  })

  it('reports the Stop an insertion pushed down, and not the new one', () => {
    const trip = tripOf('Bangkok', 'Koh Kradan')
    const inserted = run(itineraryState(trip), {
      type: 'insert-stop',
      after: 0,
    })

    // `nowFrom` is null because the inserted Stop has no name yet — `create.ts` makes it empty rather
    // than plausible — so the banner falls back to "what it arrives from has changed" rather than
    // naming a blank.
    expect(staleLegs(inserted.draft, inserted.committed)).toEqual([
      { stopId: trip.stops[1].id, wasFrom: 'Bangkok', nowFrom: null },
    ])
  })

  it('clears every flag on Save, because a reorder you saved is a reorder you meant', () => {
    const trip = tripOf('Bangkok', 'Ao Nang', 'Koh Kradan')
    const saved = run(
      itineraryState(trip),
      { type: 'move-stop', from: 2, to: 0 },
      { type: 'save' },
    )

    expect(staleLegs(saved.draft, saved.committed)).toEqual([])
  })

  it('clears the flags with Discard, because it puts the committed order back', () => {
    const trip = tripOf('Bangkok', 'Ao Nang', 'Koh Kradan')
    const discarded = run(
      itineraryState(trip),
      { type: 'move-stop', from: 2, to: 0 },
      { type: 'discard' },
    )

    expect(discarded.draft.stops.map((s) => s.name)).toEqual([
      'Bangkok',
      'Ao Nang',
      'Koh Kradan',
    ])
    expect(staleLegs(discarded.draft, discarded.committed)).toEqual([])
  })
})
