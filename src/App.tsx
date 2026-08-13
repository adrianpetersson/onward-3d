import { useEffect, useRef, useState } from 'react'
import type { MapLibreMap } from 'maplibre-gl'

import { Diorama } from './map/Diorama'
// PROTOTYPE — #10. Remove this import and the wrapper below when the real sidebar lands.
import { SidebarPrototype } from './sidebar/prototype/SidebarPrototype'

export function App() {
  const [inset, setInset] = useState(0)
  const map = useRef<MapLibreMap | null>(null)

  // The Diorama's container is no longer the whole viewport — a sidebar that pushes rather than
  // overlays narrows it — and MapLibre has to be told by hand. Its own ResizeObserver discards the
  // first event it ever receives and throttles the rest by 50 ms, so the canvas otherwise settles on
  // whatever width some intermediate frame happened to have.
  //
  // **`resize()` before the style has loaded wedges the style load permanently, and in total
  // silence** — no error, no tile request, `getStyle()` never resolves, and the map draws nothing
  // for the rest of the page's life. So the resize waits for `load` if it is not there yet.
  useEffect(() => {
    const live = map.current
    if (!live) return

    const resize = () => live.resize()
    if (live.loaded()) {
      resize()
      return
    }

    live.once('load', resize)
    return () => void live.off('load', resize)
  }, [inset])

  return (
    <div className="relative size-full overflow-hidden">
      <div className="absolute inset-y-0 right-0" style={{ left: inset }}>
        <Diorama mapRef={map} />
      </div>
      <SidebarPrototype onInset={setInset} />
    </div>
  )
}
