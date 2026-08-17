import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

/**
 * The ADR numbering, asserted — because git cannot assert it, and demonstrably did not.
 *
 * On 17 Aug 2026 two ADRs numbered 0008 landed on `main` five minutes apart:
 * [#21](https://github.com/adrianpetersson/onward/issues/21)'s Stay Marker decision and
 * [#24](https://github.com/adrianpetersson/onward/issues/24)'s camera decision. The second session
 * **rebased onto the first one's commit** and the collision still went straight through, because
 * `0008-the-camera-….md` and `0008-the-stay-marker-….md` are different paths — so there is no
 * conflict for git to report. A duplicate ADR number is invisible to version control **by
 * construction**, which is exactly the kind of failure this repo pins with a test rather than
 * trusting to a convention.
 *
 * Concurrent sessions are the norm here — the wayfinder map says outright that unblocked tickets may
 * be run in parallel — so this will be hit again.
 *
 * Lives in `scripts/` rather than `docs/` for the reason the sibling GLB test does: it reads repo
 * files off disk, and `vite.config.ts` already collects `scripts/**\/*.test.mjs` without dragging
 * node types into this browser-only app's tsconfig.
 */

const ADR_DIR = fileURLToPath(new URL('../docs/adr', import.meta.url))

const adrs = readdirSync(ADR_DIR)
  .filter((name) => /^\d{4}-.+\.md$/.test(name))
  .sort()

const numberOf = (name) => name.slice(0, 4)

describe('ADR numbering', () => {
  it('finds the ADRs at all, so a moved directory cannot quietly empty this suite', () => {
    expect(adrs.length).toBeGreaterThanOrEqual(9)
  })

  it('never reuses a number', () => {
    const byNumber = new Map()
    for (const name of adrs) {
      byNumber.set(numberOf(name), [
        ...(byNumber.get(numberOf(name)) ?? []),
        name,
      ])
    }

    const duplicated = [...byNumber.entries()]
      .filter(([, names]) => names.length > 1)
      .map(([number, names]) => `${number} used by ${names.join(' and ')}`)

    expect(duplicated).toEqual([])
  })

  it('runs consecutively from 0001, so a gap reads as a missing decision', () => {
    expect(adrs.map(numberOf)).toEqual(
      adrs.map((_, i) => String(i + 1).padStart(4, '0')),
    )
  })

  it('never contradicts its own filename in its first heading', () => {
    /*
     * Deliberately narrower than "every heading states its number": ADRs 0001-0005 carry a bare
     * title and predate any numbered-heading convention, and renaming five landed decisions for
     * cosmetics is not worth a test. What this catches is the hazard that actually bit — renumbering
     * a file and leaving the old number inside it, which is what happened to #24's ADR when it moved
     * from 0008 to 0009. So a heading may omit its number, but it may not state the wrong one.
     */
    for (const name of adrs) {
      const heading = readFileSync(join(ADR_DIR, name), 'utf8').split('\n')[0]
      const stated = heading.match(/\b(\d{4})\b/)?.[1]

      if (stated !== undefined) {
        expect(stated, `${name}: heading says ${stated}`).toBe(numberOf(name))
      }
    }
  })
})
