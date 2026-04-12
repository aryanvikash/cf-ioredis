import { DEFAULT_TIMEOUT_MS } from './defaults'
import { readEnvConfig } from './env'
import { parseConnectionUrl } from './parseConnectionUrl'
import { ConfigError } from '../core/errors'
import type { RedisOptions, ResolvedConfig, WebSocketFactory, WebSocketLike } from '../types/config'

function resolveFetch(override?: typeof fetch): typeof fetch {
  if (override) {
    return override
  }

  if (typeof globalThis.fetch !== 'function') {
    throw new ConfigError('Global fetch is not available; provide a fetch implementation in Redis options')
  }

  return globalThis.fetch
}

function resolveWebSocketFactory(override?: WebSocketFactory): WebSocketFactory | undefined {
  if (override) {
    return override
  }

  const webSocketCtor = globalThis.WebSocket as undefined | (new (url: string) => WebSocketLike)

  if (typeof webSocketCtor !== 'function') {
    return undefined
  }

  return (url: string) => new webSocketCtor(url)
}

function deriveWebSocketUrl(baseUrl: string): string {
  const url = new URL(baseUrl)
  url.protocol = url.protocol === 'http:' ? 'ws:' : 'wss:'

  const basePath = url.pathname.replace(/\/$/, '')

  if (!basePath || basePath === '/') {
    url.pathname = '/ws'
  } else if (basePath.endsWith('/ws')) {
    url.pathname = basePath
  } else {
    url.pathname = `${basePath}/ws`
  }

  return url.toString()
}

export function resolveConfig(input?: string | RedisOptions): ResolvedConfig {
  const envConfig = readEnvConfig()
  const constructorOptions: RedisOptions = typeof input === 'string' ? { url: input } : input ?? {}
  const explicitUrl = typeof input === 'string' ? input : constructorOptions.url

  const parsedUrl = explicitUrl
    ? parseConnectionUrl(explicitUrl)
    : envConfig.url
      ? parseConnectionUrl(envConfig.url)
      : undefined

  const source = explicitUrl
    ? 'constructor-url'
    : constructorOptions.url || constructorOptions.token || constructorOptions.timeoutMs || constructorOptions.keyPrefix
      ? 'constructor-options'
      : envConfig.url || envConfig.token || envConfig.timeoutMs || envConfig.keyPrefix
        ? 'env'
        : 'default'

  const finalBaseUrl = parsedUrl?.baseUrl

  if (!finalBaseUrl) {
    throw new ConfigError('Missing Cloudflare KV base URL. Set `CLOUDFLARE_KV_URL` or pass `url` to the Redis constructor')
  }

  const timeoutMs = constructorOptions.timeoutMs ?? parsedUrl?.timeoutMs ?? envConfig.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const transport = constructorOptions.transport ?? envConfig.transport ?? 'http'
  const wsUrl = constructorOptions.wsUrl ?? envConfig.wsUrl ?? deriveWebSocketUrl(finalBaseUrl)

  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new ConfigError('`timeoutMs` must be a positive integer')
  }

  if (transport !== 'http' && transport !== 'ws') {
    throw new ConfigError('`transport` must be either `http` or `ws`')
  }

  const webSocketFactory = resolveWebSocketFactory(constructorOptions.webSocketFactory)

  if (transport === 'ws' && !webSocketFactory) {
    throw new ConfigError('Global WebSocket is not available; provide a webSocketFactory in Redis options')
  }

  return {
    baseUrl: finalBaseUrl,
    token: constructorOptions.token ?? parsedUrl?.token ?? envConfig.token,
    timeoutMs,
    keyPrefix: constructorOptions.keyPrefix ?? parsedUrl?.keyPrefix ?? envConfig.keyPrefix ?? '',
    allowEmulatedCommands: constructorOptions.allowEmulatedCommands ?? false,
    transport,
    wsUrl,
    headers: constructorOptions.headers ?? {},
    fetch: resolveFetch(constructorOptions.fetch),
    webSocketFactory,
    source
  }
}
