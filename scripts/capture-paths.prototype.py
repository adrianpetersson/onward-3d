#!/usr/bin/env python3
"""PROTOTYPE for #8 — screenshot every (variant, camera) pair the ticket has to be judged at.

Throwaway. Run the dev server on :3100 first, then:

    python3 scripts/capture-paths.prototype.py

Panels land in .playwright-mcp/sheet/ at 1:1, which is the point — magnifying a crop misrepresents
apparent size, and apparent size is most of what is being judged here.
"""

import pathlib
import sys

from playwright.sync_api import sync_playwright

BASE = "http://localhost:3100/"
OUT = pathlib.Path(__file__).resolve().parents[1] / ".playwright-mcp" / "sheet"
WIDTH, HEIGHT = 1280, 760

# Long enough for tiles, the DEM and eleven GLBs; the map is not "done" in any event we can await.
SETTLE_MS = 7000

HIDE_CHROME = """
[data-prototype-bar], .maplibregl-ctrl-top-right, .maplibregl-ctrl-bottom-right,
.maplibregl-ctrl-bottom-left { display: none !important }
"""

SHOTS = [
    # The core question, at the camera where an arc can actually be seen.
    ("A", "hopsPitched", {}),
    ("B", "hopsPitched", {}),
    ("C", "hopsPitched", {}),
    # The same three from straight above — does lifting a Path do anything at pitch 0?
    ("A", "hops", {}),
    ("B", "hops", {}),
    ("C", "hops", {}),
    # The long-haul, where the great circle and the Via are the whole drawing.
    ("A", "trip", {}),
    ("C", "trip", {}),
    # A ferry arcing tens of km into the sky, and the same map with it on the sea.
    ("B", "region", {}),
    ("C", "region", {}),
    # Next to a Stay Marker, which is the world a Path has to share.
    ("C", "island", {}),
    # One ink for every Mode, against a colour each.
    ("C", "hopsPitched", {"ink": "one"}),
]


def url(variant: str, view: str, extra: dict) -> str:
    params = {"variant": variant, "view": view, **extra}
    return BASE + "?" + "&".join(f"{k}={v}" for k, v in params.items())


def name(variant: str, view: str, extra: dict) -> str:
    tail = "".join(f"-{k}{v}" for k, v in extra.items())
    return f"{variant}-{view}{tail}.png"


def main() -> int:
    OUT.mkdir(parents=True, exist_ok=True)

    with sync_playwright() as p:
        browser = p.chromium.launch(
            headless=True,
            args=[
                "--use-angle=metal",
                "--enable-unsafe-webgpu",
                "--ignore-gpu-blocklist",
                "--enable-gpu-rasterization",
            ],
        )
        page = browser.new_page(viewport={"width": WIDTH, "height": HEIGHT})

        for variant, view, extra in SHOTS:
            target = url(variant, view, extra)
            page.goto(target, wait_until="load")
            page.wait_for_timeout(SETTLE_MS)
            page.add_style_tag(content=HIDE_CHROME)
            page.wait_for_timeout(400)

            out = OUT / name(variant, view, extra)
            page.screenshot(path=str(out))
            print(f"{out.name:34} {target}")

        browser.close()

    return 0


if __name__ == "__main__":
    sys.exit(main())
