import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { createCanvas, drawLine, encodePng } from '../models/lib/raster.mjs'
import { readPng } from './png.mjs'

/**
 * The PNG reader, pinned from both ends.
 *
 * It is a measuring instrument (see `README.md`), so a quiet mistake in it does not crash anything —
 * it produces a number that is wrong, in a report nobody can check without the thing the report was
 * meant to replace. Two tests, because they cover different halves of the format:
 *
 * - **Round-trip** against the pipeline's own encoder proves the pixels come back exactly. It only
 *   exercises **filter type 0**, which is all `encodePng` emits.
 * - **A real Chromium screenshot** — one of #22's own evidence frames, committed — is what exercises
 *   the adaptive filtering every browser actually writes, Paeth included. Decoding it wrong would
 *   have gone unnoticed: a broken filter chain produces plausible-looking noise, not an exception.
 */

const temp = () => join(mkdtempSync(join(tmpdir(), 'onward-png-')), 'x.png')

describe('readPng', () => {
  it('round-trips the pipeline’s own encoder exactly', () => {
    const canvas = createCanvas(40, 24, [232, 221, 196])
    // Well inside the frame and thick, so the 2× supersample resolves to flat colour rather than to
    // an edge — this is testing the reader, not the rasteriser's antialiasing.
    drawLine(canvas, [16, 16], [64, 16], [47, 79, 79], 16)

    const path = temp()
    writeFileSync(path, encodePng(canvas))
    const img = readPng(path)

    expect([img.width, img.height, img.channels]).toEqual([40, 24, 3])
    expect(img.at(1, 1)).toEqual([232, 221, 196])
    expect(img.at(15, 10)).toEqual([47, 79, 79])
  })

  it('reads a real browser screenshot, adaptive filters and all', () => {
    const img = readPng(
      new URL('../../docs/casing/after-trip.png', import.meta.url).pathname,
    )

    expect([img.width, img.height]).toEqual([1400, 900])

    // Open water in the Gulf of Thailand: the style's `water` fill #7fc0c4, one off on red where the
    // hillshade touches it. A reader with a broken filter chain does not land within 2 of this by
    // accident — every row past the first depends on the row above being reconstructed correctly.
    const [r, g, b] = img.at(1200, 400)
    expect(Math.abs(r - 0x7f)).toBeLessThanOrEqual(2)
    expect(Math.abs(g - 0xc0)).toBeLessThanOrEqual(2)
    expect(Math.abs(b - 0xc4)).toBeLessThanOrEqual(2)
  })

  it('refuses a file that is not a PNG rather than returning noise', () => {
    const path = temp()
    writeFileSync(path, Buffer.from('not a png at all'))
    expect(() => readPng(path)).toThrow(/not a PNG/)
  })
})
