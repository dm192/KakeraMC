import { join } from 'node:path'
import { writeJson } from '../core/fsx'
import type { InstanceRecord } from '../core/instances/store'
import type { TaskHandle } from '../core/tasks/bus'

/**
 * Deterministic stand-in for network installation, enabled only by
 * `KAKERAMC_E2E_FAKE=1`. It writes a real version stub so the "installed"
 * state and the UI transitions are exercised without downloading Minecraft.
 */
export class FakeBackend {
  constructor(private readonly gameRoot: () => string) {}

  async install(record: InstanceRecord, task: TaskHandle): Promise<string> {
    const versionId = `${record.mcVersion}-${record.loader}${record.loaderVersion ? `-${record.loaderVersion}` : ''}`
    const steps = 12
    const total = steps * 1_000_000
    task.setLabel('install.label.download')
    for (let step = 1; step <= steps; step += 1) {
      if (task.canceled) throw new Error('canceled')
      await delay(50)
      task.setProgress(step * 1_000_000, total, 'bytes')
    }
    task.setLabel('install.label.finalize')
    const path = join(this.gameRoot(), 'versions', versionId, `${versionId}.json`)
    await writeJson(path, { id: versionId, type: 'release', mainClass: 'net.minecraft.client.main.Main' })
    return versionId
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
