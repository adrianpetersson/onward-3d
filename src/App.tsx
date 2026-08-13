import { useState } from 'react'
import type { MapLibreMap } from 'maplibre-gl'

import { ConflictDialog, StorageLine } from './itinerary/StorageNotice'
import { useStore } from './itinerary/use-store'
import { Diorama } from './map/Diorama'
import { PlacingProvider } from './map/placing'
import { Sidebar } from './sidebar/Sidebar'

export function App() {
  // The Trip lives in the store now (#12): the file the traveller picked is the truth, `localStorage`
  // is a cache, and the first render already has the Itinerary because the cache read is synchronous.
  const store = useStore()

  // Not the map's state — just the fact that a map exists to click. `setMap` is stable, which is what
  // `useDiorama` requires of it.
  const [map, setMap] = useState<MapLibreMap | null>(null)

  return (
    <div className="relative size-full overflow-hidden">
      <Diorama onReady={setMap} />

      <PlacingProvider map={map}>
        {/*
         * Keyed on `generation` so a Trip that arrives from the FILE — adopted on load, or chosen
         * after a conflict — reaches the sidebar's draft. The draft lives in a reducer seeded from
         * this prop, which is exactly the state a re-render cannot reseed.
         */}
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
      </PlacingProvider>

      {store.conflict && (
        <ConflictDialog conflict={store.conflict} onSettle={store.settle} />
      )}
    </div>
  )
}
