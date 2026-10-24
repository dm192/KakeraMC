import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { join } from 'node:path'
import { MinecraftFolder, Version } from '@xmcl/core'
import {
  executeInstallManifest,
  resolveAssetMetadataInstallManifest,
  resolveAssetObjectInstallFiles,
  resolveFabricInstallManifest,
  resolveLibraryInstallFiles,
  resolveMinecraftJarInstallFile,
  resolveMinecraftVersionJsonInstallFile,
  resolveQuiltInstallManifest
} from '@xmcl/installer'
import type { InstallFile, InstallManifest } from '@xmcl/installer'
import { KakeraError } from '@shared/errors'
import type { VerifyIssue } from '@shared/types'
import { gamePaths } from '../paths'
import type { InstanceRecord } from '../instances/store'
import type { LogSink } from '../log'
import type { TaskHandle } from '../tasks/bus'
import type { InstallRuntimeFactory } from './runtime'
import type { JavaService } from './java'
import type { VersionCatalog } from './versions'
import { resolveForgePlan, resolveNeoForgePlan } from './loaders'

export interface InstallContext {
  gameRoot: string
  instance: InstanceRecord
  catalog: VersionCatalog
  java: JavaService
  createRuntime: InstallRuntimeFactory
  log: LogSink
  signal: AbortSignal
  task: TaskHandle
}

export interface InstallResultInfo {
  resolvedVersionId: string
  repaired: boolean
}

/** SHA-1 of a file, streamed so large jars never load into memory. */
export async function sha1File(path: string): Promise<string> {
  const hash = createHash('sha1')
  await new Promise<void>((resolve, reject) => {
    const stream = createReadStream(path)
    stream.on('data', (chunk) => hash.update(chunk))
    stream.on('end', () => resolve())
    stream.on('error', reject)
  })
  return hash.digest('hex')
}

function manifestOf(tasks: InstallManifest['tasks']): InstallManifest {
  return { schemaVersion: 1, tasks }
}

/**
 * Installs (or repairs) one instance: vanilla base files first, then the
 * configured mod loader on top. Progress phases are reported as i18n keys so
 * the renderer owns the wording.
 */
export async function installInstance(context: InstallContext): Promise<InstallResultInfo> {
  const { instance, gameRoot, task, signal } = context
  const minecraft = MinecraftFolder.from(gameRoot)
  const paths = gamePaths(gameRoot)
  const catalog = context.catalog

  task.setLabel('install.label.metadata')

  const versionInfo = await catalog.find(instance.mcVersion)
  const runtimeHandle = context.createRuntime({
    signal,
    task,
    labelKey: 'install.label.download',
    unit: 'bytes'
  })

  try {
    await installVanillaBase(context, minecraft, versionInfo, runtimeHandle.runtime)

    let resolvedVersionId = instance.mcVersion

    if (instance.loader === 'fabric' || instance.loader === 'quilt') {
      task.setLabel('install.label.loader', { loader: instance.loader })
      const loaderVersion = instance.loaderVersion
      if (!loaderVersion) {
        throw new KakeraError('loader.unavailable', `No ${instance.loader} loader version recorded for this instance`)
      }
      const resolved =
        instance.loader === 'fabric'
          ? await resolveFabricInstallManifest({
              minecraftVersion: instance.mcVersion,
              version: loaderVersion,
              minecraft,
              side: 'client'
            })
          : await resolveQuiltInstallManifest({
              minecraftVersion: instance.mcVersion,
              version: loaderVersion,
              minecraft,
              side: 'client'
            })
      await executeInstallManifest(resolved.plan, runtimeHandle.runtime, { signal })
      resolvedVersionId = resolved.version
    } else if (instance.loader === 'forge' || instance.loader === 'neoforge') {
      task.setLabel('install.label.loader', { loader: instance.loader })
      const javaRuntime = await context.java.ensure({
        component: null,
        requiredMajor: 17,
        manualPath: instance.javaPath,
        signal,
        task
      })
      const plan =
        instance.loader === 'forge'
          ? await resolveForgePlan({
              instance,
              minecraft,
              javaPath: javaRuntime.path,
              signal
            })
          : await resolveNeoForgePlan({
              instance,
              minecraft,
              javaPath: javaRuntime.path,
              signal
            })
      resolvedVersionId = await plan.run(runtimeHandle.runtime, signal)
    }

    if (!resolvedVersionId) {
      throw new KakeraError('install.failed', 'The installer did not report a version id')
    }

    const versionJson = join(paths.versions, resolvedVersionId, `${resolvedVersionId}.json`)
    context.log.write(`Installed ${instance.name} -> ${versionJson}`)
    return { resolvedVersionId, repaired: false }
  } finally {
    runtimeHandle.stop()
  }
}

async function installVanillaBase(
  context: InstallContext,
  minecraft: MinecraftFolder,
  versionInfo: { id: string; url: string },
  runtime: Parameters<typeof executeInstallManifest>[1]
): Promise<void> {
  const paths = gamePaths(context.gameRoot)

  const versionFile = resolveMinecraftVersionJsonInstallFile(versionInfo, minecraft)
  await executeInstallManifest(manifestOf([{ id: 'version-json', type: 'files', files: [versionFile] }]), runtime, {
    signal: context.signal
  })

  const version = await Version.parse(minecraft, versionInfo.id)

  const files: InstallFile[] = []
  files.push(...resolveLibraryInstallFiles(version.libraries, minecraft))
  const jar = resolveMinecraftJarInstallFile(version)
  if (jar) files.push(jar)

  // The asset index must exist before its object list can be resolved, so the
  // metadata manifest runs first and the object batch second.
  const assetMetadata = resolveAssetMetadataInstallManifest(version, minecraft)
  const firstWave: InstallManifest['tasks'] = [...assetMetadata.tasks]
  if (files.length > 0) {
    firstWave.push({ id: 'libraries-and-client', type: 'files', files })
  }

  context.log.write(`Installing vanilla ${versionInfo.id} (${firstWave.length} metadata tasks) into ${paths.root}`)
  await executeInstallManifest(manifestOf(firstWave), runtime, { signal: context.signal })

  const assetObjects = await resolveAssetObjectInstallFiles(version, minecraft)
  context.log.write(`Downloading ${assetObjects.length} asset objects`)
  if (assetObjects.length > 0) {
    await executeInstallManifest(
      manifestOf([{ id: 'asset-objects', type: 'files', files: assetObjects }]),
      runtime,
      { signal: context.signal }
    )
  }
}

/**
 * Verifies every file the installer would create for this version and reports
 * concrete missing/corrupted paths. Reinstalling is the repair path.
 */
export async function verifyInstance(
  context: Omit<InstallContext, 'task' | 'signal'>,
  resolvedVersionId: string
): Promise<{ issues: VerifyIssue[] }> {
  const minecraft = MinecraftFolder.from(context.gameRoot)
  let version
  try {
    version = await Version.parse(minecraft, resolvedVersionId)
  } catch (error) {
    throw new KakeraError('verify.failed', `Cannot read installed version ${resolvedVersionId}`, String(error))
  }

  const targets: Array<{ role: string; file: InstallFile }> = []
  const jar = resolveMinecraftJarInstallFile(version)
  if (jar) targets.push({ role: 'client-jar', file: jar })
  for (const file of resolveLibraryInstallFiles(version.libraries, minecraft)) {
    targets.push({ role: 'library', file })
  }
  const metadata = resolveAssetMetadataInstallManifest(version, minecraft)
  for (const task of metadata.tasks) {
    if (task.type === 'files') {
      for (const file of task.files) targets.push({ role: 'asset-index', file })
    }
  }
  for (const file of await resolveAssetObjectInstallFiles(version, minecraft)) {
    targets.push({ role: 'asset', file })
  }

  const issues: VerifyIssue[] = []
  for (const target of targets) {
    let size: number
    try {
      const info = await stat(target.file.path)
      if (!info.isFile()) throw new Error('not a file')
      size = info.size
    } catch {
      issues.push({ kind: 'missing', role: target.role, file: target.file.path })
      continue
    }
    if (target.file.checksum?.algorithm === 'sha1' && typeof target.file.size === 'number') {
      if (size !== target.file.size) {
        issues.push({ kind: 'corrupted', role: target.role, file: target.file.path })
        continue
      }
    }
    if (target.file.checksum?.algorithm === 'sha1') {
      const actual = await sha1File(target.file.path).catch(() => null)
      if (actual && actual.toLowerCase() !== target.file.checksum.value.toLowerCase()) {
        issues.push({ kind: 'corrupted', role: target.role, file: target.file.path })
      }
    }
    if (issues.length >= 50) break
  }

  return { issues }
}
