import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { TaskBus } from '@main/core/tasks/bus'
import { InstanceService } from '@main/core/instances/store'
import { SettingsService, defaultSettings } from '@main/core/settings/store'
import { TokenVault } from '@main/core/auth/vault'
import type { EncryptionBox } from '@main/core/auth/vault'
import { AccountService } from '@main/core/auth/accounts'
import type { TaskSnapshot } from '@shared/types'

let dir = ''

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'kakera-unit-'))
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

describe('TaskBus', () => {
  it('tracks lifecycle and lets a task be canceled', async () => {
    const bus = new TaskBus()
    const handle = bus.create('install', 'instance-1', 'install.label.metadata')
    handle.setProgress(10, 100, 'bytes')

    const [task] = bus.list()
    expect(task?.state).toBe('running')
    expect(task?.progress).toEqual({ done: 10, total: 100, unit: 'bytes' })

    bus.cancel(handle.id)
    expect(handle.signal.aborted).toBe(true)
    expect(bus.get(handle.id)?.state).toBe('canceled')
    bus.dispose()
  })

  it('notifies subscribers once per batch and prunes finished tasks', async () => {
    const bus = new TaskBus()
    const snapshots: TaskSnapshot[][] = []
    const unsubscribe = bus.subscribe((tasks) => snapshots.push(tasks))

    const handle = bus.create('install', 'instance-1', 'install.label.metadata')
    handle.setProgress(1, 2, 'bytes')
    handle.succeed()
    await new Promise((resolve) => setTimeout(resolve, 150))
    expect(snapshots.length).toBe(1)
    expect(snapshots[0]?.[0]?.state).toBe('succeeded')

    bus.prune(0)
    expect(bus.list()).toHaveLength(0)
    unsubscribe()
    bus.dispose()
  })
})

describe('SettingsService', () => {
  it('creates defaults and persists updates', async () => {
    const settings = new SettingsService(dir)
    const initial = await settings.load()
    expect(initial).toEqual(defaultSettings(dir))

    const updated = await settings.update({ memoryMb: 6144, jvmArgs: ['-Dfoo=1'] })
    expect(updated.memoryMb).toBe(6144)

    const raw = JSON.parse(await readFile(join(dir, 'settings.json'), 'utf8')) as { memoryMb: number }
    expect(raw.memoryMb).toBe(6144)

    const reloaded = new SettingsService(dir)
    expect((await reloaded.load()).memoryMb).toBe(6144)
  })

  it('rejects invalid values', async () => {
    const settings = new SettingsService(dir)
    await settings.load()
    await expect(settings.update({ memoryMb: 16 })).rejects.toMatchObject({ code: 'settings.invalid' })
  })

  it('falls back to defaults when the file is corrupt', async () => {
    await writeFile(join(dir, 'settings.json'), '{not json', 'utf8')
    const settings = new SettingsService(dir)
    expect((await settings.load()).memoryMb).toBe(defaultSettings(dir).memoryMb)
  })
})

describe('InstanceService', () => {
  it('creates, lists, renames and deletes instances', async () => {
    const service = new InstanceService(dir)
    const created = await service.create({ name: 'Survival', mcVersion: '1.20.1', loader: 'fabric', loaderVersion: '0.16.5' })
    expect(created.installed).toBe(false)
    expect(created.loaderVersion).toBe('0.16.5')

    const list = await service.list()
    expect(list).toHaveLength(1)
    expect(list[0]?.name).toBe('Survival')

    await service.markInstalled(created.id, '1.20.1-fabric0.16.5')
    expect((await service.list())[0]?.installed).toBe(false) // no version file on disk yet

    await service.rename(created.id, 'Survival 2')
    expect((await service.list())[0]?.name).toBe('Survival 2')

    await service.remove(created.id)
    expect(await service.list()).toHaveLength(0)
  })

  it('rejects duplicate names and unknown ids', async () => {
    const service = new InstanceService(dir)
    await service.create({ name: 'One', mcVersion: '1.20.1', loader: 'vanilla' })
    await expect(service.create({ name: 'one', mcVersion: '1.20.1', loader: 'vanilla' })).rejects.toMatchObject({
      code: 'instance.name-taken'
    })
    await expect(service.get('../escape')).rejects.toMatchObject({ code: 'instance.not-found' })
  })
})

function fakeBox(available: boolean): EncryptionBox {
  return {
    isAvailable: async () => available,
    encrypt: (plain) => Buffer.from(`enc:${plain}`, 'utf8'),
    decrypt: (payload) => payload.toString('utf8').replace(/^enc:/, '')
  }
}

describe('TokenVault', () => {
  it('round-trips secrets when encryption is available', async () => {
    const vault = new TokenVault(dir, fakeBox(true))
    await vault.load()
    expect(vault.isPersistent).toBe(true)
    await vault.set('account-1', { minecraftAccessToken: 'token', msalAccountId: 'home' })

    const raw = await readFile(join(dir, 'accounts.vault.json'), 'utf8')
    expect(raw).not.toContain('"token"')

    const reopened = new TokenVault(dir, fakeBox(true))
    await reopened.load()
    expect(reopened.get('account-1')?.minecraftAccessToken).toBe('token')
  })

  it('keeps secrets in memory only when the OS keyring is unavailable', async () => {
    const vault = new TokenVault(dir, fakeBox(false))
    await vault.load()
    expect(vault.isPersistent).toBe(false)
    await vault.set('account-1', { minecraftAccessToken: 'token' })
    expect(vault.get('account-1')?.minecraftAccessToken).toBe('token')
    await expect(readFile(join(dir, 'accounts.vault.json'), 'utf8')).rejects.toThrow()
  })
})

describe('AccountService', () => {
  function createService(): AccountService {
    const vault = new TokenVault(dir, fakeBox(true))
    return new AccountService(dir, vault, () => {
      throw new Error('Microsoft auth must not be used in unit tests')
    })
  }

  it('adds an offline account and resolves a launch identity', async () => {
    const vault = new TokenVault(dir, fakeBox(true))
    await vault.load()
    const service = new AccountService(dir, vault, () => {
      throw new Error('not used')
    })
    await service.init()

    const state = await service.addOffline('Tester')
    expect(state.selectedId).not.toBeNull()
    expect(state.accounts[0]?.uuid).toBe('f3d28cb0-7225-3cb1-baeb-2dadd2be89ae')

    const identity = await service.launchIdentity()
    expect(identity).toMatchObject({ type: 'offline', name: 'Tester', accessToken: '0' })
  })

  it('rejects invalid or duplicate offline names', async () => {
    const vault = new TokenVault(dir, fakeBox(true))
    await vault.load()
    const service = createService()
    await service.init()
    await expect(service.addOffline('a')).rejects.toMatchObject({ code: 'account.name-invalid' })
    await service.addOffline('Tester')
    await expect(service.addOffline('tester')).rejects.toMatchObject({ code: 'account.name-invalid' })
  })

  it('requires a selected account before launching', async () => {
    const vault = new TokenVault(dir, fakeBox(true))
    await vault.load()
    const service = createService()
    await service.init()
    await expect(service.launchIdentity()).rejects.toMatchObject({ code: 'launch.no-account' })
  })
})

describe('Microsoft auth wiring', () => {
  it('rejects with a stable code when no client id is configured', async () => {
    const { MicrosoftAuth } = await import('@main/core/auth/microsoft')
    const auth = new MicrosoftAuth({
      clientId: null,
      openExternal: async () => undefined,
      onPrompt: () => undefined
    })
    await expect(auth.interactive()).rejects.toMatchObject({ code: 'auth.not-configured' })
  })

  it('keeps the error code through the account service and IPC serialization', async () => {
    const { MicrosoftAuth } = await import('@main/core/auth/microsoft')
    const { toAppError } = await import('@shared/errors')
    const vault = new TokenVault(dir, fakeBox(true))
    await vault.load()
    const service = new AccountService(
      dir,
      vault,
      (onPrompt) =>
        new MicrosoftAuth({
          clientId: null,
          openExternal: async () => undefined,
          onPrompt
        })
    )
    await service.init()

    const error = await service.addMicrosoft().catch((caught: unknown) => caught)
    expect(error).toMatchObject({ code: 'auth.not-configured' })
    expect(toAppError(error).code).toBe('auth.not-configured')
  })
})
