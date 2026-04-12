import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { Redis } from '../../src'

const httpUrl = process.env.CF_REDIS_KV_TEST_URL ?? 'cfkv://test@cf-redis-kv-worker-private.aryanvikash.workers.dev'
const wsUrl = process.env.CF_REDIS_KV_TEST_WS_URL
const runWsIntegration = process.env.CF_REDIS_KV_RUN_WS_INTEGRATION === 'true'
const prefix = `integration:${Date.now()}:${Math.random().toString(36).slice(2)}:`

function scoped(key: string): string {
  return `${prefix}${key}`
}

async function averageLatency(label: string, run: () => Promise<unknown>, rounds = 5): Promise<number> {
  const samples: number[] = []

  for (let index = 0; index < rounds; index += 1) {
    const start = performance.now()
    await run()
    samples.push(performance.now() - start)
  }

  const average = samples.reduce((sum, value) => sum + value, 0) / samples.length
  process.stdout.write(`${label} average latency: ${average.toFixed(2)}ms\n`)
  return average
}

describe.sequential('deployed worker integration', () => {
  let httpRedis: Redis
  let wsRedis: Redis | undefined

  beforeAll(() => {
    httpRedis = new Redis({
      url: httpUrl,
      allowEmulatedCommands: true,
      timeoutMs: 60000
    })

    if (runWsIntegration) {
      wsRedis = new Redis({
        url: httpUrl,
        transport: 'ws',
        ...(wsUrl ? { wsUrl } : {}),
        allowEmulatedCommands: true,
        timeoutMs: 60000
      })
    }
  })

  afterAll(async () => {
    await httpRedis.del(
      scoped('string'),
      scoped('mset:one'),
      scoped('mset:two'),
      scoped('expire'),
      scoped('pexpire'),
      scoped('persist'),
      scoped('pipeline'),
      scoped('multi'),
      scoped('duplicate'),
      scoped('latency:http'),
      scoped('latency:ws')
    )

    const shutdowns = [httpRedis.quit()]

    if (wsRedis) {
      shutdowns.push(wsRedis.quit())
    }

    await Promise.allSettled(shutdowns)
  })

  it('covers the supported HTTP client methods end-to-end', async () => {
    await expect(httpRedis.type(scoped('missing'))).resolves.toBe('none')
    await expect(httpRedis.set(scoped('string'), 'hello')).resolves.toBe('OK')
    await expect(httpRedis.get(scoped('string'))).resolves.toBe('hello')
    await expect(httpRedis.exists(scoped('string'))).resolves.toBe(1)
    await expect(httpRedis.type(scoped('string'))).resolves.toBe('string')

    await expect(httpRedis.mset({
      [scoped('mset:one')]: 'one',
      [scoped('mset:two')]: 'two'
    })).resolves.toBe('OK')
    await expect(httpRedis.mget(scoped('mset:one'), scoped('mset:two'), scoped('missing'))).resolves.toEqual(['one', 'two', null])

    await httpRedis.set(scoped('expire'), 'expire-me')
    await expect(httpRedis.expire(scoped('expire'), 10)).resolves.toBe(1)
    const ttl = await httpRedis.ttl(scoped('expire'))
    expect(ttl).toBeGreaterThan(0)
    expect(ttl).toBeLessThanOrEqual(10)

    await httpRedis.set(scoped('pexpire'), 'expire-me-too')
    await expect(httpRedis.pexpire(scoped('pexpire'), 1800)).resolves.toBe(1)
    const pttl = await httpRedis.pttl(scoped('pexpire'))
    expect(pttl).toBeGreaterThan(0)
    expect(pttl).toBeLessThanOrEqual(1800)

    await httpRedis.set(scoped('persist'), 'persist-me')
    await expect(httpRedis.expire(scoped('persist'), 10)).resolves.toBe(1)
    await expect(httpRedis.persist(scoped('persist'))).resolves.toBe(1)
    await expect(httpRedis.ttl(scoped('persist'))).resolves.toBe(-1)

    const pipelineResult = await httpRedis.pipeline()
      .set(scoped('pipeline'), 'pipe')
      .get(scoped('pipeline'))
      .exists(scoped('pipeline'))
      .exec()
    expect(pipelineResult).toEqual([
      [null, 'OK'],
      [null, 'pipe'],
      [null, 1]
    ])

    const multiResult = await httpRedis.multi()
      .set(scoped('multi'), 'multi-value')
      .get(scoped('multi'))
      .exec()
    expect(multiResult).toEqual([
      [null, 'OK'],
      [null, 'multi-value']
    ])

    const duplicate = httpRedis.duplicate()
    await expect(duplicate.set(scoped('duplicate'), 'dup')).resolves.toBe('OK')
    await expect(duplicate.get(scoped('duplicate'))).resolves.toBe('dup')
    await expect(duplicate.quit()).resolves.toBe('OK')

    httpRedis.disconnect()
    await expect(httpRedis.set(scoped('string'), 'hello-again')).resolves.toBe('OK')
    await expect(httpRedis.del(scoped('string'), scoped('mset:one'), scoped('mset:two'))).resolves.toBe(3)
  }, 60000)

  it('measures HTTP latency against the deployed worker', async () => {
    await httpRedis.set(scoped('latency:http'), 'latency-http')

    const httpLatency = await averageLatency('HTTP get', async () => {
      await httpRedis.get(scoped('latency:http'))
    })

    expect(httpLatency).toBeGreaterThan(0)
  }, 60000)
})

const itIfWs = runWsIntegration ? it : it.skip

describe.sequential('deployed worker websocket integration', () => {
  let wsRedis: Redis

  beforeAll(() => {
    wsRedis = new Redis({
      url: httpUrl,
      transport: 'ws',
      ...(wsUrl ? { wsUrl } : {}),
      allowEmulatedCommands: true,
      timeoutMs: 60000
    })
  })

  afterAll(async () => {
    await Promise.allSettled([
      wsRedis?.del(scoped('string'), scoped('pipeline'), scoped('latency:ws')) ?? Promise.resolve(0),
      wsRedis?.quit() ?? Promise.resolve('OK')
    ])
  })

  itIfWs('covers websocket transport and measures latency', async () => {
    await expect(wsRedis.set(scoped('string'), 'ws-hello')).resolves.toBe('OK')
    await expect(wsRedis.get(scoped('string'))).resolves.toBe('ws-hello')
    await expect(wsRedis.exists(scoped('string'))).resolves.toBe(1)

    const wsPipeline = await wsRedis.pipeline()
      .set(scoped('pipeline'), 'ws-pipe')
      .get(scoped('pipeline'))
      .exec()
    expect(wsPipeline).toEqual([
      [null, 'OK'],
      [null, 'ws-pipe']
    ])

    await wsRedis.set(scoped('latency:ws'), 'latency-ws')
    const wsLatency = await averageLatency('WS get', async () => {
      await wsRedis.get(scoped('latency:ws'))
    })

    expect(wsLatency).toBeGreaterThan(0)
  }, 60000)
})
