/**
 * A software rasteriser, so the model set can be *looked at* without a browser.
 *
 * #17's scale table has to be tuned by eye — which end of somebody else's boat is the bow is not a
 * thing arithmetic settles. Standing up a dev server and a three.js scene to answer it would be a
 * bigger apparatus than the answer deserves, so the pipeline draws its own contact sheet: flat-shaded
 * orthographic projections, straight to a PNG, in about as much code as the GLTFLoader wiring would
 * have been.
 *
 * Deliberately crude — painter's algorithm, no z-buffer, one directional light. It is a measuring
 * instrument, not a renderer.
 */

import { deflateSync } from 'node:zlib'

/* -------------------------------------------------------------------------- */
/*  Canvas                                                                    */
/* -------------------------------------------------------------------------- */

/** 2× supersampled: silhouettes are what these sheets are read for, so edges matter. */
const SS = 2

export function createCanvas(width, height, background = [246, 246, 244]) {
  const canvas = {
    width: width * SS,
    height: height * SS,
    outWidth: width,
    outHeight: height,
    pixels: new Uint8Array(width * SS * height * SS * 3),
  }

  for (let i = 0; i < canvas.pixels.length; i += 3) {
    canvas.pixels[i] = background[0]
    canvas.pixels[i + 1] = background[1]
    canvas.pixels[i + 2] = background[2]
  }

  return canvas
}

const setPixel = (canvas, x, y, [r, g, b]) => {
  if (x < 0 || y < 0 || x >= canvas.width || y >= canvas.height) return
  const at = (y * canvas.width + x) * 3
  canvas.pixels[at] = r
  canvas.pixels[at + 1] = g
  canvas.pixels[at + 2] = b
}

/** Box-downsamples the supersampled buffer into 8-bit RGB scanlines. */
function resolve(canvas) {
  const out = new Uint8Array(canvas.outWidth * canvas.outHeight * 3)

  for (let y = 0; y < canvas.outHeight; y++) {
    for (let x = 0; x < canvas.outWidth; x++) {
      const total = [0, 0, 0]
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const at = ((y * SS + sy) * canvas.width + (x * SS + sx)) * 3
          total[0] += canvas.pixels[at]
          total[1] += canvas.pixels[at + 1]
          total[2] += canvas.pixels[at + 2]
        }
      }
      const at = (y * canvas.outWidth + x) * 3
      for (let c = 0; c < 3; c++) out[at + c] = Math.round(total[c] / (SS * SS))
    }
  }

  return out
}

/* -------------------------------------------------------------------------- */
/*  Drawing                                                                   */
/* -------------------------------------------------------------------------- */

export function fillTriangle(canvas, a, b, c, colour) {
  const minX = Math.max(0, Math.floor(Math.min(a[0], b[0], c[0])))
  const maxX = Math.min(canvas.width - 1, Math.ceil(Math.max(a[0], b[0], c[0])))
  const minY = Math.max(0, Math.floor(Math.min(a[1], b[1], c[1])))
  const maxY = Math.min(
    canvas.height - 1,
    Math.ceil(Math.max(a[1], b[1], c[1])),
  )

  const edge = (p, q, x, y) =>
    (q[0] - p[0]) * (y - p[1]) - (q[1] - p[1]) * (x - p[0])
  const area = edge(a, b, c[0], c[1])
  if (area === 0) return

  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const px = x + 0.5
      const py = y + 0.5
      const w0 = edge(b, c, px, py) / area
      const w1 = edge(c, a, px, py) / area
      const w2 = edge(a, b, px, py) / area
      if (w0 >= 0 && w1 >= 0 && w2 >= 0) setPixel(canvas, x, y, colour)
    }
  }
}

export function drawLine(canvas, [x0, y0], [x1, y1], colour, width = 1) {
  const steps =
    Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))) * 2 + 1
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    const x = Math.round(x0 + (x1 - x0) * t)
    const y = Math.round(y0 + (y1 - y0) * t)
    for (let dy = 0; dy < width; dy++) {
      for (let dx = 0; dx < width; dx++)
        setPixel(canvas, x + dx, y + dy, colour)
    }
  }
}

export const drawRect = (canvas, [x0, y0], [x1, y1], colour, width = 1) => {
  drawLine(canvas, [x0, y0], [x1, y0], colour, width)
  drawLine(canvas, [x1, y0], [x1, y1], colour, width)
  drawLine(canvas, [x1, y1], [x0, y1], colour, width)
  drawLine(canvas, [x0, y1], [x0, y0], colour, width)
}

/* -------------------------------------------------------------------------- */
/*  A 4×6 bitmap font, so a contact sheet can say what it is showing          */
/* -------------------------------------------------------------------------- */

// Each glyph is six rows of four bits, high bit leftmost.
const GLYPHS = {
  A: [0x6, 0x9, 0x9, 0xf, 0x9, 0x9],
  B: [0xe, 0x9, 0xe, 0x9, 0x9, 0xe],
  C: [0x6, 0x9, 0x8, 0x8, 0x9, 0x6],
  D: [0xe, 0x9, 0x9, 0x9, 0x9, 0xe],
  E: [0xf, 0x8, 0xe, 0x8, 0x8, 0xf],
  F: [0xf, 0x8, 0xe, 0x8, 0x8, 0x8],
  G: [0x6, 0x9, 0x8, 0xb, 0x9, 0x6],
  H: [0x9, 0x9, 0xf, 0x9, 0x9, 0x9],
  I: [0xe, 0x4, 0x4, 0x4, 0x4, 0xe],
  J: [0x1, 0x1, 0x1, 0x1, 0x9, 0x6],
  K: [0x9, 0xa, 0xc, 0xc, 0xa, 0x9],
  L: [0x8, 0x8, 0x8, 0x8, 0x8, 0xf],
  M: [0x9, 0xf, 0xf, 0x9, 0x9, 0x9],
  N: [0x9, 0xd, 0xf, 0xb, 0x9, 0x9],
  O: [0x6, 0x9, 0x9, 0x9, 0x9, 0x6],
  P: [0xe, 0x9, 0x9, 0xe, 0x8, 0x8],
  Q: [0x6, 0x9, 0x9, 0xb, 0x6, 0x1],
  R: [0xe, 0x9, 0x9, 0xe, 0xa, 0x9],
  S: [0x7, 0x8, 0x6, 0x1, 0x9, 0x6],
  T: [0xe, 0x4, 0x4, 0x4, 0x4, 0x4],
  U: [0x9, 0x9, 0x9, 0x9, 0x9, 0x6],
  V: [0x9, 0x9, 0x9, 0x9, 0x6, 0x6],
  W: [0x9, 0x9, 0x9, 0xf, 0xf, 0x9],
  X: [0x9, 0x9, 0x6, 0x6, 0x9, 0x9],
  Y: [0x9, 0x9, 0x6, 0x4, 0x4, 0x4],
  Z: [0xf, 0x1, 0x2, 0x4, 0x8, 0xf],
  0: [0x6, 0x9, 0xb, 0xd, 0x9, 0x6],
  1: [0x4, 0xc, 0x4, 0x4, 0x4, 0xe],
  2: [0x6, 0x9, 0x1, 0x2, 0x4, 0xf],
  3: [0xe, 0x1, 0x6, 0x1, 0x1, 0xe],
  4: [0x9, 0x9, 0x9, 0xf, 0x1, 0x1],
  5: [0xf, 0x8, 0xe, 0x1, 0x1, 0xe],
  6: [0x6, 0x8, 0xe, 0x9, 0x9, 0x6],
  7: [0xf, 0x1, 0x2, 0x4, 0x4, 0x4],
  8: [0x6, 0x9, 0x6, 0x9, 0x9, 0x6],
  9: [0x6, 0x9, 0x9, 0x7, 0x1, 0x6],
  '-': [0x0, 0x0, 0xf, 0x0, 0x0, 0x0],
  '+': [0x0, 0x4, 0xe, 0x4, 0x0, 0x0],
  '.': [0x0, 0x0, 0x0, 0x0, 0x0, 0x4],
  ':': [0x0, 0x4, 0x0, 0x0, 0x4, 0x0],
  '/': [0x1, 0x1, 0x2, 0x4, 0x8, 0x8],
  '<': [0x0, 0x2, 0x4, 0x8, 0x4, 0x2],
  '>': [0x0, 0x8, 0x4, 0x2, 0x4, 0x8],
  ' ': [0, 0, 0, 0, 0, 0],
}

export function drawText(canvas, text, [x, y], colour, pixel = SS) {
  let cursor = x * SS

  for (const character of text.toUpperCase()) {
    const glyph = GLYPHS[character] ?? GLYPHS[' ']
    for (let row = 0; row < 6; row++) {
      for (let column = 0; column < 4; column++) {
        if (!(glyph[row] & (0x8 >> column))) continue
        for (let dy = 0; dy < pixel; dy++) {
          for (let dx = 0; dx < pixel; dx++) {
            setPixel(
              canvas,
              cursor + column * pixel + dx,
              y * SS + row * pixel + dy,
              colour,
            )
          }
        }
      }
    }
    cursor += 5 * pixel
  }
}

/** Width in output pixels of a string drawn at the default size. */
export const textWidth = (text, pixel = SS) => (text.length * 5 * pixel) / SS

/* -------------------------------------------------------------------------- */
/*  PNG                                                                       */
/* -------------------------------------------------------------------------- */

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})

const crc32 = (buffer) => {
  let c = 0xffffffff
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

const chunk = (type, data) => {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([length, body, crc])
}

/** Truecolour 8-bit PNG, filter type 0. No dependency earns its place for this. */
export function encodePng(canvas) {
  const rgb = resolve(canvas)
  const { outWidth: width, outHeight: height } = canvas

  const raw = Buffer.alloc(height * (width * 3 + 1))
  for (let y = 0; y < height; y++) {
    raw[y * (width * 3 + 1)] = 0
    Buffer.from(rgb.buffer, y * width * 3, width * 3).copy(
      raw,
      y * (width * 3 + 1) + 1,
    )
  }

  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(height, 4)
  header[8] = 8 // bit depth
  header[9] = 2 // truecolour

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

/* -------------------------------------------------------------------------- */
/*  Geometry                                                                  */
/* -------------------------------------------------------------------------- */

const applyMatrix = (m, [x, y, z]) => [
  m[0] * x + m[4] * y + m[8] * z + m[12],
  m[1] * x + m[5] * y + m[9] * z + m[13],
  m[2] * x + m[6] * y + m[10] * z + m[14],
]

const applyMatrixDirection = (m, [x, y, z]) => [
  m[0] * x + m[4] * y + m[8] * z,
  m[1] * x + m[5] * y + m[9] * z,
  m[2] * x + m[6] * y + m[10] * z,
]

const subtract = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]

const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
]

const normalise = (v) => {
  const length = Math.hypot(...v) || 1
  return [v[0] / length, v[1] / length, v[2] / length]
}

/**
 * Every triangle of a Document's scene in world space, with a shading normal.
 *
 * Uses the mesh's own normals where they exist and falls back to the geometric normal, because a
 * converted OBJ may carry none and a flat-shaded silhouette is the whole point.
 */
export function collectTriangles(document, uniformScale = 1) {
  const triangles = []

  for (const node of document.getRoot().listNodes()) {
    const mesh = node.getMesh()
    if (!mesh) continue

    const matrix = node.getWorldMatrix()

    for (const primitive of mesh.listPrimitives()) {
      const position = primitive.getAttribute('POSITION')
      if (!position) continue
      const normal = primitive.getAttribute('NORMAL')
      const indices = primitive.getIndices()
      const count = indices ? indices.getCount() : position.getCount()
      const material = primitive.getMaterial()
      const factor = material?.getBaseColorFactor() ?? [1, 1, 1, 1]

      const scratch = []
      const vertexAt = (i) => {
        const index = indices ? indices.getScalar(i) : i
        const point = applyMatrix(
          matrix,
          position.getElement(index, scratch),
        ).map((value) => value * uniformScale)
        const shading = normal
          ? normalise(
              applyMatrixDirection(matrix, normal.getElement(index, scratch)),
            )
          : null
        return { point, shading }
      }

      for (let i = 0; i < count; i += 3) {
        const [a, b, c] = [vertexAt(i), vertexAt(i + 1), vertexAt(i + 2)]
        const geometric = normalise(
          cross(subtract(b.point, a.point), subtract(c.point, a.point)),
        )
        triangles.push({
          points: [a.point, b.point, c.point],
          normal: a.shading ?? geometric,
          factor,
        })
      }
    }
  }

  return triangles
}
