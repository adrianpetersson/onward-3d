import type { Anchor, ReadSpan, ScaleContext, ScaleFor } from './model-layer'
import { EARTH_RADIUS_M } from './model-matrix'
import { MODEL_ASSETS, type ModelAssetKey } from './models/model-assets'

/**
 * How big a model *looks*, as one rule the model layer applies to every anchor it draws.
 *
 * `MODEL_ASSETS` states true metres and the model matrix maps one unit to one metre, so left alone a
 * Stay Marker is an honest 8.9 m building — which #7 measured at 5.9 px at z16 and 1.5 px at z14, and
 * #20 measured at 0.006 px over Thailand and 0.001 px on the whole-trip view. A Vehicle is worse
 * still: a 4.9 m longtail on a 1,000 km Path is invisible at every zoom that shows the Path. So
 * something has to intervene, and it has to be **one** rule in **one** place or #8's Vehicles and
 * #9's Pins will each invent their own and the world will stop agreeing with itself.
 *
 * ## The rule: the two roles do not share a law
 *
 * - A **Vehicle** takes a floor. It is a symbol of a Mode rather than a claim about a machine, so it
 *   is exaggerated as much as legibility needs: `max(1, VEHICLE_MIN_PX ÷ what this zoom covers)`.
 * - A **Stay Marker** never exaggerates at all, and is simply **not drawn** until its true size
 *   covers `STAY_MIN_PX`. Below that a Pin holds the Stop (#9's to draw).
 *
 * The Vehicle's multiplier is computed from zoom and latitude, not from where the anchor lands on
 * screen, so one number serves every anchor at a latitude and **near models stay bigger than far
 * ones** — the perspective the pitched camera exists for survives.
 *
 * ## Why a Stay Marker is not exaggerated, when exaggerating it was the obvious move
 *
 * Because it does not survive being looked at. Holding a Stay Marker at ~48 px means inflating an
 * 8.9 m guesthouse to **396 m at island zoom, 77 km over Thailand and 705 km on the trip view**, and
 * nine of those do not read as nine Stops: they occlude each other and the coastline they stand on,
 * and the map underneath disappears. Vehicles at the same multiplier read perfectly, which is the
 * asymmetry the whole rule turns on — a plane at 40 px is a plane, and a hotel at 40 px, nine times
 * over, is a grey smear. See `docs/scale/one-law-or-a-law-per-role.png`.
 *
 * Two whole families were rejected on the way, both measured rather than argued:
 *
 * - **Constant apparent size** (the model behaves like a map pin) never arrives anywhere. At z20 it
 *   has to *shrink* the guesthouse to 5.5 m to hold its target, leaving the Stay smaller than the
 *   real OSM bungalows either side of it — and OSM's extrusions are the ruler, because MapLibre draws
 *   them at true metres and we do not get a vote. `docs/scale/constant-size-never-arrives.png`.
 * - **A fixed exaggeration per role** cannot exist. Onward spans z1–z20, a factor of ~500,000 in
 *   metres per pixel: the constant that makes a Stay Marker legible on the trip view is a 444 m tower
 *   on the beach at street zoom, and the one that behaves at street zoom is 0.3 px on the trip view.
 *
 * ## The threshold is a pixel count, not a zoom level
 *
 * `STAY_MIN_PX` is where the judgement lives, and it is expressed in pixels on purpose: the question
 * is "is this big enough to be a building yet", which is about apparent size. A zoom number would be
 * an answer for exactly one model height. The 8.9 m guesthouse this was tuned against crossed 15 px
 * at **z17**, the handover chosen from `docs/scale/stay-marker-true-scale-ladder.png` — at z16 it was
 * a dark speck among specks, at z17 it read as a building.
 *
 * **#21 then spent that design as intended and this constant did not move.** Swapping the guesthouse
 * for a 40 m hotel tower drops the threshold to **z14.8** — a booking announces itself two zoom
 * levels earlier for the price of one line in `sources.json`, which is the entire reason the
 * threshold is a pixel count. The prediction written here was z15; the measurement is z14.80 at
 * Bangkok and z14.83 at Koh Kradan.
 *
 * One corollary #21 had to learn the hard way, because it inverts the obvious: `readSpanOf` reads an
 * asset's **longest** axis, so at the threshold a model is 15 px along that axis and
 * `15 ÷ slenderness` across. For the guesthouse the longest axis was its 8.9 m *footprint*, so it
 * arrived 15 px wide and chunky. For a tower it is the height, so a **slender** tower arrives as a
 * stick — Kenney's narrowest was 15 px tall and 4 px wide. Slenderness is a cost here, not a virtue.
 */

/** The apparent size a Vehicle is held at, in CSS pixels, when true scale would be smaller. */
export const VEHICLE_MIN_PX = 40

/**
 * How many times its own drawn length a Vehicle needs its Path to be, or it is not drawn.
 *
 * The second half of the Vehicle's law, and #8 found it by looking for a different problem. The
 * ticket asked how near-parallel Paths read, expecting the three speedboat Legs down the Andaman
 * coast to be illegible on top of each other. **They are not** — the lines stay distinct at every
 * camera. What is illegible is the *Vehicles*: held at a 40 px floor, six of them spread over ~180 px
 * of coastline at region zoom are one grey smear, and the map underneath disappears
 * (`docs/paths/vehicles-collide-at-region.png`).
 *
 * So the answer is #20's answer again, and it is worth noticing that it arrived twice from opposite
 * directions: **the way out is less drawing, not more scaling.** A Stay Marker is not drawn until it
 * is big enough to be a building; a Vehicle is not drawn until its Path has room for it. Shrinking
 * the floor instead was the obvious alternative and it re-opens the size law #20 just closed, on top
 * of making a Vehicle's size depend on its neighbours.
 *
 * 3 rather than a pixel constant, because the thing being asked is a *ratio* — "does this line have
 * room for that model" — and a Vehicle's drawn length is itself zoom-dependent. On the real trip
 * this hides the boat Legs below about z6.7 and keeps every flight from z0.1, which is the
 * behaviour wanted: at the cameras that frame the whole island chain, the two or three Vehicles
 * with room to stand are the ones left.
 */
export const VEHICLE_PATH_CLEARANCE = 3

/**
 * How many CSS pixels a Stay Marker's own true size has to cover before it is drawn at all.
 *
 * 15 px, picked by eye off the true-scale ladder as the first size at which a model reads as a
 * building rather than a speck. Tuned against the 8.9 m guesthouse, which crossed it at z17.0; the
 * 40 m hotel tower that replaced it crosses at z14.8, and this number was deliberately not retuned —
 * the judgement is about apparent size, and it is the same judgement either way.
 */
export const STAY_MIN_PX = 15

const EARTH_CIRCUMFERENCE_M = 2 * Math.PI * EARTH_RADIUS_M

/** MapLibre's tile size in CSS pixels, which is what its zoom levels are defined against. */
const TILE_PX = 512

/**
 * Metres per CSS pixel at a latitude and zoom.
 *
 * CSS pixels rather than the canvas buffer's device pixels, deliberately: a law expressed in device
 * pixels would draw everything half size on a retina screen, where what matters is what the eye sees.
 *
 * Ignores pitch — this is the answer at the camera's focal plane, not at the top of a pitched screen.
 * That is the point; see `ScaleContext`.
 */
export const metresPerPixel = (lat: number, zoom: number): number =>
  (EARTH_CIRCUMFERENCE_M * Math.cos((lat * Math.PI) / 180)) /
  (TILE_PX * 2 ** zoom)

/** The zoom at which `metres` first covers `px`, which is what a handover threshold means in zooms. */
export const zoomWhereSpanReaches = (
  metres: number,
  px: number,
  lat: number,
): number =>
  Math.log2(
    (EARTH_CIRCUMFERENCE_M * Math.cos((lat * Math.PI) / 180) * px) /
      (TILE_PX * metres),
  )

/**
 * The size the law reads for an asset: its largest real dimension, and which local axis that is.
 *
 * Straight off `MODEL_ASSETS.sizeM`, measured from the shipped GLB at build time by #17 — so the
 * airliner is read on its 60 m wingspan rather than its 46 m length, and nothing parses a bounding
 * box in the browser to recover a number that is already written down.
 */
export const readSpanOf = (key: ModelAssetKey): ReadSpan => {
  const [x, y, z] = MODEL_ASSETS[key].sizeM
  const metres = Math.max(x, y, z)

  return { axis: metres === x ? 'x' : metres === y ? 'y' : 'z', metres }
}

/**
 * The Diorama's size law. Handed to `createModelLayer` once, and applied to every anchor it draws.
 */
export const scaleForDiorama: ScaleFor = (
  anchor: Anchor,
  { zoom }: ScaleContext,
): number => {
  const { pathM, read, role } = anchor
  if (!read || !role) return 1

  const metresPerPx = metresPerPixel(anchor.origin[1], zoom)
  const px = read.metres / metresPerPx

  if (role !== 'vehicle') return px >= STAY_MIN_PX ? 1 : 0

  const k = Math.max(1, VEHICLE_MIN_PX / px)

  // Measured against what the Vehicle will actually be drawn at, not against the floor: above the
  // floor it is at true scale and bigger than 40 px, and the question is always whether the line has
  // room for the model that is going on it.
  if (
    pathM !== undefined &&
    pathM / metresPerPx < VEHICLE_PATH_CLEARANCE * px * k
  )
    return 0

  return k
}
