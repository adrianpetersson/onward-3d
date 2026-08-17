import type { MapLibreMap, MapOptions, PaddingOptions } from 'maplibre-gl'

import type { Footprint, Stop, Trip } from '../itinerary/model'
import type { LngLatTuple } from './model-matrix'
import { isPlaced } from './pin'

/**
 * Where the camera stands, for a Trip at any stage of being built.
 *
 * Until [#24](https://github.com/adrianpetersson/onward/issues/24) there was no camera logic at all:
 * the map opened at `INITIAL_VIEW` — Ao Niang, z17, pitched 60 — which #7 chose to put its tracer on
 * screen, and never moved again. The tracer left with #8, so a brand-new Trip opened on a bare pitched
 * camera over an island in the Andaman Sea, and a *fully loaded* Trip opened there too.
 *
 * ## Geolocation was proposed and cut
 *
 * #24 proposed asking the browser for the traveller's position. It is not here, because there are
 * **three** empty states rather than the two the ticket enumerated, and the middle one dissolves the
 * case: a Trip with an **Origin** but no Stops already knows where home is — the traveller typed it —
 * which is better than a desktop wifi fix and costs no permission. What is left for geolocation is a
 * Trip with no Origin *and* no Stops, which is the first thirty seconds of the app's life, and #14
 * already shipped a better answer to it than a street view of your own roof: the globe.
 *
 * So Onward asks the browser for nothing. No permission dialog, no denial path, no `http://` caveat,
 * and no preference to persist — which is the same keyless, credential-free line every other ruling
 * has held.
 *
 * ## Pitch is 0, and that is a measurement rather than a taste
 *
 * MapLibre's fit **cannot see pitch**. `cameraForBoxAndBearing` projects the bounds' four corners to
 * world coordinates, rotates them by *bearing*, and fits the axis-aligned box; pitch is never read,
 * and the `CenterZoomBearing` it returns has no pitch field. So `fitBounds(b, { pitch: 45 })` computes
 * the zoom as if the camera were flat and *then* tilts it — and a tilted camera sees a trapezoid, so
 * the far edge of the Itinerary spills off the top of the frame. Holding a pitched overview means
 * paying with a hand-tuned padding fudge that no test can pin. The oblique arrives the moment the
 * traveller flies down to a Stop, which is where the Diorama reads anyway.
 *
 * All three decisions, and what they cost, are recorded in
 * [ADR 0009](../../docs/adr/0009-the-camera-frames-the-stops-and-asks-the-browser-nothing.md).
 */

/** Flat and north-up. A framed overview that arrives crooked reads as a bug, not as a flourish. */
export const FRAME_PITCH = 0
export const FRAME_BEARING = 0

/**
 * The globe the app opens on when it has nothing at all to show — no placed Stop, no placed Origin.
 *
 * **Not `[0, 0]`.** That is open ocean in the Gulf of Guinea and it is this app's own not-yet-placed
 * sentinel: #8 shipped a bug that drew an 11,141 km Path from exactly there, so opening on it would
 * read as the same bug returning. `[20, 20]` puts Europe, Africa, the Middle East and India on the
 * sphere, so the empty state reads as a world rather than as water.
 *
 * z2 sits below `GLOBE_BAND.from`, so this is fully the globe with no morph — the establishing shot
 * #14 built and that nothing in the app had ever actually shown.
 */
export const EMPTY_CENTER: LngLatTuple = [20, 20]
export const EMPTY_ZOOM = 2

/**
 * The closest a *frame* ever goes, and the zoom a single unsized place is shown at.
 *
 * Two jobs, deliberately one number. A lone Stop placed by paste or by click has no Footprint, so its
 * bounds are a zero-size box and an uncapped fit would run to max zoom and open at street level. The
 * same cap keeps two Stops 300 m apart from doing a quieter version of the same thing.
 *
 * z12 is a place you sleep rather than a building you sleep in — deliberately short of #20's z17,
 * where a Stay Marker starts drawing, because a frame should not claim precision a clicked pin does
 * not have.
 */
export const POINT_ZOOM = 12

/**
 * Clearance for the Itinerary panel, which **floats over** the map rather than sitting beside it
 * (#10, variant A) — 400 px wide at `left-[18px]`, so it clears at 418 with a little air past that.
 */
const SIDEBAR_CLEARANCE = 460

/** Air around the other three edges, so the outermost Stop is not welded to the frame. */
const EDGE = 60

/**
 * What to frame, decided from the Trip alone — no map, no viewport, no MapLibre.
 *
 * Two shapes because they are answered differently: a `bounds` is handed to MapLibre's own fit, which
 * needs the viewport to solve; a `point` already knows its zoom because there is nothing to fit.
 */
export type Framing =
  | { kind: 'bounds'; west: number; south: number; east: number; north: number }
  | { kind: 'point'; center: LngLatTuple; zoom: number }

/**
 * How much ground a Stop takes up when framing: its Footprint where it has one, and the single point
 * it stands on where it does not.
 *
 * This is the first thing in the app to read a `Footprint` — #18 captured them and nothing has used
 * one since. `CONTEXT.md` says it exists so "the map can decide how far to pull back when it flies
 * somewhere, instead of guessing", which is precisely this. But #18's warning holds and is why the
 * `??` is here rather than an assertion: a Stop placed by paste or click has none and **can never
 * acquire one**, so nothing may depend on having it.
 */
const extentOf = (stop: Stop): Footprint =>
  stop.footprint ?? {
    west: stop.coord.lng,
    east: stop.coord.lng,
    north: stop.coord.lat,
    south: stop.coord.lat,
  }

/**
 * The ladder, in order: the Stops that are placed, else the Origin if it is placed, else the globe.
 *
 * An **unplaced** Stop is dropped rather than framed, on the `{ lng: 0, lat: 0 }` sentinel every other
 * reader in the app tests — `pinData` drops it, `pathsOf` drops the Legs either side of it. Framing it
 * would pull the camera out to contain the Gulf of Guinea the moment a name is typed.
 *
 * **Known residual: a Trip crossing the antimeridian frames the long way round.** The edges are
 * min/max'd in raw longitude, so a Fiji-to-Samoa Trip would come out spanning 359° of the wrong
 * hemisphere. The real trip runs Copenhagen → Kuala Lumpur and never approaches it; picking the
 * shorter of the two spans is the fix, and doing it now would be building against no case.
 */
export function framingFor(trip: Trip): Framing {
  const placed = trip.stops.filter(isPlaced)

  if (placed.length > 0) {
    const extents = placed.map(extentOf)
    // min/max both edges of each rather than trusting west < east: #18 stored a Footprint with named
    // edges precisely because Photon sends `[west, north, east, south]` and the ordering is not worth
    // trusting to an index. Normalising here means it is not worth trusting to a field name either.
    const lngs = extents.flatMap((e) => [e.west, e.east])
    const lats = extents.flatMap((e) => [e.south, e.north])

    const west = Math.min(...lngs)
    const east = Math.max(...lngs)
    const south = Math.min(...lats)
    const north = Math.max(...lats)

    // One Stop with no Footprint, or several sharing a coordinate: there is no box to fit, so this
    // answers with a zoom rather than handing MapLibre a degenerate bounds.
    if (west === east && south === north) {
      return { kind: 'point', center: [west, south], zoom: POINT_ZOOM }
    }

    return { kind: 'bounds', west, south, east, north }
  }

  const origin = trip.origin
  if (origin && (origin.lng !== 0 || origin.lat !== 0)) {
    // An Origin is a `Place`, and a Place has no Footprint — there is nothing to fit, only a zoom.
    return { kind: 'point', center: [origin.lng, origin.lat], zoom: POINT_ZOOM }
  }

  return { kind: 'point', center: EMPTY_CENTER, zoom: EMPTY_ZOOM }
}

/**
 * Padding for the fit, scaled so it can never eat the viewport.
 *
 * The clamp is not defensive decoration. MapLibre's fit computes `width - (left + right)` and, when
 * that goes negative, warns and returns `undefined` — `fitBounds` then does **nothing at all**, which
 * is the silent-failure shape this codebase has now recorded three times (#6's worker, #10's
 * `resize()`, #11's hillshade overzoom). A fixed 460 px of sidebar clearance is wider than a narrow
 * window, so without this the frame would quietly not happen.
 *
 * 0.4 + 0.1 leaves at least half the frame on both axes whatever the window does.
 */
export function framePadding(
  width: number,
  height: number,
): Required<PaddingOptions> {
  return {
    top: Math.min(EDGE, height * 0.1),
    bottom: Math.min(EDGE, height * 0.1),
    left: Math.min(SIDEBAR_CLEARANCE, width * 0.4),
    right: Math.min(EDGE, width * 0.1),
  }
}

/**
 * The camera the map is **constructed** with, so the framed view is the first frame ever painted.
 *
 * Constructor options rather than a `jumpTo` after the fact, deliberately: `MapOptions.bounds`
 * overrides `center`/`zoom`, so there is no flash of somewhere else and no camera move to animate or
 * suppress. That is #24's "cut on load" arriving as *nothing to cut*.
 *
 * It also needs no `load` handler, which keeps #13's ruling intact — the map is usable from
 * construction and nothing about it waits on the network.
 */
export function initialCamera(
  trip: Trip,
  width: number,
  height: number,
): Partial<MapOptions> {
  const framing = framingFor(trip)

  if (framing.kind === 'point') {
    return {
      center: framing.center,
      zoom: framing.zoom,
      pitch: FRAME_PITCH,
      bearing: FRAME_BEARING,
    }
  }

  return {
    bounds: [
      [framing.west, framing.south],
      [framing.east, framing.north],
    ],
    fitBoundsOptions: {
      padding: framePadding(width, height),
      maxZoom: POINT_ZOOM,
      pitch: FRAME_PITCH,
      bearing: FRAME_BEARING,
    },
  }
}

/**
 * Frames the Trip on a map that already exists — the control, and a Trip adopted from the file.
 *
 * Always animated. Both callers are moments where something just happened and the motion is what says
 * so: the traveller pressed the button, or their own file arrived and replaced what was on screen. The
 * *load* case never comes through here — it is built into the constructor above.
 *
 * Resets pitch and bearing rather than preserving them. If the map has been rotated and tilted down to
 * a beach, "frame my trip" putting it back to flat and north-up is the whole point of pressing it.
 */
export function frameTrip(map: MapLibreMap, trip: Trip): void {
  const framing = framingFor(trip)
  const { clientWidth, clientHeight } = map.getContainer()

  if (framing.kind === 'point') {
    map.flyTo({
      center: framing.center,
      zoom: framing.zoom,
      pitch: FRAME_PITCH,
      bearing: FRAME_BEARING,
    })
    return
  }

  map.fitBounds(
    [
      [framing.west, framing.south],
      [framing.east, framing.north],
    ],
    {
      padding: framePadding(clientWidth, clientHeight),
      maxZoom: POINT_ZOOM,
      pitch: FRAME_PITCH,
      bearing: FRAME_BEARING,
    },
  )
}
