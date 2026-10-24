import { app, BrowserWindow, protocol, session } from 'electron'
import { readFile } from 'node:fs/promises'
import { extname, join, normalize, sep } from 'node:path'
import { APP_ORIGIN, APP_SCHEME, createMainWindow, openExternalSafely } from './window'
import { createServices } from './services/services'
import type { LauncherServices } from './services/services'
import { registerIpc } from './ipc/register'

protocol.registerSchemesAsPrivileged([
  {
    scheme: APP_SCHEME,
    privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true }
  }
])

const userDataOverride = process.env.KAKERAMC_USERDATA
if (userDataOverride) app.setPath('userData', userDataOverride)

app.setName('KakeraMC Launcher')

const FAKE_BACKEND = process.env.KAKERAMC_E2E_FAKE === '1'

let mainWindow: BrowserWindow | null = null
let services: LauncherServices | null = null

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.json': 'application/json'
}

function rendererRoot(): string {
  return join(__dirname, '../renderer')
}

async function serveRenderer(request: Request): Promise<Response> {
  const url = new URL(request.url)
  const relative = normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, '')
  const root = rendererRoot()
  const target = join(root, relative === '' ? 'index.html' : relative)
  if (!target.startsWith(root.endsWith(sep) ? root : `${root}${sep}`)) {
    return new Response('Forbidden', { status: 403 })
  }
  try {
    const body = await readFile(target)
    const type = MIME[extname(target).toLowerCase()] ?? 'application/octet-stream'
    return new Response(new Uint8Array(body), { headers: { 'content-type': type } })
  } catch {
    return new Response('Not found', { status: 404 })
  }
}

function applyContentSecurityPolicy(): void {
  const dev = Boolean(process.env.ELECTRON_RENDERER_URL)
  const csp = dev
    ? [
        "default-src 'self'",
        "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: https:",
        "connect-src 'self' ws: http://localhost:* http://127.0.0.1:*",
        "object-src 'none'",
        "base-uri 'none'"
      ].join('; ')
    : [
        "default-src 'self'",
        "script-src 'self'",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: https:",
        "font-src 'self'",
        "connect-src 'self'",
        "object-src 'none'",
        "base-uri 'none'",
        "form-action 'none'",
        "frame-ancestors 'none'"
      ].join('; ')

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [csp]
      }
    })
  })

  session.defaultSession.setPermissionRequestHandler((_contents, permission, callback) => {
    callback(permission === 'clipboard-sanitized-write')
  })
}

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
  })

  void app.whenReady().then(async () => {
    protocol.handle(APP_SCHEME, serveRenderer)
    applyContentSecurityPolicy()

    services = await createServices({
      userDataDir: app.getPath('userData'),
      appVersion: app.getVersion(),
      openExternal: openExternalSafely,
      fake: FAKE_BACKEND
    })

    registerIpc(services, () => mainWindow)

    mainWindow = createMainWindow()
    mainWindow.on('closed', () => {
      mainWindow = null
    })

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) mainWindow = createMainWindow()
    })
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })

  app.on('before-quit', () => {
    services?.dispose()
  })
}

export { APP_ORIGIN }
