import { ConfigError } from './errors'
import type { RedisOptions, ResolvedConfig, TransportMode, WebSocketFactory, WebSocketLike } from './types'

const DEFAULT_TIMEOUT_MS = 5000
const DEFAULT_TRANSPORT: TransportMode = 'ws'

const ENV_KEYS = {
  url: 'CLOUDFLARE_KV_URL',
  token: 'CLOUDFLARE_KV_TOKEN',
  timeoutMs: 'CLOUDFLARE_KV_TIMEOUT_MS',
  keyPrefix: 'CLOUDFLARE_KV_KEY_PREFIX',
  namespace: 'CLOUDFLARE_KV_NAMESPACE',
  transport: 'CLOUDFLARE_KV_TRANSPORT',
  wsUrl: 'CLOUDFLARE_KV_WS_URL'
}

interface UrlParts {
  baseUrl: string
  token?: string
  timeoutMs?: number
  keyPrefix?: string
  namespace?: string
}

export function resolveConfig(input?: string | RedisOptions): ResolvedConfig {
  const opts: RedisOptions = typeof input === 'string' ? { url: input } : (input ?? {})
  const env = readEnv()

  const url = opts.url ?? env.url
  if (!url) {
    throw new ConfigError(
      `Missing Cloudflare KV URL. Set ${ENV_KEYS.url} or pass \`url\` to the Redis constructor`
    )
  }

  const fromUrl = parseConnectionUrl(url)
  const timeoutMs = pickInt(opts.timeoutMs, fromUrl.timeoutMs, env.timeoutMs, DEFAULT_TIMEOUT_MS)
  const transport = pickTransport(opts.transport, env.transport)
  const wsUrl = opts.wsUrl ?? env.wsUrl ?? deriveWsUrl(fromUrl.baseUrl)
  const webSocketFactory = opts.webSocketFactory ?? defaultWsFactory()

  if (transport === 'ws' && !webSocketFactory) {
    throw new ConfigError('Global WebSocket is not available; provide a `webSocketFactory` in Redis options')
  }

  return {
    baseUrl: fromUrl.baseUrl,
    token: opts.token ?? fromUrl.token ?? env.token,
    timeoutMs,
    keyPrefix: opts.keyPrefix ?? fromUrl.keyPrefix ?? env.keyPrefix ?? '',
    namespace: opts.namespace ?? fromUrl.namespace ?? env.namespace,
    allowEmulatedCommands: opts.allowEmulatedCommands ?? false,
    transport,
    wsUrl,
    headers: opts.headers ?? {},
    fetch: opts.fetch ?? requireFetch(),
    webSocketFactory
  }
}

export function parseConnectionUrl(input: string): UrlParts {
  let parsed: URL
  try {
    parsed = new URL(input)
  } catch {
    throw new ConfigError('Invalid Cloudflare KV connection URL')
  }

  if (parsed.protocol !== 'cfkv:' && parsed.protocol !== 'redis+cfkv:') {
    throw new ConfigError('Connection URL must use `cfkv://` or `redis+cfkv://`')
  }

  const baseUrl = `https://${parsed.host}${parsed.pathname}`.replace(/\/$/, '')
  const params = parsed.searchParams

  return {
    baseUrl,
    token: parsed.username || undefined,
    timeoutMs: parseIntOrUndef(params.get('timeoutMs')),
    keyPrefix: params.get('keyPrefix') || undefined,
    namespace: params.get('namespace') || params.get('ns') || undefined
  }
}

function readEnv(): RedisOptions {
  const e = typeof process !== 'undefined' ? (process.env ?? {}) : {}
  return {
    url: e[ENV_KEYS.url],
    token: e[ENV_KEYS.token],
    timeoutMs: parseIntOrUndef(e[ENV_KEYS.timeoutMs]),
    keyPrefix: e[ENV_KEYS.keyPrefix],
    namespace: e[ENV_KEYS.namespace],
    transport: e[ENV_KEYS.transport] as TransportMode | undefined,
    wsUrl: e[ENV_KEYS.wsUrl]
  }
}

function deriveWsUrl(baseUrl: string): string {
  const url = new URL(baseUrl)
  url.protocol = url.protocol === 'http:' ? 'ws:' : 'wss:'
  const path = url.pathname.replace(/\/$/, '')
  url.pathname = path && path !== '/' ? `${path}/ws` : '/ws'
  if (url.pathname.endsWith('/ws/ws')) url.pathname = url.pathname.slice(0, -3)
  return url.toString()
}

function defaultWsFactory(): WebSocketFactory | undefined {
  const ctor = (globalThis as { WebSocket?: new (url: string) => WebSocketLike }).WebSocket
  return typeof ctor === 'function' ? (url: string) => new ctor(url) : undefined
}

function requireFetch(): typeof fetch {
  if (typeof globalThis.fetch !== 'function') {
    throw new ConfigError('Global fetch is not available; provide a `fetch` implementation in Redis options')
  }
  return globalThis.fetch
}

function pickInt(...values: Array<number | undefined>): number {
  for (const v of values) {
    if (v === undefined) continue
    if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0) {
      throw new ConfigError('`timeoutMs` must be a positive integer')
    }
    return v
  }
  throw new ConfigError('`timeoutMs` must be a positive integer')
}

function pickTransport(...values: Array<TransportMode | undefined>): TransportMode {
  for (const v of values) {
    if (v === 'http' || v === 'ws') return v
    if (v !== undefined) throw new ConfigError('`transport` must be either `http` or `ws`')
  }
  return DEFAULT_TRANSPORT
}

function parseIntOrUndef(input: string | null | undefined): number | undefined {
  if (input == null || input === '') return undefined
  const n = Number.parseInt(input, 10)
  return Number.isFinite(n) ? n : undefined
}
