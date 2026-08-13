/**
 * Turning whatever was on disk into an Itinerary.
 *
 * This is the half of persistence that decides whether a schema change costs the traveller his typed
 * itinerary, so it is deliberately **lenient about absence and strict about identity**:
 *
 * - A **missing** field takes its default, and an **unknown** field is ignored. So adding a field —
 *   which is what almost every ticket left in this build does — needs no migration and no version
 *   bump: files written before it keep loading.
 * - A field of the **wrong type** is treated as absent rather than coerced. `"3"` is not a price and
 *   `{}` is not a coordinate, and quietly turning one into the other is how a corrupt file becomes a
 *   plausible-looking wrong trip.
 * - The **envelope's identity** is checked before anything else. A file that is not ours, or is from a
 *   later build, is refused whole. Reading a newer file leniently would mean dropping fields this
 *   build has never heard of and then writing the loss back over the original.
 *
 * The readers also repair the model's own invariants on the way in, because `model.ts` states them and
 * nothing else enforces them at a boundary: a Booking without a reference is not a Booking, a Stay
 * claiming to be Booked without one is only Shortlisted, and two Stops may not share an id — the
 * reducer addresses Stops by id, so a duplicate would edit both at once.
 */

import type {
  Booking,
  Coord,
  Leg,
  Mode,
  Money,
  Place,
  Stay,
  StayStatus,
  Stop,
  Trip,
} from './model'
import {
  CURRENT_SCHEMA_VERSION,
  STORE_KIND,
  envelopeOf,
  type StoreEnvelope,
  type StoreRead,
} from './store'

type Raw = Record<string, unknown>

const isRaw = (value: unknown): value is Raw =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/** Present and the right type, or absent. Never coerced — see the note above. */
const str = (value: unknown): string | null =>
  typeof value === 'string' ? value : null

const num = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null

const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : [])

const raw = (value: unknown): Raw => (isRaw(value) ? value : {})

const MODES: readonly string[] = [
  'flight',
  'train',
  'ferry',
  'boat',
  'bus',
  'van',
] satisfies Mode[]

const STAY_STATUSES: readonly string[] = [
  'booked',
  'placeholder',
  'shortlisted',
] satisfies StayStatus[]

const readMode = (value: unknown): Mode | null => {
  const mode = str(value)
  return mode !== null && MODES.includes(mode) ? (mode as Mode) : null
}

/** Both halves or nothing: half a coordinate cannot be drawn, and 0 is a real longitude. */
const readCoord = (value: unknown): Coord | null => {
  const source = raw(value)
  const lng = num(source.lng)
  const lat = num(source.lat)
  return lng === null || lat === null ? null : { lng, lat }
}

/**
 * A Place needs its coordinate — it exists so a Path bends through it — but not its name. A nameless
 * Via still bends the Path correctly, whereas dropping it for a missing name would silently
 * straighten a long-haul that really did route through Beijing.
 */
const readPlace = (value: unknown): Place | null => {
  const coord = readCoord(value)
  return coord === null ? null : { ...coord, name: str(raw(value).name) ?? '' }
}

/** The amount carries the meaning; a missing currency is a blank, not a reason to drop the figure. */
const readMoney = (value: unknown): Money | null => {
  const source = raw(value)
  const amount = num(source.amount)
  return amount === null
    ? null
    : { amount, currency: str(source.currency) ?? '' }
}

/**
 * A Booking survives if anything was typed into it; only an entirely blank one is dropped.
 *
 * `model.ts` says a Booking without a reference is merely an intention, and an earlier version of this
 * function enforced that literally — returning `null` for a blank reference. **That deleted real data.**
 * The sidebar creates `{ reference: '', platform: null, … }` the instant the traveller clicks "＋ I have
 * booked this", so the ordinary case of a booking made before its reference arrives — the guesthouse
 * that gave none, the airline's confirmation still in flight — carried a free-cancellation deadline and
 * a phone number that were silently discarded on the next read, and then written back over the file.
 *
 * Those two fields are not decoration: `cancelBy` is what `atRisk` uses to decide whether money is
 * still refundable, and `contact` is what `model.ts` calls the arrival logistics on an island with no
 * roads. So the invariant belongs to what the sidebar *writes*, not to what the reader is allowed to
 * throw away.
 */
const readBooking = (value: unknown): Booking | null => {
  const source = raw(value)

  const booking: Booking = {
    reference: str(source.reference) ?? '',
    platform: str(source.platform),
    cancelBy: str(source.cancelBy),
    contact: str(source.contact),
    detail: str(source.detail),
  }

  const blank =
    !booking.reference &&
    booking.platform === null &&
    booking.cancelBy === null &&
    booking.contact === null &&
    booking.detail === null

  return blank ? null : booking
}

/**
 * A Stay whose Booking did not survive the read cannot still claim to be Booked or held as a
 * Placeholder: both of those mean money is committed, and the reference is what says so. Demoting it
 * to Shortlisted keeps the map honest — it draws a pulsing Pin rather than a building standing on a
 * reservation that is not there.
 */
const readStay = (value: unknown): Stay => {
  const source = raw(value)
  const status = str(source.status)
  const booking = readBooking(source.booking)
  const claimed: StayStatus =
    status !== null && STAY_STATUSES.includes(status)
      ? (status as StayStatus)
      : 'shortlisted'

  return {
    name: str(source.name) ?? '',
    status:
      booking === null && claimed !== 'shortlisted' ? 'shortlisted' : claimed,
    coord: readCoord(source.coord),
    price: readMoney(source.price),
    booking,
  }
}

const readLeg = (value: unknown): Leg => {
  const source = raw(value)
  const dayRoll = num(source.dayRoll)

  return {
    mode: readMode(source.mode),
    secondMode: readMode(source.secondMode),
    depart: str(source.depart),
    arrive: str(source.arrive),
    // Whole days only, and never negative: it anchors a departure date by winding one back.
    dayRoll: dayRoll === null ? 0 : Math.max(0, Math.round(dayRoll)),
    durationMin: num(source.durationMin),
    price: readMoney(source.price),
    carrier: str(source.carrier),
    fromPlace: str(source.fromPlace),
    via: list(source.via)
      .map(readPlace)
      .filter((place): place is Place => place !== null),
    note: str(source.note),
    booking: readBooking(source.booking),
  }
}

/**
 * `{ lng: 0, lat: 0 }` is not a fallback pretending to be a location — it is the same not-yet-placed
 * sentinel `create.ts` gives a brand-new Stop, and the sidebar and map both already read it as
 * unplaced. A Stop with an unreadable coordinate is therefore an unplaced Stop, not a Stop in the Gulf
 * of Guinea.
 */
const readStop = (value: unknown, id: string): Stop => {
  const source = raw(value)

  return {
    id,
    name: str(source.name) ?? '',
    coord: readCoord(source.coord) ?? { lng: 0, lat: 0 },
    arrival: str(source.arrival),
    departure: str(source.departure),
    inbound: readLeg(source.inbound),
    stays: list(source.stays).map(readStay),
  }
}

const readTrip = (value: unknown, mintId: () => string): Trip => {
  const source = raw(value)
  const taken = new Set<string>()

  // Order is the array's, and identity is the id's — a duplicate id would make the reducer edit two
  // Stops with one keystroke, so the second occurrence is given a fresh one.
  const stops = list(source.stops).map((stop) => {
    const stored = str(raw(stop).id)
    const id = stored && !taken.has(stored) ? stored : mintId()
    taken.add(id)
    return readStop(stop, id)
  })

  return {
    id: str(source.id) || mintId(),
    name: str(source.name) ?? '',
    origin: readPlace(source.origin),
    stops,
    // The one Leg that arrives nowhere. Absent is meaningful: a Trip that does not return home.
    returnLeg: isRaw(source.returnLeg) ? readLeg(source.returnLeg) : null,
  }
}

/**
 * One entry per version step: `MIGRATIONS[n]` takes a version-`n` envelope to version `n + 1`.
 *
 * Empty, and expected to stay that way for a while — the defaulting readers above absorb every
 * additive change without one. An entry is owed only when a field is renamed or restructured, i.e.
 * when the old shape carries information the new readers would silently drop.
 */
export type Migration = (envelope: Raw) => Raw

export const MIGRATIONS: Record<number, Migration> = {}

/**
 * Walks an envelope forward, one version at a time.
 *
 * A step with no entry is not an error: versions are bumped for the whole envelope, and a bump whose
 * changes the readers already absorb needs no code. Forward only — an envelope from a later build is
 * refused before it ever reaches here.
 */
export function migrate(
  envelope: Raw,
  from: number,
  to: number = CURRENT_SCHEMA_VERSION,
  migrations: Record<number, Migration> = MIGRATIONS,
): Raw {
  let current = envelope

  for (let version = from; version < to; version++) {
    const step = migrations[version]
    if (step) current = step(current)
  }

  return current
}

/**
 * Reads a stored envelope, whether it arrives as the JSON text out of a file or an already-parsed
 * value.
 *
 * `mintId` is injected so a test can be deterministic about the ids it repairs; production passes
 * `crypto.randomUUID`, the same source `create.ts` uses.
 */
export function readEnvelope(
  stored: unknown,
  mintId: () => string = () => crypto.randomUUID(),
): StoreRead {
  if (stored === null || stored === undefined || stored === '') {
    return { state: 'empty' }
  }

  let value = stored

  if (typeof stored === 'string') {
    try {
      value = JSON.parse(stored)
    } catch {
      return {
        state: 'refused',
        reason: 'unreadable',
        detail: 'not valid JSON',
      }
    }
  }

  if (!isRaw(value)) {
    return {
      state: 'refused',
      reason: 'unreadable',
      detail: 'not a JSON object',
    }
  }

  if (value.kind !== STORE_KIND) {
    return { state: 'refused', reason: 'not-onward', detail: null }
  }

  const version = num(value.schemaVersion) ?? 0

  if (version > CURRENT_SCHEMA_VERSION) {
    return {
      state: 'refused',
      reason: 'too-new',
      detail: `written by schema version ${version}; this build reads ${CURRENT_SCHEMA_VERSION}`,
    }
  }

  const migrated = migrate(value, version)
  const trips = list(migrated.trips).map((trip) => readTrip(trip, mintId))

  // An `openTripId` naming a Trip the file does not contain would leave the sidebar with nothing to
  // edit while the trips sat there unread. Fall back to the first, which is what the UI shows anyway.
  const asked = str(migrated.openTripId)
  const openTripId =
    asked !== null && trips.some((trip) => trip.id === asked)
      ? asked
      : (trips.at(0)?.id ?? null)

  return {
    state: 'ok',
    // An unknown `savedAt` sorts before every real timestamp, so a file missing one loses the
    // comparison in `resolve` and gets asked about rather than silently believed.
    envelope: envelopeOf(trips, openTripId, str(migrated.savedAt) ?? ''),
  }
}

/** The text written to disk. Indented because it is a file the traveller owns and may open. */
export function writeEnvelope(envelope: StoreEnvelope): string {
  return JSON.stringify(envelope, null, 2)
}
