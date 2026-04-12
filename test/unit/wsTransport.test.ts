import { describe, expect, it, vi } from 'vitest'
import { Redis } from '../../src'
import type { WebSocketLike } from '../../src'

class FakeWebSocket implements WebSocketLike {
  readyState = 0
  onopen: ((event: unknown) => void) | null = null
  onmessage: ((event: { data: string }) => void) | null = null
  onerror: ((event: unknown) => void) | null = null
  onclose: ((event: unknown) => void) | null = null
  sentMessages: string[] = []

  constructor(private readonly responder: (message: string, socket: FakeWebSocket) => void) {
    queueMicrotask(() => {
      this.readyState = 1
      this.onopen?.({})
    })
  }

  send(data: string): void {
    this.sentMessages.push(data)
    this.responder(data, this)
  }

  close(): void {
    this.readyState = 3
    this.onclose?.({})
  }

  reply(payload: unknown): void {
    this.onmessage?.({ data: JSON.stringify(payload) })
  }
}

describe('websocket transport', () => {
  it('executes commands over websocket transport', async () => {
    const webSocketFactory = vi.fn((_: string) => new FakeWebSocket((raw, socket) => {
      const message = JSON.parse(raw) as { id: string; action: string; payload: { key: string } }

      if (message.action === 'get') {
        socket.reply({
          id: message.id,
          ok: true,
          data: {
            key: message.payload.key,
            entry: {
              value: { type: 'string', encoding: 'utf8', value: 'ws-value' },
              ttlMs: null
            }
          }
        })
      }
    }))

    const redis = new Redis({
      url: 'cfkv://token@worker.example.com/root',
      transport: 'ws',
      webSocketFactory,
      fetch: vi.fn() as unknown as typeof fetch
    })

    await expect(redis.get('socket:key')).resolves.toBe('ws-value')
    expect(webSocketFactory).toHaveBeenCalledWith('wss://worker.example.com/root/ws?token=token')
  })

  it('closes websocket transport on quit', async () => {
    let socketRef: FakeWebSocket | undefined

    const redis = new Redis({
      url: 'cfkv://token@worker.example.com/root',
      transport: 'ws',
      webSocketFactory: () => {
        socketRef = new FakeWebSocket((raw, socket) => {
          const message = JSON.parse(raw) as { id: string; action: string }
          socket.reply({ id: message.id, ok: true, data: { type: 'none' } })
        })

        return socketRef
      },
      fetch: vi.fn() as unknown as typeof fetch
    })

    await redis.type('missing')
    await expect(redis.quit()).resolves.toBe('OK')
    expect(socketRef?.readyState).toBe(3)
  })

  it('supports pubsub events and publish counts', async () => {
    const subscribers = new Map<string, FakeWebSocket>()
    const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input))

      if (url.pathname.endsWith('/publish')) {
        const body = JSON.parse(String(init?.body)) as { channel: string; message: string }
        const socket = subscribers.get(body.channel)

        if (socket) {
          socket.reply({
            type: 'message',
            channel: body.channel,
            message: body.message
          })
        }

        return new Response(JSON.stringify({ receivers: socket ? 1 : 0 }), { status: 200 })
      }

      throw new Error(`Unhandled URL ${url}`)
    }) as unknown as typeof fetch

    const redis = new Redis({
      url: 'cfkv://token@worker.example.com/root',
      webSocketFactory: (url: string) => new FakeWebSocket((raw, socket) => {
        const frame = JSON.parse(raw) as { type: string; channel?: string; message?: string }
        const channel = new URL(url).searchParams.get('channel') as string

        if (frame.type === 'subscribe') {
          subscribers.set(channel, socket)
          socket.reply({ type: 'subscribe', channel, count: 1 })
        }

        if (frame.type === 'publish') {
          socket.reply({ type: 'message', channel, message: frame.message })
          socket.reply({ type: 'publish', channel, receivers: 1 })
        }

        if (frame.type === 'unsubscribe') {
          subscribers.delete(channel)
          socket.reply({ type: 'unsubscribe', channel, count: 0 })
        }
      }),
      fetch
    })

    const received: Array<[string, string]> = []
    redis.on('message', (channel, message) => {
      received.push([channel, message])
    })

    await expect(redis.subscribe('updates')).resolves.toBe(1)
    await expect(redis.publish('updates', 'hello')).resolves.toBe(1)
    expect(received).toEqual([['updates', 'hello']])
    expect(fetch).not.toHaveBeenCalled()
    await expect(redis.unsubscribe('updates')).resolves.toBe(0)
    await expect(redis.quit()).resolves.toBe('OK')
  })

  it('falls back to HTTP publish without an active pubsub socket', async () => {
    const fetch = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { channel: string; message: string }
      return new Response(JSON.stringify({ receivers: body.channel === 'updates' && body.message === 'hello' ? 1 : 0 }), { status: 200 })
    }) as unknown as typeof fetch

    const redis = new Redis({
      url: 'cfkv://token@worker.example.com/root',
      fetch,
      webSocketFactory: vi.fn()
    })

    await expect(redis.publish('updates', 'hello')).resolves.toBe(1)
    expect(fetch).toHaveBeenCalledTimes(1)
  })
})
