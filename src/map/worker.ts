import { setWorkerUrl } from 'maplibre-gl'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'

/**
 * Tells MapLibre where its own worker went.
 *
 * Left alone, MapLibre finds the worker relative to its own module URL. A bundler moves the module
 * and the worker stops resolving — in dev it 404s out of `.vite/deps/`, and in a production build
 * the filename is computed at runtime, so Vite cannot see the reference and emits no asset for it
 * at all. Either way the failure is silent: the map draws its background layer, every tile request
 * hangs on a dead worker, and nothing appears in the console.
 *
 * `?worker&url` makes Vite bundle the worker — following its own import of MapLibre's shared chunk,
 * which a plain `?url` copy would leave dangling — and hand back the final URL of the result. That
 * URL is the one thing that is true in dev and in the deployed bundle alike.
 *
 * Import this module for its side effect before constructing a map.
 */
setWorkerUrl(workerUrl)
