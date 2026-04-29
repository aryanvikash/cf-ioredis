import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { parseConnectionUrl, resolveConfig } from '../../src/config'
import { ConfigError } from '../../src/errors'

describe('parseConnectionUrl', () => {
  it('parses cfkv:// scheme into HTTPS base URL', () => {
    const parts = parseConnectionUrl('cfkv://token@worker.example.com')
    expect(parts.baseUrl).toBe('https://worker.example.com')
    expect(parts.token).toBe('token')
  })

  it('accepts redis+cfkv:// alias', () => {
    const parts = parseConnectionUrl('redis+cfkv://t@worker.example.com/api')
    expect(parts.baseUrl).toBe('https://worker.example.com/api')
  })

  it('extracts query options', () => {
    const parts = parseConnectionUrl(
      'cfkv://worker.example.com?keyPrefix=app:&namespace=tenant-a&timeoutMs=2000'
    )
    expect(parts.keyPrefix).toBe('app:')
    expect(parts.namespace).toBe('tenant-a')
    expect(parts.timeoutMs).toBe(2000)
  })

  it('throws ConfigError on unsupported scheme', () => {
    expect(() => parseConnectionUrl('https://worker.example.com')).toThrow(ConfigError)
  })
})

describe('resolveConfig', () => {
  it('throws when no URL is provided anywhere', () => {
    const original = process.env.CLOUDFLARE_KV_URL
    delete process.env.CLOUDFLARE_KV_URL
    try {
      expect(() => resolveConfig()).toThrow(ConfigError)
    } finally {
      if (original) process.env.CLOUDFLARE_KV_URL = original
    }
  })

  it('accepts a string URL shorthand', () => {
    const config = resolveConfig('cfkv://token@worker.example.com')
    expect(config.baseUrl).toBe('https://worker.example.com')
    expect(config.token).toBe('token')
  })

  it('options override URL params', () => {
    const config = resolveConfig({
      url: 'cfkv://token@worker.example.com?keyPrefix=fromUrl:',
      keyPrefix: 'fromOpts:',
      timeoutMs: 9000
    })
    expect(config.keyPrefix).toBe('fromOpts:')
    expect(config.timeoutMs).toBe(9000)
  })

  it('defaults to ws when a WebSocket factory is available', () => {
    const config = resolveConfig({
      url: 'cfkv://worker.example.com',
      webSocketFactory: () => ({}) as never
    })
    expect(config.transport).toBe('ws')
  })

  describe('with no global WebSocket', () => {
    let originalWs: unknown

    beforeEach(() => {
      originalWs = (globalThis as { WebSocket?: unknown }).WebSocket
      vi.stubGlobal('WebSocket', undefined)
    })

    afterEach(() => {
      vi.stubGlobal('WebSocket', originalWs)
    })

    it('falls back to http transport instead of throwing', () => {
      const config = resolveConfig('cfkv://worker.example.com')
      expect(config.transport).toBe('http')
    })

    it('throws if ws transport is explicitly requested', () => {
      expect(() => resolveConfig({ url: 'cfkv://worker.example.com', transport: 'ws' })).toThrowError(
        /webSocketFactory/
      )
    })
  })

  it('derives a ws URL from baseUrl when not set', () => {
    const config = resolveConfig('cfkv://worker.example.com/api')
    expect(config.wsUrl).toMatch(/^wss:\/\/worker\.example\.com\/api\/ws$/)
  })

  it('rejects invalid timeoutMs', () => {
    expect(() => resolveConfig({ url: 'cfkv://worker.example.com', timeoutMs: -1 })).toThrow(ConfigError)
  })
})
