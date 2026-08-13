/**
 * The seam between the sidebar and the map, for the one thing that needs both.
 *
 * Coordinates are typed in the sidebar and clicked on the map, so something has to sit between them.
 * This is all of it: any field can say "arm the map and tell me where the next click lands". Exactly
 * one field can be armed at a time — a second request cancels the first — which is why `armed` is a
 * boolean rather than a set of field ids.
 *
 * The map itself is never React state (see `use-diorama.ts`); only the fact that one exists is.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
} from 'react'
import type { MapLibreMap } from 'maplibre-gl'

import type { Coord } from '../itinerary/model'
import { armForOnePick } from './pick-coord'

type Placing = {
  /**
   * Arms the map for one click. Resolves with the coordinate, or with `null` if the pick was
   * cancelled — by Escape, by "never mind", or by another field taking the turn.
   *
   * Deliberately not exposing *which* field is armed: the field that called this knows it is waiting,
   * and a Trip-wide flag had every coordinate box on the card announcing the same click at once.
   */
  pick: () => Promise<Coord | null>
  /** Cancels an armed pick without placing anything. */
  cancel: () => void
  /** False before a map exists, when there is nothing to click. */
  ready: boolean
}

const NOT_READY: Placing = {
  pick: () => Promise.resolve(null),
  cancel: () => {},
  ready: false,
}

const PlacingContext = createContext<Placing>(NOT_READY)

export function PlacingProvider({
  map,
  children,
}: {
  map: MapLibreMap | null
  children: ReactNode
}) {
  const disarm = useRef<(() => void) | null>(null)

  const cancel = useCallback(() => disarm.current?.(), [])

  const pick = useCallback(() => {
    // Whoever asked first loses their turn rather than two fields waiting on the same click. The
    // loser's promise resolves `null`, which is how its own "waiting" state ends.
    disarm.current?.()
    if (!map) return Promise.resolve(null)

    return new Promise<Coord | null>((resolve) => {
      disarm.current = armForOnePick(map, (coord) => {
        disarm.current = null
        resolve(coord)
      })
    })
  }, [map])

  // A sidebar that closes mid-pick must not leave the map wearing a crosshair.
  useEffect(() => () => disarm.current?.(), [])

  const value = useMemo(
    () => ({ pick, cancel, ready: map !== null }),
    [pick, cancel, map],
  )

  return (
    <PlacingContext.Provider value={value}>{children}</PlacingContext.Provider>
  )
}

export function usePlacing(): Placing {
  return useContext(PlacingContext)
}
