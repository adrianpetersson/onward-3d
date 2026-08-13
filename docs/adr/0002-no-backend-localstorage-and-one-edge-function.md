# No backend: localStorage, plus exactly one edge function

Onward is a static Vite SPA. The Itinerary lives in `localStorage`, and JSON export/import is the only
backup mechanism. There is **one** serverless function in the whole system, and its only job is following
`maps.app.goo.gl` redirects — because a browser cannot, CORS blocks it — so that a Stay can be placed from
a phone share link. That function is not a backend and must not grow into one.

This is deliberate, and it is the reason there is no database, no auth, no accounts and no API. The MVP
has exactly one user, and every hour spent on a server is an hour not spent on the 3D map, which is the
only part of this product that has to be good.

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
