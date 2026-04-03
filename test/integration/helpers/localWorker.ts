import { spawn, type ChildProcess } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export interface LocalWorkerHandle {
  httpUrl: string
  wsUrl: string
  token: string
  stop: () => Promise<void>
}

const WORKER_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../worker')
const WRANGLER_BIN = join(WORKER_DIR, 'node_modules', '.bin', 'wrangler')
const HOST = '127.0.0.1'
const TOKEN = 'test'

async function getAvailablePort(): Promise<number> {
  return await new Promise((resolve, reject) => {
    const server = createServer()

    server.listen(0, HOST, () => {
      const address = server.address()

      if (!address || typeof address === 'string') {
        reject(new Error('Failed to allocate local port for wrangler dev'))
        return
      }

      const { port } = address
      server.close(() => resolve(port))
    })

    server.on('error', reject)
  })
}

async function waitForReady(url: string, timeoutMs: number): Promise<void> {
  const startedAt = Date.now()

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url)

      if (response.ok) {
        return
      }
    } catch {
      // ignore until ready
    }

    await new Promise((resolve) => setTimeout(resolve, 250))
  }

  throw new Error(`Timed out waiting for local worker readiness at ${url}`)
}

export async function startLocalWorker(): Promise<LocalWorkerHandle> {
  const port = await getAvailablePort()
  const stateDir = await mkdtemp(join(tmpdir(), 'cf-redis-kv-worker-'))
  await writeFile(join(WORKER_DIR, '.dev.vars'), `AUTH_TOKEN=${TOKEN}\n`, 'utf8')

  const child = spawn(WRANGLER_BIN, ['dev', '--port', String(port), '--ip', HOST, '--persist-to', stateDir], {
    cwd: WORKER_DIR,
    env: {
      ...process.env,
      FORCE_COLOR: '0'
    },
    stdio: ['ignore', 'pipe', 'pipe']
  })

  let output = ''
  child.stdout.on('data', (chunk) => {
    output += String(chunk)
  })
  child.stderr.on('data', (chunk) => {
    output += String(chunk)
  })

  const teardown = async (): Promise<void> => {
    await stopProcess(child)
    await Promise.allSettled([
      rm(join(WORKER_DIR, '.dev.vars'), { force: true }),
      rm(stateDir, { recursive: true, force: true })
    ])
  }

  const readyUrl = `http://${HOST}:${port}/type?key=healthcheck&token=${TOKEN}`

  try {
    await waitForReady(readyUrl, 30000)
  } catch (error) {
    await teardown()
    throw new Error(`${error instanceof Error ? error.message : String(error)}\n${output}`)
  }

  return {
    httpUrl: `cfkv://${TOKEN}@${HOST}:${port}`,
    wsUrl: `ws://${HOST}:${port}/ws`,
    token: TOKEN,
    stop: teardown
  }
}

async function stopProcess(child: ChildProcess): Promise<void> {
  if (child.killed || child.exitCode !== null) {
    return
  }

  await new Promise<void>((resolve) => {
    const timeout = setTimeout(() => {
      child.kill('SIGKILL')
    }, 5000)

    child.once('exit', () => {
      clearTimeout(timeout)
      resolve()
    })

    child.kill('SIGTERM')
  })
}
