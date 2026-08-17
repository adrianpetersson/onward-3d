# Onward

A 3D map itinerary planner for solo travellers, backpackers and adventure travellers. You describe a trip in a sidebar; the map draws it as a stylised world you can fly through.

This file is the project's glossary. It holds the language, not the design and not the implementation.

## The itinerary

**Trip**:
One journey with a start and an end, made of Stops in order and hung off an Origin. Exactly one Trip is open at a time in the MVP.
_Avoid_: journey, holiday, vacation, plan

**Itinerary**:
A Trip's Stops in order, together with the Legs derived from that order — from the Origin out, and back to it. The whole shape of the journey.
_Avoid_: schedule, plan, route

**Stop**:
A place the traveller sleeps, with an arrival and a departure. Bangkok is a Stop; so is Koh Mook. Home is not, and neither is an airside layover — those are passed through, not stayed at.
_Avoid_: destination, location, place, node, waypoint

**Origin**:
The place a Trip leaves from and returns to. It has a name and a coordinate but no dates and no Stay, and it is never a Stop — it exists so the long-haul out and the long-haul home are Legs like any other.
_Avoid_: home, start, departure point, terminus

**Find**:
A place the search turned up, offered but not yet chosen — the one thing the sidebar shows that is not part of the Itinerary. Choosing a Find takes its position and its Footprint and leaves the traveller's own spelling alone: he typed the name on his ferry ticket, not the one in the map's index.
_Avoid_: result, match, suggestion, hit, candidate

**Footprint**:
How much ground a Stop covers — Koh Kradan's is the island, Bangkok's is the city. It is what lets the map decide how far to pull back when it flies somewhere, instead of guessing. Known only for a Stop that was found by name; a Stop placed by paste or by click has none and can never acquire one, so nothing may depend on having it.
_Avoid_: bounds, bbox, extent, envelope, area

**Leg**:
The movement into a Stop from the one before it — or from the Origin, for the first. Legs are derived
from Stop order rather than entered directly, so an Itinerary can never be missing one — though it can
hold a **stale** one. Reordering the Stops re-points a Leg without touching what was entered against
it, so the times, fare and carrier of the Kradan speedboat survive being dragged above Ao Nang and go
on describing a crossing nobody booked. Onward says so and changes nothing: the order the traveller
dragged is the order that draws ([#19](https://github.com/adrianpetersson/onward/issues/19)).
One booked movement is one Leg, however many vehicles it takes.
_Avoid_: route, connection, transfer, hop, segment

**Mode**:
How a Leg is travelled — flight, train, ferry, boat, bus, van. A Leg has one Mode and may carry a second where a single ticket covers two vehicles: the Bangkok sleeper that ends in a van is one Leg with two Modes. The first is the one the map draws.
_Avoid_: transport type, vehicle type, method

**Via**:
A named point a Leg passes through without staying — Beijing, on the way to Bangkok. A Via carries a coordinate so the Path bends correctly through it, and nothing else.
_Avoid_: layover, stopover, waypoint, transit

**Booking**:
A reservation that has been made and has a reference number. Attaches to a Stop (as a Stay) or to a Leg
(a seat, a berth, a ticket). Without a reference there is no Booking, only an intention — but that is a
statement about the **world**, never a licence to throw away what has been written down. A bed booked by
phone has a deadline and a number before its confirmation email arrives, and Onward keeps every word of
it ([#12](https://github.com/adrianpetersson/onward/issues/12),
[ADR 0010](docs/adr/0010-a-removal-hands-back-what-it-destroys.md)).
_Avoid_: reservation, confirmation, ticket

**Stay**:
The Booking of somewhere to sleep at a Stop. Deliberately not "hotel" — the audience books hostels,
guesthouses and beach huts. Every Stay is Booked, a Placeholder, or Shortlisted — three states and not
four: **a cancelled Stay is a deleted one**. A Stop holds a _list_ of Stays precisely so the window
where the replacement is booked and the incumbent is not yet cancelled has somewhere to live, and once
the incumbent is cancelled it goes rather than lingering as a state nobody is planning around
([#19](https://github.com/adrianpetersson/onward/issues/19)).
_Avoid_: hotel, accommodation, lodging, room, cancelled

**Placeholder**:
A Stay that is genuinely booked — reference, price, money committed — but held only so the dates cannot sell out, and meant to be replaced before its cancellation deadline.
_Avoid_: provisional, tentative, hold, backup

**Shortlisted**:
A Stay that is a named target and nothing more: no reference, nothing committed.
_Avoid_: candidate, option, maybe

## Where it lives

**Store**:
Every Trip Onward holds, together with which one is open. It is one JSON document, written whole to the
File and cached whole in the browser — so a Store with one Trip in it is the ordinary case, not a
degenerate one. The plural is deliberate: multi-trip is later a change of interface, never a migration.
_Avoid_: save file, database, state, storage

**File**:
The JSON document on the traveller's own disk, chosen once, holding the Store. It is the **source of
truth** — the browser's copy is only a cache of it — and it is the reason clearing a browser costs
nothing. Not an export: nothing is exported, because there is nowhere else for the Itinerary to live.
_Avoid_: export, backup, download, dump

## The map

**Diorama**:
The stylised low-poly world the Itinerary is drawn into: matte terrain, flat colour, toy-scale models. The register the whole map commits to.
_Avoid_: scene, world, theme, style

**Path**:
The line drawn on the map for a Leg. A bird's path between two Stops, not a routed road or rail
alignment — and a bird's path is a **great circle**, so a Path curves on the map and is never the
straight line between its ends. It lies on the ground: a Path has no height, not even a flight's
([ADR 0006](docs/adr/0006-a-path-is-a-line-layer-never-three-js.md)).
_Avoid_: arc, route, line, polyline, trail

**Vehicle**:
The 3D model that depicts a Leg's Mode on the map — a plane on a flight, a boat on a ferry. The depiction of a Mode, never the Mode itself.
_Avoid_: model, mesh, icon, marker

**Pin**:
The marker standing at a Stop — at **every** Stop, and at every zoom. It stands where the bed is
when a Stay has a coordinate of its own, and at the Stop's own centre when it does not, because the
centre is the geocoder's idea of the place and the bed is the traveller's. Nothing ever replaces a
Pin: when a Stay Marker rises at close zoom it rises underneath one
([#9](https://github.com/adrianpetersson/onward/issues/9)).
_Avoid_: marker, dot, point

**Stay Marker**:
The 3D building that stands at a Stop once its Stay is booked, at the Stay's own coordinates where
they are known and at the Stop's where they are not. A booked bed is always a building **as well as**
a Pin: the building is drawn only from the zoom at which its true size earns it
([#20](https://github.com/adrianpetersson/onward/issues/20)).

It **signals** a booking rather than depicting one, and that is the whole of its meaning
([#21](https://github.com/adrianpetersson/onward/issues/21),
[ADR 0008](docs/adr/0008-the-stay-marker-signals-a-booking-it-does-not-depict-one.md)): every
non-Shortlisted Stay stands the same 40 m hotel tower whether the real bed is a Sukhumvit condo or a
hut on Koh Kradan. It is a highrise so that it can be found — read on its height it is drawn from
z14.8 where the guesthouse it replaced needed z17 — and being taller than the OSM buildings around it
is what stops it being one more building on the street.
_Avoid_: hotel model, building, hotel pin. Never write as though it depicts the accommodation.

**Pulse**:
The slow throb that marks a Stop as unresolved — no Stay at all, a Shortlisted one, or a Placeholder meant to be replaced.
_Avoid_: blink, flash, glow

**Jump**:
The hop that marks a Stay Marker as unplaced: the Booking is real but no coordinate has been pasted, so the building stands at the Stop's centre rather than on its own beach. Jumping asks for the one thing still missing.
_Avoid_: bounce, bob, hover
