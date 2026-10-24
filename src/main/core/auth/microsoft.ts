import { createHash } from 'node:crypto'
import { MicrosoftAuthenticator, MicrosoftMinecraftXboxLoginError } from '@xmcl/user'
import type { XBoxResponse } from '@xmcl/user'
import { PublicClientApplication } from '@azure/msal-node'
import type { AccountInfo, AuthenticationResult, Configuration } from '@azure/msal-node'
import { KakeraError } from '@shared/errors'
import type { AuthPrompt } from '@shared/types'

export const MS_SCOPES = ['XboxLive.signin', 'offline_access']
export const MS_AUTHORITY = 'https://login.microsoftonline.com/consumers'
const PROFILE_URL = 'https://api.minecraftservices.com/minecraft/profile'

export interface MinecraftSession {
  accessToken: string
  expiresAt: number
  name: string
  uuid: string
}

export interface MicrosoftAuthResult {
  msalAccountId: string
  msalCache: string
  minecraft: MinecraftSession
}

export interface MicrosoftAuthOptions {
  /** null when the user has not configured an Azure public client yet. */
  clientId: string | null
  openExternal: (url: string) => Promise<void>
  onPrompt: (prompt: AuthPrompt | null) => void
  fetchImpl?: typeof fetch
}

/**
 * Microsoft identity flow: MSAL owns OAuth2 (PKCE, loopback redirect, device
 * code, refresh cache); `@xmcl/user` owns the Xbox Live -> XSTS -> Minecraft
 * token exchange. The Code decides nothing about scopes silently.
 */
export class MicrosoftAuth {
  constructor(private readonly options: MicrosoftAuthOptions) {}

  get configured(): boolean {
    return Boolean(this.options.clientId)
  }

  async interactive(serializedCache?: string): Promise<MicrosoftAuthResult> {
    this.options.onPrompt({ kind: 'browser' })
    try {
      const app = this.createClient(serializedCache)
      const result = await app.acquireTokenInteractive({
        scopes: MS_SCOPES,
        prompt: 'select_account',
        openBrowser: async (url: string) => {
          await this.options.openExternal(url)
        }
      })
      return await this.finish(app, result)
    } finally {
      this.options.onPrompt(null)
    }
  }

  async deviceCode(serializedCache?: string): Promise<MicrosoftAuthResult> {
    const app = this.createClient(serializedCache)
    try {
      const result = await app.acquireTokenByDeviceCode({
        scopes: MS_SCOPES,
        deviceCodeCallback: (response) => {
          this.options.onPrompt({
            kind: 'device-code',
            userCode: response.userCode,
            verificationUri: response.verificationUri,
            expiresAt: Date.now() + response.expiresIn * 1000
          })
        }
      })
      if (!result) throw new KakeraError('auth.failed', 'Microsoft device code sign-in returned no result')
      return await this.finish(app, result)
    } catch (error) {
      throw mapMicrosoftError(error)
    } finally {
      this.options.onPrompt(null)
    }
  }

  async silent(serializedCache: string, accountId: string): Promise<MicrosoftAuthResult> {
    const app = this.createClient(serializedCache)
    const account = await this.findAccount(app, accountId)
    if (!account) throw new KakeraError('auth.needs-reauth', 'The cached Microsoft account is gone')
    try {
      const result = await app.acquireTokenSilent({ account, scopes: MS_SCOPES })
      return await this.finish(app, result)
    } catch (error) {
      throw mapMicrosoftError(error)
    }
  }

  private createClient(serializedCache?: string): PublicClientApplication {
    const clientId = this.options.clientId
    if (!clientId) {
      throw new KakeraError(
        'auth.not-configured',
        'No Microsoft application client id configured',
        'Set microsoftClientId in settings'
      )
    }
    const configuration: Configuration = {
      auth: {
        clientId,
        authority: MS_AUTHORITY
      }
    }
    const app = new PublicClientApplication(configuration)
    if (serializedCache) {
      try {
        app.getTokenCache().deserialize(serializedCache)
      } catch {
        // A stale or foreign cache is ignored; the user signs in again.
      }
    }
    return app
  }

  private async findAccount(app: PublicClientApplication, accountId: string): Promise<AccountInfo | null> {
    const accounts = await app.getTokenCache().getAllAccounts()
    return accounts.find((account) => account.homeAccountId === accountId) ?? null
  }

  private async finish(app: PublicClientApplication, result: AuthenticationResult): Promise<MicrosoftAuthResult> {
    const account = result.account
    if (!account) throw new KakeraError('auth.failed', 'Microsoft sign-in returned no account')

    const authenticator = new MicrosoftAuthenticator(
      this.options.fetchImpl ? { fetch: this.options.fetchImpl } : undefined
    )

    let xsts: { uhs: string; token: string }
    try {
      const { minecraftXstsResponse } = await authenticator.acquireXBoxToken(result.accessToken)
      const xui = minecraftXstsResponse.DisplayClaims.xui[0] as XBoxResponse['DisplayClaims']['xui'][0]
      xsts = { uhs: xui.uhs, token: minecraftXstsResponse.Token }
    } catch (error) {
      throw mapXboxError(error)
    }

    let minecraftToken: { access_token: string; expires_in: number }
    try {
      minecraftToken = await authenticator.loginMinecraftWithXBox(xsts.uhs, xsts.token)
    } catch (error) {
      throw mapXboxError(error)
    }

    const profile = await this.fetchProfile(minecraftToken.access_token)

    return {
      msalAccountId: account.homeAccountId,
      msalCache: app.getTokenCache().serialize(),
      minecraft: {
        accessToken: minecraftToken.access_token,
        expiresAt: Date.now() + minecraftToken.expires_in * 1000,
        name: profile.name,
        uuid: profile.id
      }
    }
  }

  private async fetchProfile(accessToken: string): Promise<{ id: string; name: string }> {
    const fetchImpl = this.options.fetchImpl ?? fetch
    const response = await fetchImpl(PROFILE_URL, {
      headers: { Authorization: `Bearer ${accessToken}` }
    })
    if (response.status === 404) {
      throw new KakeraError('auth.no-minecraft', 'This Microsoft account does not own Minecraft: Java Edition')
    }
    if (!response.ok) {
      throw new KakeraError('auth.failed', `Minecraft profile request failed with HTTP ${response.status}`)
    }
    const profile = (await response.json()) as { id?: string; name?: string }
    if (!profile.id || !profile.name) {
      throw new KakeraError('auth.failed', 'Minecraft profile response is incomplete')
    }
    return { id: profile.id, name: profile.name }
  }
}

export function mapXboxError(error: unknown): KakeraError {
  if (error instanceof MicrosoftMinecraftXboxLoginError) {
    if (error.status === 403) {
      return new KakeraError('auth.no-minecraft', 'Xbox Live refused the Minecraft entitlement check', 'HTTP 403')
    }
    return new KakeraError(
      error.retryable ? 'net.failed' : 'auth.failed',
      `Minecraft authentication failed with HTTP ${error.status}`,
      error.body.slice(0, 200)
    )
  }
  const message = error instanceof Error ? error.message : String(error)
  if (/2148916233/.test(message)) {
    return new KakeraError('auth.xbox-blocked', 'This Microsoft account has no Xbox profile', 'XSTS 2148916233')
  }
  if (/2148916238/.test(message)) {
    return new KakeraError('auth.xbox-blocked', 'A child account requires family approval', 'XSTS 2148916238')
  }
  return new KakeraError('auth.failed', message)
}

export function mapMicrosoftError(error: unknown): KakeraError {
  if (error instanceof KakeraError) return error
  const message = error instanceof Error ? error.message : String(error)
  if (/AADSTS70011|invalid_scope/i.test(message)) {
    return new KakeraError('auth.failed', 'The Azure application does not expose the XboxLive.signin scope', message.slice(0, 200))
  }
  if (/invalid_client|unauthorized_client|AADSTS700016/i.test(message)) {
    return new KakeraError('auth.not-configured', 'The configured client id was rejected by Microsoft', message.slice(0, 200))
  }
  if (/state_mismatch|invalid_state/i.test(message)) {
    return new KakeraError('auth.state-mismatch', 'The sign-in response did not match the pending request')
  }
  if (/code_expired|expired_token|timed out|timeout/i.test(message)) {
    return new KakeraError('auth.timeout', 'The sign-in request expired')
  }
  if (/cancel/i.test(message)) {
    return new KakeraError('auth.canceled', 'Sign-in was canceled')
  }
  return new KakeraError('auth.failed', message.slice(0, 300))
}

/** PKCE helper kept public for tests: S256 challenge of a verifier. */
export function pkceChallenge(verifier: string): string {
  return createHash('sha256').update(verifier).digest('base64url')
}
