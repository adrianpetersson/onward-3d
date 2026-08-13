# CC0 low-poly models for every Mode, plus a Stay Marker

Research for [#4](https://github.com/adrianpetersson/onward/issues/4). Researched **2026-08-13**. All URLs
were fetched on that date.

## How to read this document

Two labels are used throughout and they mean different things:

- **VERIFIED** — I fetched the page myself, or downloaded the archive and parsed the binaries. Byte
  counts come from HTTP `content-length` or from the zip directory; triangle counts and bounding boxes
  come from parsing the GLB JSON chunk and walking the node hierarchy. Licence wording is quoted from the
  source's own page or from the `License.txt` inside the archive.
- **INFERRED** — judgement, extrapolation, or a claim I read on a page but could not independently check.

Nothing was rounded up to CC0. Where a licence is ambiguous it is flagged as ambiguous, not resolved in
our favour.

---

## Headline

**Kenney.nl covers five of the six Modes plus the Stay Marker, in GLB, under an unambiguous CC0 1.0, from
four kits totalling 13.8 MB of download.** The one Mode Kenney cannot serve is the **long-haul airliner** —
Kenney's 3D catalogue contains no aircraft at all. That gap has a CC0 answer (OpenGameArt, but OBJ needing
conversion) and a zero-effort answer that is **not** CC0 (Poly Pizza's Google Poly archive, CC-BY 3.0,
attribution required).

Two findings that change the build, both VERIFIED by opening the archives:

1. **Kenney's GLBs are not self-contained.** Every one references its texture as an external relative URI
   `Textures/colormap.png`. Shipping a bare `.glb` to the browser gives an untextured mesh. Either preserve
   the `Textures/` sibling directory or repack with the image embedded.
2. **No two Kenney kits share a unit scale.** A suburban house is 0.74 units tall while a van is 2.75 units
   long. Onward needs a per-asset scale table no matter which packs it picks; source units cannot be trusted.

---

## Per-mode table

Weight = the GLB's own byte size (uncompressed). Atlas textures are shared per kit and counted separately
below.

| Mode                            | Chosen asset                                                                               | Pack / source                    | URL                                            | Licence                              | Format                        | Weight                                                                      |
| ------------------------------- | ------------------------------------------------------------------------------------------ | -------------------------------- | ---------------------------------------------- | ------------------------------------ | ----------------------------- | --------------------------------------------------------------------------- |
| **Long-haul airliner**          | `low_0.obj` — "Funky aircraft", LOD _low_                                                  | OpenGameArt, by Savino           | https://opengameart.org/content/funky-aircraft | CC0 (per-submission label)           | **OBJ only** → convert to GLB | 15.4 kB OBJ; 350 verts / 696 tris                                           |
| ↳ _no-conversion fallback_      | "Airplane"                                                                                 | Poly Pizza (Google Poly archive) | https://poly.pizza/m/8ciDd9k8wha               | **CC-BY 3.0 — attribution required** | GLB direct                    | 236.5 kB; 1,772 tris                                                        |
| **Overnight sleeper train**     | `train-electric-double-a/b/c.glb` (nose + middle + tail)                                   | Kenney Train Kit                 | https://kenney.nl/assets/train-kit             | CC0 1.0                              | GLB                           | 134.2 + 134.3 + 116.9 kB; 1,445 tris (nose)                                 |
| ↳ _alt sleeper carriage_        | "Locomotive Passenger Carriage"                                                            | Poly Pizza, by Quaternius        | https://poly.pizza/m/woQPFlzPHM                | CC0 1.0                              | GLB direct                    | see caveat on Quaternius conversions                                        |
| **Intercity train**             | `train-electric-bullet-a/b/c.glb`, or `train-locomotive-passenger-a.glb` for a slower read | Kenney Train Kit                 | https://kenney.nl/assets/train-kit             | CC0 1.0                              | GLB                           | 114.6 kB / 1,261 tris (bullet nose); 119.9 kB / 1,308 tris (passenger loco) |
| **Speedboat (small open boat)** | `boat-speed-a.glb` … `boat-speed-j.glb` — ten variants                                     | Kenney Watercraft Kit            | https://kenney.nl/assets/watercraft-kit        | CC0 1.0                              | GLB                           | 16.5 kB; 156 tris                                                           |
| **Passenger ferry**             | `ship-ocean-liner-small.glb`; `boat-house-a.glb` for a small island ferry                  | Kenney Watercraft Kit            | https://kenney.nl/assets/watercraft-kit        | CC0 1.0                              | GLB                           | 145.7 kB / 1,750 tris; 38.4 kB                                              |
| **Bus / van**                   | `van.glb`, or `delivery.glb` for a boxier minibus read                                     | Kenney Car Kit                   | https://kenney.nl/assets/car-kit               | CC0 1.0                              | GLB                           | 175.7 kB / 2,082 tris; 240.3 kB / 2,476 tris                                |
| **Stay Marker — guesthouse**    | `building-sample-house-b.glb` / `-c.glb`                                                   | Kenney Modular Buildings         | https://kenney.nl/assets/modular-buildings     | CC0 1.0                              | GLB                           | 33.8 kB / 374 tris; 31.6 kB / 322 tris                                      |
| **Stay Marker — beach hut**     | "Hut"                                                                                      | Poly Pizza, by Quaternius        | https://poly.pizza/m/4MJWbyd6vw                | CC0 1.0                              | GLB direct                    | 36.3 kB; 632 tris                                                           |

There is **no bus** anywhere in Kenney's 3D catalogue and **no CC0 bus on Poly Pizza** — see
[Gaps](#gaps-and-what-falls-back-to-primitives).

---

## Licences, read from the source

### Kenney.nl — CC0 1.0, unambiguous · VERIFIED

Every 3D pack page carries `License: Creative Commons CC0` and links
https://creativecommons.org/publicdomain/zero/1.0/. The `License.txt` inside each archive is more explicit.
Quoted from `License.txt` in `kenney_car-kit.zip` (Car Kit 3.1, dated 02-04-2026):

> License: (Creative Commons Zero, CC0)
> http://creativecommons.org/publicdomain/zero/1.0/
>
> You can use this content for personal, educational, and commercial purposes.
>
> Support by crediting 'Kenney' or 'www.kenney.nl' (this is not a requirement)

The same three lines appear verbatim in the `License.txt` of Train Kit 1.1, Watercraft Kit 2.1, Modular
Buildings, City Kit Suburban 2.0, Holiday Kit 2.0 and Pirate Kit — I read all seven.

- **Commercial use:** permitted, stated explicitly.
- **Attribution:** not required, stated explicitly ("this is not a requirement").
- **Future paid SaaS:** covered. CC0 waives copyright rather than granting a revocable licence, so there is
  no per-seat, per-revenue or field-of-use limit to breach later.
- One note: Train Kit's `License.txt` adds `Additional credit(s): Guus Vermeulen, Tony Schaer`. This sits
  above the CC0 line and does not condition it — the pack is still distributed as CC0. INFERRED that this
  is a courtesy credit for contributors, not a licence term.

The CC0 1.0 deed itself (https://creativecommons.org/publicdomain/zero/1.0/) confirms the shape:

> You can copy, modify, distribute and perform the work, even for commercial purposes, all without asking
> permission.

with one carve-out worth carrying forward:

> In no way are the patent or trademark rights of any person affected by CC0

**Practical consequence:** CC0 protects you from the _copyright_ claim, not from a _trademark_ claim. Avoid
any model that depicts a named real-world livery or airframe. Poly Pizza hosts a model literally titled
"Boeing 747" (https://poly.pizza/search/airliner) — do not use it regardless of its licence label.

### Quaternius — CC0, unambiguous, but **no GLB** · VERIFIED

The FAQ (https://quaternius.com/faq.html) is unusually clear:

> Can these assets be used in commercial projects? **Yes**, these assets can be used for free without the
> need for attribution in commercial, educational, and personal projects. All models are under the CC0
> License.

> Is it necessary to give credit when using these assets? **No**, attribution is not necessary. However,
> credit is always appreciated.

> Am I allowed to modify the models? **Yes**, you are free to modify the models in any way you like,
> including combining them with other asset packs.

- **Commercial use:** permitted. **Attribution:** not required. **Paid SaaS:** covered, same CC0 reasoning.
- **But:** every pack page I checked lists `Formats: FBX OBJ Blend`. Not one offers glTF or GLB. Checked on
  https://quaternius.com/packs/modulartrain.html, `publictransport.html`, `ships.html`, `cars.html`,
  `buildings.html`, `simplebuildings.html`, `ultimatetexturedbuildings.html`, `modularstreets.html`.
- Quaternius has **no aircraft pack at all** — VERIFIED against the full 81-pack index at
  https://quaternius.com/. The only flying things are `ultimatespaceships` and `spaceships`, both sci-fi.
- Pack sizes relevant here: Modular Train Pack 15 models, Public Transport Pack 12 models (its description
  names "an ambulance, school bus…"), Ships Pack 6 models, Simple Buildings 10, Ultimate Buildings 76.

**The workaround, and it is a good one:** Poly Pizza hosts many Quaternius models already converted, and
serves a direct `.glb` per model. That turns Quaternius from "needs a Blender step" into "one HTTP GET".
See the caveat in the next section — the conversion is not lossless in the way that matters to us.

### Poly Pizza — a mirror, licence per model, no site-wide terms · VERIFIED

Poly Pizza labels each model individually and serves a direct GLB at
`https://static.poly.pizza/<uuid>.glb` for every model, including ones whose upstream pack ships no glTF.

Licence spread, measured by parsing the embedded search payload:

| Query      | Results parsed | CC-BY 3.0 | CC0 1.0                              |
| ---------- | -------------- | --------- | ------------------------------------ |
| `airplane` | 32             | 30        | 2 (both are Quaternius _spaceships_) |
| `airliner` | 27             | 26        | 1 (a barrel)                         |
| `bus`      | 24             | **24**    | **0**                                |
| `van`      | 17             | **17**    | **0**                                |
| `minibus`  | 15             | **15**    | **0**                                |
| `ferry`    | 32             | 14        | 18                                   |
| `hut`      | 32             | 21        | 11                                   |
| `hostel`   | 16             | **16**    | **0**                                |

So: **no CC0 aircraft, no CC0 bus, no CC0 van on Poly Pizza.** Every airliner-shaped result is a
"Poly by Google" upload under CC-BY 3.0. Two model pages read directly:

- https://poly.pizza/m/4MJWbyd6vw — "Hut" by Quaternius: _"FBX/GLTF format • Public Domain (CC0)"_, 632 tris.
  Cross-checks against Quaternius's own FAQ, so this label is trustworthy.
- https://poly.pizza/m/8ciDd9k8wha — "Airplane" by Poly by Google: _"OBJ/GLTF format • Creative Commons
  Attribution"_, page reports 1.3k tris (I measured 1,772 in the served GLB — minor discrepancy, INFERRED to
  be a difference in how quads were counted at import).

**Flagged as a limitation, not as a problem:** Poly Pizza has no reachable terms or licence page. `/terms`,
`/docs/terms`, `/docs/licenses` and `/faq` all returned 404 on 2026-08-13; the footer's only working legal
link is `/docs/privacy`. The per-model label is therefore the site's entire licence statement, and Poly
Pizza is a redistributor rather than the rights holder. Treat a label as a **claim**: fine where it
cross-checks upstream (Quaternius, Kenney, Kay Lousberg), and fine for the Google Poly archive where
CC-BY 3.0 matches how Google originally licensed it, but do not rely on it alone for an unknown uploader.

### CC-BY 3.0 — what it would actually cost us · VERIFIED

From https://creativecommons.org/licenses/by/3.0/:

> **Share** — copy and redistribute the material in any medium or format for any purpose, even commercially.
> **Adapt** — remix, transform, and build upon the material for any purpose, even commercially.
> The licensor cannot revoke these freedoms as long as you follow the license terms.
>
> **Attribution** — You must give appropriate credit, provide a link to the license, and indicate if changes
> were made. […] **No additional restrictions** — You may not apply legal terms or technological measures
> that legally restrict others from doing anything the license permits.

- **Commercial use:** permitted. **Attribution:** required. **Paid SaaS:** covered, and irrevocable, _provided_
  the credit is actually shown.
- The obligation is small and permanent: a credits surface naming the creator, linking
  `https://creativecommons.org/licenses/by/3.0/`, and saying the model was modified (we will rescale and
  re-material it, so it is modified). One line in an About panel discharges it.
- The deed itself notes 3.0 is superseded by 4.0. Still a valid licence; just older wording.

### KayKit / Kay Lousberg — **AMBIGUOUS, flagged** · VERIFIED

From https://kaylousberg.itch.io/kaykit-dungeon-remastered:

> Free for personal and commercial use, no attribution required. (CC0 Licensed)
> […] These assets are CC0 so you can use them freely. But please don't resell unmodified copies or claim
> them as your own.

The second sentence adds a condition CC0 does not contain and cannot contain — a CC0 dedication cannot be
made conditional after the fact. INFERRED that this is intended as a request rather than a term, and that
Onward's use (embedding modified, rescaled models in an app, not reselling the pack) would be fine either
way. **Not resolved, and not needed:** KayKit ships no vehicles and no aircraft, so nothing here is on the
shortlist. Recording it so the ambiguity is not rediscovered later.

### OpenGameArt — licence per submission · VERIFIED

Both aircraft candidates state `License(s): CC0` on their own submission pages.

- https://opengameart.org/content/funky-aircraft — by Savino, 2012-11-28. Tags include `jet`, `airliner`.
  _"3D model of an aircraft. No textures."_ Three LODs: `control.obj` 3.6 kB, `low.obj` 15.4 kB,
  `high.obj` 64.1 kB.
- https://opengameart.org/content/low-poly-cartoon-plane — by alpaqagames, 2014-07-28. _"300 vertices
  580 tris"_, Blender + TGA, 219.5 kB zip. Its own notice reads _"Attribution is appreciated but not
  required"_, consistent with CC0. It is a cartoon propeller plane, not a long-haul jet.

**Commercial use / attribution / paid SaaS:** same as any CC0 — permitted, not required, covered.
INFERRED caveat: OpenGameArt licences are self-declared by uploaders with no verification step, and these
submissions are 12–14 years old. The risk is low for a simple untextured mesh but it is not zero, and it is
higher than Kenney's, where one identifiable author distributes everything.

---

## What I verified by opening the archives

Downloaded to a scratch directory (nothing committed): Car Kit, Train Kit, Watercraft Kit, City Kit
Suburban, City Kit Commercial, Modular Buildings, Building Kit, Holiday Kit, Pirate Kit, Retro Urban Kit.

### GLB is genuinely there · VERIFIED

Every Kenney 3D kit I opened has this layout:

```
License.txt   Overview.html   Preview.png   Previews/
Models/FBX    Models/GLB    Models/OBJ    Models/Textures
```

GLB counts per kit: Car Kit 50, Train Kit 103, Watercraft Kit 46, Modular Buildings 108, City Kit Suburban
40, City Kit Commercial 41, Pirate Kit 72, Holiday Kit 99, Retro Urban Kit 124.

### The external-texture gotcha · VERIFIED — this one bites

Parsing the glTF JSON chunk of `boat-speed-a.glb`, `ship-ocean-liner-small.glb`, `train-electric-city-a.glb`,
`train-locomotive-passenger-a.glb`, `van.glb`, `building-type-h.glb`, `building-sample-house-a/b/c.glb` and
`structure.glb`, every single one declares:

```
"images": [{ "uri": "Textures/colormap.png" }]
```

The image is **not** embedded in the GLB's binary chunk. Consequences for Onward:

- Serving a lone `model.glb` from a static host yields an untextured mesh — the three.js `GLTFLoader` will
  resolve `Textures/colormap.png` relative to the GLB's URL and 404.
- Either mirror the `Models/GLB/Textures/` directory alongside the GLBs, or repack each model with the
  texture embedded (`gltf-transform` / `gltf-pipeline`). Repacking is the better call: it makes each Vehicle
  one atomic fetch, which suits a map that loads models on demand as Legs come into view.
- Cost of embedding is trivial: the atlases are 7.5–12.7 kB PNGs.

### One material, one atlas, per kit · VERIFIED

Every Kenney GLB examined reports `materials: 1` and `images: 1`. The kit is drawn from a single small
palette atlas. Atlas bytes and SHA-256 prefixes:

| Kit               | Atlas                    | Bytes            | SHA-256 (first 12)                |
| ----------------- | ------------------------ | ---------------- | --------------------------------- |
| Car Kit           | `colormap.png`           | 12,371           | `f3622a03a20c`                    |
| Train Kit         | `colormap.png`           | 12,684           | `e264660f3fc9`                    |
| Watercraft Kit    | `colormap.png`           | 8,814            | `311138350e74`                    |
| Modular Buildings | `colormap.png`           | 7,529            | _(+ `variation-a/b`)_             |
| City Kit Suburban | `colormap.png`           | 11,784           | `9b5de86078c2` _(+ 3 variations)_ |
| Pirate Kit        | `colormap.png`           | 10,061           | `451e1d7a53b8`                    |
| Retro Urban Kit   | **22 separate textures** | 1.7–12.5 kB each | —                                 |

The hashes all differ, so the kits do **not** literally share one atlas: mixing four kits means four
materials and four ~10 kB PNGs. That is a non-issue for weight and a small one for draw calls. Retro Urban
Kit is the exception that breaks the convention — 22 discrete textures, no single atlas — which is a reason
to leave it out even though it is the only Kenney kit with lorries in a city palette.

### Poly density, measured · VERIFIED

| Asset                          | Source                        | Tris  |
| ------------------------------ | ----------------------------- | ----- |
| `boat-speed-a`                 | Kenney Watercraft             | 156   |
| `boat-speed-d`                 | Kenney Watercraft             | 250   |
| `structure`                    | Kenney Pirate                 | 276   |
| `building-sample-house-a`      | Kenney Modular Buildings      | 312   |
| `building-sample-house-c`      | Kenney Modular Buildings      | 322   |
| `building-sample-house-b`      | Kenney Modular Buildings      | 374   |
| "Hut"                          | Quaternius via Poly Pizza     | 632   |
| "Funky aircraft" `low_0.obj`   | OpenGameArt                   | 696   |
| `building-type-h`              | Kenney City Kit Suburban      | 770   |
| `train-electric-city-a`        | Kenney Train                  | 1,130 |
| `train-electric-bullet-a`      | Kenney Train                  | 1,261 |
| `train-locomotive-passenger-a` | Kenney Train                  | 1,308 |
| `train-electric-double-a`      | Kenney Train                  | 1,445 |
| `ship-small`                   | Kenney Watercraft             | 1,723 |
| `ship-ocean-liner-small`       | Kenney Watercraft             | 1,750 |
| "Airplane"                     | Poly by Google via Poly Pizza | 1,772 |
| `van`                          | Kenney Car                    | 2,082 |
| `delivery`                     | Kenney Car                    | 2,476 |
| `ship-ocean-liner`             | Kenney Watercraft             | 2,796 |
| "Small Ship"                   | Quaternius via Poly Pizza     | 5,578 |

Kenney's own band is 156–2,796 tris. The Quaternius Hut (632) and the OpenGameArt aircraft (696) land
comfortably inside it. Quaternius "Small Ship" at 5,578 is twice the densest Kenney model and would read as
fussier than its neighbours — leave it out.

### Scale conventions: there are none · VERIFIED

World-space bounding boxes, computed by walking each GLB's node hierarchy and applying the transforms:

| Asset                          | Kit                       | W × H × D (source units)       | Implied real-world scale     |
| ------------------------------ | ------------------------- | ------------------------------ | ---------------------------- |
| `boat-speed-a`                 | Watercraft                | 1.78 × 1.50 × 3.37             | ≈ 1.5 m / unit               |
| `boat-speed-d`                 | Watercraft                | 2.00 × 1.20 × 3.87             | ≈ 1.5 m / unit               |
| `ship-small`                   | Watercraft                | 4.80 × 9.96 × 10.60            | ≈ 5–10 m / unit              |
| `ship-ocean-liner-small`       | Watercraft                | 4.76 × 8.93 × 15.20            | ≈ 10 m / unit                |
| `train-electric-city-a`        | Train                     | 1.10 × 1.68 × 2.40             | ≈ 10 m / unit                |
| `train-locomotive-passenger-a` | Train                     | 1.19 × 1.65 × 2.60             | ≈ 10 m / unit                |
| `railroad-straight`            | Train                     | 1.00 × 0.10 × 4.00             | 4-unit track tile            |
| `van`                          | Car                       | 1.50 × 1.35 × 2.75             | ≈ 1.8 m / unit               |
| `sedan`                        | Car                       | 1.50 × 1.30 × 2.55             | ≈ 1.8 m / unit               |
| `delivery`                     | Car                       | 1.50 × 1.65 × 3.25             | ≈ 1.8 m / unit               |
| `building-sample-house-b`      | Modular Buildings         | 1.09 × 1.98 × 2.20             | ≈ 3–4 m / unit               |
| `building-type-h`              | City Kit Suburban         | 1.30 × 0.74 × 0.92             | ≈ 8 m / unit                 |
| `structure`                    | Pirate                    | 2.50 × 2.20 × 2.50             | —                            |
| `palm-straight`                | Pirate                    | 2.49 × 4.21 × 2.49             | —                            |
| "Hut"                          | Quaternius via Poly Pizza | 0.87 × 0.76 × 1.17             | —                            |
| "Airplane"                     | Poly by Google            | **1566.56 × 580.72 × 1675.78** | centimetre-ish               |
| "Funky aircraft" `low_0.obj`   | OpenGameArt               | 20.63 × 7.39 × 16.00           | arbitrary                    |
| "Funky aircraft" `high_0.obj`  | OpenGameArt               | 1.94 × 0.70 × 1.56             | _different from its own LOD_ |

Read the extremes. A suburban house is **0.74 units tall** while a van is **2.75 units long** — park them at
1:1 and the van dwarfs the house. Inside a single kit, Watercraft's speedboat is toy-scaled at ~1.5 m/unit
while its ocean liner is ~10 m/unit. The Google Poly airliner is ~1,000× everything else. And Funky
Aircraft's own `low` and `high` LODs disagree with each other by ~10×.

This is not a defect — toy scale _is_ the Diorama's register, and Kenney authored each kit for its own grid.
But it kills the idea that "one pack" buys automatic scale coherence. Onward needs an explicit
`{ url, scale, yOffset, yaw }` record per Vehicle and per Stay Marker, hand-tuned once. That table is
required whichever packs win, so it is not a cost of mixing.

### Visual check · VERIFIED (I looked at the pack preview sheets)

- **Watercraft Kit** — contains a row of ten small open speedboats in flat primary colours, plus two
  classic funnelled passenger liners, cabin boats, fishing boats, tugs and container ships. The speedboat
  row is exactly the "small open boat" register, and the liners read unmistakably as passenger ferries.
- **Train Kit** — richer than the filenames suggest. It has assembled multi-car passenger sets: a long
  dark-blue-and-yellow double-deck set, a white/red intercity set, a green/white high-speed set, subway and
  tram units, steam locos, and freight wagons. The `-a/-b/-c` suffixes are INFERRED to be nose / middle /
  tail of a trainset (consistent with three ~2.4–2.6-unit pieces per family). The passenger _carriages_ in
  the kit are freight-bodied, so a sleeper is best read as the long double-deck set rather than
  loco-plus-sleeper-coach.
- **Car Kit** — sedans, SUVs, pickups, a taxi, a boxy green delivery van, an ambulance, a fire engine,
  tractors, and five cutesy kart racers with helmeted character heads. **No bus.** The kart racers are off
  register for Onward; ignore them.
- **City Kit Suburban** — white-walled, green-roofed detached houses with garages and driveways. A house,
  not a corporate tower, which is the right half of the brief — but the register is North-American/European
  suburbia, not a Southeast Asian guesthouse. Its `variation-a/b/c` textures allow recolouring the roof,
  which would shift the read somewhat.
- **Modular Buildings** — cream flat-roofed cubes with blue windows plus a few taller blocks, and crucially
  three **pre-assembled** `building-sample-house-a/b/c.glb`. These read far more like a small guesthouse
  than the suburban kit does, at a tenth of the triangles (312–374 vs 770–1,748). This is the better Kenney
  Stay Marker.
- **Pirate Kit** — its `structure*.glb` pieces are wooden dock platforms and market tables, not a hut.
  **Not** a Stay Marker source. It _is_ the best CC0 source of island dressing: `palm-straight`,
  `palm-detailed-bend`, `patch-sand`, `structure-platform-dock` — worth remembering for a beach Stop later.
- **Quaternius Huts** (four variants on Poly Pizza) — open-sided A-frame wooden shelters with plank roofs.
  This is the beach-hut read the brief asks for, and Kenney has no equivalent.
- Rejected on sight: CreativeTrio "Cottage" (half-timbered European), CreativeTrio "Cabin Shed" (alpine log
  cabin), Quaternius "Small Ship" (wooden sailing vessel, not a modern ferry), Quaternius "Boat" (a bare
  brown rowing boat, plainer than Kenney's speedboats).

### The Quaternius-via-Poly-Pizza caveat · VERIFIED — matters for the matte look

I downloaded three GLBs from `static.poly.pizza` and parsed them:

| File                      | Generator         | Images         | Materials                                              | Vertex attrs                 |
| ------------------------- | ----------------- | -------------- | ------------------------------------------------------ | ---------------------------- |
| Quaternius "Hut"          | `FBX2glTF v0.9.7` | **none**       | 2, colour via `baseColorFactor`, `metallicFactor: 0.4` | POSITION, NORMAL             |
| Quaternius "Boat"         | `FBX2glTF v0.9.7` | **none**       | 2, same shape                                          | POSITION, NORMAL             |
| Poly by Google "Airplane" | `obj2gltf`        | 1 embedded PNG | 1 (`lambert4SG`), `metallic: 0`, `roughness: 1`        | POSITION, NORMAL, TEXCOORD_0 |

Two things follow:

1. **The Quaternius conversions are not matte out of the box.** `metallicFactor: 0.4` will pick up specular
   highlights and read as semi-gloss plastic next to Kenney's flat colour. Their base colours are also very
   dark linear values (the Hut's wood is `[0.246, 0.144, 0.054]`). Dropping one in unmodified will look
   wrong in the Diorama.
2. **But they are trivially easy to fix, and easier to _palette_ than Kenney's.** They carry no UVs and no
   texture — colour lives entirely in the material. Overriding `metalness: 0` and setting `color` from
   Onward's own palette gives exact control, which you cannot do to a Kenney model without editing its
   atlas. INFERRED: this makes the Quaternius Hut a _better_ long-term Stay Marker than it first appears —
   we can force it into Kenney's palette rather than hoping it matches.

The Google Poly airliner needs no material work: `metallic: 0, roughness: 1` is already matte.

---

## Coherence verdict

**One pack does not cover it, and a mix is the honest answer — but the mix is 90% one author.**

Kenney alone covers speedboat, ferry, intercity train, sleeper train, bus-as-van, and the Stay Marker: six of
the seven things Onward needs, across four kits by one author, sharing a house palette, a flat-colour
single-atlas texturing convention, a 156–2,796-triangle band, and an identical matte register. That is as
close to a single-pack answer as this problem gets. The only genuine outsider is the aircraft, plus the
optional Quaternius Hut if we want a beach hut rather than a guesthouse.

**What actually makes the mix cohere:**

- **Kenney's palette family across kits.** The four atlases are different files but the same designer's
  palette. Cross-kit, the models look related in a way that cannot be faked by post-hoc recolouring.
- **Matte, unlit-ish flat colour with no PBR maps.** No normal maps, no roughness maps, no metal anywhere.
  Every candidate can be rendered with the same three.js material setup — one `MeshLambertMaterial` (or
  `MeshToonMaterial`) per atlas — and will sit in the same lighting.
- **Comparable poly density.** 156–2,796 tris for Kenney; 632 for the Quaternius Hut; 696 for the aircraft.
  Nothing in the shortlist is conspicuously smoother or blockier than its neighbours.
- **Forcing outsiders into our palette.** Because the Quaternius conversions are untextured, we can assign
  their colour directly from Onward's palette. Same trick works for the untextured OpenGameArt aircraft.
  Anything untextured is a _coherence asset_, not a liability.

**What does not make it cohere, and would be a waste of effort to try:**

- **Trusting source units.** Already covered: hopeless, even within one kit. The per-asset scale table is
  mandatory. Do not attempt a global scale factor per pack.
- **Dropping in a Google Poly / Poly-by-Google model unmodified.** Its authorship is a different hand
  entirely, and at 1,000× the scale it is a per-asset transform no matter what.
- **Reaching for Retro Urban Kit** because it has lorries. Its 22 discrete textures break the single-atlas
  convention that everything else shares.
- **Mixing in Kenney's kart racers, or CreativeTrio's cottages.** Same _palette_, wrong _world_. Coherence is
  about subject register as much as shading — a helmeted kart driver on a bus Leg is worse than a plain box.

---

## Gaps, and what falls back to primitives

### Long-haul airliner — no clean CC0 GLB anywhere

VERIFIED negatives:

- Kenney: zero aircraft in the 3D catalogue. I enumerated all 50 packs under
  https://kenney.nl/assets/category:3D and checked `tag:plane`, `tag:airplane`, `tag:aircraft`,
  `tag:aviation`, `tag:flight`. The only hits are `tappy-plane` and `pixel-shmup`, both 2D.
- Quaternius: no aircraft pack across all 81 packs.
- Poly Pizza: 30 of 32 `airplane` results and 26 of 27 `airliner` results are CC-BY 3.0. The CC0 exceptions
  are two Quaternius spaceships and a barrel.

Three routes, in order of preference:

1. **OpenGameArt "Funky aircraft" `low.obj`** — CC0, 696 tris, untextured so we own the colour completely.
   Costs one OBJ→GLB conversion. **Recommended.**
2. **Poly Pizza CC-BY 3.0 airliner** — zero conversion, direct GLB, but adds a permanent attribution
   obligation and a credits surface we do not otherwise need.
3. **A three.js primitive airliner** — a stretched box fuselage, two tapered wing boxes, a fin. At the zoom
   where an intercontinental arc is visible the Vehicle is a few dozen pixels; a primitive would genuinely do.

### Bus — no CC0 bus model exists in any source checked

VERIFIED: no bus in Kenney's 3D catalogue (`tag:bus` returns nothing; Car Kit's preview confirms it by eye;
Retro Urban Kit has lorries only). No CC0 bus, van or minibus on Poly Pizza (24 / 17 / 15 results, all
CC-BY). Quaternius's Public Transport Pack _does_ contain a school bus but ships FBX/OBJ/Blend only and is
not mirrored on Poly Pizza.

The Mode is written as "bus/van" in the itinerary, which lets us off honestly: **`van.glb` from Kenney Car
Kit is a real answer, not a compromise** — for a Southeast Asian minibus or songthaew hop, a van is arguably
the truer depiction anyway. `delivery.glb` is boxier and reads more like a minibus if that is wanted. Only
if a full coach is genuinely required does this become a primitive, and a bus is the single easiest thing to
build from primitives: one rounded box, a window band, six wheels.

### Modes needing three.js primitives

**None, if the airliner comes from OpenGameArt or accepts CC-BY.** All six Modes plus the Stay Marker have a
real model.

Keep primitives as the deliberate fallback for exactly two cases, both already scoped in the ADR's spirit:

- **Airliner**, if the OBJ conversion step is unwanted and CC-BY attribution is refused.
- **Bus**, if "van" is judged an unacceptable stand-in for a coach.

---

## Recommendation

### Shortlist

**Four Kenney kits, CC0 1.0, no attribution, commercial and future-SaaS safe:**

| Kit                | URL                                        | Download     | Gives us                                 |
| ------------------ | ------------------------------------------ | ------------ | ---------------------------------------- |
| Watercraft Kit 2.1 | https://kenney.nl/assets/watercraft-kit    | 1.87 MB      | speedboat (10 variants), passenger ferry |
| Train Kit 1.1      | https://kenney.nl/assets/train-kit         | 5.27 MB      | sleeper trainset, intercity trainset     |
| Car Kit 3.1        | https://kenney.nl/assets/car-kit           | 4.81 MB      | bus/van                                  |
| Modular Buildings  | https://kenney.nl/assets/modular-buildings | 1.83 MB      | Stay Marker (guesthouse)                 |
|                    | **total**                                  | **13.78 MB** |                                          |

**Plus two singles:**

- **Airliner** — https://opengameart.org/content/funky-aircraft, `low.obj`, 15.4 kB, CC0, 696 tris.
- **Beach hut Stay Marker** — https://poly.pizza/m/4MJWbyd6vw, direct GLB, 36.3 kB, CC0, 632 tris. Optional;
  take it if the Stay Marker should read as a beach hut rather than a guesthouse, and expect to override its
  material.

**Explicitly not taking:** Retro Urban Kit (breaks the single-atlas convention), City Kit Suburban (wrong
cultural register for a Stay), Pirate Kit for the Stay (its "structures" are docks, not huts — but bookmark
its palms and sand for island Stops), Quaternius "Small Ship" (2× the poly density of anything else),
anything by an unknown Poly Pizza uploader, and the "Boeing 747" model on trademark grounds.

### Download plan

1. **Fetch the four Kenney zips** into a scratch directory outside the repo. Verified direct URLs
   (fingerprinted paths — re-read the pack page if one 404s after a pack update):
   - `https://kenney.nl/media/pages/assets/watercraft-kit/a335cfed49-1713519620/kenney_watercraft-pack.zip`
   - `https://kenney.nl/media/pages/assets/train-kit/cf8521d625-1727040883/kenney_train-kit.zip`
   - `https://kenney.nl/media/pages/assets/car-kit/1a312ec241-1775131960/kenney_car-kit.zip`
   - `https://kenney.nl/media/pages/assets/modular-buildings/3253b4219a-1707397411/kenney_modular-buildings.zip`
2. **Extract only the GLBs we ship.** Nine files, from `Models/GLB/`:
   `boat-speed-a`, `ship-ocean-liner-small`, `train-electric-double-a/b/c`, `train-electric-bullet-a/b/c`,
   `van`, `building-sample-house-b`.
3. **Repack each with its texture embedded.** Non-negotiable — see the external-URI finding. One
   `gltf-transform` pass per file, taking `Textures/colormap.png` from the same kit. Verify afterwards that
   `images[0]` has no `uri`.
4. **Convert the airliner.** `low.obj` → GLB, assign a single matte material from Onward's palette
   (`metalness: 0`), and normalise its orientation so +Z is nose-forward like the Kenney vehicles.
5. **Optionally fetch the Hut.** `curl https://static.poly.pizza/36d65045-d2ff-4689-a34d-a4acbe1873cb.glb`,
   then override both its materials to `metalness: 0` with palette colours.
6. **Build the scale table.** One record per Vehicle and Stay Marker: `{ scale, yOffset, yaw }`, tuned by eye
   against a reference cube at a known ground size. This is the step that makes everything look like one
   world, and it is unavoidable regardless of source.
7. **Commit the processed GLBs, not the archives.** Nine to eleven files.

### Shipped weight

| Set                                             | Bytes     | Notes                                                                        |
| ----------------------------------------------- | --------- | ---------------------------------------------------------------------------- |
| One unit per Mode + guesthouse Stay + airliner  | ≈ 733 kB  | includes ~41 kB of atlases and an INFERRED ~35 kB for the converted airliner |
| With full three-piece trainsets for both trains | ≈ 1.21 MB | +481 kB for the four extra carriage pieces                                   |

Both figures are uncompressed GLB. INFERRED: brotli on the wire will cut this substantially since GLB is
mostly JSON plus float buffers, and Draco or meshopt would cut it further — neither is needed at this size.
Against a 13.78 MB download, we ship under 1.3 MB.

### Modes needing three.js primitives

**None are forced.** Two are conditional:

- **Long-haul airliner** — only if the OBJ→GLB conversion is rejected _and_ CC-BY attribution is refused.
- **Bus** — only if `van.glb` is judged an unacceptable stand-in for a coach. No CC0 bus model exists in
  Kenney, Quaternius, or Poly Pizza.

Everything else — sleeper train, intercity train, speedboat, passenger ferry, and the Stay Marker — has a
CC0, GLB, attribution-free, SaaS-safe model available today.
