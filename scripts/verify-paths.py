#!/usr/bin/env python3
"""Seed the real SEA itinerary into the cache and screenshot the Diorama at every camera.

Verification for #8, not a fixture: the trip below is Adrian's, hand-taken to a few hundred metres,
and the point is to see Paths and Vehicles drawn from a Trip that went through the sidebar's own
model rather than from a stand-in the map file made up.

    python3 scripts/verify-paths.py
"""

import json
import pathlib
import sys

from playwright.sync_api import sync_playwright

BASE = "http://localhost:3100/"
OUT = pathlib.Path(__file__).resolve().parents[1] / ".playwright-mcp" / "verify"
SETTLE_MS = 7000

HIDE_CHROME = """
.maplibregl-ctrl-top-right, .maplibregl-ctrl-bottom-right,
.maplibregl-ctrl-bottom-left { display: none !important }
"""


def leg(mode, second=None, via=()):
    return {
        "mode": mode,
        "secondMode": second,
        "depart": None,
        "arrive": None,
        "dayRoll": 0,
        "durationMin": None,
        "price": None,
        "carrier": None,
        "fromPlace": None,
        "via": [{"name": n, "lng": lng, "lat": lat} for n, lng, lat in via],
        "note": None,
        "booking": None,
    }


def stop(sid, name, lng, lat, inbound):
    return {
        "id": sid,
        "name": name,
        "coord": {"lng": lng, "lat": lat},
        "arrival": None,
        "departure": None,
        "inbound": inbound,
        "stays": [],
    }


TRIP = {
    "id": "sea-xmas",
    "name": "Southeast Asia",
    "origin": {"name": "Copenhagen", "lng": 12.5683, "lat": 55.6761},
    "stops": [
        stop("bangkok", "Bangkok", 100.5018, 13.7563,
             leg("flight", via=[("Beijing", 116.4074, 39.9042)])),
        # The sleeper that ends in a van — one booked movement, two Modes, and the map draws the first.
        stop("railay", "Railay", 98.8380, 8.0110, leg("train", second="van")),
        stop("koh-kradan", "Koh Kradan", 99.25546, 7.30365, leg("boat")),
        stop("koh-bulon-le", "Koh Bulon-Le", 99.5586, 6.8340, leg("boat")),
        stop("koh-lipe", "Koh Lipe", 99.3040, 6.4880, leg("boat")),
        stop("langkawi", "Langkawi", 99.7280, 6.2900, leg("ferry")),
        stop("george-town", "George Town", 100.3354, 5.4141, leg("ferry")),
        stop("teluk-bahang", "Teluk Bahang", 100.2130, 5.4570, leg("van")),
        stop("kuala-lumpur", "Kuala Lumpur", 101.6869, 3.1390, leg("train")),
        # A Leg still waiting to be told how it is travelled — the neutral ink.
        stop("melaka", "Melaka", 102.2501, 2.1896, leg(None)),
    ],
    "returnLeg": leg("flight", via=[("Dubai", 55.3657, 25.2532)]),
}

ENVELOPE = {
    "kind": "onward-store",
    "schemaVersion": 1,
    "savedAt": "2026-08-14T09:00:00.000Z",
    "openTripId": "sea-xmas",
    "trips": [TRIP],
}

VIEWS = {
    "trip": dict(center=[56.5, 30], zoom=2.4, pitch=0, bearing=0),
    "region": dict(center=[100.2, 8.5], zoom=5.6, pitch=0, bearing=0),
    "hops": dict(center=[99.2, 7.2], zoom=8.2, pitch=0, bearing=0),
    "hops-pitched": dict(center=[99.2, 7.0], zoom=8.2, pitch=60, bearing=-22),
    "island": dict(center=[99.2555, 7.3037], zoom=11.5, pitch=50, bearing=-22),
}


def main() -> int:
    OUT.mkdir(parents=True, exist_ok=True)

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, args=["--use-angle=metal"])
        page = browser.new_page(viewport={"width": 1280, "height": 760})

        # Registered before the first load: a style or worker failure happens during it, and #6 is
        # the standing reminder that MapLibre can fail in total silence.
        errors = []
        page.on(
            "console",
            lambda m: errors.append(m.text) if m.type == "error" else None,
        )
        page.on("pageerror", lambda e: errors.append(str(e)))

        # Seeded before the first navigation rather than set-then-reloaded. The reload was aborting
        # the style and sprite fetches MapLibre had already started, which surfaced as two
        # `AJAXError: Failed to fetch (0)` on every run — an artefact of this script, not of the app,
        # and exactly the kind of thing that gets mistaken for a real load failure.
        page.add_init_script(
            "localStorage.setItem('onward:store', %s)" % json.dumps(json.dumps(ENVELOPE))
        )
        page.goto(BASE, wait_until="load")
        page.wait_for_timeout(SETTLE_MS)
        page.add_style_tag(content=HIDE_CHROME)

        for name, view in VIEWS.items():
            page.evaluate("v => window.__diorama.jumpTo(v)", view)
            page.wait_for_timeout(3500)
            page.screenshot(path=str(OUT / f"{name}.png"))
            print(f"{name}.png")

        drawn = page.evaluate(
            """async () => {
                const map = window.__diorama;
                const data = await map.getSource('paths').getData();
                const byMode = {};
                for (const f of data.features) {
                    byMode[f.properties.mode] = (byMode[f.properties.mode] ?? 0) + 1;
                }
                return {total: data.features.length, byMode};
            }"""
        )
        print("\nPaths per Mode:", json.dumps(drawn))
        if errors:
            print("\nCONSOLE ERRORS:", *errors, sep="\n  ")

        browser.close()

    return 0


if __name__ == "__main__":
    sys.exit(main())
