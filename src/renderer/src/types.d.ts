import type { KakeraApi } from '@shared/types'

declare global {
  interface Window {
    kakera: KakeraApi
  }
}

export {}
