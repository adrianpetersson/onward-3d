/**
 * PROTOTYPE — #11. The real trip, typed in, so the chrome is judged against real density.
 *
 * A sidebar with nothing in it flatters every treatment equally: no long Stop name wrapping, no
 * four-currency column, no Leg carrying two Modes and a `(+1)`. Since #12 has not landed persistence
 * yet, the only way to see the panel full is to hand it a Trip — so this is the December trip as it
 * actually stands, coordinates and references included.
 *
 * It is **not** a fixture and nothing should import it outside this prototype: [#15](https://github.com/adrianpetersson/onward/issues/15)
 * owns loading the real itinerary for real, once there is somewhere for it to live.
 */

import type { Trip } from '../../itinerary/model'

export const SEED_TRIP: Trip = {
  id: 'prototype-11-seed',
  name: 'Southeast Asia',
  origin: { name: 'Copenhagen', lng: 12.5683, lat: 55.6761 },
  stops: [
    {
      id: 'seed-bangkok',
      name: 'Bangkok',
      coord: { lng: 100.5018, lat: 13.7563 },
      arrival: '2026-12-14',
      departure: '2026-12-17',
      inbound: {
        mode: 'flight',
        secondMode: null,
        depart: '14:20',
        arrive: '12:05',
        dayRoll: 1,
        durationMin: 985,
        price: { amount: 6420, currency: 'SEK' },
        carrier: 'Air China',
        fromPlace: 'CPH Terminal 3',
        via: [{ name: 'Beijing', lng: 116.4074, lat: 39.9042 }],
        note: '5h layover airside at PEK — do not leave security',
        booking: {
          reference: '688166919',
          platform: 'Air China direct',
          cancelBy: null,
          contact: null,
          detail:
            'seat 42A both legs · 23 kg hold · booked as PETERSSON/ADRIAN',
        },
      },
      stays: [
        {
          name: 'Baan Dinso Ratchadamnoen',
          status: 'booked',
          coord: { lng: 100.4995, lat: 13.7563 },
          price: { amount: 3400, currency: 'THB' },
          booking: {
            reference: 'EEOIO2',
            platform: 'Agoda',
            cancelBy: '2026-12-07',
            contact: '+66 2 622 0560',
            detail: null,
          },
        },
      ],
    },
    {
      id: 'seed-kradan',
      name: 'Koh Kradan',
      coord: { lng: 99.2531, lat: 7.3053 },
      arrival: '2026-12-18',
      departure: '2026-12-23',
      inbound: {
        mode: 'train',
        secondMode: 'van',
        depart: '17:05',
        arrive: '10:40',
        dayRoll: 1,
        durationMin: 1055,
        price: { amount: 1180, currency: 'THB' },
        carrier: 'SRT #83 sleeper + transfer',
        fromPlace: 'Krung Thep Aphiwat',
        via: [],
        note: 'One ticket: lower berth to Trang, then the van to Kuantungku pier',
        booking: {
          reference: 'MMMNEN',
          platform: '12go',
          cancelBy: '2026-12-11',
          contact: null,
          detail: 'coach 9, lower berth 24',
        },
      },
      stays: [
        {
          name: 'Ao Niang Resort',
          status: 'booked',
          coord: { lng: 99.25546, lat: 7.30365 },
          price: { amount: 7500, currency: 'THB' },
          booking: {
            reference: 'KR-44812',
            platform: 'direct, by WhatsApp',
            cancelBy: '2026-12-04',
            contact: '+66 82 419 3388',
            detail: 'beachfront hut, fan only — no aircon on the island',
          },
        },
      ],
    },
    {
      id: 'seed-mook',
      name: 'Koh Mook',
      coord: { lng: 99.2967, lat: 7.3797 },
      arrival: '2026-12-23',
      departure: '2026-12-28',
      inbound: {
        mode: 'boat',
        secondMode: null,
        depart: '11:00',
        arrive: '11:45',
        dayRoll: 0,
        durationMin: 45,
        price: { amount: 400, currency: 'THB' },
        carrier: 'longtail, arranged at the resort',
        fromPlace: 'Ao Niang beach',
        via: [],
        note: 'Tide-dependent; they will move it to 09:30 if the morning is flat',
        booking: null,
      },
      stays: [
        {
          name: 'Sivalai Beach Resort',
          status: 'placeholder',
          coord: null,
          price: { amount: 9200, currency: 'THB' },
          booking: {
            reference: 'BK-2290417',
            platform: 'Booking.com',
            cancelBy: '2026-12-16',
            contact: null,
            detail:
              'held so Christmas does not sell out — replace before the 16th',
          },
        },
        {
          name: 'Koh Mook Charlie Beach',
          status: 'shortlisted',
          coord: null,
          price: { amount: 6800, currency: 'THB' },
          booking: null,
        },
      ],
    },
    {
      id: 'seed-lanta',
      name: 'Koh Lanta',
      coord: { lng: 99.0833, lat: 7.6167 },
      arrival: '2026-12-28',
      departure: '2027-01-02',
      inbound: {
        mode: 'ferry',
        secondMode: null,
        depart: '13:30',
        arrive: '16:15',
        dayRoll: 0,
        durationMin: 165,
        price: { amount: 650, currency: 'THB' },
        carrier: 'Tigerline',
        fromPlace: 'Koh Mook pier',
        via: [{ name: 'Koh Ngai', lng: 99.2, lat: 7.4167 }],
        note: null,
        booking: null,
      },
      stays: [
        {
          name: 'Long Beach — somewhere on it',
          status: 'shortlisted',
          coord: null,
          price: null,
          booking: null,
        },
      ],
    },
    {
      id: 'seed-krabi',
      name: 'Krabi Town',
      coord: { lng: 98.9189, lat: 8.0863 },
      arrival: '2027-01-02',
      departure: '2027-01-05',
      inbound: {
        mode: 'bus',
        secondMode: null,
        depart: '08:00',
        arrive: '11:30',
        dayRoll: 0,
        durationMin: 210,
        price: { amount: 300, currency: 'THB' },
        carrier: null,
        fromPlace: 'Saladan pier',
        via: [],
        note: 'Minivan, not a coach. Books itself the day before.',
        booking: null,
      },
      stays: [],
    },
  ],
  returnLeg: {
    mode: 'flight',
    secondMode: null,
    depart: '09:15',
    arrive: '19:40',
    dayRoll: 0,
    durationMin: 1105,
    price: { amount: 5980, currency: 'SEK' },
    carrier: 'Thai + SAS',
    fromPlace: 'KBV',
    via: [{ name: 'Bangkok', lng: 100.7501, lat: 13.6811 }],
    note: null,
    booking: null,
  },
}
