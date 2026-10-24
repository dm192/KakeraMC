import { _electron as electron } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'

export interface LaunchedApp {
  app: ElectronApplication
  page: Page
}

/**
 * Launches the built app with a throwaway user data directory. The fake backend
 * keeps installs offline and deterministic.
 */
export async function launchApp(userDataDir: string): Promise<LaunchedApp> {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    KAKERAMC_USERDATA: userDataDir,
    KAKERAMC_E2E_FAKE: '1'
  }
  // The harness running these tests may export this for its own node child;
  // Electron must start as a GUI app here.
  delete env.ELECTRON_RUN_AS_NODE

  const app = await electron.launch({ args: ['.'], cwd: process.cwd(), env })
  app.process().stderr?.on('data', (chunk: Buffer) => {
    process.stderr.write(`[main:stderr] ${chunk.toString()}`)
  })
  const page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')
  return { app, page }
}
