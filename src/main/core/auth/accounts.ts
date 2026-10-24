import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { KakeraError } from '@shared/errors'
import type { AccountState, AccountView, AuthPrompt } from '@shared/types'
import { JsonFile } from '../fsx'
import type { MicrosoftAuth, MicrosoftAuthResult } from './microsoft'
import { isValidOfflineName, offlineUuid } from './offline'
import type { TokenVault } from './vault'

interface AccountRecord {
  id: string
  type: 'microsoft' | 'offline'
  name: string
  uuid: string
  needsReauth: boolean
}

interface AccountsFile {
  schemaVersion: 1
  accounts: AccountRecord[]
  selectedId: string | null
}

const EMPTY: AccountsFile = { schemaVersion: 1, accounts: [], selectedId: null }

export interface LaunchIdentity {
  type: 'microsoft' | 'offline'
  name: string
  uuid: string
  accessToken: string
}

/**
 * Account registry plus token lifecycle. Offline profiles never touch the
 * network; Microsoft sessions refresh silently and fall back to an explicit
 * "sign in again" state instead of launching with a dead token.
 */
export class AccountService {
  private readonly file: JsonFile<AccountsFile>
  private data: AccountsFile = EMPTY
  private prompt: AuthPrompt | null = null
  private readonly listeners = new Set<(state: AccountState) => void>()
  private cancelReject: ((error: Error) => void) | null = null

  constructor(
    userDataDir: string,
    private readonly vault: TokenVault,
    private readonly createAuth: (onPrompt: (prompt: AuthPrompt | null) => void) => MicrosoftAuth
  ) {
    this.file = new JsonFile<AccountsFile>(join(userDataDir, 'accounts.json'))
  }

  async init(): Promise<void> {
    this.data = await this.file.read(
      (raw) => raw as AccountsFile,
      () => ({ ...EMPTY, accounts: [] })
    )
    if (!this.data.selectedId && this.data.accounts.length > 0) {
      this.data.selectedId = this.data.accounts[0]?.id ?? null
    }
  }

  state(): AccountState {
    return {
      accounts: this.data.accounts.map(toView),
      selectedId: this.data.selectedId,
      auth: this.prompt,
      vaultPersistent: this.vault.isPersistent
    }
  }

  get selected(): AccountRecord | null {
    return this.data.accounts.find((account) => account.id === this.data.selectedId) ?? null
  }

  async addOffline(name: string): Promise<AccountState> {
    if (!isValidOfflineName(name)) {
      throw new KakeraError('account.name-invalid', 'Offline names must be 3-16 characters of letters, digits or underscore')
    }
    if (this.data.accounts.some((account) => account.name.toLowerCase() === name.toLowerCase())) {
      throw new KakeraError('account.name-invalid', `The name "${name}" is already in use`)
    }
    const record: AccountRecord = {
      id: randomUUID(),
      type: 'offline',
      name,
      uuid: offlineUuid(name),
      needsReauth: false
    }
    this.data.accounts.push(record)
    this.data.selectedId = record.id
    await this.persist()
    return this.state()
  }

  async addMicrosoft(): Promise<void> {
    const auth = this.createAuth((prompt) => {
      this.prompt = prompt
      this.emit()
    })
    const cancel = new Promise<never>((_, reject) => {
      this.cancelReject = reject
    })
    try {
      const result = await Promise.race([auth.interactive(), cancel])
      await this.upsertMicrosoft(result)
    } catch (error) {
      throw error instanceof KakeraError ? error : new KakeraError('auth.failed', String(error))
    } finally {
      this.cancelReject = null
      this.prompt = null
      this.emit()
    }
  }

  async addMicrosoftByDeviceCode(): Promise<void> {
    const auth = this.createAuth((prompt) => {
      this.prompt = prompt
      this.emit()
    })
    try {
      await this.upsertMicrosoft(await auth.deviceCode())
    } finally {
      this.prompt = null
      this.emit()
    }
  }

  /** Rejects a pending interactive sign-in; the browser flow is then ignored. */
  cancelAuth(): void {
    this.cancelReject?.(new KakeraError('auth.canceled', 'Sign-in canceled by the user'))
    this.cancelReject = null
    this.prompt = null
    this.emit()
  }

  async remove(id: string): Promise<AccountState> {
    const record = this.data.accounts.find((account) => account.id === id)
    if (!record) throw new KakeraError('account.not-found', `Unknown account ${id}`)
    this.data.accounts = this.data.accounts.filter((account) => account.id !== id)
    if (this.data.selectedId === id) this.data.selectedId = this.data.accounts[0]?.id ?? null
    await this.vault.delete(id)
    await this.persist()
    return this.state()
  }

  async select(id: string | null): Promise<AccountState> {
    if (id !== null && !this.data.accounts.some((account) => account.id === id)) {
      throw new KakeraError('account.not-found', `Unknown account ${id}`)
    }
    this.data.selectedId = id
    await this.persist()
    return this.state()
  }

  /** Resolves the identity to launch with, refreshing Microsoft tokens as needed. */
  async launchIdentity(): Promise<LaunchIdentity> {
    const record = this.selected
    if (!record) throw new KakeraError('launch.no-account', 'No account is selected')

    if (record.type === 'offline') {
      return { type: 'offline', name: record.name, uuid: record.uuid, accessToken: '0' }
    }

    const secret = this.vault.get(record.id)
    if (!secret?.msalAccountId || !secret.msalCache) {
      await this.markNeedsReauth(record.id)
      throw new KakeraError('auth.needs-reauth', 'This account must sign in again')
    }

    if (secret.minecraftAccessToken && (secret.minecraftExpiresAt ?? 0) - 60_000 > Date.now()) {
      return { type: 'microsoft', name: record.name, uuid: record.uuid, accessToken: secret.minecraftAccessToken }
    }

    try {
      const auth = this.createAuth(() => undefined)
      const result = await auth.silent(secret.msalCache, secret.msalAccountId)
      await this.storeMicrosoftSecret(record.id, result)
      record.name = result.minecraft.name
      record.uuid = result.minecraft.uuid
      record.needsReauth = false
      await this.persist()
      return {
        type: 'microsoft',
        name: result.minecraft.name,
        uuid: result.minecraft.uuid,
        accessToken: result.minecraft.accessToken
      }
    } catch (error) {
      await this.markNeedsReauth(record.id)
      throw new KakeraError(
        'auth.needs-reauth',
        'Silent Microsoft sign-in failed; sign in again',
        error instanceof Error ? error.message : undefined
      )
    }
  }

  onChange(listener: (state: AccountState) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private async upsertMicrosoft(result: MicrosoftAuthResult): Promise<void> {
    const existing = this.data.accounts.find(
      (account) => account.type === 'microsoft' && account.uuid === result.minecraft.uuid
    )
    const record: AccountRecord = existing ?? {
      id: randomUUID(),
      type: 'microsoft',
      name: result.minecraft.name,
      uuid: result.minecraft.uuid,
      needsReauth: false
    }
    record.name = result.minecraft.name
    record.uuid = result.minecraft.uuid
    record.needsReauth = false
    if (!existing) this.data.accounts.push(record)
    await this.storeMicrosoftSecret(record.id, result)
    if (this.selected && this.selected.type === 'offline') {
      this.data.selectedId = record.id
    }
    if (!this.data.selectedId) this.data.selectedId = record.id
    await this.persist()
  }

  private async storeMicrosoftSecret(accountId: string, result: MicrosoftAuthResult): Promise<void> {
    await this.vault.set(accountId, {
      msalCache: result.msalCache,
      msalAccountId: result.msalAccountId,
      minecraftAccessToken: result.minecraft.accessToken,
      minecraftExpiresAt: result.minecraft.expiresAt
    })
  }

  private async markNeedsReauth(accountId: string): Promise<void> {
    const record = this.data.accounts.find((account) => account.id === accountId)
    if (!record) return
    record.needsReauth = true
    await this.persist()
  }

  private async persist(): Promise<void> {
    await this.file.write(this.data)
    this.emit()
  }

  private emit(): void {
    const state = this.state()
    for (const listener of this.listeners) listener(state)
  }
}

function toView(record: AccountRecord): AccountView {
  return {
    id: record.id,
    type: record.type,
    name: record.name,
    uuid: record.uuid,
    needsReauth: record.needsReauth
  }
}
