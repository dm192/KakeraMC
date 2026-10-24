import { contextBridge, ipcRenderer } from 'electron'

/**
 * Deliberately generic: the typed API and error objects are built in the
 * renderer (`src/renderer/src/api.ts`). Custom properties on an Error do not
 * survive the context bridge, so the bridge only moves plain envelopes.
 */
const kakeraBridge = {
  invoke(channel: string, arg?: unknown): Promise<unknown> {
    return ipcRenderer.invoke(channel, arg) as Promise<unknown>
  },
  on(channel: string, callback: (payload: unknown) => void): () => void {
    const listener = (_event: unknown, payload: unknown): void => callback(payload)
    ipcRenderer.on(channel, listener)
    return () => {
      ipcRenderer.removeListener(channel, listener)
    }
  }
}

contextBridge.exposeInMainWorld('kakeraBridge', kakeraBridge)
