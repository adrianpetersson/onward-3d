/**
 * Fetches the model archives into a scratch directory **outside the repo**.
 *
 * Split from `build.mjs` on purpose: this is the only script in the pipeline that touches the
 * network, so re-running the build costs nothing and reviewing the network surface means reading
 * one file. Archives are never committed — see docs/licences/models.md for what ships.
 *
 *   node scripts/models/fetch.mjs [--scratch <dir>] [--force]
 */

import { createHash } from 'node:crypto'
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { defaultScratchDir, loadSources, parseArgs } from './lib/pipeline.mjs'

const { scratch = defaultScratchDir(), force = false } = parseArgs()
const sources = await loadSources()

await mkdir(scratch, { recursive: true })

/** Everything with a URL, kits and singles alike — they download identically. */
const downloads = [
  ...sources.kits.map((kit) => ({ ...kit, name: kit.name, file: kit.archive })),
  ...sources.singles,
]

const alreadyThere = async (path, bytes) => {
  if (force) return false
  const found = await stat(path).catch(() => null)
  return found !== null && (bytes === undefined || found.size === bytes)
}

const lock = {}

for (const item of downloads) {
  const path = join(scratch, item.file)

  if (
    await alreadyThere(path, item.bytesApproximate ? undefined : item.bytes)
  ) {
    console.log(`· ${item.file} already in the scratch dir`)
  } else {
    console.log(`↓ ${item.name}\n  ${item.url}`)

    const response = await fetch(item.url)
    if (!response.ok) {
      // A fingerprinted Kenney URL goes stale when the pack is updated. Say so, rather than
      // writing an HTML error page to disk under a .zip name.
      throw new Error(
        `${item.file}: HTTP ${response.status} ${response.statusText}. ` +
          `Re-read ${item.page} and update url + bytes in sources.json.`,
      )
    }

    await writeFile(path, Buffer.from(await response.arrayBuffer()))
  }

  const bytes = await readFile(path)

  // The manifest's byte count is the research's own measurement. A mismatch means the pack moved
  // under its fingerprint, and the extraction step's filenames can no longer be trusted either.
  if (!item.bytesApproximate && bytes.length !== item.bytes) {
    throw new Error(
      `${item.file}: expected ${item.bytes} bytes, got ${bytes.length}. ` +
        `The upstream asset changed — re-check ${item.page} before shipping it.`,
    )
  }

  lock[item.file] = {
    bytes: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    url: item.url,
  }

  console.log(
    `  ${bytes.length} bytes · sha256 ${lock[item.file].sha256.slice(0, 12)}`,
  )
}

// Committed, unlike the archives: it is how a future reader proves the bytes behind the shipped
// GLBs are the bytes this pipeline was written against.
await writeFile(
  new URL('sources.lock.json', import.meta.url),
  JSON.stringify(lock, null, 2) + '\n',
)

console.log(`\n${downloads.length} archives in ${scratch}`)
console.log('Next: node scripts/models/build.mjs')
