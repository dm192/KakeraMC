import { expect, test } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import { launchApp } from './helpers'

const require = createRequire(import.meta.url)

let app: ElectronApplication
let page: Page
let axeSource: string

interface AxeResult {
  violations: Array<{ id: string; help: string; nodes: Array<{ target: string[] }> }>
}

test.beforeAll(async () => {
  // Electron does not support the extra page AxeBuilder creates, so axe-core is
  // injected into the app page directly (same engine, same rule tags).
  axeSource = await readFile(require.resolve('axe-core/axe.min.js'), 'utf8')
})

test.beforeEach(async () => {
  const userData = await mkdtemp(join(tmpdir(), 'kakera-a11y-'))
  const launched = await launchApp(userData)
  app = launched.app
  page = launched.page
})

test.afterEach(async () => {
  await app.close()
})

test('main views pass automated accessibility checks', async () => {
  const views = [
    { nav: '实例', heading: '还没有实例' },
    { nav: '账户', heading: '账户' },
    { nav: '设置', heading: '设置' }
  ] as const

  for (const view of views) {
    await page.getByRole('button', { name: view.nav, exact: true }).click()
    await expect(page.getByRole('heading', { name: view.heading, exact: true })).toBeVisible()

    await page.evaluate(axeSource)
    const results = (await page.evaluate(async () => {
      const axe = (window as unknown as { axe: { run: (context: Document, options: unknown) => Promise<AxeResult> } }).axe
      return await axe.run(document, {
        runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] }
      })
    })) as AxeResult

    if (results.violations.length > 0) {
      console.log(
        `axe violations on ${view.nav}: ` +
          results.violations
            .map((violation) => `${violation.id} (${violation.nodes.length} nodes): ${violation.help}`)
            .join(' | ')
      )
    }
    expect(results.violations, `axe violations in the ${view.nav} view`).toEqual([])
  }
})
