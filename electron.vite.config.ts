import { builtinModules } from 'node:module'
import { resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'electron-vite'

/**
 * Runtime dependencies are bundled into the main process on purpose: `@xmcl/*`
 * and their transitive ESM-only dependencies would otherwise need a matching
 * module format at runtime. Only Electron and Node built-ins stay external.
 */
const nodeExternals = ['electron', ...builtinModules, ...builtinModules.map((m) => `node:${m}`)]

export default defineConfig({
  main: {
    build: {
      target: 'node24',
      sourcemap: true,
      minify: false,
      rollupOptions: {
        external: nodeExternals,
        output: { format: 'es', entryFileNames: '[name].js' }
      }
    },
    resolve: {
      alias: {
        '@shared': resolve('src/shared'),
        '@main': resolve('src/main')
      }
    }
  },
  preload: {
    build: {
      target: 'node24',
      sourcemap: true,
      minify: false,
      rollupOptions: {
        // Sandboxed preload scripts must be CommonJS.
        external: nodeExternals,
        output: { format: 'cjs', entryFileNames: '[name].cjs' }
      }
    },
    resolve: {
      alias: { '@shared': resolve('src/shared') }
    }
  },
  renderer: {
    root: 'src/renderer',
    build: {
      rollupOptions: { input: resolve('src/renderer/index.html') }
    },
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src'),
        '@shared': resolve('src/shared')
      }
    },
    plugins: [react()]
  }
})
