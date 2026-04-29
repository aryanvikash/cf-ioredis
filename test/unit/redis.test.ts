import { describe, expect, it, vi } from 'vitest'
import { Redis } from '../../src'
import type { RpcEnvelope } from '../../src/types'

interface FakeFetchOptions {
  responder: (envelope: RpcEnvelope) => unknown
}

function fakeFetch({ responder }: FakeFetchOptions): typeof fetch {
  return vi.fn(async (_input: unknown, init?: RequestInit) => {
    const envelope = JSON.parse(String(init?.body)) as RpcEnvelope
    const data = responder(envelope)
    return new Response(JSON.stringify({ id: envelope.id, ok: true, data }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    })
  }) as unknown as typeof fetch
}

function makeClient(responder: FakeFetchOptions['responder'], extras: Record<string, unknown> = {}): Redis {
  return new Redis({
    url: 'cfkv://test@worker.example.com',
    transport: 'http',
    fetch: fakeFetch({ responder }),
    ...extras
  })
}

describe('Redis (via fake fetch)', () => {
  it('encodes a get and decodes the entry', async () => {
    const redis = makeClient((envelope) => {
      expect(envelope.action).toBe('get')
      expect(envelope.payload).toEqual({ key: 'user:1' })
      return { entry: { value: { type: 'string', encoding: 'utf8', value: 'alice' }, ttlMs: null } }
    })

    expect(await redis.get('user:1')).toBe('alice')
  })

  it('applies keyPrefix on outgoing keys', async () => {
    const redis = makeClient(
      (envelope) => {
        expect((envelope.payload as { key: string }).key).toBe('app:user:1')
        return { entry: { value: null, ttlMs: null } }
      },
      { keyPrefix: 'app:' }
    )

    await redis.get('user:1')
  })

  it('returns OK on applied set, null on rejected NX', async () => {
    const redis = makeClient(() => ({ ok: true, applied: true, previous: null }))
    expect(await redis.set('a', 'b')).toBe('OK')

    const rejected = makeClient(() => ({
      ok: true,
      applied: false,
      previous: { type: 'string', encoding: 'utf8', value: 'x' }
    }))
    expect(await rejected.set('a', 'b', { nx: true })).toBeNull()
  })

  it('incr/decr forward to incrby with correct delta', async () => {
    const seen: Array<{ action: string; delta: number }> = []
    const redis = makeClient((envelope) => {
      const payload = envelope.payload as { delta: number }
      seen.push({ action: envelope.action, delta: payload.delta })
      return { value: 7 }
    })

    await redis.incr('counter')
    await redis.decr('counter')
    await redis.incrby('counter', 5)
    await redis.decrby('counter', 3)

    expect(seen).toEqual([
      { action: 'incrby', delta: 1 },
      { action: 'incrby', delta: -1 },
      { action: 'incrby', delta: 5 },
      { action: 'incrby', delta: -3 }
    ])
  })

  it('pipeline.exec returns ordered tuples', async () => {
    const redis = makeClient((envelope) => {
      if (envelope.action === 'get') {
        return { entry: { value: { type: 'string', encoding: 'utf8', value: '1' }, ttlMs: null } }
      }
      if (envelope.action === 'set') return { ok: true, applied: true, previous: null }
      throw new Error(`Unexpected action ${envelope.action}`)
    })

    const result = await redis.pipeline().get('a').set('a', '2').exec()
    expect(result).toEqual([
      [null, '1'],
      [null, 'OK']
    ])
  })

  it('ttl returns -2 when key missing, -1 when no expiry', async () => {
    const missing = makeClient(() => ({ exists: false, ttlMs: null }))
    expect(await missing.ttl('a')).toBe(-2)

    const noExpiry = makeClient(() => ({ exists: true, ttlMs: null }))
    expect(await noExpiry.ttl('a')).toBe(-1)

    const withTtl = makeClient(() => ({ exists: true, ttlMs: 5000 }))
    expect(await withTtl.ttl('a')).toBe(5)
  })
})
