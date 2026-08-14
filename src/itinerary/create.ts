/**
 * Blank entities.
 *
 * Everything here is deliberately empty rather than plausible. A new Stop has no name, no dates and
 * no Mode on the Leg that reaches it, because inventing any of those would put something on the map
 * that the traveller never said — and a wrong Vehicle on a Path is worse than no Vehicle at all.
 */

import type { Leg, Stay, Stop, Trip } from './model'

function id(): string {
  return crypto.randomUUID()
}

export function newLeg(): Leg {
  return {
    mode: null,
    secondMode: null,
    depart: null,
    arrive: null,
    dayRoll: 0,
    durationMin: null,
    price: null,
    carrier: null,
    fromPlace: null,
    via: [],
    note: null,
    booking: null,
  }
}

export function newStop(): Stop {
  return {
    id: id(),
    name: '',
    // Placed on save, from a search or a pasted coordinate. Until then it cannot be drawn.
    coord: { lng: 0, lat: 0 },
    // Only a Stop found by name ever learns how big it is; a pasted or clicked one never does.
    footprint: null,
    arrival: null,
    departure: null,
    inbound: newLeg(),
    stays: [],
  }
}

/** A Stay starts Shortlisted: a name and an intention, with nothing committed. */
export function newStay(): Stay {
  return {
    name: '',
    status: 'shortlisted',
    coord: null,
    price: null,
    booking: null,
  }
}

export function newTrip(): Trip {
  return { id: id(), name: '', origin: null, stops: [], returnLeg: null }
}
