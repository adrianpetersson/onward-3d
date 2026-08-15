import {
  Color,
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  RingGeometry,
  SphereGeometry,
} from 'three'
import { Marker, type Map as MapLibreMap } from 'maplibre-gl'

import { markerAt, type Marker as StopMarker } from '../itinerary/derive'
import type { Stop, Trip } from '../itinerary/model'
import type { Anchor, ModelLayer } from './model-layer'
import type { LngLatTuple } from './model-matrix'
import { metresPerPixel, readSpanOf } from './model-scale'
import { buildStayMarker } from './stay-marker'

/**
 * PROTOTYPE for #9 — three radically different answers to "what stands at a Stop", on the real map.
 *
 * The ticket asks how the pulse is rendered and offers three techniques; the honest reading is that
 * the technique is not a separate question from what the marker *is*. A MapLibre circle cannot help
 * being a flat dot on top of the world, a three.js beacon cannot help being an object in it, and a
 * DOM element cannot help being able to hold text. So each variant here takes one technique
 * seriously and follows it all the way through — including to a different answer for the swap.
 *
 * | | A — Map pin | B — Beacon | C — Name card |
 * | - | - | - | - |
 * | drawn as | MapLibre `circle` layers | three.js in the model layer | DOM `Marker` |
 * | size | screen-constant | screen-constant, its own law | screen-constant |
 * | depth | none — over everything | **true** — hides behind terrain | none — over everything |
 * | labels | symbol layer, always | none | **the marker itself** |
 * | above z17 | Pin stays at the Stop's centre | Pin stays, beacon beside the building | **card moves to the Stay** |
 * | pulse | animated paint property | animated ring in the scene | CSS |
 *
 * All three share the **Stay Marker**, which is not a variant: #20 settled that it stands at true
 * metres and is not drawn below 15 px, and `markerAt` already says where it goes. Every variant
 * therefore stands the same buildings and differs only in what marks the Stop itself — which is what
 * makes them comparable.
 *
 * The `Jump` is likewise shared: a Stay Marker with no coordinate hops. It is animated on the
 * content's own local `+y` rather than through `Anchor.altitudeM`, and those are **not** different
 * — local `+y` becomes exactly the same mercator Z. Both went through the latitude bug #8 found
 * until this branch fixed it in `model-matrix.ts`.
 *
 * Throwaway. No tests, no teardown beyond what the switcher needs, and the losing two never reach
 * `main`.
 */

export const VARIANTS = ['A', 'B', 'C'] as const
export type Variant = (typeof VARIANTS)[number]

export const VARIANT_NAME: Record<Variant, string> = {
  A: 'Map pin — a flat dot over the world',
  B: 'Beacon — an object in the world',
  C: 'Name card — the label is the marker',
}

/** `?variant=A`. Absent means the real app, so the prototype cannot be tripped over by accident. */
export function prototypeVariant(): Variant | null {
  const raw = new URLSearchParams(window.location.search).get('variant')
  return VARIANTS.includes(raw as Variant) ? (raw as Variant) : null
}

/** #8's sentinel: a Stop with no coordinate is `{ lng: 0, lat: 0 }`, never `null`. */
const placed = (stop: Stop) => stop.coord.lng !== 0 || stop.coord.lat !== 0

type Marked = { stop: Stop; marker: StopMarker; id: string }

const markedStops = (trip: Trip): Marked[] =>
  trip.stops
    .filter(placed)
    .map((stop) => ({ stop, marker: markerAt(stop), id: stop.id }))

/** The palette #11 settled, plus the two states a marker has to distinguish. */
const INK = {
  /** Settled: something is actually booked here. */
  resolved: '#2f4f4f',
  /** Unresolved: nothing booked, a Shortlist, or a Placeholder meant to be replaced. */
  pulsing: '#d9694a',
  halo: '#d9694a',
  card: '#fdfaf2',
} as const

const PULSE_MS = 2400

/** 0 → 1 → 0 over `PULSE_MS`, which is the shape a throb wants rather than a sawtooth. */
const pulsePhase = (now: number) => {
  const t = (now % PULSE_MS) / PULSE_MS
  return t
}

// ---------------------------------------------------------------------------------------------
// Shared: the Stay Markers, which are not a variant
// ---------------------------------------------------------------------------------------------

/**
 * How high a Stay Marker hops when its Booking has no coordinate of its own.
 *
 * In metres, because everything in the model layer is: 6 m is roughly the eaves of the guesthouse
 * that is doing the hopping, so it clears its own roofline and lands back on it.
 */
const JUMP_M = 6
const JUMP_MS = 1500

async function stayAnchors(trip: Trip): Promise<Anchor[]> {
  const marked = markedStops(trip).filter(
    (m) => m.marker.kind === 'stay-marker',
  )

  return Promise.all(
    marked.map(async ({ id, marker }): Promise<Anchor> => {
      const content = new Group()
      content.add(await buildStayMarker())

      if (marker.jumping) content.userData.jumping = true

      return {
        id: `stay-${id}`,
        origin: [marker.coord.lng, marker.coord.lat] satisfies LngLatTuple,
        content,
        role: 'stay',
        read: readSpanOf('stay_guesthouse'),
      }
    }),
  )
}

/** Drives every Jump on one clock, so nine unplaced Stays hop together rather than shimmering. */
function animateJumps(
  map: MapLibreMap,
  anchors: readonly Anchor[],
): () => void {
  const jumpers = anchors.filter((a) => a.content.userData.jumping)
  if (jumpers.length === 0) return () => {}

  let frame = 0

  const tick = (now: number) => {
    // A half-sine: on the ground for half the cycle, which reads as a hop rather than a hover.
    const t = (now % JUMP_MS) / JUMP_MS
    const height = Math.max(0, Math.sin(t * Math.PI * 2)) * JUMP_M

    for (const anchor of jumpers) anchor.content.position.y = height

    map.triggerRepaint()
    frame = requestAnimationFrame(tick)
  }

  frame = requestAnimationFrame(tick)
  return () => cancelAnimationFrame(frame)
}

// ---------------------------------------------------------------------------------------------
// A — Map pin: MapLibre circle layers, screen-constant, over everything
// ---------------------------------------------------------------------------------------------

const PIN_SOURCE = 'prototype-pins'

/**
 * The map-native answer, and the cheapest by a wide margin: two `circle` layers and a `symbol`, all
 * fed from one GeoJSON source, all screen-constant because a circle's radius is in pixels and
 * nothing has to be told what zoom it is.
 *
 * It buys the whole of MapLibre's label machinery for free — collision detection included, which is
 * the ticket's clustering question answered by not having it — and pays by having no depth at all.
 * A Pin behind a hill draws in front of it.
 */
function installMapPins(map: MapLibreMap, trip: Trip): () => void {
  const data = {
    type: 'FeatureCollection' as const,
    features: markedStops(trip).map(({ stop, marker }) => ({
      type: 'Feature' as const,
      geometry: {
        type: 'Point' as const,
        // The Stop's own centre, always — this variant's answer to the swap. The building goes
        // where the bed is; the Pin says where the Stop is, and they disagree by 6.6 km in Bangkok.
        coordinates: [stop.coord.lng, stop.coord.lat],
      },
      properties: {
        name: stop.name,
        pulsing: marker.pulsing,
        booked: marker.kind === 'stay-marker',
      },
    })),
  }

  map.addSource(PIN_SOURCE, { type: 'geojson', data })

  map.addLayer({
    id: 'prototype-pin-halo',
    type: 'circle',
    source: PIN_SOURCE,
    filter: ['get', 'pulsing'],
    paint: {
      'circle-radius': 8,
      'circle-color': INK.halo,
      'circle-opacity': 0.35,
    },
  })

  map.addLayer({
    id: 'prototype-pin-core',
    type: 'circle',
    source: PIN_SOURCE,
    paint: {
      'circle-radius': 6,
      'circle-color': ['case', ['get', 'pulsing'], INK.pulsing, INK.resolved],
      'circle-stroke-width': 2,
      'circle-stroke-color': INK.card,
    },
  })

  map.addLayer({
    id: 'prototype-pin-label',
    type: 'symbol',
    source: PIN_SOURCE,
    layout: {
      'text-field': ['get', 'name'],
      'text-font': ['Noto Sans Regular'],
      'text-size': 12,
      'text-offset': [0, 1.1],
      'text-anchor': 'top',
    },
    paint: {
      'text-color': INK.resolved,
      'text-halo-color': INK.card,
      'text-halo-width': 1.6,
    },
  })

  let frame = requestAnimationFrame(function tick(now) {
    const t = pulsePhase(now)

    // Radius out, opacity down — the shape of a sonar ping. Set on the layer rather than per
    // feature: every unresolved Stop throbs on the same clock, which reads as one system.
    map.setPaintProperty('prototype-pin-halo', 'circle-radius', 8 + t * 16)
    map.setPaintProperty('prototype-pin-halo', 'circle-opacity', 0.35 * (1 - t))

    frame = requestAnimationFrame(tick)
  })

  return () => {
    cancelAnimationFrame(frame)
    for (const id of [
      'prototype-pin-label',
      'prototype-pin-core',
      'prototype-pin-halo',
    ])
      if (map.getLayer(id)) map.removeLayer(id)
    if (map.getSource(PIN_SOURCE)) map.removeSource(PIN_SOURCE)
  }
}

// ---------------------------------------------------------------------------------------------
// B — Beacon: three.js, in the world, with real depth
// ---------------------------------------------------------------------------------------------

/**
 * How many pixels tall a beacon is held at, whatever the zoom.
 *
 * This is the law #20 measured and rejected — constant apparent size — and a Pin is the one thing it
 * is right for. #20 rejected it for a **Stay Marker**, on the grounds that a building claiming to be
 * a building must agree with the OSM extrusions beside it. A beacon claims nothing: it is a marker
 * that happens to be made of geometry, so holding it at a readable size is the whole job.
 */
const BEACON_PX = 46

/** Metres, at the size the geometry is authored. The law rescales it every frame. */
const BEACON_M = 40

function buildBeacon(pulsing: boolean): Group {
  const beacon = new Group()
  const ink = new Color(pulsing ? INK.pulsing : INK.resolved)

  const material = new MeshStandardMaterial({
    color: ink,
    roughness: 0.85,
    metalness: 0,
  })

  const shaft = new Mesh(
    new CylinderGeometry(BEACON_M * 0.035, BEACON_M * 0.035, BEACON_M, 8),
    material,
  )
  shaft.position.y = BEACON_M / 2
  beacon.add(shaft)

  const head = new Mesh(new SphereGeometry(BEACON_M * 0.11, 12, 8), material)
  head.position.y = BEACON_M
  beacon.add(head)

  if (pulsing) {
    const ring = new Mesh(
      new RingGeometry(BEACON_M * 0.2, BEACON_M * 0.26, 28),
      new MeshStandardMaterial({
        color: ink,
        roughness: 1,
        metalness: 0,
        transparent: true,
        opacity: 0.6,
      }),
    )
    // Flat on the ground, and lifted a hair so it does not z-fight the terrain it sits on.
    ring.rotation.x = -Math.PI / 2
    ring.position.y = 0.4
    ring.name = 'pulse'
    beacon.add(ring)
  }

  return beacon
}

function beaconAnchors(trip: Trip): Anchor[] {
  return markedStops(trip).map(({ stop, id, marker }) => ({
    id: `beacon-${id}`,
    // The Stop's centre, like A — a beacon marks the Stop, and the building marks the bed.
    origin: [stop.coord.lng, stop.coord.lat] satisfies LngLatTuple,
    content: buildBeacon(marker.pulsing),
    // Deliberately neither 'vehicle' nor 'stay': the size law has no rule for a Pin, which is the
    // finding. `scaleForPins` below is the third rule, applied here rather than in `model-scale.ts`
    // because it is a prototype and the law on `main` must not grow a role that may not survive.
    read: { axis: 'y', metres: BEACON_M },
  }))
}

/**
 * The third size law, for the third role — held at a pixel count, which is what a marker means.
 *
 * Wrapped around the Diorama's own law rather than replacing it, so Vehicles and Stay Markers keep
 * behaving exactly as #20 and #8 left them and only the beacons answer to this.
 */
export function scaleForBeacons(anchor: Anchor, zoom: number): number {
  const px = BEACON_M / metresPerPixel(anchor.origin[1], zoom)
  return Math.max(1, BEACON_PX / px)
}

function installBeacons(
  map: MapLibreMap,
  setPinAnchors: (anchors: readonly Anchor[]) => void,
  trip: Trip,
): () => void {
  const anchors = beaconAnchors(trip)
  setPinAnchors(anchors)

  const rings = anchors
    .map((a) => a.content.getObjectByName('pulse'))
    .filter((r): r is Mesh => !!r)

  if (rings.length === 0) return () => setPinAnchors([])

  let frame = requestAnimationFrame(function tick(now) {
    const t = pulsePhase(now)
    const scale = 1 + t * 2.6

    for (const ring of rings) {
      ring.scale.set(scale, scale, 1)
      ;(ring.material as MeshStandardMaterial).opacity = 0.6 * (1 - t)
    }

    map.triggerRepaint()
    frame = requestAnimationFrame(tick)
  })

  return () => {
    cancelAnimationFrame(frame)
    setPinAnchors([])
  }
}

// ---------------------------------------------------------------------------------------------
// C — Name card: DOM markers, label-first
// ---------------------------------------------------------------------------------------------

/**
 * The variant where the **name** is the marker and the dot is punctuation.
 *
 * A DOM element is the only one of the three that can hold text without asking MapLibre's permission,
 * so this variant spends that: every Stop reads as a word at every zoom, which is what a planning
 * map is for. It pays twice — no depth at all, and no collision detection, so nine cards at country
 * zoom overlap into a pile that only the traveller can untangle.
 *
 * Its answer to the swap is the other one: above z17 the card **moves to the Stay's own coordinate**,
 * because at that zoom the thing on screen is the bed and a card 6.6 km away is labelling empty air.
 */
const CARD_SWAP_ZOOM = 17

function buildCard(stop: Stop, marker: StopMarker): HTMLElement {
  const card = document.createElement('div')
  card.className = 'prototype-card'
  if (marker.pulsing) card.classList.add('is-pulsing')

  const dot = document.createElement('span')
  dot.className = 'prototype-card-dot'
  card.append(dot)

  const name = document.createElement('span')
  name.textContent = stop.name || 'unnamed'
  card.append(name)

  return card
}

function installNameCards(map: MapLibreMap, trip: Trip): () => void {
  const marked = markedStops(trip)

  const markers = marked.map(({ stop, marker }) => ({
    stop,
    marker,
    dom: new Marker({ element: buildCard(stop, marker), anchor: 'bottom' })
      .setLngLat([stop.coord.lng, stop.coord.lat])
      .addTo(map),
  }))

  // The swap, as a zoom listener: below the threshold a card names the Stop, above it names the bed.
  const reposition = () => {
    const close = map.getZoom() >= CARD_SWAP_ZOOM

    for (const { stop, marker, dom } of markers) {
      const at =
        close && marker.kind === 'stay-marker' ? marker.coord : stop.coord
      dom.setLngLat([at.lng, at.lat])
    }
  }

  map.on('zoom', reposition)
  reposition()

  return () => {
    map.off('zoom', reposition)
    for (const { dom } of markers) dom.remove()
  }
}

// ---------------------------------------------------------------------------------------------
// The switcher's entry point
// ---------------------------------------------------------------------------------------------

/**
 * Stands one variant up. Returns a teardown, so the bar can swap variants without a page reload.
 *
 * `setPinAnchors` is the second half of the model layer: `drawItinerary` owns `setAnchors` for its
 * Vehicles, and this prototype cannot simply call it again without deleting them. See
 * `splitAnchors`.
 */
export async function installVariant(
  variant: Variant,
  map: MapLibreMap,
  setPinAnchors: (anchors: readonly Anchor[]) => void,
  trip: Trip,
): Promise<() => void> {
  // Shared by all three, and the reason every variant looks like the same map: the buildings.
  const stays = await stayAnchors(trip)
  const stopJumping = animateJumps(map, stays)

  if (variant === 'B') {
    const stopBeacons = installBeacons(
      map,
      (pins) => setPinAnchors([...stays, ...pins]),
      trip,
    )

    return () => {
      stopJumping()
      stopBeacons()
    }
  }

  setPinAnchors(stays)

  const stopPins =
    variant === 'A' ? installMapPins(map, trip) : installNameCards(map, trip)

  return () => {
    stopJumping()
    stopPins()
    setPinAnchors([])
  }
}

/**
 * Lets two contributors share one `setAnchors` without deleting each other.
 *
 * `ModelLayer.setAnchors` replaces everything, deliberately — one call, one answer, no partial
 * state (#8). The prototype has two answers: `drawItinerary`'s Vehicles and this file's markers. On
 * `main` #9 will put both in `drawItinerary` and the problem does not exist; here a shim is cheaper
 * than forking the seam.
 */
export function splitAnchors(models: ModelLayer): {
  forItinerary: ModelLayer
  setPinAnchors: (anchors: readonly Anchor[]) => void
} {
  let itinerary: readonly Anchor[] = []
  let pins: readonly Anchor[] = []

  const push = () => models.setAnchors([...itinerary, ...pins])

  return {
    forItinerary: {
      ...models,
      setAnchors: (next) => {
        itinerary = next
        push()
      },
    },
    setPinAnchors: (next) => {
      pins = next
      push()
    },
  }
}
