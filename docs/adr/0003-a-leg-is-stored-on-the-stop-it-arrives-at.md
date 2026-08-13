# A Leg is stored on the Stop it arrives at

The glossary says a Leg is derived from Stop order and never entered directly. The obvious way to store
one anyway is a flat list keyed by its two endpoints — `bangkok->ao-nang`. **We do not do that.** A Leg is
stored on the Stop it arrives at, as that Stop's inbound movement, with the single Leg that arrives
nowhere held by the Trip as its return. `n` Stops therefore mean `n` inbound Legs plus one: the real
Southeast Asia trip is 8 Stops and 9 Legs.

The reason is that Stop order is stored and changed by dragging
([#10](https://github.com/adrianpetersson/onward/issues/10)), and an endpoint-keyed Leg cannot survive a
drag. Move Koh Mook and `kradan->mook` either silently re-points at a movement that never existed or is
orphaned outright — and the annotation it carries is a real speedboat with a real price. Nesting makes
the question unaskable: the boat moves with the island it lands on.

## Consequences

- **The Origin needs no sentinel.** With Legs nested, the first Stop's inbound Leg is simply the movement
  from the Trip's Origin. An endpoint-keyed list would have needed a fake id at one end of it — the exact
  seam where the trip's most expensive Leg lives.
- **A Leg has no independent identity.** It cannot be addressed, exported or linked to without its Stop.
  Accepted: nothing in the MVP wants to, and the glossary already says a Leg is derived rather than
  entered.
- **Deleting a Stop deletes its inbound Leg**, along with its Stays. That cascade is silent today and is
  flagged as residue on [#10](https://github.com/adrianpetersson/onward/issues/10) — a deleted Stop can
  take a live cancellation deadline and real committed money down with it.
- **Dragging a Stop keeps its Leg attached but changes what that Leg describes.** The Kradan speedboat
  becomes the Ao Nang speedboat: visible and editable, but now wrong. Nesting guarantees the annotation
  survives; it does not guarantee it stays true. Whether the sidebar flags this is still open.
- The shape stays inside `trips → stops → legs → bookings` as
  [ADR 0002](./0002-no-backend-localstorage-and-one-edge-function.md) requires — nesting changes where a
  Leg hangs, not the order of the four levels.
