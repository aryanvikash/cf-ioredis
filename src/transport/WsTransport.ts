import { TransportError } from '../errors'
import type { ResolvedConfig, RpcEnvelope, RpcResponse, WebSocketLike } from '../types'
import type { Transport } from './Transport'

interface PendingCall {
  resolve: (value: unknown) => void
  reject: (reason: unknown) => void
  timer: ReturnType<typeof setTimeout>
}

export class WsTransport implements Transport {
  private socket?: WebSocketLike
  private connecting?: Promise<WebSocketLike>
  private readonly pending = new Map<string, PendingCall>()
  private nextId = 0

  constructor(private readonly config: ResolvedConfig) {}

  async request<T>(action: string, payload?: unknown): Promise<T> {
    const socket = await this.ensureSocket()
    const envelope: RpcEnvelope = { id: this.id(), action, payload }

    return await new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(envelope.id)
        reject(new TransportError(`WebSocket request timed out for action \`${action}\``))
      }, this.config.timeoutMs)

      this.pending.set(envelope.id, { resolve: resolve as (v: unknown) => void, reject, timer })

      try {
        socket.send(JSON.stringify(envelope))
      } catch (error) {
        clearTimeout(timer)
        this.pending.delete(envelope.id)
        reject(
          new TransportError(error instanceof Error ? error.message : 'Failed to send WebSocket request')
        )
      }
    })
  }

  async close(): Promise<void> {
    const socket = this.socket
    this.socket = undefined
    this.connecting = undefined
    socket?.close(1000, 'client disconnect')
    this.failAllPending(new TransportError('WebSocket transport closed'))
  }

  private id(): string {
    return `${Date.now()}-${this.nextId++}`
  }

  private async ensureSocket(): Promise<WebSocketLike> {
    if (this.socket && this.socket.readyState === 1) return this.socket
    if (this.connecting) return this.connecting

    const factory = this.config.webSocketFactory
    if (!factory) throw new TransportError('WebSocket transport is not configured')

    this.connecting = new Promise<WebSocketLike>((resolve, reject) => {
      const socket = factory(this.buildUrl())
      let settled = false
      const timer = setTimeout(
        () => settle(reject, new TransportError('WebSocket connection timed out')),
        this.config.timeoutMs
      )

      const settle = (fn: (v: unknown) => void, value: unknown) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        fn(value)
      }

      socket.onopen = () => {
        this.socket = socket
        this.attachHandlers(socket)
        settle(resolve as (v: unknown) => void, socket)
      }
      socket.onerror = () => settle(reject, new TransportError('WebSocket connection failed'))
      socket.onclose = () => settle(reject, new TransportError('WebSocket connection closed before opening'))
    }).finally(() => {
      this.connecting = undefined
    })

    return await this.connecting
  }

  private attachHandlers(socket: WebSocketLike): void {
    socket.onmessage = (event) => {
      let response: RpcResponse
      try {
        response = JSON.parse(event.data) as RpcResponse
      } catch {
        this.failAllPending(new TransportError('Received invalid WebSocket payload'))
        return
      }

      const call = this.pending.get(response.id)
      if (!call) return

      clearTimeout(call.timer)
      this.pending.delete(response.id)

      if (response.ok) {
        call.resolve(response.data)
      } else {
        call.reject(new TransportError(response.error?.message ?? 'WebSocket request failed'))
      }
    }

    socket.onerror = () => {
      this.socket = undefined
      this.failAllPending(new TransportError('WebSocket transport error'))
    }

    socket.onclose = () => {
      this.socket = undefined
      this.failAllPending(new TransportError('WebSocket transport closed'))
    }
  }

  private buildUrl(): string {
    const url = new URL(this.config.wsUrl)
    if (this.config.token) url.searchParams.set('token', this.config.token)
    if (this.config.namespace) url.searchParams.set('ns', this.config.namespace)
    return url.toString()
  }

  private failAllPending(error: TransportError): void {
    for (const [id, call] of this.pending) {
      clearTimeout(call.timer)
      call.reject(error)
      this.pending.delete(id)
    }
  }
}
