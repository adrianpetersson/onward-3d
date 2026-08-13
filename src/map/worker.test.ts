import { describe, expect, it } from 'vitest'
import { getWorkerUrl } from 'maplibre-gl'

import './worker'

/**
 * The worker is the one dependency whose absence produces no error at all: the map draws its
 * background, every tile hangs on a dead RPC, and the console stays empty. Worth one assertion.
 */
describe('the MapLibre worker', () => {
  it('has a URL pointing at a bundled worker, not at MapLibre’s own module path', () => {
    const url = getWorkerUrl()

    expect(url).toBeTruthy()
    // A bundled worker asset, wherever the bundler decided to put it. What must NOT survive is the
    // unbundled `dist/maplibre-gl-worker.mjs`, which imports a shared chunk that never ships.
    expect(url).not.toMatch(/maplibre-gl\/dist\/maplibre-gl-worker\.mjs$/)
  })
})
