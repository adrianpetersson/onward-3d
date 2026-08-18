# A Path you can actually see

[#22](https://github.com/adrianpetersson/onward/issues/22). Before and after, at four cameras on the
real SEA Itinerary, 1400 × 900 against `pnpm dev`. "Before" is the Path exactly as
[#8](https://github.com/adrianpetersson/onward/issues/8) shipped it — 3 px, no casing; "after" is a
4 px dashed core over a solid 7 px casing in `#2f4f4f`.

The ruling and its arithmetic are in
[ADR 0011](../adr/0011-a-path-is-edged-in-one-dark-at-one-width.md). The instrument that produced the
numbers is [`scripts/paths/`](../../scripts/paths/README.md).

|                                 | before               | after               |
| ------------------------------- | -------------------- | ------------------- |
| the app's own load frame, z5.63 | `before-trip.png`    | `after-trip.png`    |
| the island chain, z8.6          | `before-islands.png` | `after-islands.png` |
| Koh Kradan, z14.6 pitched 60    | `before-street.png`  | `after-street.png`  |
| the globe, z2.4                 | `before-globe.png`   | `after-globe.png`   |

`before-islands.png` against `after-islands.png` is the pair to look at: Koh Mook → Koh Lipe is a
`boat` Leg drawn in teal over teal water, and it is the reason this ticket exists.

## What the frames measure

74 crossings sampled along the nine Legs at the load frame, each classified by nearest ink so that
one emphatic Leg cannot vouch for its neighbours:

|        | crossings unambiguous (ΔE ≥ 25) |
| ------ | ------------------------------- |
| before | **59 / 74**                     |
| after  | **73 / 74**                     |

Per Leg, the two that were the complaint:

| Leg                   | before                              | after                |
| --------------------- | ----------------------------------- | -------------------- |
| Koh Kradan → Koh Mook | 0/3 unambiguous, median ΔE **19.5** | 3/3, median **42.9** |
| Koh Mook → Koh Lipe   | 0/4 unambiguous, median ΔE **19.0** | 4/4, median **44.3** |
| Ao Nang → Koh Kradan  | 2/4                                 | 4/4                  |

Nothing that already read stopped reading. The one crossing still under the floor is a point where
the Butterworth train passes beneath a place label.

## Reproducing it

`pnpm dev`, `docs/real-trip/sea-xmas-2026.json` into `localStorage` under `onward:store`, reload, and
drive the camera from `window.__diorama`. Each pair was taken by toggling the layers rather than by
rebuilding, so the two frames of a pair differ in nothing but the Path:

```js
const m = window.__diorama
m.setLayoutProperty('paths-casing', 'visibility', 'none')
m.setPaintProperty('paths', 'line-width', 3) // the "before" state
```

**With terrain on, the zoom you asked `jumpTo` for is not the zoom you get** — a pitched jump to
z18.2 settles at z16.94, because MapLibre keeps the camera's altitude and recomputes zoom once the
elevation under the centre arrives. Every zoom quoted here is the one the map ended at.
