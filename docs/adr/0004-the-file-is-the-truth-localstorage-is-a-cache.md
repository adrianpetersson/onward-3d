# The file is the source of truth; localStorage is a cache

The Itinerary lives in a JSON file the traveller picks, on his own disk. `localStorage` holds a copy of
it. **The file is authoritative and the browser copy is a cache** — not the other way round, and not two
peers.

This reverses [ADR 0002](./0002-no-backend-localstorage-and-one-edge-function.md), which had
`localStorage` as the store with manual JSON export as a backup. Export as a feature is gone; the file
takes its place, and there is still no server, no key, no account and nothing to configure.

## Why

ADR 0002 accepted that "a cleared browser loses the trip", on the grounds that export made the traveller
his own backup. Two things undid that. The export feature was cut as out of scope, leaving a single copy
of real, money-committed data — booking references, cancellation deadlines — in a browser profile,
four months before the flight. And the obvious repair, "use a proper database in the browser", turns out
not to be a repair at all.

**No browser storage engine is durable.** This was measured rather than assumed, because the instinct
that SQLite would fix it is a strong one:

- `localStorage`, IndexedDB and OPFS sit in **one evictable origin bucket**. MDN is explicit: "Clearing
  storage data for the site deletes the OPFS."
- WebKit's storage policy covers "File System" alongside localStorage and IndexedDB, and expires
  script-writable storage after **seven days without interaction with the site** — which a trip planned
  over months will hit.
- In Chrome, OPFS is **worse** than what we had: it is quota-managed and evicted whole-origin under disk
  pressure, where `localStorage` is not quota-managed at all.
- `navigator.storage.persist()` blocks only _automatic_ eviction, never the user clearing data. Chrome
  denies it on silent heuristics; WebKit effectively reserves it for home-screen web apps. Treat `false`
  as the normal answer.

So SQLite in the browser would have cost **~466 KB gzip** (an 864,752-byte wasm blob that cannot be
tree-shaken, plus glue — roughly doubling the app's transfer size to store a few KB of trip), a
mandatory Web Worker with an RPC layer we would own (sqlite-wasm's own Worker1 and Promiser1 helpers
were deprecated on 2026-04-15, with use "actively discouraged"), single-tab operation, and — the punchline
— `exportFile()` as the only way to ever get the data out, since OPFS offers no filesystem transparency.
It would have bought **zero durability** and required building export anyway.

Durability requires leaving the device. The cheapest way off it that needs no server is a file the
traveller chose.

## What this means

- **The File System Access API**, with the handle kept in IndexedDB so it survives a session. Chromium
  desktop only: Firefox and Safari implement the handles OPFS needs but not the pickers.
- **The cache is what makes the first render instant.** `localStorage` is synchronous, so React's first
  render already holds the Itinerary. There is no loading state anywhere in the app.
- **One envelope**, written identically to both: `{ kind, schemaVersion, savedAt, openTripId, trips }`,
  with `Trip` verbatim from `model.ts`. There is no separate export format, because the file _is_ the
  store.
- **Save order is load-bearing**: cache synchronously, then commit and redraw, then the file in the
  background. The save has already succeeded by the time anything is on screen, so a failed file write
  raises a warning and never rolls back.
- **The picker and the permission prompt need a user gesture**, and loading a page is not one. So the app
  asks on the first **Save** of a session — a click, and the moment where wanting the file written is the
  whole intent. Nothing may be awaited before those calls.
- **A defaulting read, not a strict one.** A missing field takes its default and an unknown field is
  ignored, so adding a field needs no migration and no version bump. A file from a _newer_
  `schemaVersion` is refused outright rather than read leniently, because reading it would drop fields
  this build has never heard of and then write that loss back over the traveller's own file.

## Consequences

- **A cleared browser now loses nothing.** ADR 0002's accepted consequence is retired: the file survives
  clearing site data, WebKit's seven-day rule and quota eviction, and the app re-links to it.
- **Put the file in Dropbox or iCloud and the trip inherits backups that already exist.** That is the
  durability story, and it costs the project nothing to provide.
- **A permission prompt on the first Save of each session.** The unavoidable cost of the API. A save
  dialog appears once, when the file is first named.
- **Firefox and Safari run on the cache alone**, and say so in one footer line. This is a documented
  limitation, not a scope ruling — the app works, the durable copy does not.
- **Two tabs on one file: last write wins.** The conflict prompt catches the damage on the next load
  rather than preventing it. Recorded as a known limitation.
- **A corrupt cache is ignored silently**, because a cache is derived data — the file is consulted and
  wins. The refusal is not surfaced, and the stored value is left untouched rather than overwritten.
- **The migration chain is not scaffolding.** A Postgres row holding a trip as `jsonb` has the same
  problem of rows written by older builds, and `schemaVersion` plus migrate-on-read is the same answer.
  The async `StoreBackend` seam means a server arrives later as a third implementation rather than as a
  change to every caller.
- **The pull toward a database still signals a fresh effort**, exactly as ADR 0002 says. What this ADR
  removes is the _durability_ argument for one; multi-user remains the real reason, and it is out of
  scope.
