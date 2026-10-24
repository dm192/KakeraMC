import { BrowserWindow, shell } from 'electron'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

export const APP_SCHEME = 'app'
export const APP_ORIGIN = `${APP_SCHEME}://kakera`

const DEV_SERVER_URL = process.env.ELECTRON_RENDERER_URL

/** Only these hosts may be opened in the user's browser from the UI. */
const EXTERNAL_ALLOWLIST = [
  'login.microsoftonline.com',
  'login.live.com',
  'www.microsoft.com',
  'account.xbox.com',
  'api.minecraftservices.com',
  'www.minecraft.net',
  'help.minecraft.net',
  'github.com'
]

export function isAllowedExternal(url: string): boolean {
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'https:') return false
    return EXTERNAL_ALLOWLIST.some((host) => parsed.hostname === host || parsed.hostname.endsWith(`.${host}`))
  } catch {
    return false
  }
}

export async function openExternalSafely(url: string): Promise<void> {
  if (!isAllowedExternal(url)) {
    throw new Error(`Refusing to open non-allowlisted url: ${url}`)
  }
  await shell.openExternal(url)
}

export function createMainWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1180,
    height: 760,
    minWidth: 960,
    minHeight: 640,
    show: false,
    backgroundColor: '#0B0C0E',
    title: 'KakeraMC Launcher',
    autoHideMenuBar: true,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    webPreferences: {
      preload: join(__dirname, '../preload/index.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
      spellcheck: false,
      devTools: !process.env.KAKERA_NO_DEVTOOLS
    }
  })

  window.once('ready-to-show', () => window.show())

  window.webContents.setWindowOpenHandler(({ url }) => {
    if (isAllowedExternal(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })

  window.webContents.on('will-navigate', (event, url) => {
    const allowed = DEV_SERVER_URL ? url.startsWith(DEV_SERVER_URL) : url.startsWith(APP_ORIGIN)
    if (!allowed) {
      event.preventDefault()
      if (isAllowedExternal(url)) void shell.openExternal(url)
    }
  })

  if (DEV_SERVER_URL) {
    void window.loadURL(DEV_SERVER_URL)
  } else {
    void window.loadURL(`${APP_ORIGIN}/index.html`)
    // Fallback for environments where the custom protocol handler is not installed.
    window.webContents.on('did-fail-load', () => {
      void window.loadFile(join(__dirname, '../renderer/index.html'))
    })
  }

  return window
}

export function rendererIndex(): string {
  return pathToFileURL(join(__dirname, '../renderer/index.html')).toString()
}
