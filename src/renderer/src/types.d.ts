import type { KakeraBridge } from './api'

declare global {
  interface Window {
    kakeraBridge: KakeraBridge
  }
}

export {}
