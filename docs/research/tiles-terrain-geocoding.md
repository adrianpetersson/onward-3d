# Free-tier tiles, terrain and geocoding for a low-poly Diorama

Research for [#3](https://github.com/adrianpetersson/onward/issues/3). **Date of research: 2026-08-13.** All quotas,
prices and URLs below were read or probed on that date; providers change free tiers without notice, so treat anything
older than a few months as needing a re-check.

Three separate choices, which need not come from one provider:

1. **Vector tiles + a style** for the Diorama base.
2. **An elevation source** MapLibre can use as `terrain` (this is a _raster_ DEM source, not vector).
3. **A geocoder** for Stop search ("Koh Mook").

Constraints from the charted decisions: MapLibre GL JS v5 ([ADR 0001](../adr/0001-maplibre-v5-with-a-threejs-custom-layer.md)),
static Vite SPA with no backend ([ADR 0002](../adr/0002-no-backend-localstorage-and-one-edge-function.md)), one free-tier
API key acceptable, and the geographies that matter are **Thailand, Malaysia and Northern Europe**.

Everything is split into **VERIFIED** (read on the provider's own page, or probed with `curl` and reproduced below) and
**INFERRED** (reasoning, or a claim I could not confirm without creating an account — which I did not do).

---

## 0. VERIFIED — what MapLibre actually requires of a terrain source

This constrains the elevation choice more than pricing does.

- The style's `terrain` object takes only `source` (required, string) and `exaggeration` (number, default `1`).
  — <https://maplibre.org/maplibre-style-spec/terrain/>
- The referenced source must be of type **`raster-dem`**. Its `encoding` property is an enum with exactly three
  values — `"terrarium"`, `"mapbox"`, `"custom"` — and **defaults to `"mapbox"`**. Other relevant properties:
  `tileSize` (default `512`), `maxzoom` (default **`22`**), `minzoom` (default `0`), plus `redFactor` / `greenFactor` /
  `blueFactor` / `baseShift` used only when `encoding: "custom"`.
  — <https://maplibre.org/maplibre-style-spec/sources/>

Two consequences worth writing down now, because both are easy to get wrong:

- **Encoding is not auto-detected from the image.** A Terrarium-encoded tileset consumed with the default `"mapbox"`
  encoding renders as garbage terrain, not as an error. Terrarium decodes as
  `(red * 256 + green + blue / 256) - 32768` metres. — <https://github.com/tilezen/joerd/blob/master/docs/formats.md>
- **`maxzoom` defaults to 22**, so a DEM that stops at z12 or z15 will have MapLibre requesting non-existent tiles at
  street level unless `maxzoom` is set explicitly on the source. Set it and MapLibre overzooms the deepest real tile
  instead of 404-ing. This matters directly for the "dive to street level on a Thai island" half of the product — see
  §2.

---

## 1. VERIFIED — vector tiles and styles

### 1.1 OpenFreeMap

No account, no key, no registration. Quoting the homepage verbatim:

> "Using our public instance is completely free: there are no limits on the number of map views or requests. There's no
> registration, no user database, no API keys, and no cookies."

— <https://openfreemap.org/>

Same page, on commercial use and support: _"Is commercial usage allowed? Yes."_ and _"At the moment, I don't offer SLA
guarantees or personalized support."_ Funding is donations / GitHub Sponsors. The
[Terms of Service](https://openfreemap.org/tos/) are an as-is disclaimer — "THE SITE IS PROVIDED 'AS-IS,' 'AS
AVAILABLE,' AND 'WITH ALL FAULTS.'" — with no usage quota and no commercial restriction.

**Attribution** (<https://openfreemap.org/>):

> "Attribution is required. If you are using MapLibre, they are automatically added, you have nothing to do. If you are
> using alternative clients, or if you are using this in printed media or video, you must add the following attribution:
> OpenFreeMap © OpenMapTiles Data from OpenStreetMap. You do not need to display the OpenFreeMap part, but it is nice if
> you do."

Probed 2026-08-13 (all `200`, `content-type: application/json`, `access-control-allow-origin: *`,
`cache-control: public, max-age=86400`):

| Style URL                                       | Size     | Layers | Symbol layers | `fill-extrusion`  |
| ----------------------------------------------- | -------- | ------ | ------------- | ----------------- |
| `https://tiles.openfreemap.org/styles/liberty`  | 43,079 B | 111    | 25            | 1 (`building-3d`) |
| `https://tiles.openfreemap.org/styles/bright`   | 48,713 B | 119    | 25            | 0                 |
| `https://tiles.openfreemap.org/styles/positron` | 25,153 B | 55     | 19            | 0                 |
| `https://tiles.openfreemap.org/styles/dark`     | 20,959 B | 47     | 15            | 0                 |
| `https://tiles.openfreemap.org/styles/fiord`    | 22,234 B | 48     | 14            | 0                 |

Note the host is `tiles.openfreemap.org`. **`tiles.openfreemap.com` does not resolve** (NXDOMAIN on 2026-08-13) — the
`.com` domain appears in some third-party write-ups and is wrong.

The vector source behind every style is one TileJSON: `https://tiles.openfreemap.org/planet`. Read on 2026-08-13:

- `tilejson: 3.0.0`, `minzoom: 0`, **`maxzoom: 14`**, global bounds.
- `tiles: ["https://tiles.openfreemap.org/planet/20260802_080001_pt/{z}/{x}/{y}.pbf"]` — i.e. the data build was
  2026-08-02, eleven days before this research. Fresh.
- `attribution: "<a href=\"https://openfreemap.org\" target=\"_blank\">OpenFreeMap</a> <a href=\"https://www.openmaptiles.org/\" target=\"_blank\">&copy; OpenMapTiles</a> Data from <a href=\"https://www.openstreetmap.org/copyright\" target=\"_blank\">OpenStreetMap</a>"`
- `vector_layers`: `aerodrome_label, aeroway, boundary, building, housenumber, landcover, landuse, mountain_peak, park,
place, poi, transportation, transportation_name, water, water_name, waterway` — unmodified OpenMapTiles schema.

**Building heights are present**, which the Stay Marker work depends on. I downloaded the z14 tile covering Bangkok
(`.../planet/20260802_080001_pt/14/12765/7559.pbf`, 502,677 B) and confirmed the `building` layer carries
`render_height` and `render_min_height`. Those are the OpenMapTiles fields — _"An approximated height from levels and
height of the building"_ — per <https://openmaptiles.org/schema/>.

Glyphs and sprites are served from the same host (`https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf`,
`https://tiles.openfreemap.org/sprites/ofm_f384/ofm`), so no second vendor is needed for text or icons.

Style licensing matters here because we will fork and gut a style. The styles repo is **MIT**, with the individual style
designs under CC BY 4.0 and code under BSD-3-Clause:
<https://github.com/hyperknot/openfreemap-styles/blob/main/LICENSE.md>. The repo also notes: _"Positron, as a special
clean looking style, has POIs removed and some highway labels set to show at higher zooms only."_
— <https://github.com/hyperknot/openfreemap-styles/blob/main/README.md>

### 1.2 Protomaps (hosted API)

Requires an API key. Probed 2026-08-13: `https://api.protomaps.com/tiles/v4/14/13000/7000.mvt` with no key returns
**HTTP 403**.

From <https://protomaps.com/api> and the FAQ at <https://protomaps.com/about>:

- _"If you have light to medium traffic needs, you can sign up for an API key and use a demo API with a soft limit of
  **1,000,000 tile requests per month**."_
- _"The Protomaps Tile API is free for non-commercial use. For commercial use, become a GitHub Sponsor."_
- On overage — this is the most humane overage policy of anything surveyed: _"Nothing automated. If your map goes viral
  and exceeds the limit, it won't be shut down. Sponsored usage that consistently exceeds the soft limit will be
  contacted and encouraged to migrate to their own deployment."_
- Keys are CORS-scoped per key; `localhost` is exempt.
- URLs: style `https://api.protomaps.com/styles/v5/light/en.json?key=MY_KEY`, TileJSON
  `https://api.protomaps.com/tiles/v4.json?key=MY_KEY`, ZXY
  `https://api.protomaps.com/tiles/v4/{z}/{x}/{y}.mvt?key=MY_KEY`. _"The Basemap API supports zoom level 15."_
- Required attribution, verbatim from the docs: `<a href="https://osm.org/copyright">© OpenStreetMap</a>`.

Restyling story is the strongest of the lot for a bespoke Diorama: the basemap ships as an npm package
`@protomaps/basemaps` whose `layers()` function builds the layer array programmatically from a "flavor" object, and
flavors are plain objects you override with spread syntax — `{...namedFlavor("light"), buildings:"red"}`. Five flavors:
`light`, `dark`, `white`, `black`, `grayscale`; _"POIs appear exclusively in the light and dark flavors"_, so the
data-viz flavors are already POI-free. The visual design is **CC0**. Buildings carry `height` and `min_height`
attributes.
— <https://docs.protomaps.com/basemaps/maplibre>, <https://docs.protomaps.com/basemaps/flavors>,
<https://docs.protomaps.com/basemaps/layers>, <https://protomaps.com/about>

Sprites/glyphs are not served by the API; they live on GitHub Pages and I confirmed both resolve without a key on
2026-08-13: `https://protomaps.github.io/basemaps-assets/fonts/Noto%20Sans%20Regular/0-255.pbf` (200, 76,044 B) and
`https://protomaps.github.io/basemaps-assets/sprites/v4/light.json` (200, 3,549 B).

Self-hosting escape hatch: the planet PMTiles is _"roughly 120 gigabytes"_ for z0–15, daily builds at
`maps.protomaps.com/builds`, ODbL as a Produced Work, and the docs explicitly say _"URLs may change and hotlinking to
these downloads are discouraged. Instead, you should copy the tileset to your own Cloud Storage."_
— <https://docs.protomaps.com/basemaps/downloads>

### 1.3 MapTiler

Free tier, read from <https://www.maptiler.com/cloud/pricing/> on 2026-08-13:

|                   | Free         | Flex ($30/mo) |
| ----------------- | ------------ | ------------- |
| Map sessions      | 5k/month     | 25k/month     |
| Search sessions   | 1k/month     | 3k/month      |
| **3D sessions**   | **2k/month** | 10k/month     |
| API requests      | 100k/month   | 500k/month    |
| Custom map styles | 5            | 20            |

The plan-comparison table on that page is the decisive part. The **"Commercial use"** row has an **empty cell for Free**
and a check mark for Flex and Custom — I confirmed this in the page HTML, not by eyeballing icons. The Free column is
likewise empty for "Static maps API", "WMTS map services", "99.9% SLA" and **"No MapTiler logo required"**. The Free
plan is described as _"Suitable for testing, personal or non-commercial use."_ with _"MapTiler logo on the map"_.

Note what the "No MapTiler logo required" row says for the paid tiers: **"required for 3D sessions"**. So the MapTiler
logo is mandatory on a 3D map _even on Flex and Custom_. For a product whose whole surface is a 3D map, that is a
permanent third-party logo in the corner regardless of what you pay.

Billing mechanics, same page:

- _"FREE plans do not require billing information."_ — no card for the free tier.
- _"On a FREE plan service will pause until the next month without an upgrade to paid plans."_ — hard cutoff, not a bill.
- On Flex, _"automatic overuse charges for additional usage at the end of the monthly billing period"_, with a settable
  spending limit. Overage rates: sessions $2.50/1k, search sessions $2.50/1k, **3D sessions $6.00/1k**, API requests
  $0.15/1k.

A "session" starts when a user opens the page with the map, and a new one starts when the tab is reloaded, when a single
continuous session exceeds **6 hours**, or when it reaches **10,000 requests**.
— <https://docs.maptiler.com/guides/maps-apis/maps-platform/tile-requests-and-map-sessions-compared/>

Attribution obligation is contractual, not just conventional. Terms §6.1: _"the Customer is required to add '©
MapTiler' (with Free Account the MapTiler logo) when displaying maps."_ §6.4: _"the attribution should appear in a
corner of the map, with a clickable link."_ §6.7: _"The attribution must always be visible and readable on any screen or
medium."_ — <https://www.maptiler.com/terms/>

### 1.4 Stadia Maps

Free tier, from <https://stadiamaps.com/pricing/> on 2026-08-13: **$0, 200,000 credits/month, "No additional usage",
"Standard basemaps", "Basic APIs only", "Commercial use not allowed"** (that last string is verbatim from the free
plan card). Credit costs: **1 credit per basemap tile**, 4 per satellite tile, **20 per geocoding request**, 20 per
routing request. Starter is $20/mo for 1,000,000 credits/month, +3¢/1000 additional credits.

Overage is a hard stop: _"After you use all of your credits for a billing period (calendar month for free accounts),
our default action is to hard limit until the start of the next billing cycle"_ and _"all APIs will respond with HTTP
429 Rate Limit Exceeded."_ They email at 80% of credits.
— <https://docs.stadiamaps.com/limits/>

No card is required for the free tier — the page offers the 14-day Professional trial _"risk-free and without a credit
card"_.

Auth is unusually convenient for a static SPA: domain-based authentication needs no key in the bundle at all —
_"Domain-based authentication is the easiest form of authentication for production web apps. No additional application
code is required, and you don't need to worry about anyone scraping your API keys."_ Plain `localhost` development needs
no key but is _"subject to strict rate limits"_. — <https://docs.stadiamaps.com/authentication/>. Consistent with that,
I got a `200` from `https://tiles.stadiamaps.com/styles/alidade_smooth.json` with no key on 2026-08-13.

All 8 themes (Alidade Smooth / Smooth Dark / Satellite, Outdoors, Stamen Toner / Terrain / Watercolor, OSM Bright) are
available on every tier including Free, and custom styles are supported.
— <https://docs.stadiamaps.com/themes/>

Attribution, verbatim: `&copy; <a href="https://stadiamaps.com/" target="_blank">Stadia Maps</a> &copy; <a href="https://openmaptiles.org/" target="_blank">OpenMapTiles</a> &copy; <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a>`.
You _"must leave all automatically generated attributions in place, or replace them with something that conveys the same
information"_, and it must stay prominent. — <https://docs.stadiamaps.com/attribution/>

### 1.5 CARTO

Not a candidate. There is no persistent free tier: a **14-day trial** only, and _"Trials are for evaluation purposes
only — production use is not permitted during a trial period."_ Everything past that is Pay-As-You-Go or committed
annual contracts. — <https://carto.com/pricing>

(The _Positron_ style Onward would likely start from is originally CARTO's design, but it reaches us through the
OpenMapTiles/OpenFreeMap fork under CC BY 4.0 — no CARTO account involved. See §1.1 licensing.)

---

## 2. VERIFIED — elevation sources for `raster-dem`

### 2.1 AWS Open Data "Terrain Tiles" (Tilezen / Mapzen)

- Bucket **`elevation-tiles-prod`** (us-east-1), with an EU replica `elevation-tiles-prod-eu` (eu-central-1). Managed by
  Mapzen, a Linux Foundation project.
  — <https://registry.opendata.aws/terrain-tiles/>
- URL pattern `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png`; also `normal`, `geotiff`,
  `skadi`. _"Terrarium and normal formats are only available as 256 tile size on the Amazon S3 endpoints"_, and 256 px
  tiles top out at **zoom 15**. — <https://github.com/tilezen/joerd/blob/master/docs/use-service.md>
- No API key, no account, no quota published. CORS is open — probing on 2026-08-13 returned
  `Access-Control-Allow-Origin: *`.

I probed the actual zoom ceiling over the geographies that matter (2026-08-13):

| Location               | z12 | z13 | z14 | z15 | z16     |
| ---------------------- | --- | --- | --- | --- | ------- |
| Doi Inthanon, Thailand | 200 | 200 | 200 | 200 | **404** |
| Koh Mook, Thailand     | 200 | 200 | 200 | 200 | **404** |
| Jotunheimen, Norway    | 200 | 200 | 200 | 200 | **404** |

So: **global, uniform, z0–15, keyless.** Set `maxzoom: 15` and MapLibre overzooms cleanly past it.

One caveat found by reading response headers rather than docs: the z10 tile I fetched carries
`Last-Modified: Sun, 19 Nov 2017 16:00:30 GMT`. This tileset is a **frozen 2017 build**, and there is no
`Cache-Control` header and no CDN in front of it. Fine for matte low-poly relief; not a live-maintained dataset.

Attribution for Tilezen is source-by-source, not one string. The docs require _"Mapzen"_ plus all terrain data sources,
listing among others _"Courtesy of the U.S. Geological Survey"_, _"Produced using Copernicus data and information funded
by the European Union"_, _"© Commonwealth of Australia (Geoscience Australia) 2017"_, _"© Kartverket"_ and
_"U.S. National Oceanic and Atmospheric Administration"_.
— <https://github.com/tilezen/joerd/blob/master/docs/attribution.md>

### 2.2 Mapterhorn

This is what **MapLibre's own 3D terrain example now uses** — the example's `raster-dem` source is
`https://tiles.mapterhorn.com/tilejson.json`. — <https://maplibre.org/maplibre-gl-js/docs/examples/3d-terrain/>

I read that TileJSON on 2026-08-13. It is the tidiest DEM endpoint surveyed, because it declares its own encoding:

```json
{
  "tiles": ["https://tiles.mapterhorn.com/{z}/{x}/{y}.webp"],
  "attribution": "<a href='https://mapterhorn.com/attribution'>© Mapterhorn</a>",
  "encoding": "terrarium",
  "tileSize": 512
}
```

Note it has **no `maxzoom` field**, so MapLibre falls back to the spec default of 22 — see the trap in §0.

From <https://mapterhorn.com/data-access>: _"Mapterhorn distributes Terrarium-encoded terrain rgb tiles as webp images
with 512 pixel width."_ Keyless zxy endpoint plus PMTiles downloads (`planet.pmtiles` covering z0–z12, and separate
z13–z17 regional archives). Infrastructure is donated: _"Cloudflare is generously supporting Mapterhorn with R2 Object
Storage, Workers, and bandwidth."_ Code is BSD-3; the project is funded by NLnet/NGI0 and maintained by Oliver Wipfli.
No quota, rate limit or terms-of-use page exists on the site as of 2026-08-13. CORS is open
(`access-control-allow-origin: *`, `cache-control: public, max-age=604800`).

The coverage list (<https://mapterhorn.com/>) is _"Global, 30 m"_ plus ~70 high-resolution national/regional DEMs. The
Northern European entries are extraordinary — **Norway country-wide 1 m, Sweden country-wide 1 m, Denmark country-wide
0.4 m, Finland country-wide 2 m, Estonia 1 m, Iceland 10 m**. Thailand and Malaysia are not on the list at all.

That asymmetry shows up exactly where you would predict. Probed 2026-08-13:

| Location               | z10 | z12 | z14     | z15     | z16     | z17     |
| ---------------------- | --- | --- | ------- | ------- | ------- | ------- |
| Koh Mook, Thailand     | 200 | 200 | **404** | **404** | **404** | **404** |
| Doi Inthanon, Thailand | 200 | 200 | **404** | **404** | **404** | **404** |
| Jotunheimen, Norway    | 200 | 200 | 200     | 200     | 200     | **404** |

**Mapterhorn gives Northern Europe terrain to z16 and Thailand only to z12.** For a product whose signature move is
diving to street level on a Thai island, that is the deciding fact of this whole section.

### 2.3 MapTiler Terrain RGB

`terrain-rgb-v2`, **zoom 0–14**, WebP, 30 m globally and 5 m in specific areas, 6 m vertical resolution.
— <https://docs.maptiler.com/schema-raster/terrain-rgb/>. Key required: probing
`https://api.maptiler.com/tiles/terrain-rgb-v2/tiles.json` with no key returned **HTTP 403** on 2026-08-13.

### 2.4 MapLibre's demo tiles — not an option

`https://demotiles.maplibre.org/terrain-tiles/tiles.json` resolves, but reading it shows what it is:
`"name": "jaxa_terrainrgb_N047E011"`, `"maxzoom": 12`, attribution _"AW3D30 (JAXA)"_. A single-region demo asset on
MapLibre's own demo infrastructure. Not for production use.

---

## 3. VERIFIED — geocoding

### 3.1 Nominatim: read this before wiring anything up

> **Onward's developer must read the policy directly before using the public Nominatim API:
> <https://operations.osmfoundation.org/policies/nominatim/>.** The service runs on donated hardware with, in its own
> words, _"a very limited capacity"_. The restrictions below are not advisory; the policy names the consequence as being
> banned. Using it is a deliberate decision the developer takes on and is responsible for complying with — it is not
> something to adopt because a document (this one included) suggested it.

The policy's actual requirements, quoted:

- _"No heavy uses (an absolute **maximum of 1 request per second**)."_
- _"Provide a valid HTTP Referer or User-Agent identifying the application (stock User-Agents as set by http libraries
  will not do)."_
- _"Clearly display attribution as suitable for your medium."_
- _"Results must be cached on your side. Clients sending repeatedly the same query may be classified as faulty and
  blocked."_
- _"Apps must make sure that they can switch the service at our request at any time (in particular, switching should be
  possible without requiring a software update)."_
- Under **Unacceptable Use** — _"The following uses are strictly forbidden and will get you banned"_ — the first entry
  is: _"**Auto-complete search** This is not yet supported by Nominatim and you must not implement such a service on the
  client side using the API."_
- _"Please be aware that this usage policy may change without notice... Commercial applications should keep that in mind
  when relying on this API for serving paying customers."_

The policy also carries a section headed **"Usage in LLMs"**, which is directly relevant to how this document came to
exist:

> "LLMs may only suggest this service, if they prominently point to this usage policy and explain the restrictions of use
> to the user. Code generated by LLMs must adhere to all terms laid out in this policy."
>
> "The public Nominatim API must not be built into, offered through, suggested by, or automatically generated by
> no-code, low-code, or vibe-coding platforms as a generic geocoding, address lookup, place search, or map search
> service. Use of the public API is only permitted where the application developer has made a deliberate, informed
> decision to use it and is directly responsible for complying with this policy."

**Plain answer to the ticket's question.** An app like Onward _is_ permitted against the public instance, but only in a
narrow shape: search must be triggered by the end user (_"Use that is directly triggered by the end-user (for example,
user searches for something) is ok, provided that your number of users is moderate"_), submitted explicitly rather than
fired per keystroke, kept under 1 req/s in aggregate across all users, cached client-side, sent with a real
identifying User-Agent, and swappable without shipping a new build. **The as-you-type Stop search that a map itinerary
planner naturally wants is explicitly forbidden.** So: fine as a submit-on-Enter lookup for a single-user MVP; not fine
as the autocomplete this product wants; and not a foundation for a paid SaaS.

### 3.2 Photon (komoot)

Photon exists _for_ the thing Nominatim forbids — the project's own tagline is "search-as-you-type with OpenStreetMap",
listing "Typeahead suggestion" as its first feature. Terms of Use, verbatim and complete:

> "You can use the API for your project, but please be fair - extensive usage will be throttled. We do not guarantee for
> the availability and usage might be subject of change in the future."

— <https://photon.komoot.io/>

No key, no quota number, no commercial statement either way. Software is Apache-2.0. Self-hosting is a real escape
hatch but not a cheap one: _"A planet-wide database requires about 95GB disk space (as of 2026, grows by about 10% a
year)"_ and _"At least 64GB RAM are recommended for smooth operations."_ — <https://github.com/komoot/photon>

### 3.3 The "Koh Mook" test

I ran the ticket's own example against both public instances on 2026-08-13. Unfiltered, **both are unusable for Stop
search** — they return beach resorts, not the island:

- Nominatim `?q=Koh Mook`: `Smile Resort Koh Mook` (hotel), `Koh Mook Sea beach Restaurant`, `Koh Mook Yummy
Restaurant`, `Koh Mook Riviera Beach Resort`.
- Photon `?q=Koh Mook`: `Koh Mook Riviera Beach Resort`, `Koh Mook Supermarket`, `Koh Mook Sivalai Beach Resort`.

With a place-type filter the picture inverts, and the two behave differently:

- **Photon `?q=Koh Mook&osm_tag=place` → `เกาะมุก`, `place/island`, `[99.2973031, 7.3718307]`.** One clean hit on the
  colloquial backpacker spelling.
- **Nominatim `?q=Koh Mook&featureType=settlement` → zero results.** It only finds the island under its official
  romanisation: `?q=Ko Muk` → `Ko Muk`, `place/island`, `7.3732358, 99.2943273`.

That is a concrete quality finding, not a preference: **Photon tolerates the spelling a backpacker actually types.**
Onward's Stop search should send `osm_tag=place` (and note that a Stay is placed from a Google Maps link per
[ADR 0002](../adr/0002-no-backend-localstorage-and-one-edge-function.md), so the geocoder never needs to resolve POIs at
all — which is convenient, because POIs are exactly what pollutes these results).

### 3.4 Paid-tier geocoders

- **MapTiler Geocoding**: `https://api.maptiler.com/geocoding/{query}.json`, key required on every request, `poi`
  disabled by default, `limit` default 5 / max 10. Response carries its own attribution: _"© MapTiler © OpenStreetMap
  contributors"_. — <https://docs.maptiler.com/cloud/api/geocoding/>. Free tier is **1k search sessions/month**; as of
  <https://www.maptiler.com/news/2026/06/geocoding-with-predictable-pricing/> (2026-06-15) geocoding bills by session
  (reload / 6 hours / 10,000 requests) rather than per request when using their SDK.
- **Stadia geocoding** (Pelias): 20 credits/request against the 200,000-credit free pool → ~10,000 requests/month, but
  the free tier forbids commercial use.

---

## 4. VERIFIED — comparison table

Tiles + style:

|                   | OpenFreeMap                                                       | Protomaps hosted                     | MapTiler Free                                                                 | Stadia Free                            | CARTO             |
| ----------------- | ----------------------------------------------------------------- | ------------------------------------ | ----------------------------------------------------------------------------- | -------------------------------------- | ----------------- |
| Key / account     | **none**                                                          | key required (403 without)           | key required                                                                  | key, or domain auth (no key in bundle) | account           |
| Monthly quota     | **no limit** ("no limits on the number of map views or requests") | 1,000,000 tile req (soft)            | 5k map sessions / 100k API req / **2k 3D sessions**                           | 200,000 credits (1 credit = 1 tile)    | 14-day trial only |
| Card required     | n/a                                                               | no                                   | **no** ("FREE plans do not require billing information")                      | no                                     | —                 |
| On overage        | n/a                                                               | **nothing automated**, not shut down | **hard pause until next month**                                               | **hard 429 until next cycle**          | —                 |
| Commercial use    | **yes**                                                           | **no** (Sponsor required)            | **no** on Free                                                                | **no** ("Commercial use not allowed")  | paid only         |
| Max zoom (vector) | 14                                                                | 15                                   | 14+                                                                           | 14+                                    | —                 |
| Building heights  | yes (`render_height`)                                             | yes (`height`)                       | yes                                                                           | yes                                    | —                 |
| Third-party logo  | none                                                              | none                                 | **MapTiler logo required — and still required for 3D sessions on paid tiers** | none                                   | —                 |
| SLA               | none                                                              | none                                 | Custom plan only                                                              | paid tiers                             | contract          |

Elevation:

|                            | AWS Terrarium                                  | Mapterhorn                                   | MapTiler terrain-rgb-v2 | MapLibre demotiles |
| -------------------------- | ---------------------------------------------- | -------------------------------------------- | ----------------------- | ------------------ |
| Key                        | none                                           | none                                         | required (403 without)  | none               |
| Encoding                   | `terrarium` (256 px)                           | `terrarium` (512 px, declared in TileJSON)   | `mapbox`                | `mapbox`           |
| Zoom — Thailand / Malaysia | **z0–15**                                      | **z0–12**                                    | z0–14                   | z0–12, one region  |
| Zoom — Northern Europe     | z0–15                                          | **z0–16** (Norway/Sweden 1 m, Denmark 0.4 m) | z0–14                   | —                  |
| Quota                      | none published                                 | none published                               | 100k API req/mo on Free | demo asset         |
| Freshness                  | frozen 2017 build (`Last-Modified` 2017-11-19) | actively maintained 2025–2026                | maintained              | demo               |
| CDN                        | none (raw S3)                                  | Cloudflare R2 + Workers                      | yes                     | demo               |

Geocoding:

|                     | Nominatim public                              | Photon public                                          | MapTiler              | Stadia              |
| ------------------- | --------------------------------------------- | ------------------------------------------------------ | --------------------- | ------------------- |
| Key                 | none                                          | none                                                   | required              | key/domain          |
| Rate                | **1 req/s absolute max**                      | _"please be fair - extensive usage will be throttled"_ | 1k search sessions/mo | 20 credits/req      |
| Autocomplete        | **forbidden — "will get you banned"**         | **the product's purpose**                              | allowed               | allowed             |
| Caching             | **mandatory**                                 | not stated                                             | —                     | —                   |
| Commercial          | discouraged; policy may change without notice | not stated                                             | paid tier             | **not on Free**     |
| "Koh Mook" → island | only as "Ko Muk"                              | **yes, with `osm_tag=place`**                          | not tested (no key)   | not tested (no key) |

---

## 5. VERIFIED / judged — how close is each style to a low-poly Diorama?

The Diorama register per [CONTEXT.md](../../CONTEXT.md) is "matte terrain, flat colour, toy-scale models" with minimal
labels. None of the off-the-shelf styles are that; all of them are road-network cartography. The question is how much
subtraction each one needs, and whether subtraction is free.

Counting layers in the OpenFreeMap styles (2026-08-13, from the fetched JSON):

| Style      | Layers | Symbol (label) | Road/bridge/tunnel | Background colour  |
| ---------- | ------ | -------------- | ------------------ | ------------------ |
| `positron` | 55     | 19             | 20                 | `rgb(242,243,240)` |
| `fiord`    | 48     | 14             | 14                 | `#45516E`          |
| `dark`     | 47     | 15             | 14                 | `rgb(12,12,12)`    |
| `liberty`  | 111    | 25             | 68                 | `#f8f4f0`          |
| `bright`   | 119    | 25             | 59                 | `#f8f4f0`          |

Judgement:

- **Positron is the closest starting point** and the cheapest to strip: flat near-white, already POI-free upstream, 55
  layers of which only ~39 need touching. Delete the 19 symbol layers except city/town labels, thin the 20 road layers
  to a single hairline for context, flatten `landcover`/`landuse` fills to a handful of matte greens and sands, and you
  have the Diorama base. That is a few hours of layer surgery in a forked JSON, not a rebuild.
- **Liberty is the wrong base to strip but the right base to steal from** — 68 road layers is a lot of deleting — yet it
  is the only OpenFreeMap style with a working `fill-extrusion` layer (`building-3d`). Lift that one layer into the
  Positron fork rather than starting from Liberty.
- **Fiord** is interesting for a night/dusk Diorama: 48 layers, only 14 roads, and a flat slate `#45516E` background
  that is already matte and toy-like. Its own README admits it is _"unmodified"_ from an abandoned upstream, so expect
  rough edges.
- **Protomaps flavors are the most elegant restyling model** — a TypeScript object you spread-override, with `white` /
  `grayscale` / `black` already POI-free and designed for data-viz flatness, and the design licensed CC0. If the Diorama
  is going to be heavily art-directed and version-controlled as code, this is nicer than maintaining a forked 25 kB JSON.
- **Stadia Alidade Smooth** is a genuinely muted flat style with _"a muted color scheme and fewer points of interest"_,
  available on all tiers including Free.

**Crucially: for OpenFreeMap and Protomaps, stripping labels/roads/POIs costs nothing and needs no tier**, because the
style is a file in your own repo pointed at a public tile source. MapTiler's 5-custom-style allowance and Stadia's
custom styling are provider-hosted paths to the same result, but they tie your style to that provider's key. Since the
Diorama is the product, having the style as version-controlled source in the repo is worth more than any editor UI.

---

## 6. INFERRED — reasoning and unverified items

Marked separately because none of the following was read off a provider page.

- **No single provider covers all three well.** MapTiler is the only candidate that sells tiles + terrain + geocoding
  under one key, and it is the one combination I would not pick: its Free tier forbids commercial use, caps 3D at 2k
  sessions/month, hard-pauses at the cap, and requires its logo on a 3D map _even on paid plans_. Inferred: a mixed
  keyless stack is both cheaper and less encumbered than one-key convenience.
- **The "one free-tier API key is acceptable" allowance can go unspent.** Inferred from §1.1/§2.1/§3.2: OpenFreeMap +
  AWS Terrarium + Photon needs zero keys, which also removes the awkwardness of a key sitting in a static bundle. Keep
  the allowance in reserve for the first provider that actually needs paying.
- **OpenFreeMap's `maxzoom: 14` is not a street-level problem.** MapLibre overzooms vector tiles, so z14 building
  geometry still renders at z18 — you get no _new_ features past 14, but the Stay Marker at a beach hut is drawn from
  z14 geometry plus `render_height`. Not separately verified in a running map.
- **Terrain fidelity past z12 in Thailand is close to cosmetically irrelevant**, since Koh Mook is a low limestone
  island and the Diorama is matte and exaggerated rather than survey-accurate. This is a judgement, and it is the one
  I would most want checked against a real screenshot before it hardens.
- **Protomaps' non-commercial restriction is the same wall as MapTiler's and Stadia's**, but with a far gentler
  ladder — a GitHub Sponsorship rather than a metered plan, and no automated cutoff. Inferred: if Onward stays a
  single-user MVP, all three are fine; the moment it is commercial, only OpenFreeMap remains free.
- **Not verified, needs an account** (I created none, per the ticket): MapTiler's terrain-rgb-v2 `tiles.json` contents
  and whether its TileJSON declares `encoding` (both endpoints 403 without a key), MapTiler's and Stadia's actual
  per-second rate limits, whether Stadia's custom styling is restricted by plan, and Protomaps' key-issuance and CORS
  configuration flow. None of these change the recommendation below; all of them would need checking if the
  recommendation were ever reversed toward a keyed provider.
- **Neither AWS Terrarium nor Mapterhorn publishes a quota or a terms-of-use page.** Inferred risk: both are
  donation/grant-funded public goods that could add limits or disappear. Mitigation is cheap for both — Mapterhorn
  publishes PMTiles for self-hosting, and the Terrarium tileset is an open S3 bucket you can copy the needed zoom
  levels out of.

---

## Recommendation

**Use three keyless providers, not one keyed one: OpenFreeMap for tiles and style, AWS Terrarium for terrain, Photon for
geocoding.** Spend no API key at all.

This wins on the two things that actually bind Onward. First, **commercial use**: OpenFreeMap explicitly allows it while
MapTiler Free, Stadia Free and the Protomaps hosted API all forbid it, so this is the only stack that does not need
renegotiating the day the project changes status. Second, **the 3D logo**: MapTiler requires its logo on a 3D map on
every tier, and Onward is nothing but a 3D map. Everything else follows — no key in a static bundle, no hard pause
mid-trip-planning, and the style lives in the repo as source.

The terrain choice is the one place I am deliberately overriding what MapLibre's own docs demonstrate. MapLibre's 3D
terrain example uses Mapterhorn, and Mapterhorn is the better-maintained project (2026 vs a frozen 2017 build) with
spectacular Northern European coverage. But it stops at **z12 over Thailand and Malaysia**, which is precisely where
this product's signature zoom-to-the-hut happens. AWS Terrarium is uniform z0–15 worldwide. Take the uniformity.

### Exact URLs

```js
// Style: fork this file into the repo, strip it, and serve it locally.
// Upstream to fork: https://tiles.openfreemap.org/styles/positron
// Lift the `building-3d` fill-extrusion layer from:
//                 https://tiles.openfreemap.org/styles/liberty

// Vector source (inside the forked style)
"openmaptiles": {
  "type": "vector",
  "url": "https://tiles.openfreemap.org/planet"      // TileJSON; maxzoom 14
}

// Glyphs and sprites (same host, no extra vendor)
"glyphs": "https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf",
"sprite": "https://tiles.openfreemap.org/sprites/ofm_f384/ofm"

// Terrain — note BOTH explicit properties; neither is the spec default.
map.addSource('terrain', {
  type: 'raster-dem',
  tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'],
  encoding: 'terrarium',   // default is 'mapbox' — wrong here, and fails silently
  tileSize: 256,           // S3 serves 256 px, not the spec default of 512
  maxzoom: 15,             // default is 22 — without this you get 404s past z15
  attribution: 'Mapzen, USGS, Copernicus/EU, Kartverket, NOAA'
});
map.setTerrain({ source: 'terrain', exaggeration: 1.5 });

// Geocoding — Stop search. Send osm_tag=place; it is what makes "Koh Mook" work.
// https://photon.komoot.io/api/?q=Koh%20Mook&osm_tag=place&limit=5
```

### Attribution that must be on screen

MapLibre's own `AttributionControl` emits the OpenFreeMap string from the TileJSON automatically; the terrain and
geocoder strings must be added by hand. Minimum on-screen text:

> OpenFreeMap © OpenMapTiles Data from OpenStreetMap · Elevation: Mapzen, USGS, Copernicus/EU, Kartverket, NOAA ·
> Search: Photon / OpenStreetMap

with `OpenStreetMap` linking to <https://www.openstreetmap.org/copyright>. Per OSMF guidance the credit _"should not
require individuals to interact with the map"_ to be seen, though it may collapse behind an info button after five
seconds or on first pan/zoom, provided the licence stays reachable
(<https://osmfoundation.org/wiki/Licence/Attribution_Guidelines>) — which is the right accommodation for a
full-bleed 3D map. The `OpenFreeMap` word itself is optional per their own page; keep it, since we are using a donated
service for free.

### What changes if this becomes a paid SaaS

The tiles and terrain survive the transition; the geocoder does not.

- **OpenFreeMap: no change.** _"Is commercial usage allowed? Yes."_ The only new obligation is moral — subscribe to a
  support plan, since a commercial product on donated infrastructure with no SLA should be paying into it. The absence
  of an SLA becomes a real risk at that point, and the mitigation already exists: they publish weekly full-planet
  downloads, so the exit is self-hosting the same tiles, not re-styling for a new vendor.
- **AWS Terrarium: no licence change** (public-domain and open-data sources with attribution), but a frozen 2017
  tileset on raw S3 with no CDN is not a paid product's dependency. Copy z0–15 for Southeast Asia and Northern Europe
  into your own bucket behind a CDN, or switch to Mapterhorn's PMTiles and accept z12 in Thailand.
- **Photon: must be replaced or self-hosted.** _"Please be fair"_ with no availability guarantee cannot underpin paying
  customers. Self-hosting is ~95 GB and 64 GB RAM recommended, which is a real server and therefore a direct
  contradiction of [ADR 0002](../adr/0002-no-backend-localstorage-and-one-edge-function.md) — so the honest paid-SaaS
  move is a commercial geocoder. **Nominatim's public instance is not an option here at all**; its policy warns
  commercial applications explicitly that access may be withdrawn.
- **The unspent free-tier key becomes the budget line.** At that point the comparison is MapTiler Flex ($30/mo, 25k
  sessions, 3k search sessions, 10k 3D sessions — but its logo on your 3D map forever) versus Stadia Starter ($20/mo,
  1M credits, no logo, domain auth) versus Protomaps commercial via GitHub Sponsors. On today's numbers **Stadia
  Starter is the one to re-examine first** — cheapest, no third-party logo, and Pelias geocoding in the same credit
  pool, which would consolidate two of the three choices under one key.

### One thing to decide with a screenshot, not a document

The single judgement in here I would not fully trust on paper is §6's claim that terrain past z12 barely matters in
Thailand. Before this recommendation hardens, put the Positron fork over AWS Terrarium at Koh Mook and look at it. If
the island reads as flat, terrain provider choice stops mattering in Southeast Asia entirely and Mapterhorn's Northern
European fidelity becomes the tiebreaker — which would reverse the terrain half of this recommendation.
