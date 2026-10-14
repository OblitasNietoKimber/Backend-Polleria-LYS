import { readFile, writeFile } from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'
import { INSFORGE_PROJECT } from '../Front-Polleria-LYS-main/src/lib/insforgeConfig.js'

const root = new URL('../', import.meta.url)
const project = JSON.parse(await readFile(new URL('.insforge/project.json', root), 'utf8'))
if (project.project_id !== INSFORGE_PROJECT.id || project.oss_host.replace(/\/$/, '') !== INSFORGE_PROJECT.baseUrl) {
  throw new Error(`Vincula primero el repositorio a ${INSFORGE_PROJECT.name} con InsForge CLI.`)
}

const run = promisify(execFile)
const args = ['-y', '@insforge/cli', 'secrets', 'get', 'ANON_KEY', '--json']
const { stdout } = process.platform === 'win32'
  ? await run('cmd.exe', ['/d', '/s', '/c', 'npx -y @insforge/cli secrets get ANON_KEY --json'], { cwd: fileURLToPath(root) })
  : await run('npx', args, { cwd: fileURLToPath(root) })
const { value: anonKey } = JSON.parse(stdout)
if (typeof anonKey !== 'string' || !anonKey || anonKey.startsWith('ik_') || /[\r\n]/.test(anonKey)) {
  throw new Error('InsForge no devolvió una clave anónima pública válida.')
}
await writeFile(new URL('Front-Polleria-LYS-main/.env.local', root),
  `VITE_INSFORGE_BASE_URL=${INSFORGE_PROJECT.baseUrl}\nVITE_INSFORGE_ANON_KEY=${anonKey}\n`, { mode: 0o600 })
console.log(`Configuración local preparada para ${INSFORGE_PROJECT.name}; ninguna clave se imprime ni se versiona.`)
