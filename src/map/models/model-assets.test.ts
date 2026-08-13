import { describe, expect, it } from 'vitest'

import { MODEL_ASSETS, modelAssets } from './model-assets'

/**
 * The table's own invariants — pure, like everything else under test in this project.
 *
 * The assertions that need the filesystem live in `scripts/models/shipped-glb.test.mjs`, next to the
 * pipeline that produces the files. Keeping them out of here is what lets `tsconfig.json` go on
 * declaring `types: ["vite/client"]` and nothing else: this is a browser-only app, and node globals
 * have no business in its type graph.
 */

describe('the model asset table', () => {
  it('keys every entry by its own id', () => {
    for (const [key, asset] of Object.entries(MODEL_ASSETS)) {
      expect(key).toBe(asset.id.replaceAll('-', '_'))
    }
  })

  it('names a distinct GLB per asset', () => {
    const files = modelAssets().map((asset) => asset.file)
    expect(new Set(files).size).toBe(files.length)
    for (const asset of modelAssets()) {
      expect(asset.file).toBe(`${asset.id}.glb`)
    }
  })

  it('can convert every asset from source units to metres', () => {
    for (const asset of modelAssets()) {
      expect(asset.scale, asset.id).toBeGreaterThan(0)
      expect(Number.isFinite(asset.scale), asset.id).toBe(true)
      expect(asset.readsAtM, asset.id).toBeGreaterThan(0)
      expect(['x', 'y', 'z'], asset.id).toContain(asset.readsAtAxis)
    }
  })

  it('stands every model on the ground rather than sinking it', () => {
    for (const asset of modelAssets()) {
      expect(asset.yOffset, asset.id).toBeGreaterThanOrEqual(0)
    }
  })

  it('carries a yaw that is either nothing or a half turn', () => {
    // Not a check that the models face +Z — no unit test can see that. Which way each model faces was
    // established from Kenney's own node names for seven of nine vehicles, and from station profiles
    // plus docs/models/contact-sheet.png for the rest; the build re-checks it on every run. All this
    // asserts is that the correction stayed one of the two values that convention allows.
    for (const asset of modelAssets()) {
      expect([0, Number(Math.PI.toFixed(6))], asset.id).toContain(asset.yaw)
    }
  })

  it('measures every model in metres', () => {
    for (const asset of modelAssets()) {
      expect(asset.sizeM, asset.id).toHaveLength(3)
      for (const dimension of asset.sizeM) {
        expect(dimension, asset.id).toBeGreaterThan(0)
      }
      // The solved axis has to agree with the size it was solved for.
      const axis = { x: 0, y: 1, z: 2 }[asset.readsAtAxis]
      expect(asset.sizeM[axis], asset.id).toBeCloseTo(asset.readsAtM, 1)
    }
  })

  it('gives every Vehicle a Mode and no Stay Marker one', () => {
    for (const asset of modelAssets()) {
      if (asset.role === 'vehicle') expect(asset.mode, asset.id).toBeTruthy()
      else expect(asset.mode, asset.id).toBeUndefined()
    }
  })

  it('covers five of the glossary’s six Modes, and names the gap', () => {
    // CONTEXT.md defines Mode as flight, train, ferry, boat, bus or van. Five have their own Vehicle.
    // `van` deliberately does not: #4 established that no CC0 bus or coach exists in any source it
    // checked, so the Kenney van serves both Modes — which #4 judged the truer depiction of a
    // Southeast Asian minibus hop anyway. Whichever ticket resolves Mode → Vehicle owns that mapping;
    // this test exists so the gap is asserted rather than forgotten.
    const covered = new Set(modelAssets().map((asset) => asset.mode))

    for (const mode of ['flight', 'train', 'ferry', 'boat', 'bus']) {
      expect(covered, `no Vehicle depicts ${mode}`).toContain(mode)
    }

    expect(
      covered,
      'the van Mode is served by the bus asset, not its own',
    ).not.toContain('van')
  })
})
