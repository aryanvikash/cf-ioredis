import { describe, expect, it, vi } from 'vitest'
import { Redis } from '../../src'

function createFetch() {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)

    if (url.endsWith('/exists') && init?.method === 'POST') {
      return new Response(JSON.stringify({ count: 2 }), { status: 200 })
    }

    if (url.endsWith('/delete') && init?.method === 'DELETE') {
      return new Response(JSON.stringify({ deleted: 1 }), { status: 200 })
    }

    if (url.includes('/ttl?key=')) {
      return new Response(JSON.stringify({ exists: true, ttlMs: 2500 }), { status: 200 })
    }

    if (url.endsWith('/expire') && init?.method === 'POST') {
      return new Response(JSON.stringify({ applied: true }), { status: 200 })
    }

    if (url.endsWith('/persist') && init?.method === 'POST') {
      return new Response(JSON.stringify({ persisted: true }), { status: 200 })
    }

    if (url.includes('/type?key=')) {
      return new Response(JSON.stringify({ type: 'string' }), { status: 200 })
    }

    throw new Error(`Unhandled URL ${url}`)
  }) as unknown as typeof fetch
}

describe('key commands', () => {
  it('maps ttl and existence operations to integer replies', async () => {
    const redis = new Redis({
      url: 'cfkv://token@worker.example.com',
      fetch: createFetch()
    })

    await expect(redis.exists('a', 'b')).resolves.toBe(2)
    await expect(redis.del('a')).resolves.toBe(1)
    await expect(redis.expire('a', 10)).resolves.toBe(1)
    await expect(redis.pexpire('a', 2000)).resolves.toBe(1)
    await expect(redis.ttl('a')).resolves.toBe(3)
    await expect(redis.pttl('a')).resolves.toBe(2500)
    await expect(redis.persist('a')).resolves.toBe(1)
    await expect(redis.type('a')).resolves.toBe('string')
  })
})
