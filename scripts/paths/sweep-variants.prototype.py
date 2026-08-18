#!/usr/bin/env python3
"""THROWAWAY (#23) — screenshot every Path variant at every camera on the real SEA Itinerary.

Six variants x five cameras, plus an all-Modes pass so `bus`, `van` and a Mode-less Leg appear at
all (the real trip only uses flight, train, ferry and boat).

    pnpm dev          # or the harness preview; port below
    python3 scripts/paths/sweep-variants.prototype.py

Deliberately the same shape as `scripts/verify-paths.py`: real MapLibre, real terrain drape, real
Itinerary out of `localStorage`. There is no headless renderer here and there should not be — the
thing under test is what MapLibre actually draws.
"""

import json
import pathlib
import sys

from playwright.sync_api import sync_playwright

BASE = "http://localhost:3000/"
ROOT = pathlib.Path(__file__).resolve().parents[2]
FIXTURE = ROOT / "docs" / "real-trip" / "sea-xmas-2026.json"
OUT = ROOT / "docs" / "paths-volume"

SETTLE_MS = 8000
MOVE_MS = 3800

VARIANTS = ["shipped", "wall", "green-bed", "one-green", "green-ramp", "extruded"]

# Hide the map's own chrome, the Itinerary panel, and the prototype's variant bar. Map only, which is
# ADR 0011's convention (`docs/casing/`) — the thing being judged is the Path, and the panel covers
# 400 px of the 1400 the Path has to read across.
HIDE_CHROME = """
.maplibregl-ctrl-top-right, .maplibregl-ctrl-bottom-right,
.maplibregl-ctrl-bottom-left { display: none !important }
.fixed.bottom-4 { display: none !important }
aside { display: none !important }
"""

# The camera ladder, matching ADR 0011's evidence set so the two are comparable. `load` is the app's
# own opening frame (#24) and is deliberately *not* a jumpTo — it is whatever the app chooses.
CAMERAS = {
    "load": None,
    "globe": dict(center=[56.5, 30.0], zoom=2.4, pitch=0, bearing=0),
    "islands": dict(center=[99.42, 6.86], zoom=8.6, pitch=0, bearing=0),
    "kradan": dict(center=[99.2527, 7.3158], zoom=15.4, pitch=60, bearing=-22),
    "kradan-flat": dict(center=[99.2527, 7.3158], zoom=15.4, pitch=0, bearing=0),
}

# Every Mode on one frame. The real trip carries four of seven, so `bus`, `van` and the Mode-less Leg
# would otherwise never be looked at — and "what does a Leg with no Mode become" is one of the three
# questions #23 asks out loud.
ALL_MODES = ["flight", "train", "ferry", "boat", "bus", "van", None]


def store(all_modes: bool) -> str:
    envelope = json.loads(FIXTURE.read_text())
    if all_modes:
        trip = envelope["trips"][0]
        for i, stop in enumerate(trip["stops"]):
            if stop.get("inbound"):
                stop["inbound"]["mode"] = ALL_MODES[i % len(ALL_MODES)]
                stop["inbound"]["secondMode"] = None
        trip["returnLeg"]["mode"] = "flight"
    return json.dumps(envelope)


def main() -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    errors: list[str] = []

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, args=["--use-angle=metal"])
        page = browser.new_page(viewport={"width": 1400, "height": 900})
        page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
        page.on("pageerror", lambda e: errors.append(str(e)))

        for all_modes in (False, True):
            tag = "allmodes-" if all_modes else ""
            # Seeded before the first navigation rather than set-then-reloaded: the reload aborts the
            # style and sprite fetches MapLibre has already started, which surfaces as AJAXError noise
            # that looks exactly like a real load failure.
            page.add_init_script(
                "localStorage.setItem('onward:store', %s)" % json.dumps(store(all_modes))
            )

            for variant in VARIANTS:
                wanted = [
                    n
                    for n in CAMERAS
                    if not (all_modes and n not in ("load", "islands"))
                    and not (OUT / f"{tag}{n}-{variant}.png").exists()
                ]
                # Resumable: the dev server died once mid-sweep and re-taking 34 good frames to get
                # the last 6 is a waste of eight seconds each.
                if not wanted:
                    print(f"{tag}{variant}: already taken, skipping")
                    continue

                page.goto(f"{BASE}?variant={variant}", wait_until="load")
                page.wait_for_timeout(SETTLE_MS)
                page.add_style_tag(content=HIDE_CHROME)

                for name in wanted:
                    view = CAMERAS[name]

                    if view is not None:
                        page.evaluate("v => window.__diorama.jumpTo(v)", view)
                        page.wait_for_timeout(MOVE_MS)

                    # With terrain on, the zoom you asked for is not the zoom you get: MapLibre keeps
                    # the camera's altitude and recomputes zoom once the elevation under the centre
                    # arrives. Quote the zoom it ended at (ADR 0011).
                    got = page.evaluate(
                        "() => { const m = window.__diorama;"
                        " return {z: +m.getZoom().toFixed(2), p: Math.round(m.getPitch())}; }"
                    )
                    path = OUT / f"{tag}{name}-{variant}.png"
                    page.screenshot(path=str(path))
                    print(f"{path.name:38} z{got['z']} pitch {got['p']}")

        browser.close()

    if errors:
        print("\nCONSOLE ERRORS:", *dict.fromkeys(errors), sep="\n  ")
    return 0


if __name__ == "__main__":
    sys.exit(main())
