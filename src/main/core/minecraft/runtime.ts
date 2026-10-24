import { ProgressTrackerMultiple, createDefaultNodeInstallRuntime } from '@xmcl/installer'
import type { InstallRuntime } from '@xmcl/installer'
import type { TaskUnit } from '@shared/types'
import type { TaskHandle } from '../tasks/bus'

export interface CreateRuntimeOptions {
  signal: AbortSignal
  task?: TaskHandle
  labelKey?: string
  unit?: TaskUnit
  concurrency?: number
}

export interface RuntimeHandle {
  runtime: InstallRuntime
  /** Stops progress polling; call once the manifest/workflow settled. */
  stop: () => void
}

export type InstallRuntimeFactory = (options: CreateRuntimeOptions) => RuntimeHandle

export interface RuntimeFactoryOptions {
  /** Read lazily so a settings change applies to the next install. */
  concurrency: () => number
  pollMs?: number
}

/**
 * Builds an xmcl install runtime whose downloads come from
 * `@xmcl/file-transfer` (resume, retry, stall detection) and whose byte
 * progress is mirrored onto the launcher task bus. Progress reflects bytes
 * actually transferred for the current batch — never a synthetic percentage.
 */
export function createInstallRuntimeFactory(options: RuntimeFactoryOptions): InstallRuntimeFactory {
  return (runtimeOptions) => {
    const tracker = new ProgressTrackerMultiple()
    const runtime = createDefaultNodeInstallRuntime({
      maxConcurrency: runtimeOptions.concurrency ?? Math.max(1, options.concurrency()),
      tracker
    })

    let timer: ReturnType<typeof setInterval> | null = null
    if (runtimeOptions.task) {
      const task = runtimeOptions.task
      timer = setInterval(() => {
        let total = 0
        let done = 0
        for (const single of tracker.trackers) {
          total += single.total || 0
          done += single.progress || 0
        }
        if (total > 0) task.setProgress(done, total, runtimeOptions.unit ?? 'bytes')
        if (runtimeOptions.labelKey) task.setLabel(runtimeOptions.labelKey)
      }, options.pollMs ?? 250)
    }

    return {
      runtime,
      stop: () => {
        if (timer) clearInterval(timer)
        timer = null
      }
    }
  }
}
