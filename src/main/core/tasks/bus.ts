import { randomUUID } from 'node:crypto'
import type { AppError, TaskKind, TaskProgress, TaskSnapshot, TaskUnit } from '@shared/types'

export interface TaskHandle {
  readonly id: string
  readonly signal: AbortSignal
  setLabel(labelKey: string, params?: Record<string, string | number>): void
  setProgress(done: number, total: number, unit: TaskUnit): void
  clearProgress(): void
  succeed(): void
  fail(error: AppError): void
  /** Marks the task canceled (the abort signal is raised by `cancel`). */
  markCanceled(): void
  readonly canceled: boolean
  readonly state: TaskSnapshot['state']
}

/**
 * In-memory task registry for long-running install/repair work. It coalesces
 * renderer notifications so a byte-level download never floods IPC.
 */
export class TaskBus {
  private readonly tasks = new Map<string, TaskSnapshot>()
  private readonly controllers = new Map<string, AbortController>()
  private readonly listeners = new Set<(tasks: TaskSnapshot[]) => void>()
  private flushTimer: ReturnType<typeof setTimeout> | null = null

  create(kind: TaskKind, instanceId: string, labelKey: string, labelParams: Record<string, string | number> = {}): TaskHandle {
    const id = randomUUID()
    const controller = new AbortController()
    const snapshot: TaskSnapshot = {
      id,
      kind,
      instanceId,
      labelKey,
      labelParams,
      state: 'pending',
      progress: null,
      error: null
    }
    this.tasks.set(id, snapshot)
    this.controllers.set(id, controller)
    this.schedule()

    const touch = (): void => this.schedule()

    const handle: TaskHandle = {
      id,
      signal: controller.signal,
      setLabel(nextLabelKey, params = {}) {
        snapshot.labelKey = nextLabelKey
        snapshot.labelParams = params
        touch()
      },
      setProgress(done: number, total: number, unit: TaskUnit) {
        const progress: TaskProgress = { done: Math.max(0, done), total: Math.max(0, total), unit }
        snapshot.progress = progress
        if (snapshot.state === 'pending') snapshot.state = 'running'
        touch()
      },
      clearProgress() {
        snapshot.progress = null
        touch()
      },
      succeed() {
        snapshot.state = 'succeeded'
        snapshot.progress = null
        touch()
      },
      fail(error: AppError) {
        snapshot.state = 'failed'
        snapshot.error = error
        touch()
      },
      markCanceled() {
        snapshot.state = 'canceled'
        touch()
      },
      get canceled() {
        return controller.signal.aborted
      },
      get state() {
        return snapshot.state
      }
    }

    if (snapshot.state === 'pending') {
      snapshot.state = 'running'
      this.schedule()
    }
    return handle
  }

  cancel(id: string): boolean {
    const controller = this.controllers.get(id)
    const snapshot = this.tasks.get(id)
    if (!controller || !snapshot) return false
    controller.abort()
    if (snapshot.state === 'running' || snapshot.state === 'pending') snapshot.state = 'canceled'
    this.schedule()
    return true
  }

  get(id: string): TaskSnapshot | undefined {
    return this.tasks.get(id)
  }

  list(): TaskSnapshot[] {
    return [...this.tasks.values()]
  }

  /** Keeps the most recent finished tasks visible but bounded. */
  prune(keep = 20): void {
    const finished = [...this.tasks.values()].filter((task) => task.state !== 'running' && task.state !== 'pending')
    for (const task of finished.slice(0, Math.max(0, finished.length - keep))) {
      this.tasks.delete(task.id)
      this.controllers.delete(task.id)
    }
  }

  subscribe(listener: (tasks: TaskSnapshot[]) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  dispose(): void {
    if (this.flushTimer) clearTimeout(this.flushTimer)
    this.flushTimer = null
    this.listeners.clear()
  }

  private schedule(): void {
    if (this.flushTimer) return
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null
      const snapshot = this.list().map((task) => ({ ...task }))
      for (const listener of this.listeners) listener(snapshot)
    }, 100)
  }
}
