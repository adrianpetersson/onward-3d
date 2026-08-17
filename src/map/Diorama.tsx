import { useRef } from 'react'
import type { MapLibreMap } from 'maplibre-gl'

import type { Trip } from '../itinerary/model'
import { useDiorama } from './use-diorama'

/** The Diorama, full bleed. It is the interface; nothing is laid out around it. */
export function Diorama({
  trip,
  onReady,
  generation,
}: {
  /** The committed Itinerary. A new one redraws the map; it never rebuilds it. */
  trip: Trip
  /** Must be stable across renders — see `useDiorama`. */
  onReady?: (map: MapLibreMap | null) => void
  /** The store's generation. Bumps on adoption only, and re-frames the camera when it does (#24). */
  generation?: number
}) {
  const container = useRef<HTMLDivElement>(null)

  useDiorama(container, trip, onReady, generation)

  // Sized, not positioned: MapLibre's own stylesheet sets `position: relative` on this element once
  // the map is attached, and it lands after Tailwind in the bundle. Fighting it with `absolute`
  // silently collapses the map to nothing.
  return <div ref={container} className="size-full" />
}
