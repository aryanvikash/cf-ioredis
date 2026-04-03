import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { Redis } from '../../src'
import { startLocalWorker, type LocalWorkerHandle } from './helpers/localWorker'

const prefix = `local:${Date.now()}:${Math.random().toString(36).slice(2)}:`

function scoped(key: string): string {
  return `${prefix}${key}`
}

async function averageLatency(label: string, run: () => Promise<unknown>, rounds = 10): Promise<number> {
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

describe.sequential('local worker end-to-end', () => {
  let handle: LocalWorkerHandle
  let httpRedis: Redis
  let wsRedis: Redis
  let pubSubRedis: Redis

  beforeAll(async () => {
    handle = await startLocalWorker()

    httpRedis = new Redis({
      url: handle.httpUrl,
      wsUrl: handle.wsUrl,
      timeoutMs: 30000,
      allowEmulatedCommands: true
    })

    wsRedis = new Redis({
      url: handle.httpUrl,
      transport: 'ws',
      wsUrl: handle.wsUrl,
      timeoutMs: 30000,
      allowEmulatedCommands: true
    })

    pubSubRedis = new Redis({
      url: handle.httpUrl,
      wsUrl: handle.wsUrl,
      timeoutMs: 30000
    })
  }, 90000)

  afterAll(async () => {
    if (!handle) {
      return
    }

    await Promise.allSettled([
      httpRedis?.del(
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
        scoped('latency:ws'),
        scoped('ws:string'),
        scoped('ws:pipeline')
      ) ?? Promise.resolve(0),
      httpRedis?.quit() ?? Promise.resolve('OK'),
      wsRedis?.quit() ?? Promise.resolve('OK'),
      pubSubRedis?.quit() ?? Promise.resolve('OK')
    ])

    await handle.stop()
  }, 20000)

  it('covers supported methods over HTTP', async () => {
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
  }, 60000)

  it('covers supported methods over WebSocket', async () => {
    await expect(wsRedis.set(scoped('ws:string'), 'ws-hello')).resolves.toBe('OK')
    await expect(wsRedis.get(scoped('ws:string'))).resolves.toBe('ws-hello')
    await expect(wsRedis.exists(scoped('ws:string'))).resolves.toBe(1)

    const pipelineResult = await wsRedis.pipeline()
      .set(scoped('ws:pipeline'), 'pipe-ws')
      .get(scoped('ws:pipeline'))
      .exec()
    expect(pipelineResult).toEqual([
      [null, 'OK'],
      [null, 'pipe-ws']
    ])

    await expect(wsRedis.multi().set(scoped('multi'), 'ws-multi').get(scoped('multi')).exec()).resolves.toEqual([
      [null, 'OK'],
      [null, 'ws-multi']
    ])
  }, 60000)

  it('measures warm local latency for HTTP and WebSocket', async () => {
    await httpRedis.set(scoped('latency:http'), 'latency-http')
    await wsRedis.set(scoped('latency:ws'), 'latency-ws')

    const httpGetLatency = await averageLatency('Local HTTP get', async () => {
      await httpRedis.get(scoped('latency:http'))
    })

    const httpSetLatency = await averageLatency('Local HTTP set', async () => {
      await httpRedis.set(scoped('latency:http'), 'latency-http')
    })

    const wsGetLatency = await averageLatency('Local WS get', async () => {
      await wsRedis.get(scoped('latency:ws'))
    })

    expect(httpGetLatency).toBeGreaterThan(0)
    expect(httpSetLatency).toBeGreaterThan(0)
    expect(wsGetLatency).toBeGreaterThan(0)
  }, 60000)

  it('supports live pubsub over durable objects', async () => {
    const channel = scoped('pubsub')
    const subscriberTwo = new Redis({
      url: handle.httpUrl,
      wsUrl: handle.wsUrl,
      timeoutMs: 30000
    })

    const receivedOne: Array<[string, string]> = []
    const receivedTwo: Array<[string, string]> = []

    pubSubRedis.on('message', (receivedChannel, message) => {
      receivedOne.push([receivedChannel, message])
    })

    subscriberTwo.on('message', (receivedChannel, message) => {
      receivedTwo.push([receivedChannel, message])
    })

    await expect(pubSubRedis.subscribe(channel)).resolves.toBe(1)
    await expect(subscriberTwo.subscribe(channel)).resolves.toBe(1)
    await expect(httpRedis.publish(channel, 'hello-pubsub')).resolves.toBe(2)

    await waitFor(() => receivedOne.length === 1 && receivedTwo.length === 1)
    expect(receivedOne).toEqual([[channel, 'hello-pubsub']])
    expect(receivedTwo).toEqual([[channel, 'hello-pubsub']])

    await expect(subscriberTwo.unsubscribe(channel)).resolves.toBe(0)
    await expect(httpRedis.publish(channel, 'only-one')).resolves.toBe(1)
    await waitFor(() => receivedOne.length === 2)
    expect(receivedOne).toEqual([[channel, 'hello-pubsub'], [channel, 'only-one']])
    expect(receivedTwo).toEqual([[channel, 'hello-pubsub']])

    await Promise.allSettled([
      pubSubRedis.unsubscribe(channel),
      subscriberTwo.quit()
    ])
  }, 60000)
})

async function waitFor(condition: () => boolean, timeoutMs = 5000): Promise<void> {
  const startedAt = Date.now()

  while (Date.now() - startedAt < timeoutMs) {
    if (condition()) {
      return
    }

    await new Promise((resolve) => setTimeout(resolve, 25))
  }

  throw new Error('Timed out waiting for pub/sub messages')
}
