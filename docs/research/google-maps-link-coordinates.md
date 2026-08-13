# Turning a pasted Google Maps link into coordinates

**Research date: 2026-08-13.** Resolves [issue #5](https://github.com/adrianpetersson/onward/issues/5).
This is a parsing specification, not an implementation.

Every claim below is tagged:

- **[VERIFIED]** — I observed it this session, from the real network or by running code. The observation is
  quoted or reproduced.
- **[INFERRED]** — reasoned from a cited document or from a verified observation, but not directly observed.
  Treat as a hypothesis the implementation ticket should confirm.

Everything under a **[VERIFIED]** tag was captured on 2026-08-13 from a Swedish residential IP with no Google
account signed in. Google Maps varies its output by locale and by client, so treat the _shapes_ as durable and
the exact query parameters (`entry=`, `g_ep=`, `coh=`) as noise.

---

## 1. The finding that decides the feature

**A Google Maps URL usually carries two different coordinates, and only one of them is the place.**

- `/@lat,lng,zoom` is the **map camera** — where the viewport was pointing when the URL was made.
- `!3d<lat>!4d<lng>` inside `data=` is the **place's own coordinate** — the pin.

They are frequently equal, which is exactly what makes this dangerous: a parser that reads `/@` will look
correct in testing and then drop a Stay Marker in the wrong bay the first time someone shares a link they
made while panned somewhere else.

### [VERIFIED] The divergence, demonstrated

I took the live Google Maps URL for Ao-nieng Beach Resort on Koh Kradan and edited **only** the `/@` segment,
moving the camera to Bangkok (13.7563309, 100.5017651 — 731 km away) while leaving `!3d7.3031889!4d99.2552559`
untouched. I then loaded that URL in a real browser and read back the document:

```
navigated: https://www.google.com/maps/place/Ao-nieng+Beach+Resort/@13.7563309,100.5017651,12z/
           data=!4m9!3m8!1s0x304dde5e177a038d:0xfe6124a305b22b80!5m2!4m1!1i2
           !8m2!3d7.3031889!4d99.2552559!16s%2Fg%2F11clwnp8vp

document.title -> "Ao-nieng Beach Resort - Google Maps"
document.querySelector('h1').textContent -> "Ao-nieng Beach Resort"
```

Google Maps still resolved the page to the Koh Kradan resort. **The camera does not identify the place.**
`/@` is presentation; `!3d/!4d` and `!1s<ftid>` are identity.

### [VERIFIED] `!3d/!4d` really is the place's own coordinate

Cross-checked against Google's own place entity, obtained independently of the URL. Requesting
`https://www.google.com/maps?q=Ao+Niang+Beach+Resort+Koh+Kradan&output=embed` returns a bootstrap payload
containing the entity record:

```
["0x304dde5e177a038d:0xfe6124a305b22b80",
 "8734+74C Ao-nieng Beach Resort, Andaman Sea, Ko Libong, Amphoe Kantang, Chang Wat Trang 92110, Thailand",
 [7.303188899999999,99.25525589999999],"18329972240968461184"],
"Ao-nieng Beach Resort", ... "ChIJjQN6F17eTTARgCuyBaMkYf4"
```

The entity's coordinate `[7.3031889, 99.2552559]` is bit-for-bit the `!3d7.3031889!4d99.2552559` in the
share URL. Same for Koh Mook Charlie Beach Resort, queried the same way:
`["0x304deb6c2ba981a1:0x440b5262db8c89f7","Koh Mook Charlie Beach Resort & Hotel, 164 Moo 2, Koh Mook,
Kantang, 92000, Thailand",[7.3601147,99.29487259999999]`.

> **Do not ship a dependency on `output=embed`.** It is an undocumented internal endpoint and the response
> embeds Google's own API key. I used it as a _research oracle_ to establish ground truth about what `!3d/!4d`
> means. Onward must not call it in production — see [§9 Legal / ToS](#9-legal--tos).

---

## 2. URL pattern table

`LAT` = `-?\d{1,2}(?:\.\d+)?` and `LNG` = `-?\d{1,3}(?:\.\d+)?` throughout. Match against the
**percent-decoded** URL; Google encodes `,` as `%2C` in some share paths.

| #       | Shape                                         | Regex                                                                            | Carries                            | Prec.  | Status                                                                                                     |
| ------- | --------------------------------------------- | -------------------------------------------------------------------------------- | ---------------------------------- | ------ | ---------------------------------------------------------------------------------------------------------- |
| **P1a** | `data=…!8m2!3d<lat>!4d<lng>`                  | `!8m2!3d(LAT)!4d(LNG)`                                                           | **place**                          | 1      | [VERIFIED]                                                                                                 |
| **P1b** | bare `!3d<lat>!4d<lng>`                       | `!3d(LAT)!4d(LNG)`                                                               | **place** (lower confidence)       | 2      | [VERIFIED]                                                                                                 |
| **P2**  | `/maps/search/?api=1&query=<lat>,<lng>`       | `[?&]query=(LAT),\+?(LNG)(?:&\|$)`                                               | **place**                          | 3      | [VERIFIED] regex; form is [documented](https://developers.google.com/maps/documentation/urls/get-started)  |
| **P3**  | `?q=<lat>,<lng>` (also `q=loc:`)              | `[?&]q=(?:loc:)?(LAT),\+?(LNG)(?:&\|$)`                                          | **place**                          | 4      | [VERIFIED] regex                                                                                           |
| **P4**  | `/maps/search/<lat>,+<lng>`                   | `/maps/search/(LAT),\s*\+?(LNG)`                                                 | **place**                          | 5      | [VERIFIED] — real short-link output                                                                        |
| **P5**  | `?ll=` / `?sll=` / `&center=` / `&viewpoint=` | `[?&](?:ll\|sll\|center\|viewpoint)=(LAT),\+?(LNG)`                              | **camera** (`viewpoint` = pano)    | 6      | [VERIFIED] regex; `center` [documented](https://developers.google.com/maps/documentation/urls/get-started) |
| **P6**  | `/@<lat>,<lng>,<zoom>z`                       | `/@(LAT),(LNG),([\d.]+)([zmayht])`                                               | **camera**                         | 7      | [VERIFIED]                                                                                                 |
| **P7**  | `/maps/dir/…`                                 | —                                                                                | route endpoints, not one place     | reject | [INFERRED]                                                                                                 |
| **N1**  | `/maps/place/<name>/…`                        | `/maps/place/([^/@?]+)`                                                          | **name only**                      | —      | [VERIFIED]                                                                                                 |
| **I1**  | `&ftid=0x…:0x…` or `data=!1s0x…:0x…`          | `(?:[?&]ftid=\|!1s)(0x[0-9a-f]{1,16}:0x[0-9a-f]{1,16})`                          | **identity, no coordinate**        | —      | [VERIFIED]                                                                                                 |
| **I2**  | `place_id:` / `&query_place_id=`              | `(?:place_id[:=]\|[?&]query_place_id=)((?:ChIJ\|Ei\|Gh\|El)[A-Za-z0-9_\-]{10,})` | **identity, no coordinate**        | —      | [VERIFIED]                                                                                                 |
| **I3**  | Plus code, e.g. `8G9M+MRR`                    | `\b([23456789CFGHJMPQRVWX]{4,8}\+[23456789CFGHJMPQRVWX]{2,3})\b`                 | coordinate **only if full-length** | —      | [VERIFIED] detection                                                                                       |

### Notes on the tricky rows

**P1a vs P1b.** In the live Ao-nieng URL the place pair is anchored as `!8m2!3d…!4d…` — `!8m2` is the
two-field wrapper that introduces it. [VERIFIED] both regexes return `(7.3031889, 99.2552559)` on that URL,
and there is exactly **one** bare `!3d/!4d` pair in it. P1b exists because [INFERRED] not every share URL
carries the `!8m2` wrapper, and `!3d`/`!4d` also appear in Street View payloads with unrelated meanings
(heading/pitch), so a bare match is weaker. Prefer P1a; fall back to P1b; never prefer either over an
explicit conflict.

**P7 — reject `/dir/` links.** [INFERRED] A directions URL has a camera framing the whole route and a
`data=` payload that can contain a `!3d/!4d` pair **per waypoint**. Taking the first pair silently yields the
_origin_. This is also the right product call: a Stay is one place, not a route. Reject with a specific
message (§8) rather than guessing.

**I3 — plus codes are mostly a trap.** [VERIFIED] Google's own place records carry _short_ plus codes:
`8734+74C` (Ao-nieng) and `8G9M+MRR` (the Doha link in §3). A short code is only meaningful relative to a
locality string, so it is **not** offline-decodable. A _full_ 10/11-character code (e.g. `7PH57MJM+2X`) is
decodable offline with [open-location-code](https://github.com/google/open-location-code), no network and no
API key. Support full codes; treat short codes as a name hint only.

---

## 3. Short links: what they actually resolve to

Tested against two **real** published `maps.app.goo.gl` links, 2026-08-13.

### [VERIFIED] Hop count: one

```
$ curl -sSI https://maps.app.goo.gl/VSTHi61EE8aMp8Dk9
HTTP/2 302
location: https://www.google.com/maps/search/8.023077,+98.291887?coh=219680&utm_campaign=tt-rcs&entry=tts&g_ep=…

$ curl -sS -L -o /dev/null -w "num_redirects=%{num_redirects}\n" https://maps.app.goo.gl/VSTHi61EE8aMp8Dk9
num_redirects=1
```

**One hop.** The `Location` of the first response is the whole answer. Following further only downloads a
~200 KB JavaScript shell.

### [VERIFIED] Two different destination shapes — and one has no coordinates

| Short link                                  | Resolves to                                                                                               | Coordinate?                 |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------- | --------------------------- |
| `maps.app.goo.gl/VSTHi61EE8aMp8Dk9`         | `www.google.com/maps/search/8.023077,+98.291887?…`                                                        | **yes** — P4                |
| `maps.app.goo.gl/yNWrPg1SFLomwCKX9?g_st=iw` | `maps.google.com?q=8G9M+MRR+Hotel+Park,+1+Al+Corniche,+Doha&ftid=0x3e45c4c1f05884fd:0x3b522196a47804ad&…` | **no** — name + `ftid` only |

The second case is the one that breaks naive implementations. It is a valid, live share link that resolves to
a URL containing **no latitude or longitude at all**. Following it further does not help — [VERIFIED] two more
hops (`maps.google.com` → `maps.google.com/maps` → `www.google.com/maps`) preserve the `ftid` and never add
coordinates. An `ftid`-only link is a hard dead end for URL parsing; it goes to the fallback ladder (§8).

Note the destination host varies (`www.google.com` vs `maps.google.com`), and the path form varies
(`/maps/search/<coords>` vs `/maps?q=<text>`). The resolver must not assume either.

### [VERIFIED] The User-Agent changes the response — this is a real footgun

Same URL, five different `User-Agent` values:

| User-Agent                 | Response                               |
| -------------------------- | -------------------------------------- |
| `curl/8.7.1`               | **302** + `Location`                   |
| `Onward-resolver/1.0`      | **302** + `Location`                   |
| `Mozilla/5.0 (compatible)` | **302** + `Location`                   |
| iPhone Safari 17           | **302** + `Location`                   |
| Desktop Chrome 127         | **200**, 34 791-byte HTML interstitial |

The desktop-Chrome interstitial is an app-link handoff page. [VERIFIED] it contains **no** coordinates and
**no** `google.com/maps` URL — I grepped it for both and got zero hits. A resolver that copies a browser UA to
"look normal" gets a page with the answer stripped out.

**Rule: send a plain, honest, non-desktop-browser User-Agent.** Something like `Onward/1.0 (+https://…)` both
works and is the courteous thing to do. Google also returns
`vary: Sec-Fetch-Dest, Sec-Fetch-Mode, Sec-Fetch-Site`, so [INFERRED] Sec-Fetch headers participate in this
decision too; don't send them.

### [VERIFIED] `goo.gl/maps/…` — treat as dead, verify per link

Google [announced](https://developers.googleblog.com/en/google-url-shortener-links-will-no-longer-be-available/)
that goo.gl links stop working; the shutdown landed 2025-08-25. Reporting was inconsistent about whether
Maps-generated links were carved out. I could not obtain a real `goo.gl/maps/…` link to test, so I have **no
direct evidence either way** — an invented code returns `HTTP/2 404`, which proves nothing. Handle the host
with the same one-hop logic and let a 404 fall through to the ladder.

### [VERIFIED] Durability caveat on `maps.app.goo.gl`

The host runs on Firebase Dynamic Links infrastructure — requesting `/robots.txt` returns an
`Invalid Dynamic Link` FDL error page. Firebase
[states](https://firebase.google.com/support/dynamic-links-faq) that on 2025-08-25 "All links served by
Firebase Dynamic Links … will stop working", with no documented exemption for Google's own domains.

**Yet both real links resolved correctly on 2026-08-13**, ~12 months after that date. So Maps' share domain is
evidently retained on separate infrastructure. The honest reading: **it works today, and its documented
lifecycle does not explain why.** That is a reason for the fallback ladder to be genuinely good, not a reason
to skip the feature.

---

## 4. The browser CORS block

### [VERIFIED] From the actual response headers

```
$ curl -sS -D - -o /dev/null -H "Origin: https://onward.example" https://maps.app.goo.gl/VSTHi61EE8aMp8Dk9
HTTP/2 302
vary: Sec-Fetch-Dest, Sec-Fetch-Mode, Sec-Fetch-Site
location: https://www.google.com/maps/search/8.023077,+98.291887?…

$ curl -sSI https://maps.app.goo.gl/VSTHi61EE8aMp8Dk9 | grep -ci access-control
0

$ curl -sS -X OPTIONS -D - -o /dev/null \
    -H "Origin: https://onward.example" -H "Access-Control-Request-Method: GET" \
    https://maps.app.goo.gl/VSTHi61EE8aMp8Dk9
HTTP/2 200
allow: HEAD, GET
```

**Zero `Access-Control-*` headers on the redirect, and none on the preflight either.** Sending an `Origin`
header does not induce them.

### [INFERRED, from those headers] What a browser `fetch` therefore does

Per the [Fetch standard's CORS check](https://fetch.spec.whatwg.org/#cors-check), a response with no
`Access-Control-Allow-Origin` fails, and the redirect is not followed:

- `fetch(url)` (default `cors` mode) → rejects with a `TypeError`. JS sees nothing; not the status, not `Location`.
- `fetch(url, {mode:'no-cors'})` → an [opaque filtered response](https://fetch.spec.whatwg.org/#concept-filtered-response-opaque):
  `status` forced to `0`, header list empty. `Location` is unreadable _by construction_, not by policy.
- `fetch(url, {redirect:'manual'})` → an
  [opaque-redirect filtered response](https://fetch.spec.whatwg.org/#concept-filtered-response-opaque-redirect),
  also `status` `0` with an empty header list.

There is no browser-side trick. Not a header, not a mode, not a proxy-shaped `<img>` or `<iframe>` — a
cross-origin navigation's `Location` is simply not exposed to script. **The one permitted serverless function
in [ADR 0002](../adr/0002-no-backend-localstorage-and-one-edge-function.md) is genuinely necessary, and
following this redirect is the entirety of its job.**

I did not execute the browser `fetch` itself: the session's browser pane was policy-blocked from loading
external origins partway through. The header evidence above is direct, and the spec citations are exact, but
the three bullets are labelled [INFERRED] rather than [VERIFIED] deliberately.

### [VERIFIED] The same call from outside a browser — the mechanism works

Node 25.6.0 (undici — the same `fetch` implementation family as Vercel's Node.js function runtime):

```js
await fetch("https://maps.app.goo.gl/VSTHi61EE8aMp8Dk9", {
  redirect: "manual",
  headers: { "user-agent": "Onward-resolver/1.0" },
});
```

```
redirect:'manual' -> status=302  type=basic  location=https://www.google.com/maps/search/8.023077,+98.291887?…
                    r.url=https://maps.app.goo.gl/VSTHi61EE8aMp8Dk9  redirected=false
redirect:'follow' -> status=200  type=cors   location=null
                    r.url=https://www.google.com/maps/search/8.023077,+98.291887?…  redirected=true
```

This is the precise contrast that justifies the function. Identical code, identical URL: in a browser the
header list is empty; outside one, `redirect:'manual'` hands back a readable `302` and a readable `Location`.
`redirect:'follow'` also works via `r.url`, but downloads the full Maps page — **use `manual`.**

### [VERIFIED] Scraping the Maps page is not an alternative path

`www.google.com/maps/place/?q=place_id:…` returns a 217 KB JS shell whose `<title>` is the literal
`  Google Maps  ` and whose `APP_INITIALIZATION_STATE` begins at a default global camera
(`[[[2.608160252827102…`) — for a known-good place_id. Place resolution happens client-side. There is nothing
to scrape, which is convenient: the redirect hop is both the only workable route and the lightest-touch one.

---

## 5. Can a Vercel or Netlify edge function do this?

**Yes, both.** The work is one outbound `fetch` with `redirect: 'manual'` and one header read.

**Vercel — Edge runtime.** The
[runtime reference](https://vercel.com/docs/functions/runtimes/edge) lists `fetch`, `Request`, `Response` and
`Headers` under _Network APIs_: "The Edge runtime provides a subset of Web APIs such as `fetch`, `Request`,
and `Response`." Budget is ample — a response must begin within 25 s.

⚠️ **[VERIFIED] Vercel is steering off the Edge runtime.** That same page (last updated 2026-08-03) says: "We
recommend migrating from edge to Node.js for improved performance and reliability", and "Starting in Next.js
16.3, setting `runtime = 'edge'` is no longer supported." **Use Vercel's Node.js function runtime**, not Edge.
It is still exactly one serverless function, so ADR 0002 is satisfied either way — and it is the runtime whose
`fetch` I verified above.

**Netlify — Edge Functions.** [Docs](https://docs.netlify.com/build/edge-functions/api/) list the Fetch API
(`fetch`, `Request`, `Response`, `URL`) as supported and show fetching external sites directly: "To fetch
content hosted on another Netlify site or an external site, use the `fetch` Web API." The runtime is Deno,
which implements standard `fetch` including the `redirect` option. No documented restriction on outbound hosts.

Either is fine. Neither needs a Google Cloud project, an API key, or a billing account.

---

## 6. The resolver's contract

One function. It expands short links. **It does not parse, geocode, or know what a Stay is** — parsing is pure
client-side code (§2) that runs on the expanded URL. Keeping the split here is what stops the function growing
into a backend.

```
POST /api/resolve-maps-link
Content-Type: application/json
```

### Input

```ts
{
  url: string;
} // absolute http(s) URL, ≤ 2048 chars
```

**Accept only these hosts**, exact match, after parsing with `new URL()`:
`maps.app.goo.gl`, `goo.gl`, `maps.google.com`, `www.google.com`, `google.<cctld>`.
Reject everything else with `unsupported_host`. This allowlist is the whole security model: without it the
function is an open redirect-follower — an SSRF proxy that anyone can point at any host.

### Output — 200

```ts
{
  resolved: true,
  url: string,          // the fully expanded Google Maps URL
  hops: number,         // redirects followed (0 if input needed no expansion)
  finalHost: string
}
```

The client parses `url` with the §2 table. The function returns no coordinates: it has no opinion about them,
and that is deliberate.

### Output — errors

All errors are `200` with `resolved: false` plus an HTTP-level status only for malformed calls. The client
always gets a structured reason so the ladder in §8 can pick the right rung.

| `reason`           | When                                                                    | HTTP |
| ------------------ | ----------------------------------------------------------------------- | ---- |
| `bad_request`      | missing/oversized/unparseable `url`                                     | 400  |
| `unsupported_host` | host not on the allowlist                                               | 200  |
| `not_a_redirect`   | 2xx returned; nothing to expand (also the desktop-UA interstitial case) | 200  |
| `link_dead`        | 404/410 — expired or revoked share link                                 | 200  |
| `too_many_hops`    | hop cap exceeded (cap: 3; observed real max: 1)                         | 200  |
| `upstream_error`   | 5xx or Google-side rate limiting                                        | 200  |
| `timeout`          | no response within 5 s                                                  | 200  |
| `network_error`    | DNS/TLS/socket failure                                                  | 200  |

### Behaviour

- `fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(5000) })`.
- Follow `Location` manually, **max 3 hops**, re-validating the host allowlist **on every hop** — a redirect
  can leave the allowlist, and that is the SSRF hole.
- `User-Agent: Onward/1.0 (+<deploy url>)`. Never a desktop-browser UA (§3).
- Send no cookies, no `Origin`, no `Sec-Fetch-*`. Forward no client headers, no IP.
- Never read the response body. Headers only. Nothing to parse, nothing to store, nothing to log.
- Idempotent, side-effect-free, stateless. No storage, no secrets, no environment beyond its own URL.
- `Cache-Control: public, max-age=86400` on success — share links are immutable, so this collapses repeat
  pastes and keeps request volume near-zero.
- CORS: `Access-Control-Allow-Origin` restricted to Onward's own deploy origins.

---

## 7. Recovering the place name

The sidebar's Stay form has a name field, and [VERIFIED] the URL often carries a usable one. In precedence
order:

1. **`/maps/place/<name>/`** — [VERIFIED] the live Ao-nieng URL yields `Ao-nieng Beach Resort` after
   `decodeURIComponent` and `+` → space. Best source: it is the place's actual Google name.
2. **`?q=<text>`** when the text is not coordinates — [VERIFIED] the Doha link gives
   `8G9M+MRR Hotel Park, 1 Al Corniche, Doha`. This is an _address-ish_ blob, not a clean name. Strip a
   leading plus code, take the segment before the first comma → `Hotel Park`. Offer it, don't trust it.
3. **`&query=<text>`** — same treatment as `?q=`.

Always land the extracted name in the field as an **editable prefill**, never as a committed value. Google's
name is sometimes a transliteration ("Ao-nieng" for a resort marketed as "Ao Niang"), sometimes a plus code
with an address stapled to it. The traveller knows what they booked.

### [VERIFIED] Bonus: `ftid` ↔ `place_id` is a pure local conversion

Both identifiers in the table (I1, I2) are the same 16 bytes in different clothes. The `place_id` is
`"ChIJ"` + base64url(`LE64(a)` ‖ `0x11` ‖ `LE64(b)`) for an `ftid` of `0x<a>:0x<b>`. `ChIJ` itself decodes to
the protobuf bytes `0a 12 09` — field 1, length 18, inner fixed64 — and `0x11` is the second fixed64's tag.

I verified this **both directions against two independent ground-truth pairs** obtained from Google's own
entity records:

```
ftid->place_id  ChIJ_YRY8MHERT4RrQR4pJYhUjs  == ChIJ_YRY8MHERT4RrQR4pJYhUjs  -> True
place_id->ftid  0x3e45c4c1f05884fd:0x3b522196a47804ad == 0x3e45c4c1f05884fd:0x3b522196a47804ad -> True
ftid->place_id  ChIJjQN6F17eTTARgCuyBaMkYf4  == ChIJjQN6F17eTTARgCuyBaMkYf4  -> True
place_id->ftid  0x304dde5e177a038d:0xfe6124a305b22b80 == 0x304dde5e177a038d:0xfe6124a305b22b80 -> True
```

**This does not get you coordinates** — that would need the Places API, which needs billing, which is out of
scope. Its value is that storing the identifier alongside a Stay lets Onward reconstruct a canonical
`https://www.google.com/maps/place/?q=place_id:<id>` link later ("open in Google Maps") from either form.
Worth ~20 lines. Not on the critical path.

---

## 8. The fallback ladder

The rungs are ordered by how much they ask of the traveller. Never skip a rung to reach a worse one, and never
plant a Stay Marker on a coordinate the user has not seen confirmed.

**Rung 0 — parsed cleanly (P1a/P1b/P2/P3/P4).**
Place the Stay Marker. Show the resolved name and coordinate with an **Undo**. No modal, no ceremony.

> `Ao-nieng Beach Resort — 7.30319, 99.25526` · _Undo_

**Rung 1 — only a camera coordinate (P5/P6, no place pattern matched).**
Do **not** treat it as the place. Drop a draft marker at the camera position and make the user confirm or drag
it. This is the rung that protects the hut-on-a-beach case.

> This link points at a map view, not a specific place. I've put a marker at the centre — drag it onto your
> Stay, or paste a link from the place's own Google Maps page.

**Rung 2 — identity but no coordinate (`ftid`/`place_id` only, or a short plus code).**
[VERIFIED] this is a real, common case, not a theoretical one. Onward cannot resolve it without a paid API, so
say so plainly and offer the cheapest repair.

> I can see _which_ place this is, but the link doesn't include its position. Open it in Google Maps, then
> share again from the place's page — or drop the marker yourself.

Include a working "Open in Google Maps" link built from the identifier (§7) so the repair is one tap. Offer the
extracted name as a prefill regardless.

**Rung 3 — a directions link (P7).**

> That's a directions link with a start and an end. Which one is your Stay? Paste a link to the place itself,
> or place the marker by hand.

**Rung 4 — short link could not be expanded** (`link_dead`, `timeout`, `upstream_error`, `network_error`).
Distinguish _dead_ from _unreachable_, because the remedies differ.

> **dead:** This share link has expired. Open the place in Google Maps and share a fresh link.
> **unreachable:** I couldn't reach Google just now. Try again, or place the marker by hand — _Retry_.

**Rung 5 — nothing recognised.**

> That doesn't look like a Google Maps link. You can paste coordinates directly (`7.3032, 99.2553`), or drop
> the marker on the map.

**Rung 6 — the floor: manual placement, always available.**
Click the map to place the Stay, drag to adjust. This must never be gated behind a failed paste. It is also the
answer for every case above, which is why none of the copy above is an apology or a dead end.

Two rules that hold across every rung:

- **Accept bare coordinates in the same input.** `7.3032, 99.2553` is P3 without the URL. It costs one regex
  and rescues Rungs 2–5 instantly, offline, with no function call.
- **The app never scolds and never silently guesses.** A wrong marker the user didn't confirm is worse than
  asking.

---

## 9. Recommendation

1. **Parse `!8m2!3d/!4d` first and `/@` last, and label them differently in the code.** Name the variables
   `placeLatLng` and `cameraLatLng`. The whole feature's correctness is this one distinction, and the two
   coordinates are equal often enough to hide the bug (they were identical in the live Ao-nieng URL, and 731 km
   apart when I moved the camera).
2. **Never promote a camera coordinate to a place coordinate.** Rung 1 exists precisely so this never happens.
3. **Ship the function on Vercel's Node.js runtime**, not the Edge runtime — Vercel's own docs now recommend
   against Edge and Next.js 16.3 has dropped `runtime = 'edge'`. Netlify Edge Functions are an equally valid
   choice. Still exactly one function; ADR 0002 holds.
4. **The function expands links and nothing else.** Host allowlist re-checked per hop, `redirect: 'manual'`,
   max 3 hops, 5 s timeout, headers only, no body read, no logging, 24 h cache. The allowlist is not
   optional — without it this is an SSRF proxy.
5. **Do not send a desktop-browser User-Agent.** [VERIFIED] it swaps the 302 for a 34 KB interstitial with the
   answer removed. A plain `Onward/1.0` UA is both what works and what's polite.
6. **Never call `output=embed` or scrape Maps pages in production.** [VERIFIED] the Maps HTML is a JS shell
   with no coordinates, so there is no temptation — and the embed endpoint carries Google's API key, which
   moves it from "following a redirect" into territory §9 would not defend.
7. **Build Rung 6 (manual placement) first, before any parsing.** It is the floor under every other rung, it
   needs no network, and it makes the parser an accelerator rather than a dependency. It is also the only rung
   that can never fail.
8. **Accept bare `lat, lng` in the same paste box.** Cheapest possible rescue for the `ftid`-only case, which
   is real and unresolvable otherwise.
9. **Add a regression test with the divergent URL from §1** (camera in Bangkok, place on Koh Kradan). It fails
   loudly against any implementation that reads `/@`, and it is the exact bug this research exists to prevent.

---

## 10. Legal / ToS

**Verdict: permitted for Onward's use, with one genuine ambiguity that is worth stating rather than
smoothing over.**

### What the terms actually say

Google's [Terms of Service](https://policies.google.com/terms) tie the automated-access prohibition to
machine-readable signals. Verbatim, under _Don't abuse our services_, it forbids:

> "using automated means to access content from any of our services in violation of the machine-readable
> instructions on our web pages (for example, robots.txt files that disallow crawling, training, or other
> activities)"

So the operative question is what the robots files say.

**[VERIFIED] `maps.app.goo.gl` publishes no robots.txt.** `GET /robots.txt` returns `HTTP 400` with an FDL
`Invalid Dynamic Link` page — zero robots directives. Under
[RFC 9309 §2.3.1.3](https://www.rfc-editor.org/rfc/rfc9309.html#section-2.3.1.3): "If a server status code
indicates that the robots.txt file is unavailable to the crawler, then the crawler MAY access any resources on
the server." There is no instruction to violate.

**[VERIFIED] `www.google.com/robots.txt` explicitly _allows_ the destination paths**, for `User-agent: *`:

```
Allow: /maps/place/
Allow: /maps/search/
Allow: /maps/@
Allow: /maps/?q=
Allow: /maps?q=
Allow: /maps/dir/
```

Every shape the resolver could touch is on the allow list. (`Disallow: /maps/` is also present, but these
narrower `Allow:` rules win: [RFC 9309 §2.2.2](https://www.rfc-editor.org/rfc/rfc9309.html#section-2.2.2) —
"The most specific match found MUST be used. The most specific match is the match that has the most octets.")
And the resolver need not fetch
`www.google.com` at all — it reads one `Location` header from `maps.app.goo.gl` and stops.

### The restrictions that don't apply, and the one that might

The [Google Maps/Google Earth Additional Terms](https://www.google.com/help/terms_maps/) restrict:

- _"copy the content"_ — **not engaged.** A `Location` header is a URL, not map content. No tiles, no imagery,
  no listing data, no reviews. The resolver never reads a response body.
- _"mass download or create bulk feeds of the content (or let anyone else do so)"_ — **not engaged.** One
  request per link the user personally pasted, response cached 24 h, one user in the MVP. This is the
  antithesis of bulk.
- _"redistribute or sell any part of Google Maps"_ — **not engaged.** Nothing is redistributed or sold.
- _"use Google Maps to create or augment any other mapping-related dataset … for use in a service that is a
  substitute for, or a substantially similar service to, Google Maps"_ — **ambiguous, and I won't pretend
  otherwise.**

That last clause is the honest sticking point. Onward _does_ store coordinates that originated in Google Maps
into its own itinerary data and render them on a non-Google map (MapLibre). Two readings:

- **Against engagement (the stronger reading):** the restriction is conditioned on the dataset being _for use
  in a substitute for, or substantially similar service to, Google Maps_. A personal itinerary planner is not
  a search-and-navigation product; it competes with a notes app, not with Google Maps. And the coordinate the
  user pasted is a coordinate _about their own booking_.
- **For engagement:** read expansively, "augment any other mapping-related dataset" describes storing
  place coordinates in a map product, whatever it competes with.

I judge the first reading correct for a single-user MVP, and I note that clause 2 explicitly grants users a
licence to _"view and annotate maps"_, which is close to what Onward does. But this is a judgement about
ambiguous drafting, not a clean permission, and it is not legal advice. **The risk grows if Onward becomes
multi-user, accumulates a shared corpus of places, or exposes them to anyone but the person who pasted the
link.** If the eventual SaaS in ADR 0002 ever arrives, re-read this clause first — that is the trigger, not
the traffic volume.

### Rate limits

**[VERIFIED] no documented rate limit and no observed throttling.** I issued ~20 requests to
`maps.app.goo.gl` across this session with no `429`, no interstitial, and no degradation; both links still
resolved on the final check. There is no published quota because there is no API here — just a redirect. With
a 24 h cache and one user, volume is effectively nil. Don't retry on a loop, honour `429` if it ever appears,
and keep the honest User-Agent so Google can identify the traffic.

### Two lines that are not defensible, for the record

- Calling `output=embed` from production. It is undocumented and its payload carries Google's own API key.
  I used it as a research oracle; the product must not. See §1.
- Scraping Maps page HTML. [VERIFIED] pointless anyway (§4), and unambiguously "copying the content".

Neither is needed. The feature works on one redirect hop and one regex.

---

## Appendix — real URLs tested, and what the patterns actually returned

Harness output, 2026-08-13. R1–R4 and R11 are **real** URLs captured live this session; R5–R10 are
documented or constructed forms for the route (Koh Kradan / Koh Mook).

```
--- R1 live place URL, Ao-nieng Beach Resort, Koh Kradan (camera == place)
    place  = (7.3031889, 99.2552559)   via=!8m2!3d/!4d
    camera = (7.3031889, 99.2552559)
    name='Ao-nieng Beach Resort'  ftid=0x304dde5e177a038d:0xfe6124a305b22b80

--- R2 same place, camera forced to Bangkok (DIVERGENCE)
    place  = (7.3031889, 99.2552559)   via=!8m2!3d/!4d
    camera = (13.7563309, 100.5017651)
    *** CAMERA/PLACE DIVERGENCE: 731.4 km apart ***
    name='Ao-nieng Beach Resort'  ftid=0x304dde5e177a038d:0xfe6124a305b22b80

--- R3 REAL short-link destination #1 (dropped pin)
    place  = (8.023077, 98.291887)     via=/maps/search/<lat>,+<lng>

--- R4 REAL short-link destination #2 (ftid only, NO coords)  <-- the hard case
    place  = None
    camera = None
    ftid=0x3e45c4c1f05884fd:0x3b522196a47804ad   pluscode=8G9M+MRR (short, not decodable)

--- R5 bare camera only                camera=(7.3031889, 99.2552559)  place=None
--- R6 api=1 &query=                   place =(7.3601147, 99.2948726)
--- R7 api=1 map_action &center=       camera=(7.36, 99.29)             place=None
--- R8 legacy ?ll=                     camera=(7.3601147, 99.2948726)  place=None
--- R9 /maps/dir/ link                 camera=(7.35, 99.28)  endpoint=(7.3601147, 99.2948726) -> REJECT
--- R10 api=1 &query_place_id=         place =None   place_id=ChIJjQN6F17eTTARgCuyBaMkYf4
--- R11 short link, unexpanded         nothing -> must go through the resolver first
```

Two results worth dwelling on. **R2** is the whole reason this document exists: identical place data, camera
731 km away, and any parser reading `/@` puts the beach hut in Bangkok. **R4** is a live published share link
that yields no coordinate at all — the fallback ladder is load-bearing, not decoration.

Ground-truth coordinates for the route, from Google's own place entities:
Ao-nieng Beach Resort, Koh Kradan `7.3031889, 99.2552559`; Koh Mook Charlie Beach Resort
`7.3601147, 99.2948726`.
