import { ConfigError } from '../core/errors'
import type { ParsedConnectionUrl } from '../types/config'

export function parseConnectionUrl(input: string): ParsedConnectionUrl {
  let parsed: URL

  try {
    parsed = new URL(input)
  } catch {
    throw new ConfigError('Invalid Cloudflare KV connection URL')
  }

  if (parsed.protocol !== 'cfkv:' && parsed.protocol !== 'redis+cfkv:') {
    throw new ConfigError('Connection URL must use `cfkv://` or `redis+cfkv://`')
  }

  const baseUrl = `${parsed.protocol === 'cfkv:' ? 'https:' : 'https:'}//${parsed.host}${parsed.pathname}`.replace(/\/$/, '')
  const timeoutMs = parsed.searchParams.get('timeoutMs')
  const keyPrefix = parsed.searchParams.get('keyPrefix')

  return {
    baseUrl,
    token: parsed.username || undefined,
    timeoutMs: timeoutMs ? Number.parseInt(timeoutMs, 10) : undefined,
    keyPrefix: keyPrefix || undefined
  }
}
