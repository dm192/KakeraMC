import { join } from 'node:path'
import { JsonFile } from '../fsx'

/** Raised when the platform cannot encrypt secrets (e.g. Linux without a keyring). */
export interface EncryptionBox {
  isAvailable(): Promise<boolean>
  encrypt(plain: string): Buffer
  decrypt(payload: Buffer): string
}

export interface StoredSecret {
  /** Serialized MSAL cache; contains refresh tokens. */
  msalCache?: string
  /** MSAL home account id used to pick the cached account. */
  msalAccountId?: string
  /** Minecraft services access token (about 24h). */
  minecraftAccessToken?: string
  minecraftExpiresAt?: number
}

interface VaultFile {
  schemaVersion: 1
  entries: Record<string, string>
}

/**
 * Encrypts account secrets at rest through Electron's safeStorage (DPAPI,
 * Keychain, libsecret). When encryption is unavailable, secrets are kept in
 * memory only and the caller must warn the user instead of writing plaintext.
 */
export class TokenVault {
  private readonly file: JsonFile<VaultFile>
  private memory: Record<string, StoredSecret> = {}
  private persistent = false

  constructor(userDataDir: string, private readonly box: EncryptionBox) {
    this.file = new JsonFile<VaultFile>(join(userDataDir, 'accounts.vault.json'))
  }

  get isPersistent(): boolean {
    return this.persistent
  }

  async load(): Promise<void> {
    this.persistent = await this.box.isAvailable().catch(() => false)
    if (!this.persistent) return
    const data = await this.file.read(
      (raw) => raw as VaultFile,
      () => ({ schemaVersion: 1 as const, entries: {} })
    )
    this.memory = {}
    for (const [accountId, payload] of Object.entries(data.entries ?? {})) {
      try {
        this.memory[accountId] = JSON.parse(this.box.decrypt(Buffer.from(payload, 'base64'))) as StoredSecret
      } catch {
        // A secret that cannot be decrypted (moved profile, rotated key) is dropped.
      }
    }
  }

  get(accountId: string): StoredSecret | undefined {
    return this.memory[accountId]
  }

  async set(accountId: string, secret: StoredSecret): Promise<void> {
    this.memory[accountId] = secret
    if (this.persistent) await this.flush()
  }

  async delete(accountId: string): Promise<void> {
    delete this.memory[accountId]
    if (this.persistent) await this.flush()
  }

  private async flush(): Promise<void> {
    const entries: Record<string, string> = {}
    for (const [accountId, secret] of Object.entries(this.memory)) {
      entries[accountId] = this.box.encrypt(JSON.stringify(secret)).toString('base64')
    }
    await this.file.write({ schemaVersion: 1, entries })
  }
}
