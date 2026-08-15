import type {
  CircleLayerSpecification,
  SymbolLayerSpecification,
} from 'maplibre-gl'
import type { FeatureCollection } from 'geojson'

import { markerAt } from '../itinerary/derive'
import type { Stop, Trip } from '../itinerary/model'

/**
 * The Pin: what marks a Stop, at every Stop and at every zoom.
 *
 * Two `circle` layers and a `symbol`, all fed from one GeoJSON source — MapLibre's own machinery
 * rather than three.js, and that is #9's decision rather than an accident of what was easy.
 *
 * ## Why not the model layer, when everything else at a Stop is in it
 *
 * A beacon built in three.js was prototyped and it wins on exactly one thing: **ground contact**. Its
 * shaft touches down, so under a pitched camera you can see where it stands, where a flat dot floats
 * somewhere along the view ray (`docs/pins/a-dot-floats-under-pitch.png` against
 * `b-shaft-touches-the-ground.png`). It loses on everything else. A circle is screen-constant without
 * being told the zoom; a symbol brings **collision detection for free**, which is the whole of the
 * "what happens when nine Pins cluster" question — nine names thin out to the ones that fit instead
 * of piling into an unreadable stack, which is what the DOM-marker variant did
 * (`docs/pins/c-nine-cards-pile-up.png`). And a beacon costs a `renderer.render` per Stop where these
 * cost none at all.
 *
 * The depth a three.js beacon would buy is not wanted here either. #7 measured that a model in the
 * custom layer occludes properly against terrain — sunk 40 m it draws zero pixels — and for a
 * building that is right. For a marker it is a bug: a Stop behind a hill is a Stop you cannot see.
 *
 * ## The Pin draws over the Diorama's models, on purpose
 *
 * These layers are added **after** the model layer, so a Pin draws on top of the Stay Marker beneath
 * it. #11 established that a symbol layer added after the model layer does composite over it (which
 * corrected #2's inferred warning), and this is what spends that finding.
 *
 * It is the whole point of the ruling: a Stay Marker is drawn at true metres (#20), which at street
 * zoom makes it one more building among the OSM extrusions on the same beach — indistinguishable
 * without something naming it (`docs/pins/a-at-the-stay-nothing-marks-it.png`). The Pin and its label
 * are that something, so neither is allowed to hand over when the building appears.
 *
 * ## Residual: the traveller's name and OSM's can both draw
 *
 * These layers sit above the style's own `label_*` layers, so OSM's place labels place first and win
 * any collision. Where the two spellings differ that reads correctly — the traveller's `Koh Mook`
 * beside the map's `Ko Muk`, which is what #18 wanted — and where they are identical it is a
 * duplicate, seen on `George Town` at region zoom. Left alone: #15 types the real Itinerary in and
 * will say whether it is actually annoying.
 */

export const PIN_SOURCE_ID = 'pins'
export const PIN_HALO_LAYER_ID = 'pin-halo'
export const PIN_CORE_LAYER_ID = 'pin-core'
export const PIN_LABEL_LAYER_ID = 'pin-label'

/** Settled — something here is actually booked. #11's ink, the same the sidebar reads in. */
export const PIN_RESOLVED_INK = '#2f4f4f'

/** Unresolved — nothing booked, a Shortlist, or a Placeholder meant to be replaced. */
export const PIN_PULSING_INK = '#d9694a'

/** The paper the Diorama's labels are haloed on, so a Pin reads over sand and over sea alike. */
export const PIN_PAPER = '#fdfaf2'

export const PIN_RADIUS_PX = 6

/** How far the halo travels out from the Pin's own edge before it fades out. */
export const PIN_HALO_REACH_PX = 16

/**
 * One turn of the Pulse.
 *
 * "The slow throb that marks a Stop as unresolved" (`CONTEXT.md`) — slow being the operative word.
 * 2.4 s is well below the rate at which a repeated motion starts reading as an alert; the Pulse is
 * meant to be noticed on the second look, not the first.
 */
export const PULSE_MS = 2400

/**
 * Where in its cycle the Pulse is, as radius and opacity, at a moment in time.
 *
 * A pure function of the clock, and separated from the animation loop for the reason every other
 * pure part of this map is: it is the only part with arithmetic in it, and a `requestAnimationFrame`
 * callback cannot be reached by a test.
 *
 * Every Pin throbs on the same clock rather than each on its own phase — nine Stops beating together
 * reads as one map, where nine independent phases read as nine things going wrong separately.
 */
export const pulseAt = (
  nowMs: number,
): { radiusPx: number; opacity: number } => {
  const t = ((nowMs % PULSE_MS) + PULSE_MS) % PULSE_MS
  const through = t / PULSE_MS

  return {
    radiusPx: PIN_RADIUS_PX + through * PIN_HALO_REACH_PX,
    // Linear rather than eased: the halo is a ring expanding into nothing, and an eased fade leaves
    // it hanging at the edge long enough to read as a second, static circle.
    opacity: 0.35 * (1 - through),
  }
}

/** #8's sentinel: a Stop that has never been placed is `{ lng: 0, lat: 0 }`, and is not `null`. */
export const isPlaced = (stop: Stop): boolean =>
  stop.coord.lng !== 0 || stop.coord.lat !== 0

export type PinProperties = {
  name: string
  pulsing: boolean
}

/**
 * Every Stop as one Pin.
 *
 * An unplaced Stop is dropped rather than drawn at Null Island — the same rule `pathsOf` applies to
 * the Legs either side of it, and for the same reason #8 recorded: a Stop drawn in the Gulf of
 * Guinea the moment a name is typed is worse than a Stop not drawn yet.
 */
export const pinData = (trip: Trip): FeatureCollection => ({
  type: 'FeatureCollection',
  features: trip.stops.filter(isPlaced).map((stop) => {
    const marker = markerAt(stop)

    return {
      type: 'Feature',
      id: stop.id,
      properties: {
        name: stop.name,
        pulsing: marker.pulsing,
      } satisfies PinProperties,
      geometry: {
        type: 'Point',
        coordinates: [marker.coord.lng, marker.coord.lat],
      },
    }
  }),
})

/**
 * The expanding ring behind an unresolved Pin. Filtered rather than faded to nothing on the settled
 * ones, so a resolved Stop costs no drawing at all.
 */
export const pinHaloLayer = (): CircleLayerSpecification => ({
  id: PIN_HALO_LAYER_ID,
  type: 'circle',
  source: PIN_SOURCE_ID,
  filter: ['get', 'pulsing'],
  paint: {
    'circle-radius': PIN_RADIUS_PX,
    'circle-color': PIN_PULSING_INK,
    'circle-opacity': 0.35,
  },
})

/**
 * The Pin itself. A radius in pixels, so it is screen-constant with nothing to compute — the law #20
 * measured and rejected for a *building*, and the right one for a marker, which claims to be nothing
 * except visible.
 */
export const pinCoreLayer = (): CircleLayerSpecification => ({
  id: PIN_CORE_LAYER_ID,
  type: 'circle',
  source: PIN_SOURCE_ID,
  paint: {
    'circle-radius': PIN_RADIUS_PX,
    'circle-color': [
      'case',
      ['get', 'pulsing'],
      PIN_PULSING_INK,
      PIN_RESOLVED_INK,
    ],
    'circle-stroke-width': 2,
    'circle-stroke-color': PIN_PAPER,
  },
})

/**
 * The Stop's name, in the traveller's own spelling (#18) — never the geocoder's, which is already on
 * the map's own labels.
 *
 * Collision is left **on**, which is the point of using a symbol layer at all: at the trip view nine
 * names thin out to the few that fit, and the map stays readable instead of becoming a stack of
 * overlapping words.
 */
export const pinLabelLayer = (): SymbolLayerSpecification => ({
  id: PIN_LABEL_LAYER_ID,
  type: 'symbol',
  source: PIN_SOURCE_ID,
  layout: {
    'text-field': ['get', 'name'],
    'text-font': ['Noto Sans Regular'],
    'text-size': 12,
    // Below the Pin, so the label never covers the building the Pin is standing on.
    'text-offset': [0, 1.1],
    'text-anchor': 'top',
  },
  paint: {
    'text-color': PIN_RESOLVED_INK,
    'text-halo-color': PIN_PAPER,
    'text-halo-width': 1.6,
  },
})
