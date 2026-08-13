import { useState } from 'react'

import { newTrip } from './itinerary/create'
import type { Trip } from './itinerary/model'
import { Diorama } from './map/Diorama'
import { Sidebar } from './sidebar/Sidebar'

export function App() {
  // The Trip lives here until persistence lands (#12). Nothing is written to disk yet, so a reload
  // is a new trip — deliberate, and the reason #12 is blocked on this ticket rather than the reverse.
  const [trip, setTrip] = useState<Trip>(newTrip)

  return (
    <div className="relative size-full overflow-hidden">
      <Diorama />
      <Sidebar trip={trip} onSave={setTrip} />
    </div>
  )
}
