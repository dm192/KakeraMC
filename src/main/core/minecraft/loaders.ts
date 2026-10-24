import type { MinecraftFolder } from '@xmcl/core'
import {
  createModernForgeInstallWorkflow,
  executeInstallWorkflow,
  getForgeVersionList,
  getLoaderArtifactListFor,
  getQuiltLoaderVersionsByMinecraft,
  resolveForgeArtifactVersion,
  resolveForgeInstallerFile,
  resolveNeoForgedInstallerFile
} from '@xmcl/installer'
import type { InstallForgeOptions, InstallRuntime } from '@xmcl/installer'
import { KakeraError } from '@shared/errors'
import type { LoaderOption, LoaderType } from '@shared/types'
import type { InstanceRecord } from '../instances/store'

const NEOFORGE_VERSIONS_URL =
  'https://maven.neoforged.net/api/maven/versions/releases/net/neoforged/neoforge'

/** Comparable version ordering for loader builds (1.2.10 > 1.2.9). */
export function compareVersionsDesc(a: string, b: string): number {
  const pa = a.split(/[.-]/)
  const pb = b.split(/[.-]/)
  for (let i = 0; i < Math.max(pa.length, pb.length); i += 1) {
    const na = Number(pa[i] ?? 0)
    const nb = Number(pb[i] ?? 0)
    if (Number.isNaN(na) || Number.isNaN(nb)) {
      const cmp = (pa[i] ?? '').localeCompare(pb[i] ?? '')
      if (cmp !== 0) return -cmp
      continue
    }
    if (na !== nb) return nb - na
  }
  return 0
}

/** NeoForge versions are prefixed by the Minecraft minor line: 1.21.1 -> 21.1. */
export function neoforgePrefix(mcVersion: string): string {
  const parts = mcVersion.split('.')
  const normalized = parts[0] === '1' ? parts.slice(1) : parts
  return `${normalized[0] ?? '0'}.${normalized[1] ?? '0'}`
}

export interface LoaderInstallPlan {
  /** Runs every stage and resolves to the installed version id. */
  run(runtime: InstallRuntime, signal: AbortSignal): Promise<string>
}

export async function listLoaderVersions(mcVersion: string, loader: LoaderType): Promise<LoaderOption[]> {
  if (loader === 'vanilla') return []

  if (loader === 'fabric') {
    const artifacts = await getLoaderArtifactListFor(mcVersion)
    return artifacts
      .map((artifact) => ({ version: artifact.loader.version, stable: artifact.loader.stable }))
      .sort((a, b) => compareVersionsDesc(a.version, b.version))
  }

  if (loader === 'quilt') {
    const artifacts = await getQuiltLoaderVersionsByMinecraft({ minecraftVersion: mcVersion })
    return artifacts
      .map((artifact) => ({ version: artifact.loader.version, stable: artifact.loader.stable }))
      .sort((a, b) => compareVersionsDesc(a.version, b.version))
  }

  if (loader === 'forge') {
    const list = await getForgeVersionList({ minecraft: mcVersion })
    const versions = list.versions
      .filter((entry) => entry.mcversion === mcVersion)
      .map((entry) => ({ version: entry.version, stable: entry.type === 'recommended' || entry.type === 'latest' }))
    if (versions.length === 0) return []
    return versions.sort((a, b) => compareVersionsDesc(a.version, b.version))
  }

  return listNeoForgeVersions(mcVersion)
}

async function listNeoForgeVersions(mcVersion: string): Promise<LoaderOption[]> {
  const prefix = `${neoforgePrefix(mcVersion)}.`
  let versions: string[] = []
  try {
    const response = await fetch(NEOFORGE_VERSIONS_URL, { signal: AbortSignal.timeout(20_000) })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const payload = (await response.json()) as { versions?: string[] }
    versions = payload.versions ?? []
  } catch (error) {
    throw new KakeraError('net.failed', 'Unable to load the NeoForge version list', String(error))
  }
  return versions
    .filter((version) => version.startsWith(prefix))
    .map((version) => ({ version, stable: true }))
    .sort((a, b) => compareVersionsDesc(a.version, b.version))
}

export interface LoaderPlanInput {
  instance: InstanceRecord
  minecraft: MinecraftFolder
  javaPath: string
  signal: AbortSignal
}

export async function resolveForgePlan(input: LoaderPlanInput): Promise<LoaderInstallPlan> {
  const { instance, minecraft, javaPath } = input
  const forgeVersion = instance.loaderVersion
  if (!forgeVersion) {
    throw new KakeraError('loader.unavailable', 'This Forge instance has no loader version recorded')
  }
  if (isLegacyMinecraft(instance.mcVersion)) {
    throw new KakeraError(
      'loader.unsupported',
      `Forge installation is only supported for Minecraft 1.13 and newer (got ${instance.mcVersion})`
    )
  }

  const list = await getForgeVersionList({ minecraft: instance.mcVersion })
  const entry = list.versions.find((candidate) => candidate.version === forgeVersion)
  if (!entry) {
    throw new KakeraError('loader.unavailable', `Forge ${forgeVersion} is not published for ${instance.mcVersion}`)
  }

  const artifactVersion = resolveForgeArtifactVersion(instance.mcVersion, forgeVersion)
  const versionId = `${instance.mcVersion}-forge-${forgeVersion}`
  const options: InstallForgeOptions = {
    side: 'client',
    versionId,
    inheritsFrom: instance.mcVersion,
    signal: input.signal
  }
  const installer = resolveForgeInstallerFile(forgeVersion, entry.installer, minecraft, options).file

  const workflow = createModernForgeInstallWorkflow({
    id: `${instance.mcVersion}-forge`,
    minecraft,
    minecraftVersion: instance.mcVersion,
    installer,
    artifactVersion,
    java: javaPath,
    installOptions: options,
    side: 'client'
  })

  return {
    async run(runtime, signal) {
      const result = await executeInstallWorkflow(workflow, runtime, { signal })
      return result.version
    }
  }
}

export async function resolveNeoForgePlan(input: LoaderPlanInput): Promise<LoaderInstallPlan> {
  const { instance, minecraft, javaPath } = input
  const neoVersion = instance.loaderVersion
  if (!neoVersion) {
    throw new KakeraError('loader.unavailable', 'This NeoForge instance has no loader version recorded')
  }
  if (isLegacyMinecraft(instance.mcVersion)) {
    throw new KakeraError(
      'loader.unsupported',
      `NeoForge is only supported for Minecraft 1.20.2 and newer (got ${instance.mcVersion})`
    )
  }

  const versionId = `${instance.mcVersion}-neoforge-${neoVersion}`
  const options: InstallForgeOptions = {
    side: 'client',
    versionId,
    inheritsFrom: instance.mcVersion,
    signal: input.signal
  }
  const installer = (
    await resolveNeoForgedInstallerFile('neoforge', neoVersion, minecraft, options)
  ).file

  const workflow = createModernForgeInstallWorkflow({
    id: `${instance.mcVersion}-neoforge`,
    minecraft,
    minecraftVersion: instance.mcVersion,
    installer,
    artifactVersion: neoVersion,
    java: javaPath,
    installOptions: options,
    side: 'client'
  })

  return {
    async run(runtime, signal) {
      const result = await executeInstallWorkflow(workflow, runtime, { signal })
      return result.version
    }
  }
}

export function isLegacyMinecraft(mcVersion: string): boolean {
  // Only the classic 1.x line can be older than 1.13; the year-based 26.x+
  // scheme is always modern.
  if (!mcVersion.startsWith('1.')) return false
  const minor = Number(mcVersion.split('.')[1] ?? '0')
  return Number.isFinite(minor) && minor < 13
}
