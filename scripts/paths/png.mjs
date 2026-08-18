/**
 * A minimal PNG reader, so a screenshot can be measured rather than looked at.
 *
 * The pipeline already ships a hand-rolled PNG *encoder* (`scripts/models/lib/raster.mjs`) for the
 * same reason — evidence you can put a number on beats evidence you have to squint at. This is the
 * other direction, and only as much of the format as Chromium's screenshots actually emit:
 * 8-bit RGB/RGBA, non-interlaced.
 */

import { readFileSync } from 'node:fs'
import { inflateSync } from 'node:zlib'

const PAETH = (a, b, c) => {
  const p = a + b - c
  const pa = Math.abs(p - a)
  const pb = Math.abs(p - b)
  const pc = Math.abs(p - c)
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c
}

export function readPng(path) {
  const buf = readFileSync(path)
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error(`${path}: not a PNG`)

  let at = 8
  let width = 0
  let height = 0
  let channels = 0
  const idat = []

  while (at < buf.length) {
    const length = buf.readUInt32BE(at)
    const kind = buf.toString('ascii', at + 4, at + 8)
    const body = buf.subarray(at + 8, at + 8 + length)

    if (kind === 'IHDR') {
      width = body.readUInt32BE(0)
      height = body.readUInt32BE(4)
      const depth = body[8]
      const colour = body[9]
      const interlace = body[12]
      if (depth !== 8) throw new Error(`${path}: ${depth}-bit, expected 8`)
      if (interlace !== 0) throw new Error(`${path}: interlaced`)
      channels = { 2: 3, 6: 4, 0: 1, 4: 2 }[colour]
      if (!channels) throw new Error(`${path}: colour type ${colour}`)
    } else if (kind === 'IDAT') {
      idat.push(body)
    } else if (kind === 'IEND') {
      break
    }

    at += 12 + length
  }

  const raw = inflateSync(Buffer.concat(idat))
  const stride = width * channels
  const pixels = new Uint8Array(width * height * channels)

  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)]
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1))
    const out = y * stride

    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? pixels[out + x - channels] : 0
      const b = y > 0 ? pixels[out - stride + x] : 0
      const c = x >= channels && y > 0 ? pixels[out - stride + x - channels] : 0
      const v = line[x]

      pixels[out + x] =
        filter === 0
          ? v
          : filter === 1
            ? v + a
            : filter === 2
              ? v + b
              : filter === 3
                ? v + ((a + b) >> 1)
                : v + PAETH(a, b, c)
    }
  }

  return {
    width,
    height,
    channels,
    at: (x, y) => {
      const i = (y * width + x) * channels
      return [pixels[i], pixels[i + 1], pixels[i + 2]]
    },
  }
}
