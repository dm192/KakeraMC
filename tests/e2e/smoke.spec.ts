import { expect, test } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { launchApp } from './helpers'

let app: ElectronApplication
let page: Page
let userDataDir: string

async function launch(userData: string): Promise<void> {
  const launched = await launchApp(userData)
  app = launched.app
  page = launched.page
}

test.describe('KakeraMC launcher shell', () => {
  test.beforeEach(async () => {
    userDataDir = await mkdtemp(join(tmpdir(), 'kakera-e2e-'))
    await launch(userDataDir)
  })

  test.afterEach(async () => {
    await app.close()
  })

  test('boots with an empty instance list', async () => {
    await expect(page).toHaveTitle(/KakeraMC/)
    await expect(page.locator('.empty__title')).toHaveText('还没有实例')
    await expect(page.getByRole('button', { name: '创建实例', exact: true })).toBeVisible()
    await expect(page.getByRole('navigation')).toBeVisible()
  })

  test('creates an instance, installs it, and enables play', async () => {
    await page.getByRole('button', { name: '创建实例', exact: true }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()

    await page.getByLabel('名称', { exact: true }).fill('冒烟测试')
    await page.getByLabel('游戏版本', { exact: true }).selectOption('1.99.0')
    await page.getByLabel('加载器', { exact: true }).selectOption('fabric')
    await expect(page.getByLabel('加载器版本', { exact: true })).toHaveValue('9.9.9')
    await dialog.getByRole('button', { name: '创建', exact: true }).click()

    await expect(page.locator('.instance__name')).toHaveText('冒烟测试')
    await expect(page.locator('.instance__meta')).toContainText('1.99.0 · Fabric')

    // Without an account the primary action is install-only.
    await expect(page.getByRole('button', { name: '安装', exact: true })).toBeVisible()
    await page.getByRole('button', { name: '安装', exact: true }).click()

    // Real progress, then the play action appears once the install settles.
    await expect(page.getByRole('progressbar')).toBeVisible()
    await expect(page.getByRole('button', { name: '启动', exact: true })).toBeVisible({ timeout: 30_000 })
    await expect(page.locator('.instance__meta')).not.toContainText('尚未安装')
    // Still disabled: no account has been added yet.
    await expect(page.getByRole('button', { name: '启动', exact: true })).toBeDisabled()

    await page.getByRole('button', { name: '账户', exact: true }).click()
    await page.getByRole('button', { name: '离线档案', exact: true }).click()
    await page.getByLabel('用户名', { exact: true }).fill('Tester')
    await page.getByRole('dialog').getByRole('button', { name: '创建', exact: true }).click()
    await expect(page.locator('.account__name')).toHaveText('Tester')

    await page.getByRole('button', { name: '实例', exact: true }).click()
    await expect(page.getByRole('button', { name: '启动', exact: true })).toBeEnabled()
  })

  test('switches language and persists the setting', async () => {
    await page.getByRole('button', { name: '设置', exact: true }).click()
    await page.getByLabel('界面语言', { exact: true }).selectOption('en')
    await page.getByRole('button', { name: '保存', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Instances', exact: true })).toBeVisible()

    // The choice survives a restart because it is written to disk.
    await app.close()
    await launch(userDataDir)
    await expect(page.getByRole('button', { name: 'Instances', exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Settings', exact: true }).click()
    await expect(page.getByLabel('Language', { exact: true })).toHaveValue('en')
  })
})
