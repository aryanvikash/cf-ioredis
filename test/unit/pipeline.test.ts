import { describe, expect, it, vi } from 'vitest'
import { Redis } from '../../src'

function createFetch() {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)

    if (url.includes('/get?key=')) {
      return new Response(JSON.stringify({ key: 'a', entry: { value: { type: 'string', encoding: 'utf8', value: '1' }, ttlMs: null } }), { status: 200 })
    }

    if (url.endsWith('/set')) {
      return new Response(JSON.stringify({ ok: true, applied: true, previous: null }), { status: 200 })
    }

    if (url.endsWith('/delete')) {
      return new Response(JSON.stringify({ deleted: 1 }), { status: 200 })
    }

    throw new Error(`Unhandled URL ${url} ${String(init?.method)}`)
  }) as unknown as typeof fetch
}

describe('pipeline', () => {
  it('returns ioredis-style tuples', async () => {
    const redis = new Redis({
      url: 'cfkv://token@worker.example.com',
      fetch: createFetch()
    })

    const result = await redis.pipeline().get('a').set('a', '2').del('a').exec()

    expect(result).toEqual([
      [null, '1'],
      [null, 'OK'],
      [null, 1]
    ])
  })
})
