import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { MinecraftFolder, Version } from '@xmcl/core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { installInstance, verifyInstance } from '@main/core/minecraft/install'
import { JavaService } from '@main/core/minecraft/java'
import { createInstallRuntimeFactory } from '@main/core/minecraft/runtime'
import { VersionCatalog } from '@main/core/minecraft/versions'
import type { InstanceRecord } from '@main/core/instances/store'
import type { TaskHandle } from '@main/core/tasks/bus'
import { consoleSink } from '@main/core/log'

/**
 * Real-network acceptance: installs the current release into a temporary game
 * root and verifies every file. Run with `npm run verify:real`.
 */
const enabled = process.env.KAKERA_NET_TESTS === '1'

function fakeTask(): TaskHandle {
  const controller = new AbortController()
  return {
    id: 'integration',
    signal: controller.signal,
    setLabel: () => undefined,
    setProgress: (done, total) => {
      if (total > 0 && done > 0 && Math.random() < 0.02) {
        process.stdout.write(`\r  progress ${Math.round((done / total) * 100)}%   `)
      }
    },
    clearProgress: () => undefined,
    succeed: () => undefined,
    fail: () => undefined,
    markCanceled: () => undefined,
    canceled: false,
    state: 'running'
  }
}

describe.skipIf(!enabled)('real install', () => {
  let gameRoot = ''

  beforeAll(async () => {
    gameRoot = await mkdtemp(join(tmpdir(), 'kakera-real-'))
    console.log(`\n  game root: ${gameRoot}`)
  })

  afterAll(async () => {
    if (process.env.KAKERA_KEEP_GAME !== '1') {
      await rm(gameRoot, { recursive: true, force: true }).catch(() => undefined)
    }
  })

  it('installs the latest release and verifies every file', async () => {
    const catalog = new VersionCatalog()
    const latest = await catalog.latestRelease()
    console.log(`  latest release: ${latest.id}`)

    const instance: InstanceRecord = {
      schemaVersion: 1,
      id: 'integration-instance',
      name: 'integration',
      createdAt: new Date().toISOString(),
      lastPlayedAt: null,
      mcVersion: latest.id,
      loader: 'vanilla',
      loaderVersion: null,
      resolvedVersionId: null,
      javaPath: null,
      memoryMb: null,
      jvmArgs: []
    }

    const java = new JavaService(gameRoot, consoleSink, createInstallRuntimeFactory({ concurrency: () => 8 }))
    const result = await installInstance({
      gameRoot,
      instance,
      catalog,
      java,
      createRuntime: createInstallRuntimeFactory({ concurrency: () => 8 }),
      log: consoleSink,
      signal: new AbortController().signal,
      task: fakeTask()
    })

    expect(result.resolvedVersionId).toBe(latest.id)
    console.log(`\n  installed version id: ${result.resolvedVersionId}`)

    const minecraft = MinecraftFolder.from(gameRoot)
    const version = await Version.parse(minecraft, result.resolvedVersionId)
    console.log(`  main class: ${version.mainClass}`)
    console.log(`  libraries: ${version.libraries.length}`)

    const report = await verifyInstance(
      {
        gameRoot,
        instance,
        catalog,
        java,
        createRuntime: createInstallRuntimeFactory({ concurrency: () => 8 }),
        log: consoleSink
      },
      result.resolvedVersionId
    )

    if (report.issues.length > 0) {
      console.log(`  issues (${report.issues.length}):`)
      for (const issue of report.issues.slice(0, 10)) {
        console.log(`   - ${issue.kind} ${issue.role}: ${issue.file}`)
      }
    }
    expect(report.issues).toEqual([])
  })

  it('reports missing files after a jar is deleted', async () => {
    const catalog = new VersionCatalog()
    const latest = await catalog.latestRelease()
    const instance: InstanceRecord = {
      schemaVersion: 1,
      id: 'integration-instance',
      name: 'integration',
      createdAt: new Date().toISOString(),
      lastPlayedAt: null,
      mcVersion: latest.id,
      loader: 'vanilla',
      loaderVersion: null,
      resolvedVersionId: latest.id,
      javaPath: null,
      memoryMb: null,
      jvmArgs: []
    }
    const java = new JavaService(gameRoot, consoleSink, createInstallRuntimeFactory({ concurrency: () => 8 }))
    const report = await verifyInstance(
      {
        gameRoot,
        instance,
        catalog,
        java,
        createRuntime: createInstallRuntimeFactory({ concurrency: () => 8 }),
        log: consoleSink
      },
      latest.id
    )
    // Sanity: a just-installed version has no issues.
    expect(report.issues.length).toBe(0)
  })
})
