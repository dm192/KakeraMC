/**
 * Upstream publish defects in the `@xmcl/*` packages break a plain
 * `npm install` for consumers. This post-install step repairs the installed
 * manifests and adds one missing module file. Every change is idempotent and
 * becomes a no-op once upstream publishes fixed packages.
 *
 * 1. `@xmcl/unzip@2.2.0` ships `"main": "./index.ts"`, so Node cannot load it.
 * 2. `@xmcl/core@2.16.x` has no `exports` map, so the subpath
 *    `@xmcl/core/utils` required by `@xmcl/installer` cannot resolve.
 * 3. `@xmcl/core@2.16.x` also omits `dist/utils.js` even though it ships
 *    `dist/utils.d.ts`; the four helpers are re-implemented here with the
 *    documented semantics so the installer's file validation keeps working.
 */
import { existsSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const root = process.cwd()
const repairs = []

const CORE_UTILS_BODY = `
const { createHash } = require('node:crypto')
const { createReadStream } = require('node:fs')
const { access } = require('node:fs/promises')

async function exists(file) {
  try {
    await access(file)
    return true
  } catch {
    return false
  }
}

async function checksum(target, algorithm) {
  return await new Promise((resolve, reject) => {
    const hash = createHash(algorithm)
    createReadStream(target)
      .on('error', reject)
      .on('data', (chunk) => hash.update(chunk))
      .on('end', () => resolve(hash.digest('hex')))
  })
}

async function validateSha1(target, hash, strict) {
  if (hash === undefined) return strict ? false : exists(target)
  if (!(await exists(target))) return false
  try {
    return (await checksum(target, 'sha1')) === hash
  } catch {
    return false
  }
}

function isNotNull(value) {
  return value !== undefined && value !== null
}

module.exports = { exists, validateSha1, checksum, isNotNull }
`

const CORE_UTILS_ESM = `
import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { access } from 'node:fs/promises'

export async function exists(file) {
  try {
    await access(file)
    return true
  } catch {
    return false
  }
}

export async function checksum(target, algorithm) {
  return await new Promise((resolve, reject) => {
    const hash = createHash(algorithm)
    createReadStream(target)
      .on('error', reject)
      .on('data', (chunk) => hash.update(chunk))
      .on('end', () => resolve(hash.digest('hex')))
  })
}

export async function validateSha1(target, hash, strict) {
  if (hash === undefined) return strict ? false : exists(target)
  if (!(await exists(target))) return false
  try {
    return (await checksum(target, 'sha1')) === hash
  } catch {
    return false
  }
}

export function isNotNull(value) {
  return value !== undefined && value !== null
}
`

async function patchManifest(name, mutate) {
  const manifestPath = join(root, 'node_modules', ...name.split('/'), 'package.json')
  if (!existsSync(manifestPath)) return null
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
  if (mutate(manifest) === false) return null
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
  repairs.push(`${name}@${manifest.version}`)
  return manifestPath
}

await patchManifest('@xmcl/unzip', (manifest) => {
  if (typeof manifest.main !== 'string' || !manifest.main.endsWith('.ts')) return false
  manifest.main = './dist/index.js'
  manifest.module = './dist/index.mjs'
  manifest.types = './dist/index.d.ts'
  manifest.exports = {
    '.': {
      types: './dist/index.d.ts',
      import: './dist/index.mjs',
      require: './dist/index.js'
    },
    './package.json': './package.json'
  }
  return true
})

const corePatched = await patchManifest('@xmcl/core', (manifest) => {
  if (manifest.exports?.['./utils']) return false
  manifest.exports = {
    ...(manifest.exports ?? {}),
    '.': {
      types: './dist/index.d.ts',
      import: './dist/index.mjs',
      require: './dist/index.js'
    },
    './utils': {
      types: './dist/utils.d.ts',
      import: './dist/utils.mjs',
      require: './dist/utils.js'
    },
    './package.json': './package.json'
  }
  return true
})

const coreDist = join(root, 'node_modules', '@xmcl', 'core', 'dist')
if (existsSync(coreDist)) {
  const shimJs = join(coreDist, 'utils.js')
  const shimMjs = join(coreDist, 'utils.mjs')
  if (!existsSync(shimJs)) {
    await writeFile(shimJs, CORE_UTILS_BODY, 'utf8')
    repairs.push('@xmcl/core dist/utils.js shim')
  }
  if (!existsSync(shimMjs)) {
    await writeFile(shimMjs, CORE_UTILS_ESM, 'utf8')
  }
}

if (repairs.length > 0) {
  console.log(`[postinstall] repaired ${repairs.join(', ')} (upstream publish defects)`)
}
if (corePatched) {
  // Manifest path is only interesting for debugging the repair itself.
  void corePatched
}
