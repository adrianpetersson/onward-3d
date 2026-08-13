/**
 * Click-to-place: the floor of the fallback ladder.
 *
 * Built before the parser, deliberately ([#13](https://github.com/adrianpetersson/onward/issues/13)).
 * Every other route to a coordinate can fail — a paste can be a short link, a camera position, a
 * directions URL, or nothing recognisable at all. Clicking the map cannot: no network, no regex, no
 * Google. That makes the parser an accelerator on top of this rather than a dependency, and it is why
 * none of the ladder's messages is a dead end.
 */

import type { MapLibreMap, MapMouseEvent } from 'maplibre-gl'

import type { Coord } from '../itinerary/model'

/**
 * Arms the map for exactly one click and hands back where it landed.
 *
 * Returns a disarm function that settles the pick as cancelled. Cancelling resolves with `null`
 * rather than throwing: a traveller who changes their mind has not caused an error.
 */
export function armForOnePick(
  map: MapLibreMap,
  settle: (coord: Coord | null) => void,
): () => void {
  const canvas = map.getCanvas()
  // The document that owns the map, rather than the global `window`: it is the right scope for a key
  // that only means anything while this map is armed, and it survives the map being moved into a
  // popout or an iframe.
  const document = canvas.ownerDocument
  const cursorBefore = canvas.style.cursor
  let settled = false

  const finish = (coord: Coord | null) => {
    if (settled) return
    settled = true
    canvas.style.cursor = cursorBefore
    map.off('click', onClick)
    document.removeEventListener('keydown', onKey)
    settle(coord)
  }

  /*
   * `lngLat` is unprojected through the DEM whenever terrain is set, so on a pitched island the
   * coordinate is the one under the cursor on the visible hillside — not the sea-level point the flat
   * plane would give. That is the whole reason this is worth wiring to the real map rather than to a
   * flat picker.
   */
  const onClick = (event: MapMouseEvent) =>
    finish({ lng: event.lngLat.lng, lat: event.lngLat.lat })

  const onKey = (event: KeyboardEvent) => {
    if (event.key === 'Escape') finish(null)
  }

  canvas.style.cursor = 'crosshair'
  map.on('click', onClick)
  document.addEventListener('keydown', onKey)

  return () => finish(null)
}
