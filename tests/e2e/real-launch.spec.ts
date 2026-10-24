import { expect, test } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { launchApp } from './helpers'

/**
 * End-to-end acceptance against a real, already-installed game directory:
 * pre-seeds settings/accounts/instance, presses Play in the UI, waits for the
 * running state, then stops the game. Opt-in via KAKERA_REAL_GAME_ROOT, e.g.
 *
 *   KAKERA_REAL_GAME_ROOT=<game root from npm run verify:real> \
 *   KAKERA_VERSION_ID=26.3 npm run e2e -- real-launch
 */
const gameRoot = process.env.KAKERA_REAL_GAME_ROOT ?? ''
const versionId = process.env.KAKERA_VERSION_ID ?? ''
const enabled = Boolean(gameRoot && versionId)

let app: ElectronApplication
let page: Page

test.skip(!enabled, 'Set KAKERA_REAL_GAME_ROOT and KAKERA_VERSION_ID to run the real launch check')

test.beforeAll(async () => {
  const userData = await mkdtemp(join(tmpdir(), 'kakera-real-ui-'))
  const instanceId = 'e2e-real-instance'
  const now = new Date().toISOString()

  await writeFile(
    join(userData, 'settings.json'),
    `${JSON.stringify(
      {
        language: 'zh-CN',
        gameRoot,
        memoryMb: 2048,
        jvmArgs: [],
        downloadConcurrency: 8,
        javaPath: null,
        microsoftClientId: null
      },
      null,
      2
    )}\n`,
    'utf8'
  )

  await writeFile(
    join(userData, 'accounts.json'),
    `${JSON.stringify(
      {
        schemaVersion: 1,
        accounts: [
          {
            id: 'offline-e2e',
            type: 'offline',
            name: 'Tester',
            uuid: 'f3d28cb0-7225-3cb1-baeb-2dadd2be89ae',
            needsReauth: false
          }
        ],
        selectedId: 'offline-e2e'
      },
      null,
      2
    )}\n`,
    'utf8'
  )

  const instanceDir = join(gameRoot, 'instances', instanceId)
  await mkdir(instanceDir, { recursive: true })
  await writeFile(
    join(instanceDir, 'instance.json'),
    `${JSON.stringify(
      {
        schemaVersion: 1,
        id: instanceId,
        name: '真实启动验收',
        createdAt: now,
        lastPlayedAt: null,
        mcVersion: versionId,
        loader: 'vanilla',
        loaderVersion: null,
        resolvedVersionId: versionId,
        javaPath: null,
        memoryMb: 2048,
        jvmArgs: []
      },
      null,
      2
    )}\n`,
    'utf8'
  )

  const env: NodeJS.ProcessEnv = { ...process.env, KAKERAMC_USERDATA: userData }
  delete env.ELECTRON_RUN_AS_NODE
  delete env.KAKERAMC_E2E_FAKE

  const launched = await launchApp(userData, { fake: false, env })
  app = launched.app
  page = launched.page
})

test.afterAll(async () => {
  await app?.close()
})

test('launches the real game from the UI and stops it', async () => {
  test.setTimeout(240_000)
  await expect(page.locator('.instance__name')).toHaveText('真实启动验收')
  const play = page.getByRole('button', { name: '启动', exact: true })
  await expect(play).toBeEnabled({ timeout: 15_000 })
  await play.click()

  // The game process must reach the "running" phase before we consider it a pass.
  await expect(page.getByText('运行中', { exact: false })).toBeVisible({ timeout: 200_000 })

  const stop = page.getByRole('button', { name: '停止', exact: true })
  await expect(stop).toBeVisible()
  await stop.click()
})
