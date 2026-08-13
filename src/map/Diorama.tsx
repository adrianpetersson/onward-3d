import { useRef } from 'react'

import { useDiorama } from './use-diorama'

/** The Diorama, full bleed. It is the interface; nothing is laid out around it. */
export function Diorama() {
  const container = useRef<HTMLDivElement>(null)

  useDiorama(container)

  // Sized, not positioned: MapLibre's own stylesheet sets `position: relative` on this element once
  // the map is attached, and it lands after Tailwind in the bundle. Fighting it with `absolute`
  // silently collapses the map to nothing.
  return <div ref={container} className="size-full" />
}
