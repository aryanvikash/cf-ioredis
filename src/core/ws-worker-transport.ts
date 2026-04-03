import { TransportError } from './errors'
import type { KvTransport } from './transport'
import type { ResolvedConfig, WebSocketLike } from '../types/config'
import type { RedisKey, SetOptions } from '../types/commands'
import type {
  WorkerBatchGetResponse,
  WorkerDeleteResponse,
  WorkerExistsResponse,
  WorkerGetResponse,
  WorkerMSetRequest,
  WorkerPersistResponse,
  WorkerSetRequest,
  WorkerSetResponse,
  WorkerTypeResponse,
  WsRequestEnvelope,
  WsResponseEnvelope
} from '../types/internal'
import type { KvRecord } from '../types/responses'
import { decodeValue, encodeValue } from '../utils/encoding'

interface InflightRequest {
  resolve: (value: unknown) => void
  reject: (reason?: unknown) => void
  timeout: ReturnType<typeof setTimeout>
}

export class WebSocketWorkerTransport implements KvTransport {
  private socket?: WebSocketLike
  private connectPromise?: Promise<WebSocketLike>
  private readonly inflight = new Map<string, InflightRequest>()
  private nextId = 0

  constructor(private readonly config: ResolvedConfig) {}

  async get(key: RedisKey): Promise<KvRecord> {
    const response = await this.send<WorkerGetResponse>('get', { key })

    return {
      value: decodeValue(response.entry.value),
      ttlMs: response.entry.ttlMs
    }
  }

  async mget(keys: RedisKey[]): Promise<KvRecord[]> {
    const response = await this.send<WorkerBatchGetResponse>('mget', { keys })

    return response.entries.map((entry) => ({
      value: decodeValue(entry.value),
      ttlMs: entry.ttlMs
    }))
  }

  async set(key: RedisKey, value: string, options?: SetOptions): Promise<{ applied: boolean; previous: string | null }> {
    const response = await this.send<WorkerSetResponse>('set', {
      key,
      value: encodeValue(value),
      options
    } satisfies WorkerSetRequest)

    return {
      applied: response.applied,
      previous: decodeValue(response.previous ?? null)
    }
  }

  async mset(entries: Array<{ key: RedisKey; value: string; options?: SetOptions }>): Promise<'OK'> {
    await this.send('mset', {
      entries: entries.map((entry) => ({
        key: entry.key,
        value: encodeValue(entry.value),
        options: entry.options
      }))
    } satisfies WorkerMSetRequest)

    return 'OK'
  }

  async del(keys: RedisKey[]): Promise<number> {
    const response = await this.send<WorkerDeleteResponse>('delete', { keys })
    return response.deleted
  }

  async exists(keys: RedisKey[]): Promise<number> {
    const response = await this.send<WorkerExistsResponse>('exists', { keys })
    return response.count
  }

  async expire(key: RedisKey, ttlMs: number): Promise<boolean> {
    const response = await this.send<{ applied: boolean }>('expire', { key, ttlMs })
    return response.applied
  }

  async ttl(key: RedisKey): Promise<number> {
    const response = await this.send<{ ttlMs: number | null; exists: boolean }>('ttl', { key })

    if (!response.exists) {
      return -2
    }

    if (response.ttlMs === null) {
      return -1
    }

    return response.ttlMs
  }

  async persist(key: RedisKey): Promise<boolean> {
    const response = await this.send<WorkerPersistResponse>('persist', { key })
    return response.persisted
  }

  async type(key: RedisKey): Promise<'string' | 'none'> {
    const response = await this.send<WorkerTypeResponse>('type', { key })
    return response.type
  }

  async close(): Promise<void> {
    if (!this.socket) {
      return
    }

    const socket = this.socket
    this.socket = undefined
    this.connectPromise = undefined
    socket.close(1000, 'client disconnect')
    this.rejectInflight(new TransportError('WebSocket transport closed'))
  }

  private async send<T>(action: string, payload?: unknown): Promise<T> {
    const socket = await this.ensureSocket()
    const id = `${Date.now()}-${this.nextId++}`
    const message: WsRequestEnvelope = { id, action, payload }

    const result = await new Promise<unknown>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.inflight.delete(id)
        reject(new TransportError(`WebSocket request timed out for action ${action}`))
      }, this.config.timeoutMs)

      this.inflight.set(id, { resolve, reject, timeout })

      try {
        socket.send(JSON.stringify(message))
      } catch (error) {
        clearTimeout(timeout)
        this.inflight.delete(id)
        reject(new TransportError(error instanceof Error ? error.message : 'Failed to send WebSocket request'))
      }
    })

    return result as T
  }

  private async ensureSocket(): Promise<WebSocketLike> {
    if (this.socket && this.socket.readyState === 1) {
      return this.socket
    }

    if (this.connectPromise) {
      return await this.connectPromise
    }

    const factory = this.config.webSocketFactory

    if (!factory || !this.config.wsUrl) {
      throw new TransportError('WebSocket transport is not configured')
    }

    this.connectPromise = new Promise<WebSocketLike>((resolve, reject) => {
      const socket = factory(this.buildSocketUrl())
      let settled = false
      const timeout = setTimeout(() => {
        if (settled) {
          return
        }

        settled = true
        reject(new TransportError('WebSocket connection timed out'))
      }, this.config.timeoutMs)

      socket.onopen = () => {
        if (settled) {
          return
        }

        settled = true
        clearTimeout(timeout)
        this.socket = socket
        this.attachSocketHandlers(socket)
        resolve(socket)
      }

      socket.onerror = () => {
        if (settled) {
          return
        }

        settled = true
        clearTimeout(timeout)
        reject(new TransportError('WebSocket connection failed'))
      }

      socket.onclose = () => {
        if (!settled) {
          settled = true
          clearTimeout(timeout)
          reject(new TransportError('WebSocket connection closed before opening'))
        }
      }
    })

    try {
      return await this.connectPromise
    } finally {
      this.connectPromise = undefined
    }
  }

  private buildSocketUrl(): string {
    const socketUrl = new URL(this.config.wsUrl as string)

    if (this.config.token) {
      socketUrl.searchParams.set('token', this.config.token)
    }

    return socketUrl.toString()
  }

  private attachSocketHandlers(socket: WebSocketLike): void {
    socket.onmessage = (event) => {
      let response: WsResponseEnvelope

      try {
        response = JSON.parse(event.data) as WsResponseEnvelope
      } catch {
        this.rejectInflight(new TransportError('Received invalid WebSocket response payload'))
        return
      }

      const pending = this.inflight.get(response.id)

      if (!pending) {
        return
      }

      clearTimeout(pending.timeout)
      this.inflight.delete(response.id)

      if (!response.ok) {
        pending.reject(new TransportError(response.error?.message ?? 'WebSocket transport request failed'))
        return
      }

      pending.resolve(response.data)
    }

    socket.onerror = () => {
      this.socket = undefined
      this.rejectInflight(new TransportError('WebSocket transport error'))
    }

    socket.onclose = () => {
      this.socket = undefined
      this.rejectInflight(new TransportError('WebSocket transport closed'))
    }
  }

  private rejectInflight(error: TransportError): void {
    for (const [id, pending] of this.inflight.entries()) {
      clearTimeout(pending.timeout)
      pending.reject(error)
      this.inflight.delete(id)
    }
  }
}
