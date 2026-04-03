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
      wsUrl: 'wss://worker.example.com/root/ws',
      webSocketFactory,
      fetch: vi.fn() as unknown as typeof fetch
    })

    await expect(redis.get('socket:key')).resolves.toBe('ws-value')
    expect(webSocketFactory).toHaveBeenCalledTimes(1)
  })

  it('closes websocket transport on quit', async () => {
    let socketRef: FakeWebSocket | undefined

    const redis = new Redis({
      url: 'cfkv://token@worker.example.com/root',
      transport: 'ws',
      wsUrl: 'wss://worker.example.com/root/ws',
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
})
