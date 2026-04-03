import { beforeEach, describe, expect, it, vi } from 'vitest'
import { resolveConfig } from '../../src/config/resolveConfig'

describe('resolveConfig', () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    process.env = { ...originalEnv }
    delete process.env.CLOUDFLARE_KV_URL
    delete process.env.CLOUDFLARE_KV_TOKEN
    delete process.env.CLOUDFLARE_KV_TIMEOUT_MS
    delete process.env.CLOUDFLARE_KV_KEY_PREFIX
  })

  it('prefers constructor url over env url', () => {
    process.env.CLOUDFLARE_KV_URL = 'cfkv://env-token@env.example.com/kv'

    const config = resolveConfig({
      url: 'cfkv://constructor-token@worker.example.com/api?timeoutMs=1234&keyPrefix=app:',
      fetch: vi.fn() as unknown as typeof fetch
    })

    expect(config.baseUrl).toBe('https://worker.example.com/api')
    expect(config.token).toBe('constructor-token')
    expect(config.timeoutMs).toBe(1234)
    expect(config.keyPrefix).toBe('app:')
    expect(config.source).toBe('constructor-url')
  })

  it('falls back to env config when constructor input is missing', () => {
    process.env.CLOUDFLARE_KV_URL = 'cfkv://env-token@worker.example.com/root'
    process.env.CLOUDFLARE_KV_TIMEOUT_MS = '2000'
    process.env.CLOUDFLARE_KV_KEY_PREFIX = 'env:'

    const config = resolveConfig({
      fetch: vi.fn() as unknown as typeof fetch
    })

    expect(config.baseUrl).toBe('https://worker.example.com/root')
    expect(config.token).toBe('env-token')
    expect(config.timeoutMs).toBe(2000)
    expect(config.keyPrefix).toBe('env:')
    expect(config.source).toBe('env')
  })
})
