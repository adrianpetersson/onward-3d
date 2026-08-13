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

**Leg**:
The movement into a Stop from the one before it — or from the Origin, for the first. Legs are derived from Stop order rather than entered directly, so an Itinerary can never be missing one. One booked movement is one Leg, however many vehicles it takes.
_Avoid_: route, connection, transfer, hop, segment

**Mode**:
How a Leg is travelled — flight, train, ferry, boat, bus, van. A Leg has one Mode and may carry a second where a single ticket covers two vehicles: the Bangkok sleeper that ends in a van is one Leg with two Modes. The first is the one the map draws.
_Avoid_: transport type, vehicle type, method

**Via**:
A named point a Leg passes through without staying — Beijing, on the way to Bangkok. A Via carries a coordinate so the Path bends correctly through it, and nothing else.
_Avoid_: layover, stopover, waypoint, transit

**Booking**:
A reservation that has been made and has a reference number. Attaches to a Stop (as a Stay) or to a Leg (a seat, a berth, a ticket). Without a reference there is no Booking, only an intention.
_Avoid_: reservation, confirmation, ticket

**Stay**:
The Booking of somewhere to sleep at a Stop. Deliberately not "hotel" — the audience books hostels, guesthouses and beach huts. Every Stay is Booked, a Placeholder, or Shortlisted.
_Avoid_: hotel, accommodation, lodging, room

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
The line drawn on the map for a Leg. A bird's path between two Stops, not a routed road or rail alignment.
_Avoid_: arc, route, line, polyline, trail

**Vehicle**:
The 3D model that depicts a Leg's Mode on the map — a plane on a flight, a boat on a ferry. The depiction of a Mode, never the Mode itself.
_Avoid_: model, mesh, icon, marker

**Pin**:
The marker standing at a Stop that has no Booking. A Pin is what stands there when nothing has been reserved yet — the moment a Stay is booked, a Stay Marker replaces it.
_Avoid_: marker, dot, point

**Stay Marker**:
The 3D building that stands at a Stop once its Stay is booked. It stands at the Stay's own coordinates where they are known, and at the Stop's where they are not — a booked bed is always a building, never a Pin.
_Avoid_: hotel model, building, hotel pin

**Pulse**:
The slow throb that marks a Stop as unresolved — no Stay at all, a Shortlisted one, or a Placeholder meant to be replaced.
_Avoid_: blink, flash, glow

**Jump**:
The hop that marks a Stay Marker as unplaced: the Booking is real but no coordinate has been pasted, so the building stands at the Stop's centre rather than on its own beach. Jumping asks for the one thing still missing.
_Avoid_: bounce, bob, hover
