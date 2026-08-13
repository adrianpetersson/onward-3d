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

## Whose call the rest is

This is a working fork, not the finished visual language. Flattening the palette, the matte terrain
treatment and making the attribution look deliberate are all
[#11](https://github.com/adrianpetersson/onward/issues/11)'s. This file is the single place that work
happens.

Terrain deliberately lives in `../map-config.ts` rather than here: three of its four properties are
not the spec defaults and one of them fails silently, which is worth a comment that JSON cannot hold.
