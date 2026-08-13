# No backend: a static bundle and localStorage, with no server-side code at all

Onward is a static Vite SPA. The Itinerary lives in `localStorage`, and JSON export/import is the only
backup mechanism. **There is no server-side code in the system — not a route, not a function.**

This is deliberate, and it is the reason there is no database, no auth, no accounts and no API. The MVP
has exactly one user, and every hour spent on a server is an hour not spent on the 3D map, which is the
only part of this product that has to be good.

> **Note on the filename.** This ADR was originally titled "…plus exactly one edge function" and the
> filename still says so. The function was removed on 13 Aug 2026 — see the amendment at the end. The
> filename is kept because an ADR's identity is its number, and renaming it would break references.

## Consequences

- **A cleared browser loses the trip.** Accepted. Export is manual and the user is the backup. The
  persistence ticket ([#12](https://github.com/adrianpetersson/onward/issues/12)) decides whether a
  schema version and migration path are worth the cost given that.
- **The single concession to the eventual SaaS is the data shape**, not the architecture: the model is
  `trips → stops → legs → bookings` from day one, so multi-trip is later a UI change rather than a
  migration. Nothing else in v1 pays anything toward multi-user.
- If a future session feels the pull to add a database, that is a signal the destination has been
  redrawn — it belongs in a fresh effort, not in this one. See the
  [wayfinder map](https://github.com/adrianpetersson/onward/issues/1)'s out-of-scope list.

## Amendment, 13 Aug 2026 — the one function is gone; the count is now zero

Onward was scoped **desktop-only** on 13 Aug 2026: it is for planning a future trip at a desk, not
consulting one on the go.

That removed the function's entire premise. The function existed to resolve `maps.app.goo.gl` short links,
which is what the **phone** share sheet produces. Planning at a desk means the Google Maps URL is in the
address bar, and research [#5](https://github.com/adrianpetersson/onward/issues/5) established that the
address-bar form carries the place's own coordinate in its `!3d/!4d` fragment — **parseable with a regex,
no network call.** A short link now degrades to click-to-place with a message, which was always the
designed floor of the fallback ladder.

What that buys, beyond simplicity: **the product has no server-side attack surface at all.** #5 flagged
that the resolver would need its host allowlist re-checked on every redirect hop or it would be an open
SSRF proxy. That risk is now structurally absent rather than carefully managed, which is the better place
for a security property to live.

The CORS finding #5 verified still stands and is worth keeping on record — the `maps.app.goo.gl` 302
carries no `Access-Control-*` headers and the preflight adds none, so a browser genuinely cannot follow it.
That is _why_ short links cannot be supported client-side, and therefore why the fallback exists rather
than a workaround.

**If short-link pastes turn out to be a real annoyance in daily use, restoring the function is a fresh
effort, not a resumption** — and it would arrive with the Node-runtime and per-hop-allowlist requirements
#5 documented. Hosting stays purely static in the meantime.
