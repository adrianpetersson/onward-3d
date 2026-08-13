import { describe, expect, it } from 'vitest'

import { formatCoord, placeIdFromFtid, readMapsLink } from './maps-link'

/**
 * The URLs here are the ones the research actually captured from Google on 13 Aug 2026, not URLs
 * invented to suit the parser. Two are real Stays on the Southeast Asia trip this MVP has to hold.
 *
 * The first test is the reason the research exists.
 */

/**
 * Ao-nieng Beach Resort, Koh Kradan — a real Stay on the route. This is its live share URL with
 * **one segment edited**: the camera was moved to Bangkok, 731 km away, and the `!8m2!3d/!4d` pin was
 * left alone. Loading it in a browser still resolved to the resort, which is the proof that `/@` is
 * presentation and `!3d/!4d` is identity.
 */
const AO_NIENG_CAMERA_IN_BANGKOK =
  'https://www.google.com/maps/place/Ao-nieng+Beach+Resort/@13.7563309,100.5017651,12z/data=!4m9!3m8!1s0x304dde5e177a038d:0xfe6124a305b22b80!5m2!4m1!1i2!8m2!3d7.3031889!4d99.2552559!16s%2Fg%2F11clwnp8vp'

/** Cross-checked against Google's own entity record for the resort, obtained without the URL. */
const AO_NIENG = { lat: 7.3031889, lng: 99.2552559 }
const BANGKOK = { lat: 13.7563309, lng: 100.5017651 }

describe('the camera is not the place', () => {
  it('reads the pin, not the viewport, when they are 731 km apart', () => {
    const reading = readMapsLink(AO_NIENG_CAMERA_IN_BANGKOK)

    expect(reading).toEqual({
      rung: 'place',
      coord: AO_NIENG,
      pattern: 'P1a',
      name: 'Ao-nieng Beach Resort',
    })
  })

  it('fails loudly rather than quietly: the answer is nowhere near Bangkok', () => {
    const reading = readMapsLink(AO_NIENG_CAMERA_IN_BANGKOK)

    // Stated as a distance because that is the failure the traveller would see — a Stay Marker
    // standing in central Bangkok instead of on a Koh Kradan beach.
    expect(kmApart(coordOf(reading), BANGKOK)).toBeGreaterThan(700)
    expect(kmApart(coordOf(reading), AO_NIENG)).toBeLessThan(0.01)
  })

  it('prefers the `!8m2`-anchored pair over a bare one that appears earlier', () => {
    // A bare `!3d/!4d` is weaker than the anchored pair: the same two keys mean heading and pitch in
    // a Street View payload, so position in the string must not decide it.
    const reading = readMapsLink(
      'https://www.google.com/maps/place/X/@1,2,17z/data=!3d1.5!4d2.5!8m2!3d7.3031889!4d99.2552559',
    )

    expect(reading).toMatchObject({ pattern: 'P1a', coord: AO_NIENG })
  })

  it('takes a camera coordinate as a camera, and never as a place', () => {
    // What the address bar holds after panning to Koh Mook — the real coordinate of Charlie Beach
    // Resort, another Stay on the route — without clicking the place itself.
    const reading = readMapsLink(
      'https://www.google.com/maps/@7.3601147,99.2948726,17z',
    )

    expect(reading).toEqual({
      rung: 'camera',
      coord: { lat: 7.3601147, lng: 99.2948726 },
      pattern: 'P6',
      name: null,
    })
  })
})

describe('the shapes a real paste arrives in', () => {
  it('reads what a short link resolves to', () => {
    // The verified destination of maps.app.goo.gl/VSTHi61EE8aMp8Dk9 — note the `+` for the space.
    const reading = readMapsLink(
      'https://www.google.com/maps/search/8.023077,+98.291887?coh=219680&utm_campaign=tt-rcs&entry=tts',
    )

    expect(reading).toMatchObject({
      rung: 'place',
      pattern: 'P4',
      coord: { lat: 8.023077, lng: 98.291887 },
    })
  })

  it('decodes a percent-encoded comma', () => {
    const reading = readMapsLink(
      'https://www.google.com/maps/search/?api=1&query=7.3031889%2C99.2552559',
    )

    expect(reading).toMatchObject({ rung: 'place', pattern: 'P2' })
  })

  it('accepts a bare coordinate pasted into the same box', () => {
    expect(readMapsLink('7.3032, 99.2553')).toEqual({
      rung: 'place',
      coord: { lat: 7.3032, lng: 99.2553 },
      pattern: 'bare',
      name: null,
    })
  })

  it('refuses a pair that cannot be a position on Earth', () => {
    // `!3d`/`!4d` also carry heading and pitch in Street View payloads. The range is what tells them
    // apart, and getting it wrong would place a Stay at a bearing.
    expect(
      readMapsLink('https://www.google.com/maps/x/data=!3d30!4d200'),
    ).toEqual({ rung: 'unrecognised' })
  })

  it('says nothing about an empty box', () => {
    expect(readMapsLink('   ')).toEqual({ rung: 'unrecognised' })
    expect(
      readMapsLink('https://www.booking.com/hotel/th/ao-niang.html'),
    ).toEqual({ rung: 'unrecognised' })
  })
})

describe('the rungs that carry no coordinate', () => {
  it('will not guess which end of a directions link is the Stay', () => {
    // A `/dir/` payload holds a `!3d/!4d` pair per waypoint, so the first match would be the route's
    // origin — Bangkok here, which is a Stop but not this Stay.
    const reading = readMapsLink(
      'https://www.google.com/maps/dir/Bangkok/Ao+Nang/@11.1,99.6,7z/data=!4m13!1m5!1m1!1s0x30e2:0x4e0e!2m2!1d100.5018!2d13.7563!1m5!1m1!1s0x3051:0x1!8m2!3d8.0324!4d98.8214',
    )

    expect(reading).toEqual({ rung: 'directions' })
  })

  it('does not try to expand a share link a browser cannot follow', () => {
    expect(readMapsLink('https://maps.app.goo.gl/VSTHi61EE8aMp8Dk9')).toEqual({
      rung: 'short-link',
    })
    expect(readMapsLink('https://goo.gl/maps/abc123')).toEqual({
      rung: 'short-link',
    })
  })

  it('recognises the place from a link with no coordinates at all', () => {
    // A real, live share shape: the second verified short link resolves to exactly this — an `ftid`
    // and an address-ish blob, and no position anywhere. Following it further never adds one.
    const reading = readMapsLink(
      'https://maps.google.com?q=8G9M+MRR+Hotel+Park,+1+Al+Corniche,+Doha&ftid=0x3e45c4c1f05884fd:0x3b522196a47804ad&entry=gps',
    )

    expect(reading).toEqual({
      rung: 'identity',
      name: 'Hotel Park',
      openUrl:
        'https://www.google.com/maps/place/?q=place_id:ChIJ_YRY8MHERT4RrQR4pJYhUjs',
    })
  })
})

describe('ftid and place_id are the same sixteen bytes', () => {
  // Both pairs came from Google's own entity records, independently of any share URL.
  it('converts the Doha hotel', () => {
    expect(placeIdFromFtid('0x3e45c4c1f05884fd:0x3b522196a47804ad')).toBe(
      'ChIJ_YRY8MHERT4RrQR4pJYhUjs',
    )
  })

  it('converts Ao-nieng Beach Resort', () => {
    expect(placeIdFromFtid('0x304dde5e177a038d:0xfe6124a305b22b80')).toBe(
      'ChIJjQN6F17eTTARgCuyBaMkYf4',
    )
  })

  it('has nothing to convert without an ftid', () => {
    expect(placeIdFromFtid(undefined)).toBeNull()
    expect(placeIdFromFtid('0xdeadbeef')).toBeNull()
  })
})

it('shows a coordinate at a beach hut’s precision, not a float’s', () => {
  expect(formatCoord(AO_NIENG)).toBe('7.30319, 99.25526')
})

function coordOf(reading: ReturnType<typeof readMapsLink>) {
  if (reading.rung !== 'place' && reading.rung !== 'camera')
    throw new Error(`expected a coordinate, got ${reading.rung}`)
  return reading.coord
}

/** Equirectangular approximation. Fine for asserting "731 km, not 0". */
function kmApart(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
) {
  const x = (a.lng - b.lng) * Math.cos(((a.lat + b.lat) / 2) * (Math.PI / 180))
  const y = a.lat - b.lat
  return Math.sqrt(x * x + y * y) * 111.32
}
