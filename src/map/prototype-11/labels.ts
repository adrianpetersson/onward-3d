/**
 * PROTOTYPE — #11. Three places a Stop's name can live, and one of them may not be available.
 *
 * The ticket asks "do labels live in the 3D world or float above it in the DOM", and #2 warned the
 * answer might be forced rather than chosen: a non-3D MapLibre layer may be unable to composite over
 * a custom 3D layer. Nobody has run it. So each register takes a different one and the map is asked
 * directly:
 *
 * - **`symbol`** — a MapLibre symbol layer added *above* `diorama-models`. The one that can fail.
 * - **`dom`** — a MapLibre `Marker`, which is an HTML element positioned over the canvas. It cannot
 *   fail to draw on top, because it is not in the canvas at all. It also cannot be occluded, so a
 *   Stop behind a hill still shows its name.
 * - **`sprite`** — a billboard inside the anchor's own group, so it is a thing standing on the table:
 *   occluded by terrain, and scaled in metres like everything else in there.
 */

import {
  CanvasTexture,
  LinearFilter,
  Sprite,
  SpriteMaterial,
  type Object3D,
} from 'three'
import { Marker, type Map as MapLibreMap } from 'maplibre-gl'

import type { LngLatTuple } from '../model-matrix'

export type LabelPoint = {
  id: string
  origin: LngLatTuple
  name: string
}

export const LABEL_SOURCE_ID = 'prototype-11-labels'
export const LABEL_LAYER_ID = 'prototype-11-labels'

/**
 * Added **after** the model layer, which is the whole point: if MapLibre honours the order, the name
 * draws over the roof; if #2's inference is right, the roof wins and this register needs another
 * mechanism.
 */
export function addSymbolLabels(
  map: MapLibreMap,
  points: readonly LabelPoint[],
) {
  map.addSource(LABEL_SOURCE_ID, {
    type: 'geojson',
    data: {
      type: 'FeatureCollection',
      features: points.map((point) => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [...point.origin] },
        properties: { name: point.name },
      })),
    },
  })

  map.addLayer({
    id: LABEL_LAYER_ID,
    type: 'symbol',
    source: LABEL_SOURCE_ID,
    layout: {
      'text-field': ['get', 'name'],
      'text-font': ['Noto Sans Regular'],
      'text-size': 13,
      'text-offset': [0, -1.4],
      'text-anchor': 'bottom',
      // A prototype wants every label on screen, not MapLibre's collision-thinned subset.
      'text-allow-overlap': true,
      'text-ignore-placement': true,
    },
    paint: {
      'text-color': '#2f2c26',
      'text-halo-color': '#f4efe6',
      'text-halo-width': 1.6,
    },
  })
}

/** HTML over the canvas. Always on top, never occluded — both of those are the trade. */
export function addDomLabels(
  map: MapLibreMap,
  points: readonly LabelPoint[],
): Marker[] {
  return points.map((point) => {
    const element = document.createElement('div')
    element.className = 'diorama-label'
    element.textContent = point.name

    return new Marker({ element, anchor: 'bottom' })
      .setLngLat([...point.origin])
      .addTo(map)
  })
}

/** How far above the ground the billboard floats, in metres — clear of an 8 m ridge. */
const SPRITE_HEIGHT_M = 11
/** Metres of world the billboard is wide. It scales with the map, exactly like the building does. */
const SPRITE_WIDTH_M = 13

/**
 * A billboard standing in the anchor's frame.
 *
 * It inherits the Stay Marker's own problem — at true metre scale it shrinks with everything else,
 * so it stops being legible at the same zoom the building does (#20). That is not a bug in this
 * mechanism, it is the argument against choosing it.
 */
export function buildSpriteLabel(text: string): Object3D {
  const scale = 4
  const canvas = document.createElement('canvas')
  const font = `600 ${13 * scale}px ui-sans-serif, system-ui, sans-serif`

  const measuring = canvas.getContext('2d')
  if (!measuring) throw new Error('no 2d context for a sprite label')
  measuring.font = font

  const padding = 10 * scale
  canvas.width = Math.ceil(measuring.measureText(text).width) + padding * 2
  canvas.height = 26 * scale

  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('no 2d context for a sprite label')

  ctx.font = font
  ctx.fillStyle = 'rgba(250, 246, 236, 0.94)'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.fillStyle = '#2f2c26'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, padding, canvas.height / 2)

  const texture = new CanvasTexture(canvas)
  texture.minFilter = LinearFilter

  const sprite = new Sprite(
    new SpriteMaterial({ map: texture, depthTest: true }),
  )
  sprite.name = 'sprite-label'
  sprite.position.y = SPRITE_HEIGHT_M
  sprite.scale.set(
    SPRITE_WIDTH_M,
    (SPRITE_WIDTH_M * canvas.height) / canvas.width,
    1,
  )

  return sprite
}
