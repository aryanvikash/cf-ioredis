import { describe, expect, it } from 'vitest'
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

  it('defaults to ws transport', () => {
    const config = resolveConfig('cfkv://worker.example.com')
    expect(config.transport).toBe('ws')
  })

  it('derives a ws URL from baseUrl when not set', () => {
    const config = resolveConfig('cfkv://worker.example.com/api')
    expect(config.wsUrl).toMatch(/^wss:\/\/worker\.example\.com\/api\/ws$/)
  })

  it('rejects invalid timeoutMs', () => {
    expect(() => resolveConfig({ url: 'cfkv://worker.example.com', timeoutMs: -1 })).toThrow(ConfigError)
  })
})
