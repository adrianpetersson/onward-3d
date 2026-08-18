# Entry flow — nine Stops top to bottom ([#27](https://github.com/adrianpetersson/onward/issues/27))

Evidence from working #27: the sidebar now lets a trip be laid out the way one is actually planned —
name where you are going first, work out how you get there second.

- **`ribbon-entry-state.png`** — the ribbon mid-entry, the ticket's whole argument in one frame. Every
  named Stop shows its Leg row ("boat · 20m"); the just-added _Untitled stop_ card is open with its
  Name field ready to type into; and above it stands a bare dashed connector where the old layout put
  a "no mode yet — to this stop" row. The `＋ Add a stop` button that made it is permanent furniture at
  the ribbon's end.
- **`modeless-chain-region.png`** — the answer to "how does a Mode-less chain read while the trip is
  being built": the real trip's eight Stops entered by search alone and saved with no Mode anywhere.
  At region zoom the chain reads as one continuous muted line — unfinished, not broken.
- **`modeless-chain-globe.png`** — the same trip zoomed out: the long-haul out of Copenhagen arcs over
  as a single drained line.
- **`parked-pointer-kosovo.png`** — the bug the flow surfaced, kept because the picture argues better
  than the prose: a Stop named _Koh Lipe_ standing in Kosovo. Clicking `＋ Add a stop` parks the cursor
  over the ribbon; the result list renders under the stationary pointer; Chromium recomputes hover on
  layout change and fires `mouseenter` with no movement; the row under the mouse steals the highlight
  from the top-ranked result; Enter places it. Three of eight Stops landed on the wrong continent in
  one pass. Fixed in `NameField.tsx` — a row claims the highlight only when the pointer actually moves.

The scripted run that produced these entered all eight real Stops in one keyboard stream — click
`＋ Add a stop`, type, Enter on the top result — without opening a single Leg card.
