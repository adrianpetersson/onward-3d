# The Diorama style

`onward-positron.json` is a fork, not a fetch. It is served from the bundle, so the map has no style
request to a third party and no key to carry — see [#3](https://github.com/adrianpetersson/onward/issues/3).

## Provenance

- **Forked from** `https://tiles.openfreemap.org/styles/positron` — 55 layers, POIs already stripped
  upstream, and the only provider whose terms permit free commercial use.
- **`building-3d` lifted from** `https://tiles.openfreemap.org/styles/liberty`. Only that one
  `fill-extrusion` layer was taken; starting from Liberty instead would have meant 68 road layers to
  strip back. `render_height` is present in real z14 tiles over Bangkok, so Stay Markers have true
  building heights available to sit beside.
- Tiles, glyphs and sprites all stay on `tiles.openfreemap.org`. Nothing else is referenced.

## What the strip removed

| Layer                                                                     | Why                                                        |
| ------------------------------------------------------------------------- | ---------------------------------------------------------- |
| `highway-shield-non-us`, `highway-shield-us-interstate`, `road_shield_us` | US route shields — unusable in Southeast Asia, and noisy   |
| `highway-name-path`, `highway-name-minor`, `highway-name-major`           | street-name clutter fights the toy register of the Diorama |
| `ne2_shaded` (source)                                                     | referenced by no layer upstream; dead weight in the fork   |

Place labels stayed: at globe and country zoom they are how you know what you are looking at.

50 layers out, from 55 in plus one lifted.

## What #11 then took out, and what it painted

[#11](https://github.com/adrianpetersson/onward/issues/11) settled the visual language against three
built alternatives — see
[`docs/diorama/`](https://github.com/adrianpetersson/onward/tree/prototype/11-diorama-visual-language/docs/diorama)
on the prototype branch. The register it chose is **a shaded, toy-palette ground you can still read
place names off**, which cost another 30 layers:

| Layer group                                                      | Why it went                                                                                                         |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| every `highway_*`, `railway*`, `aeroway-*`, `road_*`, `tunnel_*` | roads are the least toy thing on the map, and shading needs the ground uncluttered to read                          |
| `boundary_*`                                                     | a Diorama is a model of a place, and a model has no dotted lines on it                                              |
| `water_name_*`, `waterway_line_label`                            | bay and stream names, in Thai _and_ Latin — the noisiest labels on an island map and the least use for "where am I" |

**Place labels stayed, and that is the load-bearing half of the decision.** A shaded island with no
names on it tells you what you are looking at but not where it is; the whole `label_*` hierarchy plus
`airport` is what keeps the Diorama legible as a map rather than a diorama of nowhere. They are
repainted to a warm ink on a sand halo so they sit in the palette instead of on top of it.

20 layers, from 50.

The palette itself: sand `#e8ddc4` land, teal `#7fc0c4` water, moss `#b7cba4` wood, `#c6d6b0` park,
`#e3d7bd` built-up, `#ded2bc` buildings, `#4a4032` label ink.

## What is deliberately not in this file

- **The hillshade**, which is what makes the ground read as ground at all. It reads the terrain
  source, and that source is added at runtime — see `HILLSHADE` in `../map-config.ts`, including why
  its `maxzoom` is not optional.
- **The light** the models are lit by, in `../diorama-light.ts`. Nothing in the basemap is lit by
  three.js and nothing in three.js can shade the basemap: they meet only in the palette.
- **Terrain exaggeration**, also `../map-config.ts`, for the reason below.

Terrain deliberately lives in `../map-config.ts` rather than here: three of its four properties are
not the spec defaults and one of them fails silently, which is worth a comment that JSON cannot hold.
