# Onward

A 3D map itinerary planner for solo travellers, backpackers and adventure travellers. You describe a trip in a sidebar; the map draws it as a stylised world you can fly through.

This file is the project's glossary. It holds the language, not the design and not the implementation.

## The itinerary

**Trip**:
One journey with a start and an end, made of Stops in order. Exactly one Trip is open at a time in the MVP.
_Avoid_: journey, holiday, vacation, plan

**Itinerary**:
A Trip's Stops in order, together with the Legs derived from that order. The whole shape of the journey.
_Avoid_: schedule, plan, route

**Stop**:
A place the traveller stays, with an arrival and a departure. Bangkok is a Stop; so is Koh Mook.
_Avoid_: destination, location, place, node, waypoint

**Leg**:
The movement between two consecutive Stops. Legs are derived from Stop order rather than entered directly, so an Itinerary can never be missing one.
_Avoid_: route, connection, transfer, hop, segment

**Mode**:
How a Leg is travelled — flight, train, ferry, boat, bus, van. A property of the Leg, not a thing in itself.
_Avoid_: transport type, vehicle type, method

**Booking**:
A reservation that has been made and has a reference number. Attaches to a Stop (a Stay) or to a Leg (a seat, a berth, a ticket).
_Avoid_: reservation, confirmation, ticket

**Stay**:
The Booking of somewhere to sleep at a Stop. Deliberately not "hotel" — the audience books hostels, guesthouses and beach huts.
_Avoid_: hotel, accommodation, lodging, room

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
The pulsing marker standing at a Stop that has no Stay booked yet. Pulsing means unresolved.
_Avoid_: marker, dot, point

**Stay Marker**:
The 3D building that replaces a Pin once the Stop has a Stay, standing at the Stay's own coordinates rather than the Stop's centre.
_Avoid_: hotel model, building, hotel pin
