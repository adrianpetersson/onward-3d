# Is a Path visible? — the instrument

Built for [#22](https://github.com/adrianpetersson/onward/issues/22), kept for
[#23](https://github.com/adrianpetersson/onward/issues/23), which has to judge Path variants against
each other and will otherwise be judging them by eye.

"The Paths are too faint" is the kind of complaint that gets argued rather than settled. This settles
it: two screenshots of one camera — the Path layers drawn, and hidden — compared per pixel in
CIE L\*a\*b\*. A Leg is visible to exactly the extent that drawing it changed the picture.

## Why ΔE and not contrast

WCAG contrast is a luminance ratio built for text. It scores coral `flight` on teal sea at **1.69**,
a picture nobody has ever failed to see, because the whole difference is hue. ΔE76 is a distance in a
perceptual space and gets that pairing right at **78.5**.

The floor used throughout is **ΔE 25** for "unambiguous". It is not a round number chosen for
comfort: it is `ferry` over water at 24.9, the weakest pairing anyone had looked at and called
acceptable — [#15](https://github.com/adrianpetersson/onward/issues/15) photographed that crossing
and recorded that nothing about it read broken.

## Running it

There is no headless renderer here and there should not be: the thing under test is what MapLibre
actually draws, terrain drape and all. The two frames come from a browser session against `pnpm dev`
with the real Itinerary in `localStorage`, at 1400 × 900.

```js
// In the page, with the trip loaded and the camera settled:
const m = window.__diorama
const hide = (on) => {
  for (const id of ['paths', 'paths-casing'])
    m.setLayoutProperty(id, 'visibility', on ? 'visible' : 'none')
}
```

Screenshot with the layers visible, then again with them hidden, then:

```bash
node scripts/paths/legibility.mjs on.png off.png scripts/paths/opening-camera.json '#2f4f4f'
```

The fourth argument is the casing ink, and it is optional — omit it to measure an uncased Path, which
is how the before/after in [ADR 0011](../../docs/adr/0011-a-path-is-edged-in-one-dark-at-one-width.md)
was taken.

`opening-camera.json` is where each Leg crosses the screen at the app's own load frame — z5.63 over
the real SEA Itinerary, the camera [#24](https://github.com/adrianpetersson/onward/issues/24) settled
on. Regenerate it for another camera with:

```js
const data = m.getSource('paths')._data.geojson
const { clientWidth: W, clientHeight: H } = m.getCanvas()
const visible = (p) => p.x >= 440 && p.x < W - 10 && p.y >= 10 && p.y < H - 30
JSON.stringify(
  data.features.map((f) => {
    const pts = f.geometry.coordinates.map(([lng, lat]) =>
      m.project({ lng, lat }),
    )
    const on = pts
      .map((p, i) => [p, i])
      .filter(([p]) => visible(p))
      .map(([, i]) => i)
    const step = Math.max(1, Math.floor(on.length / 24))
    return {
      mode: f.properties.mode,
      samples: on
        .filter((_, k) => k % step === 0)
        .slice(0, 24)
        .map((j) => ({ x: +pts[j].x.toFixed(1), y: +pts[j].y.toFixed(1) })),
    }
  }),
)
```

## Three ways this measurement lies, all of them found the hard way

**One crossing per Leg is not a measurement.** A Path is dashed, so a single sample lands in a gap
often enough to report a perfectly visible Leg as absent. Hence up to 24 crossings each, and a hit
rate rather than a verdict.

**`map.project()` and the drawn line disagree by a few pixels over hilly ground** — the line is
draped onto the terrain and the projected point is not, and the offset is not along the line's
normal. The search has to be a box. Walked along the normal instead, the train Leg came back missing
from a frame it is plainly drawn in.

**A search box finds the brightest thing near it, which is not always the Leg you asked about.** The
Copenhagen long-haul crosses the island chain, and four separate Legs once came back reporting an
identical ΔE 78.2 — coral on water, the flight, counted four times as its neighbours. Every pixel is
now classified by nearest ink and has to be this Mode's own, or the casing.

`png.mjs` is a PNG reader for the same reason `scripts/models/lib/raster.mjs` is a PNG writer:
evidence you can put a number on beats evidence you have to squint at, and no dependency earns its
place for either direction.
