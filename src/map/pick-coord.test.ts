import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import type { MapLibreMap, MapMouseEvent } from 'maplibre-gl'

import type { Coord } from '../itinerary/model'
import { armForOnePick } from './pick-coord'

/**
 * Click-to-place is the floor under every other way of getting a coordinate, so its mechanics are
 * pinned here rather than left to a browser: it fires once, it always lets go of the cursor, and
 * cancelling is an outcome rather than an error.
 *
 * The map is faked down to the three things this function touches — the canvas, `on`, and `off`.
 * Anything more would be testing MapLibre.
 */

type Handler = (event: MapMouseEvent) => void
type Keys = (event: { key: string }) => void

function fakeMap() {
  const clicks = new Set<Handler>()
  const keys = new Set<Keys>()

  const canvas = {
    style: { cursor: 'grab' },
    ownerDocument: {
      addEventListener: (_type: 'keydown', handler: Keys) => keys.add(handler),
      removeEventListener: (_type: 'keydown', handler: Keys) =>
        keys.delete(handler),
    },
  } as unknown as HTMLCanvasElement

  const map = {
    getCanvas: () => canvas,
    on: (_event: 'click', handler: Handler) => clicks.add(handler),
    off: (_event: 'click', handler: Handler) => clicks.delete(handler),
  } as unknown as MapLibreMap

  return {
    map,
    canvas,
    get listening() {
      return clicks.size
    },
    clickAt(lng: number, lat: number) {
      for (const handler of [...clicks])
        handler({ lngLat: { lng, lat } } as MapMouseEvent)
    },
    press(key: string) {
      for (const handler of [...keys]) handler({ key })
    },
  }
}

describe('arming the map for one click', () => {
  let fake: ReturnType<typeof fakeMap>
  let settle: Mock<(coord: Coord | null) => void>

  beforeEach(() => {
    fake = fakeMap()
    settle = vi.fn<(coord: Coord | null) => void>()
  })

  it('hands back where the click landed', () => {
    armForOnePick(fake.map, settle)
    fake.clickAt(99.2552559, 7.3031889)

    expect(settle).toHaveBeenCalledWith({ lng: 99.2552559, lat: 7.3031889 })
  })

  it('fires once — a second click belongs to the map, not to the field', () => {
    armForOnePick(fake.map, settle)
    fake.clickAt(99.25, 7.3)
    fake.clickAt(100.5, 13.75)

    expect(settle).toHaveBeenCalledTimes(1)
    expect(settle).toHaveBeenCalledWith({ lng: 99.25, lat: 7.3 })
  })

  it('gives the cursor back, however the pick ends', () => {
    expect(fake.canvas.style.cursor).toBe('grab')

    armForOnePick(fake.map, settle)
    expect(fake.canvas.style.cursor).toBe('crosshair')

    fake.clickAt(99.25, 7.3)
    expect(fake.canvas.style.cursor).toBe('grab')
    expect(fake.listening).toBe(0)
  })

  it('treats Escape as cancelled, not as failed', () => {
    armForOnePick(fake.map, settle)
    fake.press('Escape')

    expect(settle).toHaveBeenCalledWith(null)
    expect(fake.canvas.style.cursor).toBe('grab')
    expect(fake.listening).toBe(0)
  })

  it('ignores every other key', () => {
    armForOnePick(fake.map, settle)
    fake.press('Enter')

    expect(settle).not.toHaveBeenCalled()
    expect(fake.listening).toBe(1)
  })

  it('cancels when disarmed from outside, and only the first ending counts', () => {
    const disarm = armForOnePick(fake.map, settle)
    disarm()
    disarm()
    fake.clickAt(99.25, 7.3)

    expect(settle).toHaveBeenCalledTimes(1)
    expect(settle).toHaveBeenCalledWith(null)
  })

  it('stops listening for Escape once it is done', () => {
    armForOnePick(fake.map, settle)
    fake.clickAt(99.25, 7.3)
    fake.press('Escape')

    expect(settle).toHaveBeenCalledTimes(1)
  })
})
