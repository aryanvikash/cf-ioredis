import { describe, expect, it, vi } from 'vitest'
import { Redis } from '../../src'

function createFetch() {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)

    if (url.endsWith('/get?key=user%3A1')) {
      return new Response(JSON.stringify({ key: 'user:1', entry: { value: { type: 'string', encoding: 'utf8', value: 'alice' }, ttlMs: null } }), { status: 200 })
    }

    if (url.endsWith('/set')) {
      const body = JSON.parse(String(init?.body))

      return new Response(JSON.stringify({ ok: true, applied: body.options?.nx !== true, previous: null }), { status: 200 })
    }

    if (url.endsWith('/mget')) {
      return new Response(JSON.stringify({ entries: [{ value: { type: 'string', encoding: 'utf8', value: 'a' }, ttlMs: null }, { value: null, ttlMs: null }] }), { status: 200 })
    }

    if (url.endsWith('/mset')) {
      return new Response(JSON.stringify({ ok: true }), { status: 200 })
    }

    throw new Error(`Unhandled URL ${url}`)
  }) as unknown as typeof fetch
}

describe('string commands', () => {
  it('executes get and set style commands', async () => {
    const redis = new Redis({
      url: 'cfkv://token@worker.example.com',
      fetch: createFetch()
    })

    await expect(redis.get('user:1')).resolves.toBe('alice')
    await expect(redis.set('user:1', 'bob')).resolves.toBe('OK')
    await expect(redis.set('user:1', 'bob', { nx: true })).resolves.toBeNull()
    await expect(redis.mget('one', 'two')).resolves.toEqual(['a', null])
    await expect(redis.mset({ one: '1', two: '2' })).resolves.toBe('OK')
  })
})
