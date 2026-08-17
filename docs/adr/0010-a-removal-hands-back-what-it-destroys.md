# A removal hands back what it destroys

Removing a Stop takes its inbound Leg and every Stay under it, and each of those can carry a Booking —
a reference, a platform, a cancellation deadline, a phone number. Onward asks about that removal **only
when a Booking would die**, and when it asks, the question it puts is not _are you sure_. It reads the
reference out, says how long the cancellation window has left, and names the platform to go and ask.

The reason is that a Booking is the one thing in the model that exists **somewhere other than Onward**.
Everything else can be retyped from memory; `688166919` cannot, and a still-open cancellation window is
money that comes back only if the traveller leaves the app and does something about it. So the panel's
job is to create that errand, not to slow the click down.

That fixes the trigger. **A `Booking` object, not money and not a reference:**

- A `price` with no Booking under it is an intention — a Shortlisted target's asking price, a fare
  nobody has bought. Removing it costs retyping, and Langkawi's real 2,250 SEK target is exactly this.
- An **empty `reference` does not disqualify a Booking.**
  [#12](https://github.com/adrianpetersson/onward/issues/12) found that reading a reference-less Booking
  as "not really a Booking" is what destroys a genuine cancellation deadline and phone number, written
  down in the window before the confirmation email arrives. The test is whether _anything_ has been
  written into it.
- A Booking with all five fields blank and no price beside it is a mis-click on `＋ I have booked this`,
  and the click that undoes it does not have to argue.

**Silence is the feature, not the fallback.** On the real Southeast Asia trip the guard fires on **three
Stops out of eight** and says nothing on the other five, which hold a Shortlisted name and nothing
committed. Two of the three are the obvious ones — Koh Kradan's Ao Niang and Koh Lipe's Placeholder. The
third is **Bangkok**, which has nowhere booked to sleep and whose inbound Leg carries Air China
`EEOIO2`, the flight out of Copenhagen: the cascade this whole ticket is about, arriving at the Stop
nobody would have guessed. A guard that fires on all eight is a guard that gets dismissed on the three
that mattered, and there is a worked example of exactly that failure: Koh Bulon Le was cut between two
revisions of the planning documents while holding Pankabay at 772.42 SEK, refundable only until 21 Dec.
A human caught it because a human had written it down twice.

**One rule, three controls.** The guard belongs to _destroying a Booking_ rather than to _removing a
Stop_, so a Stay's `remove` and a Booking's `not booked after all` go through the same derivation. Both
of those shipped before this decision as one unconfirmed click, which is the same loss in a smaller box —
guarding the Stop alone would have shipped a contradiction.

**It is inline, not a modal.** `StorageNotice.tsx` holds the only modal in the app and states what earns
one: the moment where guessing would cost real work and only the traveller knows the answer. This does
not clear that bar, and a modal would cover the Itinerary the traveller is checking the Stop against.

## And therefore no fourth Stay status

The obvious companion feature is a `cancelled` state, so the history of a replaced Placeholder survives.
**We do not add one**, and this ADR holds both halves because the second follows from the first.

The concern behind a `cancelled` state is that deleting the Noi Guesthouse loses the record of what was
almost booked. But the record's only real use is _going and cancelling it_, and the removal panel now
hands that over at the exact moment it is needed. What a fourth state would preserve is the corpse
afterwards, which nobody plans around.

Against it, concretely: `stop.stays` is already a **list**, and it is a list precisely so the window
where the replacement is booked and the incumbent is not yet cancelled has somewhere to live — the
overlap is already modelled, so the state would only cover what happens _after_ the overlap closes. It
would also need a rank in `drawingStay`, a case in `markerAt`, an exclusion in `atRisk` (a refunded Stay
is not money at risk), a case in `parse.ts`, and a fourth button in a sidebar that
[#28](https://github.com/adrianpetersson/onward/issues/28) is already trying to thin out. And it
contradicts `CONTEXT.md`, which rules three states.

## Consequences

- **`atRisk()` is still not on screen anywhere.** It was built and tested by
  [#12](https://github.com/adrianpetersson/onward/issues/12) and this ticket deliberately did not spend
  it, because its framing is the inverse of what a removal needs: `atRisk` sums money whose deadline has
  **passed**, and the dangerous removal is the one whose deadline is still **live**. The two are
  complementary, not interchangeable, and a trip-level "at risk" figure remains unsurfaced.
- **The guard is silent for a Trip that has never been saved.** `Loss` is read off the draft, so it
  fires correctly; but the panel's promise that "Discard still brings it back" is only worth what
  Discard is worth, and Discard reverts the **whole** draft. It is a revert, not an undo, and the copy
  says so rather than implying a per-row undo that does not exist.
- **A removal is one `touched` entry, exactly like a drag.** Both key `'order'`, so the footer counts a
  removal that destroyed a booking the same as a reorder. Not worth a distinction the footer would have
  to explain, but it is why the guard cannot lean on the unsaved count to convey weight.
- **The stale-Leg report is the same decision applied to reordering** — see the `Leg` entry in
  `CONTEXT.md`. It reports and never repairs, because a re-pointed Leg's times are probably wrong while
  its fare and note may be exactly right, and only the traveller knows which.
