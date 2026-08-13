# MapLibre GL JS v5 with a three.js custom layer

Onward's whole value is a 3D map that works at two wildly different scales: a 9,000 km flight arc from
Copenhagen to Bangkok, and a beach hut on a 300 m-wide sandbar at Koh Kradan. We chose **MapLibre GL JS
v5** as the map, with **three.js** models injected through a custom layer, because v5 is the only option
that offers a globe projection _and_ pitched 3D terrain _and_ street-level model placement in one
instance — so the zoom-driven dive from globe to hut needs no seam between two libraries.

## Considered options

- **deck.gl** — excellent arc and trips layers and a globe view, but weaker support for placing individual
  GLB models at street scale, which is exactly what a Stay Marker is.
- **CesiumJS** — the strongest real-earth engine, with proper terrain and ellipsoidal maths. Rejected for
  bundle weight and because stylising it into a matte low-poly Diorama fights the library rather than
  using it.
- **react-globe.gl** — beautiful arcs for almost no effort, and structurally incapable of the street-level
  half of the product.
- **Google Photorealistic 3D Tiles** — wrong register entirely; we deliberately chose stylised over
  photoreal, and it carries billing.

## Consequences

The globe half of this decision is **not yet proven**. The custom-layer technique the MapLibre docs
demonstrate is Mercator; whether that layer receives a usable projection matrix under v5's globe
projection is an open question, and it is the largest single risk in the project. It is being verified in
[#2](https://github.com/adrianpetersson/onward/issues/2) and then proven in the app in
[#14](https://github.com/adrianpetersson/onward/issues/14).

If the globe turns out to be incompatible with the model layer, the fallback is a pitched map only,
losing the intercontinental arc but keeping everything else. The build order is deliberately arranged so
that the pitched map ships first and nothing depends on the globe — see the
[wayfinder map](https://github.com/adrianpetersson/onward/issues/1).
