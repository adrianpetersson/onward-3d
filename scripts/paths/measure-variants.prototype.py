#!/usr/bin/env python3
"""THROWAWAY (#23) — an on/off frame pair and sample points per variant, for the legibility numbers.

    python3 scripts/paths/measure-variants.prototype.py
    node scripts/paths/legibility-variants.prototype.mjs

#22's instrument compares one camera drawn against the same camera with the Path layers hidden, so a
Leg is visible to exactly the extent that drawing it changed the picture. This takes that pair for
every variant, plus the crossing coordinates, which differ per camera and not per variant — the
geometry is identical, only the paint changes.
"""

import json
import pathlib
import sys

from playwright.sync_api import sync_playwright

BASE = "http://localhost:3000/"
ROOT = pathlib.Path(__file__).resolve().parents[2]
FIXTURE = ROOT / "docs" / "real-trip" / "sea-xmas-2026.json"
OUT = ROOT / "docs" / "paths-volume" / "measure"

SETTLE_MS = 8000
MOVE_MS = 3800

VARIANTS = ["shipped", "wall", "green-bed", "one-green", "green-ramp", "extruded"]

CAMERAS = {
    "load": None,
    "islands": dict(center=[99.42, 6.86], zoom=8.6, pitch=0, bearing=0),
}

HIDE_CHROME = """
.maplibregl-ctrl-top-right, .maplibregl-ctrl-bottom-right,
.maplibregl-ctrl-bottom-left { display: none !important }
.fixed.bottom-4 { display: none !important }
aside { display: none !important }
"""

# Every layer id any variant might have added. Hiding all of them is the "off" frame.
TOGGLE = """
(on) => {
  const m = window.__diorama
  for (const id of ['paths', 'paths-casing', 'paths-wall', 'paths-extrusion']) {
    if (m.getLayer(id)) m.setLayoutProperty(id, 'visibility', on ? 'visible' : 'none')
  }
}
"""

# Straight out of scripts/paths/README.md, with the sidebar's 440 px guard dropped because the panel
# is hidden here — every pixel of the frame is map.
SAMPLES = """
async () => {
  const m = window.__diorama
  const data = await m.getSource('paths').getData()
  const { clientWidth: W, clientHeight: H } = m.getCanvas()
  const visible = (p) => p.x >= 10 && p.x < W - 10 && p.y >= 10 && p.y < H - 10

  return data.features.map((f) => {
    const pts = f.geometry.coordinates.map(([lng, lat]) => m.project({ lng, lat }))
    const on = pts.map((p, i) => [p, i]).filter(([p]) => visible(p)).map(([, i]) => i)
    const step = Math.max(1, Math.floor(on.length / 24))
    return {
      mode: f.properties.mode,
      samples: on.filter((_, k) => k % step === 0).slice(0, 24)
        .map((j) => ({ x: +pts[j].x.toFixed(1), y: +pts[j].y.toFixed(1) })),
    }
  })
}
"""


def main() -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    errors: list[str] = []

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, args=["--use-angle=metal"])
        page = browser.new_page(viewport={"width": 1400, "height": 900})
        page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.add_init_script(
            "localStorage.setItem('onward:store', %s)" % json.dumps(FIXTURE.read_text())
        )

        for variant in VARIANTS:
            page.goto(f"{BASE}?variant={variant}", wait_until="load")
            page.wait_for_timeout(SETTLE_MS)
            page.add_style_tag(content=HIDE_CHROME)

            for camera, view in CAMERAS.items():
                if view is not None:
                    page.evaluate("v => window.__diorama.jumpTo(v)", view)
                    page.wait_for_timeout(MOVE_MS)

                # Sample points once per camera — the geometry does not vary by variant.
                spots = OUT / f"samples-{camera}.json"
                if not spots.exists():
                    spots.write_text(json.dumps(page.evaluate(SAMPLES), indent=1))

                page.screenshot(path=str(OUT / f"{camera}-{variant}-on.png"))

                page.evaluate(TOGGLE, False)
                page.wait_for_timeout(700)
                page.screenshot(path=str(OUT / f"{camera}-{variant}-off.png"))
                page.evaluate(TOGGLE, True)
                page.wait_for_timeout(400)

                print(f"{camera}-{variant}: on + off")

        browser.close()

    if errors:
        print("\nCONSOLE ERRORS:", *dict.fromkeys(errors), sep="\n  ")
    return 0


if __name__ == "__main__":
    sys.exit(main())
