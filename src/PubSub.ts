import { ConfigError, TransportError } from './errors'
import type {
  PubSubClientFrame,
  PubSubServerFrame,
  RedisEventListener,
  RedisEventMap,
  RedisEventName,
  ResolvedConfig,
  WebSocketLike
} from './types'

interface Subscription {
  socket: WebSocketLike
  pendingSubscribe?: Deferred<void>
  pendingUnsubscribe?: Deferred<void>
  pendingPublish?: Deferred<number>
}

interface Deferred<T> {
  resolve: (value: T) => void
  reject: (reason: unknown) => void
  timer: ReturnType<typeof setTimeout>
}

export class PubSub {
  private readonly listeners = new Map<RedisEventName, Set<(...args: unknown[]) => void>>()
  private readonly subscriptions = new Map<string, Subscription>()

  constructor(private readonly config: ResolvedConfig) {}

  on<T extends RedisEventName>(event: T, listener: RedisEventListener<T>): void {
    let set = this.listeners.get(event)
    if (!set) this.listeners.set(event, (set = new Set()))
    set.add(listener as (...args: unknown[]) => void)
  }

  off<T extends RedisEventName>(event: T, listener: RedisEventListener<T>): void {
    const set = this.listeners.get(event)
    if (!set) return
    set.delete(listener as (...args: unknown[]) => void)
    if (set.size === 0) this.listeners.delete(event)
  }

  once<T extends RedisEventName>(event: T, listener: RedisEventListener<T>): void {
    const wrapped = ((...args: RedisEventMap[T]) => {
      this.off(event, wrapped)
      listener(...args)
    }) as RedisEventListener<T>
    this.on(event, wrapped)
  }

  async subscribe(...channels: string[]): Promise<number> {
    for (const channel of new Set(channels.filter(Boolean))) {
      if (!this.subscriptions.has(channel)) {
        await this.openSubscription(channel)
      }
    }
    return this.subscriptions.size
  }

  async unsubscribe(...channels: string[]): Promise<number> {
    const targets = channels.length > 0 ? [...new Set(channels)] : [...this.subscriptions.keys()]

    for (const channel of targets) {
      const sub = this.subscriptions.get(channel)
      if (sub) await this.closeSubscription(channel, sub)
    }
    return this.subscriptions.size
  }

  async publish(channel: string, message: string): Promise<number> {
    const sub = this.subscriptions.get(channel)
    if (sub && sub.socket.readyState === 1) {
      try {
        return await this.publishOverSocket(channel, message, sub)
      } catch {
        // fall through to HTTP
      }
    }
    return await this.publishOverHttp(channel, message)
  }

  async close(): Promise<void> {
    await Promise.allSettled([...this.subscriptions.keys()].map((c) => this.unsubscribe(c)))
  }

  // ─── internals ─────────────────────────────────────────────────

  private emit<T extends RedisEventName>(event: T, ...args: RedisEventMap[T]): void {
    const set = this.listeners.get(event)
    if (!set) return
    for (const listener of [...set]) listener(...args)
  }

  private async openSubscription(channel: string): Promise<void> {
    const factory = this.config.webSocketFactory
    if (!factory)
      throw new ConfigError('WebSocket is not available; provide a `webSocketFactory` for pub/sub')

    const socket = factory(this.socketUrl(channel))
    const sub: Subscription = { socket }
    this.subscriptions.set(channel, sub)

    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.subscriptions.delete(channel)
        reject(new TransportError(`Pub/sub connection timed out for channel ${channel}`))
      }, this.config.timeoutMs)

      socket.onopen = () => {
        clearTimeout(timer)
        this.attachHandlers(channel, sub)
        sub.pendingSubscribe = this.deferred(channel, 'subscribe', resolve, reject)
        this.send(socket, { type: 'subscribe', channels: [channel] })
      }
      socket.onerror = () => {
        clearTimeout(timer)
        this.subscriptions.delete(channel)
        reject(new TransportError(`Pub/sub connection failed for channel ${channel}`))
      }
      socket.onclose = () => {
        clearTimeout(timer)
        this.subscriptions.delete(channel)
        reject(new TransportError(`Pub/sub connection closed before subscribing to ${channel}`))
      }
    })
  }

  private async closeSubscription(channel: string, sub: Subscription): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      sub.pendingUnsubscribe = this.deferred(channel, 'unsubscribe', resolve, reject)
      this.send(sub.socket, { type: 'unsubscribe', channels: [channel] })
    })
  }

  private attachHandlers(channel: string, sub: Subscription): void {
    sub.socket.onmessage = (event) => {
      let frame: PubSubServerFrame
      try {
        frame = JSON.parse(event.data) as PubSubServerFrame
      } catch {
        this.rejectPending(sub, new TransportError(`Invalid pub/sub payload for channel ${channel}`))
        return
      }
      this.handleFrame(channel, sub, frame)
    }
    sub.socket.onerror = () => {
      this.rejectPending(sub, new TransportError(`Pub/sub socket error for channel ${channel}`))
      this.subscriptions.delete(channel)
    }
    sub.socket.onclose = () => {
      this.rejectPending(sub, new TransportError(`Pub/sub socket closed for channel ${channel}`))
      this.subscriptions.delete(channel)
    }
  }

  private handleFrame(channel: string, sub: Subscription, frame: PubSubServerFrame): void {
    switch (frame.type) {
      case 'subscribe':
        sub.pendingSubscribe?.resolve()
        sub.pendingSubscribe = undefined
        this.emit('subscribe', frame.channel, frame.count)
        return
      case 'unsubscribe':
        sub.pendingUnsubscribe?.resolve()
        sub.pendingUnsubscribe = undefined
        this.subscriptions.delete(channel)
        this.emit('unsubscribe', frame.channel, frame.count)
        sub.socket.close(1000, 'client unsubscribe')
        return
      case 'message':
        this.emit('message', frame.channel, frame.message)
        return
      case 'publish':
        sub.pendingPublish?.resolve(frame.receivers)
        sub.pendingPublish = undefined
        return
      case 'pong':
        return
      case 'error':
        this.rejectPending(sub, new TransportError(frame.message))
        return
    }
  }

  private async publishOverSocket(channel: string, message: string, sub: Subscription): Promise<number> {
    if (sub.pendingPublish) throw new TransportError(`Pub/sub publish already in flight for ${channel}`)

    return await new Promise<number>((resolve, reject) => {
      sub.pendingPublish = this.deferred(channel, 'publish', resolve, reject)
      this.send(sub.socket, { type: 'publish', channel, message })
    })
  }

  private async publishOverHttp(channel: string, message: string): Promise<number> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this.config.timeoutMs)

    try {
      const url = new URL(`${this.config.baseUrl}/rpc`)
      if (this.config.namespace) url.searchParams.set('ns', this.config.namespace)

      const response = await this.config.fetch(url.toString(), {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'content-type': 'application/json',
          ...(this.config.token ? { authorization: `Bearer ${this.config.token}` } : {}),
          ...this.config.headers
        },
        body: JSON.stringify({
          id: `pub-${Date.now()}`,
          action: 'publish',
          payload: { channel, message }
        })
      })

      if (!response.ok) {
        throw new TransportError(`Worker publish failed with status ${response.status}`, response.status)
      }

      const result = (await response.json()) as {
        ok: boolean
        data?: { receivers: number }
        error?: { message: string }
      }
      if (!result.ok) throw new TransportError(result.error?.message ?? 'Publish failed')
      return result.data?.receivers ?? 0
    } catch (error) {
      if (error instanceof TransportError) throw error
      if (error instanceof Error && error.name === 'AbortError') {
        throw new TransportError('Worker publish request timed out')
      }
      throw new TransportError(error instanceof Error ? error.message : 'Unknown pub/sub transport error')
    } finally {
      clearTimeout(timer)
    }
  }

  private rejectPending(sub: Subscription, error: TransportError): void {
    for (const key of ['pendingSubscribe', 'pendingUnsubscribe', 'pendingPublish'] as const) {
      const pending = sub[key]
      if (pending) {
        clearTimeout(pending.timer)
        pending.reject(error)
        sub[key] = undefined
      }
    }
  }

  private deferred<T>(
    channel: string,
    action: string,
    resolve: (value: T) => void,
    reject: (reason: unknown) => void
  ): Deferred<T> {
    const timer = setTimeout(() => {
      reject(new TransportError(`Pub/sub ${action} timed out for channel ${channel}`))
    }, this.config.timeoutMs)

    return {
      resolve: (value: T) => {
        clearTimeout(timer)
        resolve(value)
      },
      reject: (reason: unknown) => {
        clearTimeout(timer)
        reject(reason)
      },
      timer
    }
  }

  private send(socket: WebSocketLike, frame: PubSubClientFrame): void {
    try {
      socket.send(JSON.stringify(frame))
    } catch (error) {
      throw new TransportError(error instanceof Error ? error.message : 'Failed to send pub/sub frame')
    }
  }

  private socketUrl(channel: string): string {
    const source = new URL(this.config.wsUrl ?? this.config.baseUrl)
    if (!this.config.wsUrl) {
      source.protocol = source.protocol === 'http:' ? 'ws:' : 'wss:'
    }
    source.pathname = source.pathname.endsWith('/ws')
      ? source.pathname.replace(/\/ws$/, '/pubsub/ws')
      : `${source.pathname.replace(/\/$/, '')}/pubsub/ws`
    source.searchParams.set('channel', channel)
    if (this.config.token) source.searchParams.set('token', this.config.token)
    if (this.config.namespace) source.searchParams.set('ns', this.config.namespace)
    return source.toString()
  }
}
