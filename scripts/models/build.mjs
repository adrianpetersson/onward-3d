/**
 * Turns the fetched archives into the GLBs Onward ships, and derives the scale table from them.
 *
 * Four things happen here, and the first is the reason the ticket exists:
 *
 * 1. **Embed the texture.** Every Kenney GLB declares its atlas as an external relative URI
 *    (`Textures/colormap.png`). Served as downloaded, the browser 404s the atlas and the mesh
 *    renders untextured — silently. Each model is repacked with the atlas inside it, and the
 *    result is asserted to carry no image URI at all.
 * 2. **Convert the airliner.** No CC0 aircraft exists as glTF anywhere #4 checked, so the one
 *    aircraft is an OpenGameArt OBJ, converted here with a matte material and rotated so +Z is
 *    nose-forward like the Kenney vehicles.
 * 3. **Measure.** Source units are incoherent across kits and even within one, so every model's
 *    real size is measured and a per-asset scale derived against the metres it should read at.
 * 4. **Emit.** The GLBs, the typed table, and the licence record.
 *
 *   node scripts/models/build.mjs [--scratch <dir>]
 */

import { Document, NodeIO } from '@gltf-transform/core'
import { execFile } from 'node:child_process'
import {
  copyFile,
  mkdir,
  readdir,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import { promisify } from 'node:util'

const exec = promisify(execFile)

import {
  defaultScratchDir,
  exists,
  extractArchive,
  forwardFromNodeNames,
  loadSources,
  measureBounds,
  measureFrontEnd,
  parseArgs,
  repoPath,
  walk,
  yawToFaceZ,
} from './lib/pipeline.mjs'

const { scratch = defaultScratchDir() } = parseArgs()
const sources = await loadSources()

const io = new NodeIO()
const OUT_DIR = repoPath('src/map/models')
const extractRoot = join(scratch, 'extracted')

/** An off-white for the untextured airliner. #11 owns the real palette; this is a stand-in. */
const AIRLINER_SRGB = [0xe8, 0xea, 0xed]

const srgbToLinear = (channel) => {
  const value = channel / 255
  return value <= 0.04045
    ? value / 12.92
    : Math.pow((value + 0.055) / 1.055, 2.4)
}

const round = (value, places = 6) => Number(value.toFixed(places))

/* -------------------------------------------------------------------------- */
/*  1. Extract                                                                */
/* -------------------------------------------------------------------------- */

await rm(extractRoot, { recursive: true, force: true })

/** kit id → every file path in that kit's extraction. */
const kitFiles = new Map()

for (const kit of sources.kits) {
  const archive = join(scratch, kit.archive)
  if (!(await exists(archive))) {
    throw new Error(
      `${kit.archive} is not in ${scratch}. Run: node scripts/models/fetch.mjs`,
    )
  }

  const into = join(extractRoot, kit.id)
  await mkdir(into, { recursive: true })
  await extractArchive(archive, into)

  const files = await walk(into)
  kitFiles.set(kit.id, files)
  console.log(`· ${kit.name}: ${files.length} files extracted`)
}

/* -------------------------------------------------------------------------- */
/*  2. Repack the Kenney GLBs with their atlas embedded                       */
/* -------------------------------------------------------------------------- */

/**
 * Reads a kit GLB with its external atlas resolved, then hands back a Document whose textures
 * carry image bytes and no URI.
 *
 * The archive splits formats and textures into sibling directories, so the relative URI inside the
 * GLB does not necessarily resolve where the GLB sits. The atlas is located by basename anywhere in
 * the kit and staged next to a copy of the model at exactly the path the GLB asks for — which is
 * what makes the read succeed without patching somebody else's glTF by hand.
 */
async function readWithAtlas(kitId, glbName) {
  const files = kitFiles.get(kitId)

  const source = files.find(
    (path) => basename(path).toLowerCase() === glbName.toLowerCase(),
  )
  if (!source) throw new Error(`${kitId}: ${glbName} is not in the archive`)

  // Read the declared image URIs straight from the JSON chunk before glTF-Transform tries to
  // resolve them, so a missing atlas is a clear message rather than an ENOENT from deep inside io.
  const sourceBytes = await readFile(source)
  const declared = declaredImageURIs(sourceBytes)
  assertTextureTransformsAreNoOps(kitId, glbName, sourceBytes)

  const staging = join(extractRoot, kitId, '.staged', glbName)
  await mkdir(dirname(staging), { recursive: true })
  await copyFile(source, staging)

  for (const uri of declared) {
    const atlas = files.find(
      (path) => basename(path).toLowerCase() === basename(uri).toLowerCase(),
    )
    if (!atlas)
      throw new Error(`${kitId}: ${glbName} wants ${uri}, not found in the kit`)

    const target = join(dirname(staging), uri)
    await mkdir(dirname(target), { recursive: true })
    await copyFile(atlas, target)
  }

  const document = await io.read(staging)

  // Clearing the URI is what moves the image into the GLB's binary chunk on write.
  for (const texture of document.getRoot().listTextures()) {
    if (!texture.getImage()) {
      throw new Error(
        `${kitId}: ${glbName} texture has no image data after read`,
      )
    }
    texture.setURI('')
    if (!texture.getMimeType()) texture.setMimeType('image/png')
  }

  return { document, declared }
}

/** The `images[].uri` values in a GLB's JSON chunk. Also the shipped-file assertion, below. */
function declaredImageURIs(glb) {
  return (readGlbJson(glb).images ?? [])
    .map((image) => image.uri)
    .filter(Boolean)
}

/**
 * The JSON chunk of a GLB.
 *
 * The spec requires the JSON chunk to come first, so its body always starts at byte 20 — 12 bytes of
 * header, then this chunk's own 8-byte length and type.
 */
function readGlbJson(glb) {
  const chunkType = glb.subarray(16, 20).toString('ascii')
  if (chunkType !== 'JSON') {
    throw new Error(
      `Not a GLB, or its first chunk is ${chunkType} rather than JSON`,
    )
  }
  return JSON.parse(
    glb.subarray(20, 20 + glb.readUInt32LE(12)).toString('utf8'),
  )
}

/**
 * Refuses to silently drop a texture transform that would actually change how the atlas is sampled.
 *
 * Every Kenney GLB declares `KHR_texture_transform`, and glTF-Transform says so on every read
 * ("Missing optional extension"). Dropping it is safe **today only because the payload is empty** —
 * every model carries `{ "texCoord": 0 }`, which restates the default and means nothing. If a future
 * pack ships a real offset, scale or rotation, the repack would quietly change the model's UVs and
 * the mesh would sample the wrong patch of the atlas — exactly the class of silent asset failure this
 * script exists to prevent. So: assert it is a no-op, and fail loudly if it ever is not.
 */
function assertTextureTransformsAreNoOps(kitId, glbName, glb) {
  const json = readGlbJson(glb)
  if (!(json.extensionsUsed ?? []).includes('KHR_texture_transform')) return

  for (const material of json.materials ?? []) {
    // Every texture slot, not just the base colour one: a future kit could carry the transform on a
    // normal or emissive map, and checking one slot would let exactly that case through.
    const slots = [
      ...Object.values(material.pbrMetallicRoughness ?? {}),
      material.normalTexture,
      material.occlusionTexture,
      material.emissiveTexture,
    ]

    for (const slot of slots) {
      const transform = slot?.extensions?.KHR_texture_transform
      if (!transform) continue

      const meaningful = Object.entries(transform).filter(
        ([key, value]) =>
          (key === 'offset' && (value[0] !== 0 || value[1] !== 0)) ||
          (key === 'scale' && (value[0] !== 1 || value[1] !== 1)) ||
          (key === 'rotation' && value !== 0) ||
          // A texCoord other than 0 selects a second UV set, which is just as lost as a transform.
          (key === 'texCoord' && value !== 0),
      )

      if (meaningful.length > 0) {
        throw new Error(
          `${kitId}: ${glbName} carries a real KHR_texture_transform (${JSON.stringify(
            Object.fromEntries(meaningful),
          )}). This pipeline drops the extension, which would silently move the model's UVs — ` +
            `register KHRTextureTransform on the NodeIO before shipping this asset.`,
        )
      }
    }
  }
}

/* -------------------------------------------------------------------------- */
/*  3. Convert the airliner OBJ                                              */
/* -------------------------------------------------------------------------- */

/**
 * A deliberately small OBJ reader: positions, optional normals, and triangulated faces.
 *
 * **This file has no `vn` records at all** — 350 `v`, zero `vn`, and faces written as bare vertex
 * indices (`f 259 101 1 85`), some of them quads. An earlier version of this function defaulted the
 * missing normal to (0, 1, 0), which shipped an aircraft whose every vertex faced the sky: no form
 * under any lit material, and a black underside. So when the file carries no normals, faces are
 * emitted **unindexed with a geometric normal per triangle** — flat shading, which is the correct
 * read for a faceted low-poly model and matches the Kenney set it flies alongside.
 *
 * Vertices are only shared when the file supplies its own normals, since sharing a vertex between
 * two faces is exactly what would average their normals and round off the facets.
 */
function parseObj(text) {
  const positions = []
  const normals = []
  const faces = []

  // OBJ indices are 1-based, and negative means relative to the end of the list so far.
  const resolveIndex = (raw, list) => {
    const index = Number(raw)
    return index < 0 ? list.length + index : index - 1
  }

  for (const line of text.split(/\r?\n/)) {
    const [keyword, ...rest] = line.trim().split(/\s+/)

    if (keyword === 'v') positions.push(rest.slice(0, 3).map(Number))
    else if (keyword === 'vn') normals.push(rest.slice(0, 3).map(Number))
    else if (keyword === 'f') {
      const corners = rest.map((token) => {
        const [v, , vn] = token.split('/')
        return {
          position: resolveIndex(v, positions),
          normal: vn ? resolveIndex(vn, normals) : null,
        }
      })

      // Fan-triangulate: this mesh is quads in places.
      for (let i = 1; i < corners.length - 1; i++) {
        faces.push([corners[0], corners[i], corners[i + 1]])
      }
    }
  }

  const outPositions = []
  const outNormals = []

  const subtract = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
  const cross = (a, b) => [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ]
  const normalise = (v) => {
    const length = Math.hypot(...v) || 1
    return [v[0] / length, v[1] / length, v[2] / length]
  }

  for (const face of faces) {
    const points = face.map((corner) => {
      const position = positions[corner.position]
      if (!position) {
        throw new Error(
          `OBJ references vertex ${corner.position + 1}, which does not exist`,
        )
      }
      return position
    })

    // Counter-clockwise winding is the OBJ convention, so this points outwards.
    const geometric = normalise(
      cross(subtract(points[1], points[0]), subtract(points[2], points[0])),
    )

    for (const [corner, point] of face.map((corner, i) => [
      corner,
      points[i],
    ])) {
      outPositions.push(...point)
      outNormals.push(
        ...(corner.normal !== null
          ? (normals[corner.normal] ?? geometric)
          : geometric),
      )
    }
  }

  return {
    positions: new Float32Array(outPositions),
    normals: new Float32Array(outNormals),
    triangles: faces.length,
  }
}

function buildAirlinerDocument({ positions, normals }) {
  const document = new Document()
  document.getRoot().getAsset().generator = 'onward scripts/models/build.mjs'

  const buffer = document.createBuffer()

  const material = document
    .createMaterial('airliner')
    .setBaseColorFactor([...AIRLINER_SRGB.map(srgbToLinear), 1])
    // Matte on purpose: the Diorama is flat colour, and every Kenney model in the set is unlit-ish.
    .setMetallicFactor(0)
    .setRoughnessFactor(1)
    // The mercator frame is mirrored (see model-matrix.ts), which flips winding. Two-sided costs
    // nothing at 696 triangles and removes a whole class of "half the plane vanished".
    .setDoubleSided(true)

  const primitive = document
    .createPrimitive()
    .setMaterial(material)
    .setAttribute(
      'POSITION',
      document
        .createAccessor()
        .setType('VEC3')
        .setArray(positions)
        .setBuffer(buffer),
    )
    .setAttribute(
      'NORMAL',
      document
        .createAccessor()
        .setType('VEC3')
        .setArray(normals)
        .setBuffer(buffer),
    )
  // No index buffer on purpose: every triangle owns its three vertices so that each keeps its own
  // face normal. Indexing would share vertices between faces and smooth the facets away, and at 696
  // triangles the saving would be a few kB against a model that is already the lightest in the set.

  const node = document
    .createNode('airliner')
    .setMesh(document.createMesh('airliner').addPrimitive(primitive))

  document
    .getRoot()
    .setDefaultScene(document.createScene('airliner').addChild(node))

  return { document, node }
}

/** Quaternion for a rotation about +Y, in glTF's [x, y, z, w] order. */
const yawQuaternion = (radians) => [
  0,
  Math.sin(radians / 2),
  0,
  Math.cos(radians / 2),
]

/**
 * OBJ → GLB, with the model's nose brought onto the convention the Kenney vehicles already follow:
 * +Z forward, +Y up.
 *
 * Which way the nose points is **declared** in sources.json, not inferred. Inferring it is what went
 * wrong the first time: this aircraft's widest horizontal extent is its 20.63-unit wingspan, not its
 * 16-unit fuselage, so "longest axis is the length" rotated an already-correct model 90° out of true.
 * The declaration was verified against docs/models/inspect-airliner.png.
 */
async function convertAirliner(single, asset) {
  const objPath = join(scratch, single.file)
  if (!(await exists(objPath))) {
    throw new Error(
      `${single.file} is not in ${scratch}. Run: node scripts/models/fetch.mjs`,
    )
  }

  const { document, node } = buildAirlinerDocument(
    parseObj(await readFile(objPath, 'utf8')),
  )

  // Baked into the file rather than left in the table: this is the one asset Onward authors, so it
  // ships already facing the right way instead of carrying a correction for the reader to remember.
  const yaw = yawToFaceZ(asset.forward ?? '+z')
  if (yaw !== 0) node.setRotation(yawQuaternion(yaw))

  return { document, orientation: { declaredForward: asset.forward, yaw } }
}

/**
 * Cross-checks a declared `forward` against the model itself, and warns on a mismatch.
 *
 * Two witnesses, in order of trust:
 *
 * 1. **The artist's node names** — `wheel-front-right`, `wheels-back`. Authoritative when present,
 *    because it is the author stating which way the thing faces.
 * 2. **The taper heuristic** — a fallback for the single-node watercraft, and measurably unreliable:
 *    it read the van's cargo box as its nose and called the ferry's finer bow its stern. It never
 *    decides anything; it only asks a human to go and look.
 *
 * Either way the declaration in sources.json wins. This is a tripwire for a newly added asset, not
 * an inference step.
 */
function crossCheckForward(asset, document) {
  if (asset.role !== 'vehicle' || !asset.forward) return null

  const named = forwardFromNodeNames(document)
  const taper = measureFrontEnd(document, 'z')
  const witness = named
    ? { source: 'node names', reads: named.forward }
    : { source: 'taper heuristic', reads: taper.frontIsPositive ? '+z' : '-z' }

  const agrees = witness.reads === asset.forward

  if (!agrees) {
    console.log(
      `  ! ${asset.id}: sources.json declares forward ${asset.forward}, the ${witness.source} ` +
        `reads ${witness.reads}. The declaration wins — regenerate ` +
        `docs/models/inspect-${asset.id}.png and look, if this asset is new.`,
    )
  } else if (named) {
    console.log(
      `    forward ${asset.forward} confirmed by node names ` +
        `(front z ${named.frontZ.toFixed(2)}, back z ${named.backZ.toFixed(2)})`,
    )
  }

  return { ...taper, witness, agrees }
}

/* -------------------------------------------------------------------------- */
/*  4. Write, measure, emit                                                   */
/* -------------------------------------------------------------------------- */

// Clear only what this script generates. The directory also holds a hand-written test, so removing
// it wholesale would delete the very guard that stops the repack silently regressing.
await mkdir(OUT_DIR, { recursive: true })
for (const stale of await readdir(OUT_DIR)) {
  if (
    stale.endsWith('.glb') ||
    stale === 'model-assets.ts' ||
    stale === 'index.ts'
  ) {
    await rm(join(OUT_DIR, stale))
  }
}

const built = []

for (const asset of sources.assets) {
  const outPath = join(OUT_DIR, `${asset.id}.glb`)
  let document
  let provenance
  let orientation = null

  if (asset.kit) {
    const kit = sources.kits.find((candidate) => candidate.id === asset.kit)
    const { document: read, declared } = await readWithAtlas(
      asset.kit,
      asset.glb,
    )
    document = read
    provenance = {
      source: kit.page,
      licence: kit.licence,
      author: kit.author,
      from: asset.glb,
    }
    console.log(
      `· ${asset.id}: embedded ${declared.join(', ') || '(no external image)'}`,
    )
  } else {
    const single = sources.singles.find(
      (candidate) => candidate.id === asset.single,
    )
    const converted = await convertAirliner(single, asset)
    document = converted.document
    orientation = converted.orientation
    provenance = {
      source: single.page,
      licence: single.licence,
      author: single.author,
      from: single.file,
    }
    console.log(
      `· ${asset.id}: converted from OBJ · nose declared ${orientation.declaredForward}` +
        `${orientation.yaw === 0 ? ' (already facing +z, no rotation)' : ` → rotated ${((orientation.yaw * 180) / Math.PI).toFixed(0)}° onto +z`}`,
    )
  }

  await io.write(outPath, document)

  // The whole point of the ticket: prove the atlas travelled with the model.
  const bytes = await readFile(outPath)
  const stillExternal = declaredImageURIs(bytes)
  if (stillExternal.length > 0) {
    throw new Error(
      `${asset.id}.glb still declares external images: ${stillExternal.join(', ')}`,
    )
  }

  // Measure the written file, not the in-memory Document — what ships is what gets scaled.
  const shipped = await io.read(outPath)
  const bounds = measureBounds(shipped)
  const axis = { x: 0, y: 1, z: 2 }[asset.target.axis]
  const extent = bounds.size[axis]
  if (!(extent > 0))
    throw new Error(`${asset.id}: zero extent on ${asset.target.axis}`)

  const scale = asset.target.metres / extent
  const ends = crossCheckForward(asset, shipped)

  built.push({
    ...asset,
    provenance,
    orientation,
    bytes: bytes.length,
    triangles: shipped
      .getRoot()
      .listMeshes()
      .flatMap((mesh) => mesh.listPrimitives())
      .reduce(
        (total, primitive) =>
          total +
          (primitive.getIndices()?.getCount() ??
            primitive.getAttribute('POSITION').getCount()) /
            3,
        0,
      ),
    // Recorded rather than assumed, because #7 has to light these and #11 has to restyle them.
    materials: shipped
      .getRoot()
      .listMaterials()
      .map((material) => ({
        doubleSided: material.getDoubleSided(),
        metallic: material.getMetallicFactor(),
        textured: material.getBaseColorTexture() !== null,
      })),
    sourceSize: bounds.size.map((value) => round(value, 3)),
    scale: round(scale),
    // The real size the solved scale produces, so the table can be read without a calculator.
    readsAsM: bounds.size.map((value) => round(value * scale, 2)),
    // Lifts a model whose origin sits inside the mesh up onto the ground, in metres.
    yOffset: round(-bounds.min[1] * scale, 4),
    // Every asset in the set faces +Z — Kenney's own convention, and the one the airliner was
    // rotated to match — so this is 0 throughout today. It stays in the table because the next
    // asset added may not, and because #8 needs somewhere to hang a heading.
    yaw: asset.single ? 0 : round(yawToFaceZ(asset.forward ?? '+z'), 6),
    ends,
  })
}

await writeFile(
  join(scratch, 'measurements.json'),
  JSON.stringify(built, null, 2) + '\n',
)

/* -------------------------------------------------------------------------- */
/*  Emit the table and the licence record                                     */
/* -------------------------------------------------------------------------- */

const tsLiteral = (value) => JSON.stringify(value)

/**
 * Facts about the shipped materials, stated only when they hold for the whole set.
 *
 * These are the questions the next ticket asks first — do I need lights, will half the mesh vanish in
 * the mirrored mercator frame, is there a texture to colour-manage — so they are answered here, from
 * measurement, instead of being rediscovered per ticket.
 */
const materialFacts = (() => {
  const all = built.flatMap((asset) => asset.materials)
  const every = (predicate) => all.length > 0 && all.every(predicate)

  const facts = []

  if (every((material) => material.doubleSided)) {
    facts.push(
      'Every material is doubleSided already, so the mirrored mercator frame cannot cull half a',
      'model away — the trap proof-triangle.ts guards against with side: DoubleSide.',
    )
  }

  if (every((material) => material.metallic === 0)) {
    facts.push(
      'Every material is metallicFactor 0 — matte on arrival, no specular to fight, which is the',
      'Diorama register #11 will build on.',
    )
  }

  const textured = all.filter((material) => material.textured).length
  facts.push(
    `${textured} of ${all.length} materials carry a baseColorTexture, all of them the kit atlas now`,
    'embedded in the GLB. The airliner is the untextured one, so its colour lives in the material',
    'and #11 can set it outright. A loader must mark the atlas as sRGB.',
  )

  facts.push(
    "These are PBR metallic-roughness materials, so they need a light in the scene. The scaffold's",
    'proof triangle uses MeshBasicMaterial and adds none — whoever draws the first model adds the',
    'lighting with it (#7).',
  )

  return facts
})()

const tableEntries = built
  .map((asset) => {
    const [width, height, length] = asset.readsAsM

    const notes = [
      asset.note,
      '',
      `Solved on ${asset.target.axis.toUpperCase()} at ${asset.target.metres} m, which puts it at ` +
        `${length} m long, ${width} m wide, ${height} m tall.`,
      `${asset.triangles} tris · ${(asset.bytes / 1024).toFixed(1)} kB · source box ` +
        `${asset.sourceSize.join(' × ')} units.`,
      asset.ends?.witness && !asset.ends.agrees
        ? `Faces +Z, declared and verified by eye plus a station profile — the ${asset.ends.witness.source} ` +
          `reads ${asset.ends.witness.reads} on this model and is wrong.`
        : null,
      asset.ends?.witness &&
      asset.ends.agrees &&
      asset.ends.witness.source === 'node names'
        ? "Faces +Z, confirmed by Kenney's own node names."
        : null,
    ].filter((note) => note !== null)

    return `  /**
${notes.map((note) => (note ? `   * ${note}` : '   *')).join('\n')}
   */
  ${asset.id.replace(/-/g, '_')}: {
    id: ${tsLiteral(asset.id)},
    file: ${tsLiteral(`${asset.id}.glb`)},
${asset.mode ? `    mode: ${tsLiteral(asset.mode)},\n` : ''}    role: ${tsLiteral(asset.role)},
    scale: ${asset.scale},
    yOffset: ${asset.yOffset},
    yaw: ${asset.yaw},
    readsAtM: ${asset.target.metres},
    readsAtAxis: ${tsLiteral(asset.target.axis)},
    sizeM: [${asset.readsAsM.join(', ')}],
    licence: ${tsLiteral(asset.provenance.licence)},
    author: ${tsLiteral(asset.provenance.author)},
    source: ${tsLiteral(asset.provenance.source)},
  },`
  })
  .join('\n')

await writeFile(
  join(OUT_DIR, 'model-assets.ts'),
  `// Generated by scripts/models/build.mjs — edit sources.json and re-run, not this file.
//
// Every number here was measured from the shipped GLB. Source units are incoherent across the four
// kits and even inside one of them (a suburban house is 0.74 units tall; a van is 2.75 units long),
// so nothing may be scaled 1:1 and no per-kit constant would do.
//
// The model matrix maps one unit to one metre (src/map/model-matrix.ts), so:
//
//   metres = source units × scale
//
// Scale is solved on **height** for every Kenney asset, and that is the load-bearing decision here.
// Kenney's vehicles are faithful in cross-section and compressed in length — a double-deck carriage
// is 2.5 units long on a 1.92-unit body, where a real one is 26 m long on a 3 m body. Solving for a
// true 26 m length gives a carriage 20 m TALL and 4.3x too fat, which is absurd on its own terms;
// solving for a true height leaves each piece stubby, which is the toy register the Diorama already
// committed to. Train length comes from coupling the a/b/c segments, which is what they are for. The
// airliner is the exception and is solved on wingspan.
//
// #17 argued this as "towering over an 8 m guesthouse", and #21 retired that guesthouse for a 40 m
// hotel tower — so a 20 m carriage would no longer tower over the Stay Marker at all. The conclusion
// does not depend on it: a carriage inflated 4.3x in cross-section is wrong whatever it stands next
// to. Stated without the comparison now, so the argument cannot rot again when the building changes.
//
// \`readsAtM\` / \`readsAtAxis\` record which size was solved for. A Vehicle crossing a continent will
// want exaggerating well past life size to stay visible — multiply there (#8), and leave this table
// stating the truth.
//
// What the files already are, measured from the shipped GLBs rather than assumed — all of it matters
// to whoever draws them:
//
${materialFacts.map((line) => `// ${line}`).join('\n')}

export type ModelRole = 'vehicle' | 'stay'

export type ModelAsset = {
  id: string
  /** Filename inside this directory. The URL comes from index.ts, which lets Vite fingerprint it. */
  file: string
  /** The Mode this Vehicle depicts. Absent on a Stay Marker. */
  mode?: string
  role: ModelRole
  /** Metres per source unit. */
  scale: number
  /** Metres to lift the model so it stands on the ground rather than sinking into it. */
  yOffset: number
  /**
   * Radians about Y to bring the model's nose onto +Z. Zero for every asset in the set today —
   * verified by eye, not assumed — and kept because the next asset may need it.
   */
  yaw: number
  /** The real-world size \`scale\` was solved for. */
  readsAtM: number
  /** The axis \`readsAtM\` was measured on: height for the Kenney set, wingspan for the airliner. */
  readsAtAxis: 'x' | 'y' | 'z'
  /**
   * The model's real size once scaled, as [x, y, z] metres — width, height, length.
   *
   * Here because #8 needs it: a train is drawn by coupling the a/b/c segments, and the length of each
   * is the spacing between them. Deriving it from a GLB at runtime would mean parsing accessor bounds
   * in the browser to recover a number already measured at build time.
   */
  sizeM: readonly [x: number, y: number, z: number]
  licence: string
  author: string
  source: string
}

export const MODEL_ASSETS = {
${tableEntries}
} as const satisfies Record<string, ModelAsset>

export type ModelAssetKey = keyof typeof MODEL_ASSETS

export const modelAssets = (): ModelAsset[] => Object.values(MODEL_ASSETS)
`,
)

await writeFile(
  join(OUT_DIR, 'index.ts'),
  `// Generated by scripts/models/build.mjs — edit sources.json and re-run, not this file.
//
// The GLBs are imported with \`?url\` rather than read from a public/ directory, for the reason #6
// learned the hard way with MapLibre's worker: a URL Vite can see is a URL that survives the
// production build. These imports make the bundler fingerprint each model and hand back the final
// path, in dev and on Vercel alike.

${built
  .map(
    (asset) =>
      `import ${asset.id.replace(/-/g, '_')}Url from './${asset.id}.glb?url'`,
  )
  .join('\n')}

import { MODEL_ASSETS, type ModelAssetKey } from './model-assets'

export * from './model-assets'

export const MODEL_URLS: Record<ModelAssetKey, string> = {
${built.map((asset) => `  ${asset.id.replace(/-/g, '_')}: ${asset.id.replace(/-/g, '_')}Url,`).join('\n')}
}

/** The URL to fetch a model from, keyed the same way as the table. */
export const modelUrl = (key: ModelAssetKey): string => MODEL_URLS[key]

export const modelAsset = (key: ModelAssetKey) => MODEL_ASSETS[key]
`,
)

const totalBytes = built.reduce((total, asset) => total + asset.bytes, 0)

await mkdir(repoPath('docs/licences'), { recursive: true })
await writeFile(
  repoPath('docs/licences/models.md'),
  `# Model licences

Generated by \`scripts/models/build.mjs\`. Every 3D asset Onward ships, the licence it arrives
under, and where it came from — so the question "can this be in a paid product" is answerable
without redoing the research in [#4](https://github.com/adrianpetersson/onward/issues/4).

**Every asset below is CC0 1.0: commercial use permitted, attribution not required, and a waiver
rather than a revocable licence, so there is no per-seat or field-of-use limit to breach later.**
Onward therefore ships **no attribution surface for models**. (It does credit its map providers —
that is separate, and lives in the map's own attribution control.)

One carve-out to carry forward: CC0 waives copyright, never trademark. No asset here depicts a
named real-world livery or airframe, and none should be swapped for one that does.

| Asset | File | Author | Licence | Source | Bytes |
| --- | --- | --- | --- | --- | --- |
${built
  .map(
    (asset) =>
      `| ${asset.id} | \`${asset.id}.glb\` | ${asset.provenance.author} | ${asset.provenance.licence} | <${asset.provenance.source}> | ${asset.bytes.toLocaleString('en-GB')} |`,
  )
  .join('\n')}

Shipped total: **${totalBytes.toLocaleString('en-GB')} bytes** (${(totalBytes / 1e6).toFixed(2)} MB) across
${built.length} files, uncompressed — against ${(sources.kits.reduce((sum, kit) => sum + kit.bytes, 0) / 1e6).toFixed(2)} MB of archives that stay out of the repo. Both
figures are SI, so they are comparable.

That is a little above the ~1.21 MB [#4](https://github.com/adrianpetersson/onward/issues/4) costed, and the difference is all airliner: it ships
unindexed so that every triangle keeps its own face normal, since the source OBJ supplies no normals
at all. Roughly 32 kB for a model that would otherwise have no shading.

## Provenance

- The four Kenney kits state CC0 on their pack pages and again in each archive's \`License.txt\`:
  _"You can use this content for personal, educational, and commercial purposes… Support by
  crediting 'Kenney' or 'www.kenney.nl' (this is not a requirement)"_. Train Kit adds a courtesy
  credit to Guus Vermeulen and Tony Schaer above its CC0 line; it does not condition it.
- The airliner is OpenGameArt submission _Funky aircraft_ by Savino, labelled CC0 by its uploader,
  converted here from \`low.obj\` (696 triangles, untextured). OpenGameArt licences are
  self-declared with no verification step — a lower-assurance provenance than Kenney's, recorded
  rather than resolved in our favour.

## Deliberately not shipped

${sources.notTaken.map((line) => `- ${line}`).join('\n')}
`,
)

// Generated files are checked in, so they have to satisfy the same `pnpm check` as hand-written
// ones. Formatting here rather than leaving it to the developer keeps a re-run from showing up as a
// diff of nothing but quote marks.
await exec('pnpm', [
  'exec',
  'prettier',
  '--write',
  '--log-level',
  'warn',
  join(OUT_DIR, 'model-assets.ts'),
  join(OUT_DIR, 'index.ts'),
  repoPath('docs/licences/models.md'),
])

console.log(
  `\n${built.length} models → src/map/models (${(totalBytes / 1024).toFixed(1)} kB)`,
)
console.table(
  built.map((asset) => ({
    asset: asset.id,
    tris: asset.triangles,
    kB: Number((asset.bytes / 1024).toFixed(1)),
    'source box': asset.sourceSize.join(' × '),
    'solved on': `${asset.target.axis} = ${asset.target.metres}m`,
    'L×W×H m': `${asset.readsAsM[2]} × ${asset.readsAsM[0]} × ${asset.readsAsM[1]}`,
    scale: asset.scale,
    yaw: asset.yaw,
  })),
)
