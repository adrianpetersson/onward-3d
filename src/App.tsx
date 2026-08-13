import { useState } from 'react'

import type { Trip } from './itinerary/model'
import { Diorama } from './map/Diorama'
// PROTOTYPE — #11, the Diorama's visual language. Both of these leave with the losing registers.
import { Switcher } from './map/prototype-11/Switcher'
import { SEED_TRIP } from './map/prototype-11/seed-trip'
import './map/prototype-11/chrome.css'
import { Sidebar } from './sidebar/Sidebar'

export function App() {
  // The Trip lives here until persistence lands (#12). Nothing is written to disk yet, so a reload
  // is a new trip — deliberate, and the reason #12 is blocked on this ticket rather than the reverse.
  //
  // PROTOTYPE — #11 opens on the real December trip rather than a blank one: an empty sidebar makes
  // every chrome treatment look fine, which is exactly the mistake a prototype exists to avoid.
  const [trip, setTrip] = useState<Trip>(SEED_TRIP)

  return (
    <div className="relative size-full overflow-hidden">
      <Diorama />
      <Sidebar trip={trip} onSave={setTrip} />
      <Switcher />
    </div>
  )
}
