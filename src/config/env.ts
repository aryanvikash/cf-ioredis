import type { RedisOptions } from '../types/config'

type EnvMap = Record<string, string | undefined>

export function readEnvConfig(env: EnvMap = process.env): RedisOptions {
  const timeoutRaw = env.CLOUDFLARE_KV_TIMEOUT_MS

  return {
    url: env.CLOUDFLARE_KV_URL,
    token: env.CLOUDFLARE_KV_TOKEN,
    timeoutMs: timeoutRaw ? Number.parseInt(timeoutRaw, 10) : undefined,
    keyPrefix: env.CLOUDFLARE_KV_KEY_PREFIX,
    headers: undefined
  }
}
