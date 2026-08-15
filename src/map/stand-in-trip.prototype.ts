import type { Leg, Mode, Place, Stay, Stop, Trip } from '../itinerary/model'

/**
 * PROTOTYPE for #9 — the real SEA trip as an actual `Trip`, so the variants are judged against the
 * real `markerAt`, the real `pathsOf` and the real size law rather than against a parallel shape.
 *
 * #20 and #8 both built a stand-in of their own (`STAND_IN_STOPS`, a bespoke tuple list) because
 * neither could reach the Itinerary — #8 wired it up on the way past, so this one is the model's own
 * type and goes through `drawItinerary` untouched.
 *
 * **What this stand-in exists to show is the marker states, so every one of them appears at least
 * once.** `markerAt` has four axes and they are not independent: kind (pin | stay-marker), pulsing,
 * jumping, and whether the Stay's coordinate differs from the Stop's. The nine Stops below cover all
 * of them:
 *
 * | Stop         | Stay              | draws        | pulsing | jumping | gap     |
 * | ------------ | ----------------- | ------------ | ------- | ------- | ------- |
 * | Bangkok      | booked, placed    | stay-marker  | no      | no      | 6.6 km  |
 * | Railay       | booked, unplaced  | stay-marker  | no      | **yes** | —       |
 * | Koh Kradan   | booked, placed    | stay-marker  | no      | no      | 740 m   |
 * | Koh Bulon-Le | placeholder       | stay-marker  | **yes** | no      | 300 m   |
 * | Koh Lipe     | shortlisted       | **pin**      | yes     | no      | —       |
 * | Langkawi     | none              | **pin**      | yes     | no      | —       |
 * | George Town  | booked, placed    | stay-marker  | no      | no      | 1.1 km  |
 * | Teluk Bahang | none              | **pin**      | yes     | no      | —       |
 * | Kuala Lumpur | placeholder, none | stay-marker  | yes     | **yes** | —       |
 *
 * The **gap** column is the ticket's own question — a Stop's centre against the bed actually booked
 * inside it. Bangkok's 6.6 km is the case that decides it: a city centroid and a Sukhumvit guesthouse
 * are not the same place at any zoom that frames the city, and pretending otherwise is a lie the map
 * tells confidently. Koh Kradan's 740 m is the tracer's own beach (#7's `AO_NIANG`) against the
 * island's middle.
 *
 * Coordinates are hand-taken to a few hundred metres, which is far inside what any question here can
 * tell apart — except the gaps, which were chosen deliberately and are the point.
 *
 * Dates, prices, references and carriers are omitted wholesale: nothing on the map reads them, and a
 * plausible-looking fake reference is exactly the sort of thing that gets mistaken for real data
 * later. #15 types the true itinerary in.
 */

const leg = (mode: Mode | null, via: Place[] = []): Leg => ({
  mode,
  secondMode: null,
  depart: null,
  arrive: null,
  dayRoll: 0,
  durationMin: null,
  price: null,
  carrier: null,
  fromPlace: null,
  via,
  note: null,
  booking: null,
})

/** A Booking with only the field that makes it one. Nothing on the map reads the rest. */
const booking = () => ({
  reference: 'STAND-IN',
  platform: null,
  cancelBy: null,
  contact: null,
  detail: null,
})

const stay = (
  name: string,
  status: Stay['status'],
  coord: Stay['coord'],
): Stay => ({
  name,
  status,
  coord,
  price: null,
  booking: status === 'shortlisted' ? null : booking(),
})

const stop = (
  name: string,
  [lng, lat]: [number, number],
  inbound: Leg,
  stays: Stay[] = [],
): Stop => ({
  id: name.toLowerCase().replace(/[^a-z]+/g, '-'),
  name,
  coord: { lng, lat },
  footprint: null,
  arrival: null,
  departure: null,
  inbound,
  stays,
})

/** Copenhagen. Not a Stop — nothing stands on it, which is itself worth looking at. */
const ORIGIN: Place = { name: 'Copenhagen', lng: 12.5683, lat: 55.6761 }

export const STAND_IN_TRIP: Trip = {
  id: 'stand-in-9',
  name: 'SEA',
  origin: ORIGIN,
  stops: [
    // The gap at its worst: the city's centroid against a bed on Sukhumvit, 6.6 km apart.
    stop(
      'Bangkok',
      [100.5018, 13.7563],
      leg('flight', [{ name: 'Beijing', lng: 116.4074, lat: 39.9042 }]),
      [stay('Sukhumvit guesthouse', 'booked', { lng: 100.56, lat: 13.738 })],
    ),
    // Booked and unplaced — the Jump. The one state that has no coordinate to stand on.
    stop('Railay', [98.838, 8.011], leg('train'), [
      stay('Railay Beach hut', 'booked', null),
    ]),
    // #7's beach against the island's middle, 780 m. The middle is hand-placed and had to be
    // corrected once — the first guess was 400 m out to sea, which the map said immediately.
    stop('Koh Kradan', [99.257, 7.3105], leg('boat'), [
      stay('Ao Niang hut', 'booked', { lng: 99.25546, lat: 7.30365 }),
    ]),
    // A Placeholder: real money, meant to be replaced. Pulses and stands as a building.
    stop('Koh Bulon-Le', [99.5586, 6.834], leg('boat'), [
      stay('Pansand', 'placeholder', { lng: 99.5561, lat: 6.8355 }),
    ]),
    // Shortlisted: a name and nothing else, so a Pin holds it.
    stop('Koh Lipe', [99.304, 6.488], leg('boat'), [
      stay('Castaway', 'shortlisted', null),
    ]),
    stop('Langkawi', [99.728, 6.29], leg('ferry')),
    stop('George Town', [100.3354, 5.4141], leg('ferry'), [
      stay('Chulia Street', 'booked', { lng: 100.3391, lat: 5.4198 }),
    ]),
    stop('Teluk Bahang', [100.213, 5.457], leg('van')),
    // Both at once, which is the honest state of a Placeholder nobody has pasted a link for.
    stop('Kuala Lumpur', [101.6869, 3.139], leg('train'), [
      stay('Bukit Bintang', 'placeholder', null),
    ]),
  ],
  returnLeg: leg('flight', [{ name: 'Doha', lng: 51.531, lat: 25.286 }]),
}
