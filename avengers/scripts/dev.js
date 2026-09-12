import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)))
const viteBin = path.join(root, 'node_modules', 'vite', 'bin', 'vite.js')
const services = [
  {
    name: 'dashboard',
    command: process.execPath,
    args: [viteBin, '--host', '127.0.0.1', '--port', '5173', '--strictPort'],
  },
  {
    name: 'auth-api',
    command: process.execPath,
    args: [path.join(root, 'server', 'index.js')],
  },
]

const children = services.map((service) => {
  const child = spawn(service.command, service.args, {
    cwd: root,
    env: process.env,
    stdio: 'inherit',
  })

  child.on('error', (error) => {
    console.error(`[${service.name}] failed to start: ${error.message}`)
  })

  return { ...service, child }
})

let stopping = false
function stop(exitCode = 0) {
  if (stopping) return
  stopping = true

  for (const { child } of children) {
    if (!child.killed) child.kill()
  }

  setTimeout(() => process.exit(exitCode), 150).unref()
}

for (const { name, child } of children) {
  child.on('exit', (code, signal) => {
    if (stopping) return
    console.error(`[${name}] stopped${signal ? ` (${signal})` : ` with code ${code}`}.`)
    stop(code || 1)
  })
}

process.on('SIGINT', () => stop(0))
process.on('SIGTERM', () => stop(0))

console.log('Starting AVVA dashboard and local authentication service…')
