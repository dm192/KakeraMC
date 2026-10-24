import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { MinecraftFolder, Version, createMinecraftProcessWatcher, launch } from '@xmcl/core'
import { describe, expect, it } from 'vitest'
import { JavaService } from '@main/core/minecraft/java'
import { createInstallRuntimeFactory } from '@main/core/minecraft/runtime'
import { offlineUuid } from '@main/core/auth/offline'
import { consoleSink } from '@main/core/log'

/**
 * Launches an already-installed version with an offline profile, waits for the
 * game window, then stops it. Requires KAKERA_GAME_ROOT pointing at a game root
 * produced by tests/integration/install.test.ts (run with KAKERA_KEEP_GAME=1).
 */
const enabled = process.env.KAKERA_NET_TESTS === '1'
const gameRoot = process.env.KAKERA_GAME_ROOT ?? ''
const versionId = process.env.KAKERA_VERSION_ID ?? ''

describe.skipIf(!enabled || !gameRoot || !versionId)('real launch', () => {
  it('starts the game and reaches the main window', async () => {
    const java = new JavaService(gameRoot, consoleSink, createInstallRuntimeFactory({ concurrency: () => 4 }))
    const minecraft = MinecraftFolder.from(gameRoot)
    const version = await Version.parse(minecraft, versionId)

    const runtime = await java.ensure({
      component: version.javaVersion?.component ?? null,
      requiredMajor: version.javaVersion?.majorVersion ?? null,
      manualPath: null,
      signal: AbortSignal.timeout(120_000)
    })
    console.log(`  java: ${runtime.path} (${runtime.version}, ${runtime.source})`)

    const instanceDir = join(gameRoot, 'instances', 'integration')
    await mkdir(instanceDir, { recursive: true })

    const startedAt = Date.now()
    const process_ = await launch({
      gamePath: instanceDir,
      resourcePath: gameRoot,
      javaPath: runtime.path,
      version: versionId,
      gameProfile: { name: 'Tester', id: offlineUuid('Tester') },
      accessToken: '0',
      userType: 'legacy',
      launcherName: 'KakeraMC',
      launcherBrand: 'KakeraMC',
      maxMemory: 2048,
      minMemory: 1024
    })

    const watcher = createMinecraftProcessWatcher(process_)
    const outcome = await new Promise<'ready' | 'exited' | 'timeout'>((resolve) => {
      const timer = setTimeout(() => resolve('timeout'), 180_000)
      watcher.on('minecraft-window-ready', () => {
        clearTimeout(timer)
        resolve('ready')
      })
      watcher.on('minecraft-exit', (event) => {
        clearTimeout(timer)
        console.log(`  game exited early with code ${event.code}`)
        if (event.crashReport) console.log(event.crashReport.slice(0, 2000))
        resolve('exited')
      })
    })

    console.log(`  outcome: ${outcome} after ${Math.round((Date.now() - startedAt) / 1000)}s`)

    if (process_.pid && process_.exitCode === null) {
      process_.kill()
    }

    expect(outcome).toBe('ready')
  }, 300_000)
})
