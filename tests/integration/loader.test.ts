import { describe, expect, it } from 'vitest'
import { MinecraftFolder, Version } from '@xmcl/core'
import { installInstance } from '@main/core/minecraft/install'
import { JavaService } from '@main/core/minecraft/java'
import { createInstallRuntimeFactory } from '@main/core/minecraft/runtime'
import { VersionCatalog } from '@main/core/minecraft/versions'
import { listLoaderVersions } from '@main/core/minecraft/loaders'
import type { InstanceRecord } from '@main/core/instances/store'
import type { LoaderType } from '@shared/types'
import { consoleSink } from '@main/core/log'

/**
 * Installs a mod loader on top of an already-installed vanilla version. Uses the
 * game root produced by tests/integration/install.test.ts (KAKERA_KEEP_GAME=1).
 */
const enabled = process.env.KAKERA_NET_TESTS === '1'
const gameRoot = process.env.KAKERA_GAME_ROOT ?? ''
const mcVersion = process.env.KAKERA_VERSION_ID ?? ''

function instance(loader: LoaderType, loaderVersion: string | null): InstanceRecord {
  return {
    schemaVersion: 1,
    id: `loader-${loader}`,
    name: loader,
    createdAt: new Date().toISOString(),
    lastPlayedAt: null,
    mcVersion,
    loader,
    loaderVersion,
    resolvedVersionId: null,
    javaPath: null,
    memoryMb: null,
    jvmArgs: []
  }
}

describe.skipIf(!enabled || !gameRoot || !mcVersion)('real loader install', () => {
  it('reports which loaders publish a build for this version', async () => {
    for (const loader of ['fabric', 'quilt', 'forge', 'neoforge'] as LoaderType[]) {
      const versions = await listLoaderVersions(mcVersion, loader).catch(() => [])
      console.log(`  ${loader}: ${versions.length} builds${versions[0] ? ` (newest ${versions[0].version})` : ''}`)
    }
    expect(true).toBe(true)
  })

  it('installs Fabric on top of the installed vanilla version', async () => {
    const versions = await listLoaderVersions(mcVersion, 'fabric')
    expect(versions.length).toBeGreaterThan(0)
    const loaderVersion = versions[0]?.version ?? ''

    const java = new JavaService(gameRoot, consoleSink, createInstallRuntimeFactory({ concurrency: () => 8 }))
    const result = await installInstance({
      gameRoot,
      instance: instance('fabric', loaderVersion),
      catalog: new VersionCatalog(),
      java,
      createRuntime: createInstallRuntimeFactory({ concurrency: () => 8 }),
      log: consoleSink,
      signal: new AbortController().signal,
      task: {
        id: 'loader',
        signal: new AbortController().signal,
        setLabel: () => undefined,
        setProgress: () => undefined,
        clearProgress: () => undefined,
        succeed: () => undefined,
        fail: () => undefined,
        markCanceled: () => undefined,
        canceled: false,
        state: 'running'
      }
    })

    console.log(`  installed: ${result.resolvedVersionId}`)
    expect(result.resolvedVersionId).toContain('fabric')

    const minecraft = MinecraftFolder.from(gameRoot)
    const version = await Version.parse(minecraft, result.resolvedVersionId)
    expect(version.mainClass.toLowerCase()).toContain('fabric')
    expect(version.libraries.length).toBeGreaterThan(0)
  }, 300_000)

  it('installs NeoForge (installer processors) on top of vanilla', async () => {
    const versions = await listLoaderVersions(mcVersion, 'neoforge')
    expect(versions.length).toBeGreaterThan(0)
    const loaderVersion = versions[0]?.version ?? ''

    const java = new JavaService(gameRoot, consoleSink, createInstallRuntimeFactory({ concurrency: () => 8 }))
    const result = await installInstance({
      gameRoot,
      instance: instance('neoforge', loaderVersion),
      catalog: new VersionCatalog(),
      java,
      createRuntime: createInstallRuntimeFactory({ concurrency: () => 8 }),
      log: consoleSink,
      signal: new AbortController().signal,
      task: {
        id: 'neoforge',
        signal: new AbortController().signal,
        setLabel: () => undefined,
        setProgress: () => undefined,
        clearProgress: () => undefined,
        succeed: () => undefined,
        fail: () => undefined,
        markCanceled: () => undefined,
        canceled: false,
        state: 'running'
      }
    })

    console.log(`  installed: ${result.resolvedVersionId}`)
    expect(result.resolvedVersionId).toContain('neoforge')

    const minecraft = MinecraftFolder.from(gameRoot)
    const version = await Version.parse(minecraft, result.resolvedVersionId)
    console.log(`  main class: ${version.mainClass}`)
    expect(version.libraries.some((library) => library.name.includes('neoforged'))).toBe(true)
  }, 900_000)
})
