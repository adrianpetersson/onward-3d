import { useState } from 'react'
import type { MapLibreMap } from 'maplibre-gl'

import { newTrip } from './itinerary/create'
import type { Trip } from './itinerary/model'
import { Diorama } from './map/Diorama'
import { PlacingProvider } from './map/placing'
import { Sidebar } from './sidebar/Sidebar'

export function App() {
  // The Trip lives here until persistence lands (#12). Nothing is written to disk yet, so a reload
  // is a new trip — deliberate, and the reason #12 is blocked on this ticket rather than the reverse.
  const [trip, setTrip] = useState<Trip>(newTrip)

  // Not the map's state — just the fact that a map exists to click. `setMap` is stable, which is what
  // `useDiorama` requires of it.
  const [map, setMap] = useState<MapLibreMap | null>(null)

  return (
    <div className="relative size-full overflow-hidden">
      <Diorama onReady={setMap} />
      <PlacingProvider map={map}>
        <Sidebar trip={trip} onSave={setTrip} />
      </PlacingProvider>
    </div>
  )
}
