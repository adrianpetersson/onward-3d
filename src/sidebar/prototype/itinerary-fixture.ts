/**
 * PROTOTYPE — throwaway. See `README.md` in this folder.
 *
 * The real SEA trip, 13 Dec 2026 – 6 Jan 2027, as data. Taken from `~/Documents/sea-xmas`
 * (`itinerary-clean.md` is the current truth; `bookings.md` supplies the reference numbers).
 *
 * This is deliberately the *messy* version. Every awkward case the real trip actually contains is
 * kept rather than tidied away, because the whole point of #10 is to find out which fields earn
 * their place — and a fixture of clean three-night hops would answer that question wrongly:
 *
 * - Copenhagen is an endpoint the traveller never "stays" at.
 * - Beijing and Dubai are layovers: real map geometry, zero nights, no Stay, ever.
 * - Bangkok → Ao Nang is *one* movement in the traveller's head and *two* Modes on the ground
 *   (sleeper train, then a van).
 * - Ao Nang → Koh Kradan calls at two islands that are not Stops.
 * - Koh Lipe's incumbent booking is for the wrong dates and exists only to be cancelled.
 * - Prices arrive in four currencies.
 */

export type Mode =
  'flight' | 'train' | 'ferry' | 'boat' | 'bus' | 'van' | 'transfer'

export type Money = { amount: number; currency: 'SEK' | 'THB' | 'MYR' | 'EUR' }

export type StayStatus =
  /** Confirmed, with a reference. Draws a Stay Marker. */
  | 'booked'
  /** Held so the dates cannot sell out, but expected to be re-shopped and replaced. */
  | 'placeholder'
  /** A name and a price, nothing committed. */
  | 'shortlisted'

export type Stay = {
  name: string
  status: StayStatus
  /** Where it was booked — Agoda, Booking, direct. */
  platform?: string
  reference?: string
  price?: Money
  /** Free cancellation deadline. Load-bearing on this trip: three of them are diarised. */
  cancelBy?: string
  host?: string
  hostPhone?: string
  /** Booked under a different name than the traveller goes by. Real, and it matters at check-in. */
  guestName?: string
  breakfast?: boolean
  /** From a pasted Google Maps link. The Stay Marker stands here, not at the Stop's centre. */
  lng?: number
  lat?: number
  note?: string
}

export type Stop = {
  id: string
  name: string
  country: string
  /** ISO. Null on the trip's first Stop — you do not arrive at home. */
  arrival: string | null
  /** ISO. Null on the trip's last Stop. */
  departure: string | null
  lng: number
  lat: number
  /** Layovers are real geometry with no bed and no day. */
  layover?: boolean
  stay?: Stay
  /** Why this place, in the traveller's words. Not a field — a prototype crutch for context. */
  blurb?: string
}

export type Leg = {
  /** Derived: `${fromStopId}->${toStopId}`. Never entered; always looked up. */
  key: string
  mode: Mode
  /** A second Mode on the same movement, e.g. sleeper train then van. */
  alsoMode?: Mode
  departAt?: string
  arriveAt?: string
  /** Where the movement actually starts — a station, a terminal, the next beach along. */
  from?: string
  to?: string
  carrier?: string
  /** Flight number, train number, boat operator's service. */
  service?: string
  reference?: string
  seat?: string
  price?: Money
  booked: boolean
  /** Places the vehicle calls at that are not Stops. */
  callsAt?: string[]
  note?: string
}

export type Trip = {
  name: string
  stops: Stop[]
  /** Annotations hung on the gaps between Stops. The gaps themselves come from `stops` order. */
  legs: Leg[]
}

export const SEA_TRIP: Trip = {
  name: 'Southeast Asia — Christmas 2026',
  stops: [
    {
      id: 'cph-out',
      name: 'Copenhagen',
      country: 'Denmark',
      arrival: null,
      departure: '2026-12-13T18:00',
      lng: 12.5683,
      lat: 55.6761,
      blurb: 'Home. The trip leaves from here.',
    },
    {
      id: 'pek',
      name: 'Beijing',
      country: 'China',
      arrival: '2026-12-14T09:45',
      departure: '2026-12-14T13:55',
      lng: 116.5844,
      lat: 40.0799,
      layover: true,
      blurb: '4h10 airside, T3 → T3. Visa-free under the 24h rule.',
    },
    {
      id: 'bkk',
      name: 'Bangkok',
      country: 'Thailand',
      arrival: '2026-12-14T18:05',
      departure: '2026-12-15T19:50',
      lng: 100.5018,
      lat: 13.7563,
      stay: {
        name: 'Sukhumvit or Silom — not chosen yet',
        status: 'shortlisted',
        price: { amount: 650, currency: 'SEK' },
        note: 'Book in November. On the BTS/MRT. Avoid Khao San.',
      },
      blurb: 'One night, one full day, then the sleeper.',
    },
    {
      id: 'aonang',
      name: 'Ao Nang',
      country: 'Thailand',
      arrival: '2026-12-16T09:30',
      departure: '2026-12-20T10:10',
      lng: 98.8225,
      lat: 8.0324,
      stay: {
        name: 'Shop the 600–800 SEK band — A/C and a pool',
        status: 'shortlisted',
        price: { amount: 2800, currency: 'SEK' },
        note: 'October. 134 under-cap properties, so no urgency. Refundable, verified at room level.',
      },
      blurb: 'Railay by longtail, Dragon Crest, and the first real unwind.',
    },
    {
      id: 'kradan',
      name: 'Koh Kradan',
      country: 'Thailand',
      arrival: '2026-12-20T13:40',
      departure: '2026-12-23T11:35',
      lng: 99.2531,
      lat: 7.3167,
      stay: {
        name: 'Ao Niang Beach Resort',
        status: 'booked',
        platform: 'Agoda',
        reference: '688166919',
        price: { amount: 1605.86, currency: 'SEK' },
        cancelBy: '2026-12-13',
        host: 'Thidarat',
        hostPhone: '+66 81 893 8008',
        guestName: 'Timothy Petersson',
        breakfast: true,
        lng: 99.2565,
        lat: 7.3086,
        note: 'The only resort on its own beach. House reef ~50 m off the sand.',
      },
      blurb: 'No roads, no village, 4 km × 300 m.',
    },
    {
      id: 'mook',
      name: 'Koh Mook',
      country: 'Thailand',
      arrival: '2026-12-23T12:00',
      departure: '2026-12-26T09:00',
      lng: 99.2967,
      lat: 7.3797,
      stay: {
        name: 'Charlie Beach side — beachfront',
        status: 'shortlisted',
        note: 'Book soon, then cancel the Bulon Le incumbent (free until 21 Dec).',
      },
      blurb:
        'Christmas Eve and Christmas Day. The Emerald Cave, and a working village.',
    },
    {
      id: 'lipe',
      name: 'Koh Lipe',
      country: 'Thailand',
      arrival: '2026-12-26T11:00',
      departure: '2026-12-29T09:30',
      lng: 99.3053,
      lat: 6.4869,
      stay: {
        name: 'The Noi Guesthouse',
        status: 'placeholder',
        platform: 'Agoda',
        reference: '746681',
        price: { amount: 2254, currency: 'SEK' },
        cancelBy: '2026-12-23',
        note: 'Held for 25–28 Dec, which is no longer the plan. Re-shop for 26–29 and cancel this.',
      },
      blurb: 'Best snorkelling on the route. File the MDAC from here.',
    },
    {
      id: 'langkawi',
      name: 'Langkawi',
      country: 'Malaysia',
      arrival: '2026-12-29T11:00',
      departure: '2027-01-01T10:00',
      lng: 99.68,
      lat: 6.36,
      stay: {
        name: 'Telaga / Pantai Kok — not Cenang',
        status: 'shortlisted',
        price: { amount: 2250, currency: 'SEK' },
        note: 'The scarcest unbooked bed on the route. Peak Malaysian holiday into NYE.',
      },
      blurb: "New Year's Eve. Machinchang, the mangroves, and duty-free.",
    },
    {
      id: 'penang',
      name: 'Penang — George Town',
      country: 'Malaysia',
      arrival: '2027-01-01T12:00',
      departure: '2027-01-04T15:00',
      lng: 100.3327,
      lat: 5.4141,
      stay: {
        name: 'Heritage core — Chulia, Armenian or Love Lane',
        status: 'shortlisted',
        price: { amount: 1300, currency: 'SEK' },
        note: 'The best walkable base of the trip. Not Gurney.',
      },
      blurb: 'Penang Hill, the national park, and the eating.',
    },
    {
      id: 'kl',
      name: 'Kuala Lumpur',
      country: 'Malaysia',
      arrival: '2027-01-04T19:00',
      departure: '2027-01-06T06:20',
      lng: 101.6869,
      lat: 3.139,
      stay: {
        name: 'Bukit Bintang',
        status: 'shortlisted',
        price: { amount: 1300, currency: 'SEK' },
        note: 'November. Food and walkability.',
      },
      blurb: 'Batu Caves and the FRIM skywalk, then home.',
    },
    {
      id: 'dxb',
      name: 'Dubai',
      country: 'UAE',
      arrival: '2027-01-06T13:20',
      departure: '2027-01-06T14:50',
      lng: 55.3644,
      lat: 25.2532,
      layover: true,
      blurb: '1h30, T3 → T3.',
    },
    {
      id: 'cph-home',
      name: 'Copenhagen',
      country: 'Denmark',
      arrival: '2027-01-06T18:50',
      departure: null,
      lng: 12.5683,
      lat: 55.6761,
      blurb: 'Back at work on the Thursday.',
    },
  ],
  legs: [
    {
      key: 'cph-out->pek',
      mode: 'flight',
      departAt: '2026-12-13T18:00',
      arriveAt: '2026-12-14T09:45',
      from: 'CPH T3',
      to: 'PEK T3',
      carrier: 'Air China',
      service: 'CA878',
      reference: 'EEOIO2',
      seat: '52L',
      price: { amount: 4072, currency: 'SEK' },
      booked: true,
      note: 'Price covers both Air China legs. Refund not permitted; changes 150 EUR.',
    },
    {
      key: 'pek->bkk',
      mode: 'flight',
      departAt: '2026-12-14T13:55',
      arriveAt: '2026-12-14T18:05',
      from: 'PEK T3',
      to: 'BKK Suvarnabhumi',
      carrier: 'Air China',
      service: 'CA959',
      reference: 'EEOIO2',
      seat: '46L',
      booked: true,
    },
    {
      key: 'bkk->aonang',
      mode: 'train',
      alsoMode: 'van',
      departAt: '2026-12-15T19:50',
      arriveAt: '2026-12-16T09:30',
      from: 'Krung Thep Aphiwat',
      to: 'Ao Nang',
      carrier: 'A and T Travel, via 12go',
      price: { amount: 504, currency: 'SEK' },
      booked: false,
      note: '2nd class A/C sleeper, then a van. Book in September. Ask for a lower berth.',
    },
    {
      key: 'aonang->kradan',
      mode: 'boat',
      departAt: '2026-12-20T10:10',
      arriveAt: '2026-12-20T13:40',
      from: 'Nopparat Thara',
      to: 'Kradan Beach Jetty',
      carrier: 'Bundhaya',
      price: { amount: 2000, currency: 'THB' },
      booked: false,
      callsAt: ['Koh Ngai', 'Koh Mook'],
      note: 'Songthaew to Nopparat Thara, ~5 min. Book on 12go a few days ahead.',
    },
    {
      key: 'kradan->mook',
      mode: 'boat',
      departAt: '2026-12-23T11:35',
      from: 'Kradan Beach Jetty',
      price: { amount: 320, currency: 'SEK' },
      booked: false,
      note: '~20 min northbound. Confirm the day’s sailing with the Ao Niang host.',
    },
    {
      key: 'mook->lipe',
      mode: 'boat',
      departAt: '2026-12-26T09:00',
      price: { amount: 205, currency: 'SEK' },
      booked: false,
      note: '~2h down the southbound corridor.',
    },
    {
      key: 'lipe->langkawi',
      mode: 'ferry',
      departAt: '2026-12-29T09:30',
      arriveAt: '2026-12-29T11:00',
      to: 'Telaga or Kuah',
      price: { amount: 350, currency: 'SEK' },
      booked: false,
      note: 'Sea border. Immigration on the beach at Lipe. Two sailings daily; book ahead over NYE.',
    },
    {
      key: 'langkawi->penang',
      mode: 'flight',
      departAt: '2027-01-01T10:00',
      arriveAt: '2027-01-01T12:00',
      price: { amount: 500, currency: 'SEK' },
      booked: false,
      note: '~40 min. Thin route, and 1 Jan is a holiday — book early. No ferry exists.',
    },
    {
      key: 'penang->kl',
      mode: 'train',
      departAt: '2027-01-04T15:00',
      arriveAt: '2027-01-04T19:00',
      from: 'Butterworth',
      to: 'KL Sentral',
      carrier: 'KTM ETS',
      price: { amount: 79, currency: 'MYR' },
      booked: false,
      note: 'Sales open ~6 months ahead in monthly blocks. Take an afternoon departure.',
    },
    {
      key: 'kl->dxb',
      mode: 'flight',
      departAt: '2027-01-06T10:15',
      arriveAt: '2027-01-06T13:20',
      from: 'KUL T1',
      to: 'DXB T3',
      carrier: 'Emirates',
      service: 'EK345',
      reference: 'MMMNEN',
      seat: '27K',
      price: { amount: 2000, currency: 'MYR' },
      booked: true,
      note: 'Economy Flex, 30 kg checked. Check-in opens 06:15.',
    },
    {
      key: 'dxb->cph-home',
      mode: 'flight',
      departAt: '2027-01-06T14:50',
      arriveAt: '2027-01-06T18:50',
      from: 'DXB T3',
      to: 'CPH T3',
      carrier: 'Emirates',
      service: 'EK153',
      reference: 'MMMNEN',
      seat: '26K',
      booked: true,
    },
  ],
}

/** Legs are derived from Stop order. This is the derivation, and it is the only way to get one. */
export function legsOf(
  trip: Trip,
): { from: Stop; to: Stop; leg: Leg | undefined }[] {
  return trip.stops.slice(0, -1).map((from, i) => {
    const to = trip.stops[i + 1]
    return {
      from,
      to,
      leg: trip.legs.find((l) => l.key === `${from.id}->${to.id}`),
    }
  })
}

/** Nights are derivable, so they are never stored. This is the derivation. */
export function nightsAt(stop: Stop): number {
  if (!stop.arrival || !stop.departure || stop.layover) return 0
  const a = new Date(stop.arrival)
  const d = new Date(stop.departure)
  const day = (x: Date) => Date.UTC(x.getFullYear(), x.getMonth(), x.getDate())
  return Math.round((day(d) - day(a)) / 86_400_000)
}

export const MODE_GLYPH: Record<Mode, string> = {
  flight: '✈',
  train: '🚂',
  ferry: '⛴',
  boat: '🛥',
  bus: '🚌',
  van: '🚐',
  transfer: '→',
}

export function money(m?: Money): string {
  if (!m) return '—'
  return `${m.amount.toLocaleString('en-GB')} ${m.currency}`
}

export function shortDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
  })
}

export function time(iso?: string | null): string {
  if (!iso) return ''
  return new Date(iso).toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
  })
}
