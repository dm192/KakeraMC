import { _electron as electron } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'

export interface LaunchedApp {
  app: ElectronApplication
  page: Page
}

export interface LaunchOptions {
  /** Defaults to true: keeps installs offline and deterministic. */
  fake?: boolean
  env?: NodeJS.ProcessEnv
}

/**
 * Launches the built app with a throwaway user data directory. The fake backend
 * keeps installs offline; pass `fake: false` for real-network acceptance runs.
 */
export async function launchApp(userDataDir: string, options: LaunchOptions = {}): Promise<LaunchedApp> {
  const fake = options.fake ?? true
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    ...options.env,
    KAKERAMC_USERDATA: userDataDir
  }
  if (fake) env.KAKERAMC_E2E_FAKE = '1'
  else delete env.KAKERAMC_E2E_FAKE
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
