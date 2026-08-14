import { useState } from 'react'
import type { MapLibreMap } from 'maplibre-gl'

import { ConflictDialog, StorageLine } from './itinerary/StorageNotice'
import { useStore } from './itinerary/use-store'
import { Diorama } from './map/Diorama'
import { PathBar } from './map/PathBar.prototype'
import { prototypeRequested } from './map/path-variants.prototype'
import { PlacingProvider } from './map/placing'
import { Sidebar } from './sidebar/Sidebar'

export function App() {
  // The Trip lives in the store now (#12): the file the traveller picked is the truth, `localStorage`
  // is a cache, and the first render already has the Itinerary because the cache read is synchronous.
  const store = useStore()

  // Not the map's state — just the fact that a map exists to click. `setMap` is stable, which is what
  // `useDiorama` requires of it.
  const [map, setMap] = useState<MapLibreMap | null>(null)

  // PROTOTYPE for #8. The sidebar overlays a third of the map (#10's ruling), and a Path is judged
  // on what the world looks like — so in prototype mode the map gets the whole window.
  const prototype = import.meta.env.DEV && prototypeRequested()

  return (
    <div className="relative size-full overflow-hidden">
      <Diorama onReady={setMap} />

      <PlacingProvider map={map}>
        {/*
         * Keyed on `generation` so a Trip that arrives from the FILE — adopted on load, or chosen
         * after a conflict — reaches the sidebar's draft. The draft lives in a reducer seeded from
         * this prop, which is exactly the state a re-render cannot reseed.
         */}
        {!prototype && (
          <Sidebar
            key={store.generation}
            trip={store.trip}
            onSave={store.save}
            storage={
              <StorageLine
                state={store.state}
                cached={store.cached}
                onRetry={store.retry}
                onRelink={store.relink}
              />
            }
          />
        )}
      </PlacingProvider>

      {store.conflict && (
        <ConflictDialog conflict={store.conflict} onSettle={store.settle} />
      )}

      {/* PROTOTYPE for #8 — dev only, and only with `?variant=` in the URL. */}
      {prototype && <PathBar />}
    </div>
  )
}
