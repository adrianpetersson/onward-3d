/**
 * Reading a coordinate out of a pasted Google Maps link.
 *
 * Pure, offline, and the only place a paste is interpreted. The full specification this implements is
 * [`docs/research/google-maps-link-coordinates.md`](https://github.com/adrianpetersson/onward/blob/research/google-maps-link-coordinates/docs/research/google-maps-link-coordinates.md)
 * on the research branch; the pattern names below (`P1a`, `P4`, `I1`…) are its table's names, so the
 * two can be read side by side.
 *
 * **The one finding the whole feature turns on: a Maps URL usually carries two coordinates and only
 * one of them is the place.** `!8m2!3d/!4d` is the pin — the place's own position. `/@lat,lng` is
 * merely where the camera was pointing when the link was made. They are equal often enough that a
 * parser reading `/@` passes every casual test and then drops a Stay Marker in the wrong bay the
 * first time someone shares a link they made while panned elsewhere. Hence `placeLatLng` and
 * `cameraLatLng`, named apart on purpose, and the 731 km regression test in `maps-link.test.ts`.
 *
 * Nothing here fetches anything. A `maps.app.goo.gl` short link cannot be expanded from a browser —
 * verified, the 302 carries no `Access-Control-*` headers and the preflight adds none — and Onward
 * ships with no server-side code to do it for us
 * ([ADR 0002](../../docs/adr/0002-no-backend-localstorage-and-one-edge-function.md)). So a short link
 * is a rung on the ladder, not a request.
 */

import type { Coord } from './model'

/** Which shape the coordinate came out of. Kept on the reading so a bug can be traced to a row. */
export type Pattern = 'P1a' | 'P1b' | 'P2' | 'P3' | 'P4' | 'P5' | 'P6' | 'bare'

/**
 * What a paste turned out to be — the fallback ladder, as data.
 *
 * The rungs are ordered by how much they ask of the traveller, and the floor under all of them is
 * click-to-place (`map/pick-coord.ts`), which is why no rung is a dead end.
 */
export type Reading =
  /** Rung 0. The place's own coordinate. Place it. */
  | { rung: 'place'; coord: Coord; pattern: Pattern; name: string | null }
  /**
   * Rung 1. Only a camera position. **Never placed automatically** — this is the rung that stops a
   * hut on a beach being planted wherever the viewport happened to be.
   */
  | { rung: 'camera'; coord: Coord; pattern: Pattern; name: string | null }
  /** Rung 2. We know *which* place, but the link carries no position. Real, and common. */
  | { rung: 'identity'; name: string | null; openUrl: string | null }
  /** Rung 3. A route has two ends, and a Stay is one place. */
  | { rung: 'directions' }
  /** Rung 4. A share link, unreadable from a browser and with no function to ask. */
  | { rung: 'short-link' }
  /** Rung 5. Not a Maps link at all. */
  | { rung: 'unrecognised' }

const LAT = String.raw`-?\d{1,2}(?:\.\d+)?`
const LNG = String.raw`-?\d{1,3}(?:\.\d+)?`

/** `,` may arrive percent-encoded, and a `+` for a space survives into the path forms. */
const SEP = String.raw`,\s*\+?`

const BARE = new RegExp(String.raw`^(${LAT})\s*,\s*(${LNG})$`)

/** In precedence order. Every one of these is the place's own coordinate. */
const PLACE: [Pattern, RegExp][] = [
  ['P1a', new RegExp(String.raw`!8m2!3d(${LAT})!4d(${LNG})`)],
  ['P1b', new RegExp(String.raw`!3d(${LAT})!4d(${LNG})`)],
  ['P2', new RegExp(String.raw`[?&]query=(${LAT})${SEP}(${LNG})(?:&|$)`)],
  ['P3', new RegExp(String.raw`[?&]q=(?:loc:)?(${LAT})${SEP}(${LNG})(?:&|$)`)],
  ['P4', new RegExp(String.raw`/maps/search/(${LAT})${SEP}(${LNG})`)],
]

/** Also in precedence order, and none of these is a place. */
const CAMERA: [Pattern, RegExp][] = [
  [
    'P5',
    new RegExp(
      String.raw`[?&](?:ll|sll|center|viewpoint)=(${LAT})${SEP}(${LNG})`,
    ),
  ],
  ['P6', new RegExp(String.raw`/@(${LAT}),(${LNG}),[\d.]+[zmayht]`)],
]

/** I1: Google's internal feature id. Identity with no position attached. */
const FTID = /(?:[?&]ftid=|!1s)(0x[0-9a-f]{1,16}:0x[0-9a-f]{1,16})/
/** I2: the public Places id. Same, in different clothes. */
const PLACE_ID =
  /(?:place_id[:=]|[?&]query_place_id=)((?:ChIJ|Ei|Gh|El)[A-Za-z0-9_-]{10,})/

const PLACE_NAME = /\/maps\/place\/([^/@?]+)/
const QUERY_TEXT = /[?&](?:q|query)=([^&]+)/

const SHORT_LINK = /\b(?:maps\.app\.goo\.gl|goo\.gl\/maps)\//
const DIRECTIONS = /\/maps\/dir\//

/** A Plus code's own alphabet, from the research's I3 row. */
const PLUS_CODE_PREFIX =
  /^[23456789CFGHJMPQRVWX]{4,8}[+ ][23456789CFGHJMPQRVWX]{2,3}\s+/

/**
 * Reads a paste. Never throws, never fetches, and never promotes a camera to a place.
 *
 * An empty or whitespace-only paste reads as `unrecognised` rather than as its own case: the caller
 * is a text box that fires on every keystroke, and the field decides when silence is worth saying
 * something about.
 */
export function readMapsLink(input: string): Reading {
  const text = input.trim()
  if (!text) return { rung: 'unrecognised' }

  // Bare coordinates are the cheapest rescue on the board — the answer for every short link, and for
  // the live share shape that resolves to a URL with no coordinates in it at all. Anchored, so a URL
  // can never match here.
  const bare = text.match(BARE)
  if (bare) {
    const coord = coordFrom(bare[1], bare[2])
    if (coord) return { rung: 'place', coord, pattern: 'bare', name: null }
  }

  const url = decoded(text)

  if (SHORT_LINK.test(url)) return { rung: 'short-link' }

  // Before any coordinate: a directions payload carries a `!3d/!4d` pair *per waypoint*, so the first
  // match would silently be the route's origin rather than anywhere the traveller sleeps.
  if (DIRECTIONS.test(url)) return { rung: 'directions' }

  const name = nameFrom(url)

  const placeLatLng = firstMatch(url, PLACE)
  if (placeLatLng)
    return {
      rung: 'place',
      coord: placeLatLng.coord,
      pattern: placeLatLng.pattern,
      name,
    }

  const cameraLatLng = firstMatch(url, CAMERA)
  if (cameraLatLng)
    return {
      rung: 'camera',
      coord: cameraLatLng.coord,
      pattern: cameraLatLng.pattern,
      name,
    }

  const identity =
    url.match(PLACE_ID)?.[1] ?? placeIdFromFtid(url.match(FTID)?.[1])
  if (identity)
    return {
      rung: 'identity',
      name,
      openUrl: `https://www.google.com/maps/place/?q=place_id:${identity}`,
    }

  if (name) return { rung: 'identity', name, openUrl: null }

  return { rung: 'unrecognised' }
}

function firstMatch(
  url: string,
  patterns: [Pattern, RegExp][],
): { coord: Coord; pattern: Pattern } | null {
  for (const [pattern, regex] of patterns) {
    const found = url.match(regex)
    if (!found) continue
    const coord = coordFrom(found[1], found[2])
    if (coord) return { coord, pattern }
  }
  return null
}

/**
 * A pair of numbers that could be somewhere on Earth.
 *
 * The range check is not defensive padding: `!3d`/`!4d` also appear in Street View payloads meaning
 * heading and pitch, and a heading past 180 is exactly what tells the two apart.
 */
function coordFrom(latText: string, lngText: string): Coord | null {
  const lat = Number(latText)
  const lng = Number(lngText)
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null
  return { lat, lng }
}

/** Google encodes `,` as `%2C` in some share paths, so matching happens on the decoded form. */
function decoded(text: string): string {
  try {
    return decodeURIComponent(text)
  } catch {
    // A stray `%` in a pasted URL is not worth refusing the paste over.
    return text
  }
}

/**
 * A name worth offering as a prefill — the place's own Google name where the URL carries it.
 *
 * Always a prefill and never a committed value: Google's name is sometimes a transliteration
 * ("Ao-nieng" for a resort marketed as "Ao Niang") and sometimes a Plus code with an address stapled
 * to it. The traveller knows what they booked.
 */
function nameFrom(url: string): string | null {
  const fromPath = url.match(PLACE_NAME)?.[1]
  if (fromPath) return clean(fromPath)

  // `?q=` is an address-ish blob rather than a name: take the part before the first comma and drop a
  // leading Plus code, which is how `8G9M+MRR Hotel Park, 1 Al Corniche, Doha` becomes `Hotel Park`.
  const fromQuery = url.match(QUERY_TEXT)?.[1]
  if (!fromQuery) return null
  const head = clean(fromQuery).split(',')[0]
  return usable(head.replace(PLUS_CODE_PREFIX, '').trim())
}

function clean(value: string): string {
  return decoded(value).replace(/\+/g, ' ').trim()
}

/** Rejects a "name" that is really a coordinate, which is what a dropped pin gives. */
function usable(name: string): string | null {
  if (!name) return null
  if (BARE.test(name)) return null
  if (!/[a-z]/i.test(name)) return null
  return name
}

/**
 * `ftid` → `place_id`, so the identity rung can offer a working link instead of a shrug.
 *
 * The two are the same sixteen bytes in different clothes: a `place_id` is the protobuf
 * `0a 12 09 ‖ LE64(a) ‖ 11 ‖ LE64(b)` in base64url, for an `ftid` of `0x<a>:0x<b>`. The leading three
 * bytes are what every `place_id` starting `ChIJ` actually is. Verified in both directions against two
 * of Google's own entity records — both are in the tests.
 */
export function placeIdFromFtid(ftid: string | undefined): string | null {
  if (!ftid) return null
  const [a, b] = ftid.split(':')
  if (!a || !b) return null

  const bytes = new Uint8Array([0x0a, 0x12, 0x09, ...le64(a), 0x11, ...le64(b)])
  return base64url(bytes)
}

function le64(hex: string): number[] {
  let value = BigInt(hex)
  const bytes: number[] = []
  for (let i = 0; i < 8; i++) {
    bytes.push(Number(value & 0xffn))
    value >>= 8n
  }
  return bytes
}

function base64url(bytes: Uint8Array): string {
  const binary = String.fromCharCode(...bytes)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** Five decimals is ~1 m — finer than a beach hut needs, and short enough to read. */
export function formatCoord(coord: Coord): string {
  return `${coord.lat.toFixed(5)}, ${coord.lng.toFixed(5)}`
}
