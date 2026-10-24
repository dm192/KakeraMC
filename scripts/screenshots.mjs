/**
 * Captures review screenshots of the four main surfaces using the built app and
 * the deterministic fake backend. Not a test: images are meant to be reviewed by
 * a human (and attached to docs/quality-report.md).
 *
 * Usage: node scripts/screenshots.mjs
 */
import { mkdir, mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { _electron as electron } from 'playwright'

const root = fileURLToPath(new URL('..', import.meta.url))
const outDir = join(root, 'docs', 'screenshots')

const env = {
  ...process.env,
  KAKERAMC_USERDATA: await mkdtemp(join(tmpdir(), 'kakera-shots-')),
  KAKERAMC_E2E_FAKE: '1'
}
delete env.ELECTRON_RUN_AS_NODE
delete env.ELECTRON_RENDERER_URL

await mkdir(outDir, { recursive: true })

const app = await electron.launch({ args: ['.'], cwd: root, env })
const page = await app.firstWindow()
await page.waitForLoadState('domcontentloaded')
await page.setViewportSize({ width: 1180, height: 760 })

async function shot(name) {
  await page.waitForTimeout(250)
  await page.screenshot({ path: join(outDir, name) })
  console.log(`captured ${name}`)
}

await shot('instances-empty.png')

await page.getByRole('button', { name: '创建实例', exact: true }).click()
await page.getByLabel('名称', { exact: true }).fill('生存 26.3')
await page.getByLabel('加载器', { exact: true }).selectOption('fabric')
await shot('create-instance.png')

await page.getByRole('button', { name: '创建', exact: true }).click()
await page.waitForTimeout(400)
await page.getByRole('button', { name: '安装', exact: true }).click()
await page.waitForTimeout(180)
await shot('installing.png')
await page.waitForTimeout(1800)

await page.getByRole('button', { name: '账户', exact: true }).click()
await shot('accounts-empty.png')

await page.getByRole('button', { name: '设置', exact: true }).click()
await shot('settings.png')

await app.close()
console.log(`screenshots written to ${outDir}`)
