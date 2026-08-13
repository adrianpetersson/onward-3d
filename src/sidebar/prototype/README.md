# Sidebar prototype — throwaway

Three variants of the sidebar, switchable via `?variant=A|B|C`, mounted over the real Diorama.
Built to answer [#10](https://github.com/adrianpetersson/onward/issues/10): _the sidebar is the only
door data enters, so its shape is the data model._

```bash
pnpm dev    # then http://localhost:3000/?variant=A
```

Arrow keys, or the (deliberately garish) bar at the bottom, cycle the variants.

## What is loaded into it

The **real** SEA trip — 13 Dec 2026 → 6 Jan 2027, from `~/Documents/sea-xmas` — including every
awkward case, because a fixture of clean three-night hops would answer the field question wrongly.
See the header comment in [`itinerary-fixture.ts`](./itinerary-fixture.ts).

## What each variant disagrees about

|                 | **A — Rail**            | **B — Ledger**           | **C — Focus**              |
| --------------- | ----------------------- | ------------------------ | -------------------------- |
| Shape           | one ribbon, accordion   | dense table, all visible | thin index + floating card |
| Editing         | inline, in place        | in the cell              | in a card over the map     |
| Fold-out        | overlays the map        | pushes the map           | always there, thin         |
| Camera          | never moves             | never moves              | flies to the selection     |
| Order           | drag a Stop             | up/down buttons          | derived from the dates     |
| Insert mid-trip | `+` in the gap on hover | `+` on the Leg row       | append, then set dates     |
| Save            | one global, dirty count | none — commits on blur   | per card                   |

## Rules this obeys

Throwaway from day one. No tests, no persistence, no error handling, no abstractions worth keeping.
When #10 is settled the winner gets **rewritten** into `src/sidebar/`, this folder is deleted from
`main`, and the whole set is kept on the `prototype/10-sidebar-shape` branch as the primary source.
