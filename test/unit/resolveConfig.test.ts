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
    delete process.env.CLOUDFLARE_KV_TRANSPORT
    delete process.env.CLOUDFLARE_KV_WS_URL
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

  it('defaults transport to http', () => {
    const config = resolveConfig({
      url: 'cfkv://token@worker.example.com/root',
      fetch: vi.fn() as unknown as typeof fetch
    })

    expect(config.transport).toBe('http')
    expect(config.wsUrl).toBeUndefined()
  })

  it('resolves websocket transport from env', () => {
    process.env.CLOUDFLARE_KV_URL = 'cfkv://env-token@worker.example.com/root'
    process.env.CLOUDFLARE_KV_TRANSPORT = 'ws'
    process.env.CLOUDFLARE_KV_WS_URL = 'wss://worker.example.com/root/ws'

    const config = resolveConfig({
      fetch: vi.fn() as unknown as typeof fetch,
      webSocketFactory: vi.fn()
    })

    expect(config.transport).toBe('ws')
    expect(config.wsUrl).toBe('wss://worker.example.com/root/ws')
  })

  it('requires wsUrl for websocket transport', () => {
    expect(() => resolveConfig({
      url: 'cfkv://token@worker.example.com/root',
      transport: 'ws',
      fetch: vi.fn() as unknown as typeof fetch,
      webSocketFactory: vi.fn()
    })).toThrowError('Missing WebSocket URL')
  })
})
