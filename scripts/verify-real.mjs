/**
 * Runs the opt-in integration suite against the real Mojang/Fabric/Modrinth
 * network and a throwaway game directory. Kept out of `npm test` so a normal
 * test run never depends on the internet.
 */
import { spawn } from 'node:child_process'

const isWindows = process.platform === 'win32'
const npx = isWindows ? 'npx.cmd' : 'npx'

const child = spawn(npx, ['vitest', 'run', '--config', 'vitest.integration.config.ts'], {
  stdio: 'inherit',
  env: { ...process.env, KAKERA_NET_TESTS: '1' },
  shell: isWindows
})

child.on('exit', (code) => {
  process.exit(code ?? 1)
})
