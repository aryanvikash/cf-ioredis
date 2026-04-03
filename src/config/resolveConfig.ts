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

function resolveWebSocketFactory(transport: ResolvedConfig['transport'], override?: WebSocketFactory): WebSocketFactory | undefined {
  if (override) {
    return override
  }

  if (transport !== 'ws') {
    return undefined
  }

  const webSocketCtor = globalThis.WebSocket as undefined | (new (url: string) => WebSocketLike)

  if (typeof webSocketCtor !== 'function') {
    throw new ConfigError('Global WebSocket is not available; provide a webSocketFactory in Redis options')
  }

  return (url: string) => new webSocketCtor(url)
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
  const wsUrl = constructorOptions.wsUrl ?? envConfig.wsUrl

  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new ConfigError('`timeoutMs` must be a positive integer')
  }

  if (transport !== 'http' && transport !== 'ws') {
    throw new ConfigError('`transport` must be either `http` or `ws`')
  }

  if (transport === 'ws' && !wsUrl) {
    throw new ConfigError('Missing WebSocket URL. Set `CLOUDFLARE_KV_WS_URL` or pass `wsUrl` when `transport` is `ws`')
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
    webSocketFactory: resolveWebSocketFactory(transport, constructorOptions.webSocketFactory),
    source
  }
}
