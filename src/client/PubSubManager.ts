import { ConfigError, TransportError } from '../core/errors'
import type { RedisEventListener, RedisEventMap, RedisEventName } from '../types/commands'
import type { ResolvedConfig, WebSocketLike } from '../types/config'
import type {
  PubSubClientFrame,
  PubSubErrorFrame,
  PubSubMessageFrame,
  PubSubServerFrame,
  WorkerPublishRequest,
  WorkerPublishResponse
} from '../types/internal'

interface PendingOperation {
  resolve: () => void
  reject: (error: TransportError) => void
  timeout: ReturnType<typeof setTimeout>
}

interface ChannelSubscription {
  socket: WebSocketLike
  subscribePending?: PendingOperation
  unsubscribePending?: PendingOperation
  publishPending?: PendingOperation & { resolveValue: (receivers: number) => void }
}

export class PubSubManager {
  private readonly listeners = new Map<RedisEventName, Set<(...args: unknown[]) => void>>()
  private readonly subscriptions = new Map<string, ChannelSubscription>()

  constructor(private readonly config: ResolvedConfig) {}

  on<T extends RedisEventName>(event: T, listener: RedisEventListener<T>): void {
    const listeners = this.listeners.get(event) ?? new Set()
    listeners.add(listener as (...args: unknown[]) => void)
    this.listeners.set(event, listeners)
  }

  off<T extends RedisEventName>(event: T, listener: RedisEventListener<T>): void {
    const listeners = this.listeners.get(event)

    if (!listeners) {
      return
    }

    listeners.delete(listener as (...args: unknown[]) => void)

    if (listeners.size === 0) {
      this.listeners.delete(event)
    }
  }

  once<T extends RedisEventName>(event: T, listener: RedisEventListener<T>): void {
    const wrapped = ((...args: RedisEventMap[T]) => {
      this.off(event, wrapped)
      listener(...args)
    }) as RedisEventListener<T>

    this.on(event, wrapped)
  }

  async publish(channel: string, message: string): Promise<number> {
    const subscription = this.subscriptions.get(channel)

    if (subscription && subscription.socket.readyState === 1) {
      try {
        return await this.publishOverSocket(channel, message, subscription)
      } catch {
        // Fall back to HTTP if the active pub/sub socket cannot be used for publish.
      }
    }

    const body: WorkerPublishRequest = { channel, message }
    const response = await this.request<WorkerPublishResponse>('POST', '/publish', body)
    return response.receivers
  }

  async subscribe(...channels: string[]): Promise<number> {
    const uniqueChannels = [...new Set(channels)].filter(Boolean)

    for (const channel of uniqueChannels) {
      if (this.subscriptions.has(channel)) {
        continue
      }

      await this.openChannelSubscription(channel)
    }

    return this.subscriptions.size
  }

  async unsubscribe(...channels: string[]): Promise<number> {
    const targets = channels.length > 0
      ? [...new Set(channels)]
      : [...this.subscriptions.keys()]

    for (const channel of targets) {
      const subscription = this.subscriptions.get(channel)

      if (!subscription) {
        continue
      }

      await this.closeChannelSubscription(channel, subscription)
    }

    return this.subscriptions.size
  }

  async close(): Promise<void> {
    const channels = [...this.subscriptions.keys()]
    await Promise.allSettled(channels.map((channel) => this.unsubscribe(channel)))
  }

  private emit<T extends RedisEventName>(event: T, ...args: RedisEventMap[T]): void {
    const listeners = this.listeners.get(event)

    if (!listeners) {
      return
    }

    for (const listener of [...listeners]) {
      listener(...args)
    }
  }

  private async openChannelSubscription(channel: string): Promise<void> {
    const factory = this.config.webSocketFactory

    if (!factory) {
      throw new ConfigError('WebSocket is not available; provide a `webSocketFactory` when using pub/sub')
    }

    const socket = factory(this.buildSocketUrl(channel))
    const subscription: ChannelSubscription = { socket }
    this.subscriptions.set(channel, subscription)

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.subscriptions.delete(channel)
        reject(new TransportError(`Pub/Sub connection timed out for channel ${channel}`))
      }, this.config.timeoutMs)

      socket.onopen = () => {
        clearTimeout(timeout)
        this.attachSocketHandlers(channel, subscription)
        subscription.subscribePending = this.createPendingOperation(channel, 'subscribe', resolve, reject)
        this.sendFrame(socket, { type: 'subscribe', channels: [channel] })
      }

      socket.onerror = () => {
        clearTimeout(timeout)
        this.subscriptions.delete(channel)
        reject(new TransportError(`Pub/Sub connection failed for channel ${channel}`))
      }

      socket.onclose = () => {
        clearTimeout(timeout)
        this.subscriptions.delete(channel)
        reject(new TransportError(`Pub/Sub connection closed before subscribing to ${channel}`))
      }
    })
  }

  private async closeChannelSubscription(channel: string, subscription: ChannelSubscription): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      subscription.unsubscribePending = this.createPendingOperation(channel, 'unsubscribe', resolve, reject)

      this.sendFrame(subscription.socket, { type: 'unsubscribe', channels: [channel] })
    })
  }

  private attachSocketHandlers(channel: string, subscription: ChannelSubscription): void {
    const { socket } = subscription

    socket.onmessage = (event) => {
      let frame: PubSubServerFrame

      try {
        frame = JSON.parse(event.data) as PubSubServerFrame
      } catch {
        this.rejectPending(subscription, new TransportError(`Received invalid pub/sub payload for channel ${channel}`))
        return
      }

      switch (frame.type) {
        case 'subscribe':
          this.resolvePending(subscription.subscribePending)
          subscription.subscribePending = undefined
          this.emit('subscribe', frame.channel, frame.count)
          return
        case 'unsubscribe':
          this.resolvePending(subscription.unsubscribePending)
          subscription.unsubscribePending = undefined
          this.subscriptions.delete(channel)
          this.emit('unsubscribe', frame.channel, frame.count)
          socket.close(1000, 'client unsubscribe')
          return
        case 'message': {
          const messageFrame = frame as PubSubMessageFrame
          this.emit('message', messageFrame.channel, messageFrame.message)
          return
        }
        case 'publish':
          subscription.publishPending?.resolveValue(frame.receivers)
          subscription.publishPending = undefined
          return
        case 'pong':
          return
        case 'error': {
          const errorFrame = frame as PubSubErrorFrame
          this.rejectPending(subscription, new TransportError(errorFrame.message))
          return
        }
      }
    }

    socket.onerror = () => {
      this.rejectPending(subscription, new TransportError(`Pub/Sub socket error for channel ${channel}`))
      this.subscriptions.delete(channel)
    }

    socket.onclose = () => {
      this.rejectPending(subscription, new TransportError(`Pub/Sub socket closed for channel ${channel}`))
      this.subscriptions.delete(channel)
    }
  }

  private createPendingOperation(
    channel: string,
    action: string,
    resolve: () => void,
    reject: (error: TransportError) => void
  ): PendingOperation {
    const timeout = setTimeout(() => {
      reject(new TransportError(`Pub/Sub ${action} timed out for channel ${channel}`))
    }, this.config.timeoutMs)

    return {
      resolve: () => {
        clearTimeout(timeout)
        resolve()
      },
      reject: (error: TransportError) => {
        clearTimeout(timeout)
        reject(error)
      },
      timeout
    }
  }

  private resolvePending(pending?: PendingOperation): void {
    pending?.resolve()
  }

  private rejectPending(subscription: ChannelSubscription, error: TransportError): void {
    const pendings = [subscription.subscribePending, subscription.unsubscribePending, subscription.publishPending]

    for (const pending of pendings) {
      if (!pending) {
        continue
      }

      pending.reject(error)
    }

    subscription.subscribePending = undefined
    subscription.unsubscribePending = undefined
    subscription.publishPending = undefined
  }

  private async publishOverSocket(channel: string, message: string, subscription: ChannelSubscription): Promise<number> {
    if (subscription.publishPending) {
      throw new TransportError(`Pub/Sub publish already in flight for channel ${channel}`)
    }

    return await new Promise<number>((resolve, reject) => {
      const timeout = setTimeout(() => {
        subscription.publishPending = undefined
        reject(new TransportError(`Pub/Sub publish timed out for channel ${channel}`))
      }, this.config.timeoutMs)

      subscription.publishPending = {
        timeout,
        resolve: () => {},
        reject: (error: TransportError) => {
          clearTimeout(timeout)
          reject(error)
        },
        resolveValue: (receivers: number) => {
          clearTimeout(timeout)
          resolve(receivers)
        }
      }

      this.sendFrame(subscription.socket, {
        type: 'publish',
        channel,
        message
      })
    })
  }

  private sendFrame(socket: WebSocketLike, frame: PubSubClientFrame): void {
    try {
      socket.send(JSON.stringify(frame))
    } catch (error) {
      throw new TransportError(error instanceof Error ? error.message : 'Failed to send pub/sub frame')
    }
  }

  private buildSocketUrl(channel: string): string {
    const sourceUrl = this.config.wsUrl
      ? new URL(this.config.wsUrl)
      : new URL(this.config.baseUrl)

    if (!this.config.wsUrl) {
      sourceUrl.protocol = sourceUrl.protocol === 'http:' ? 'ws:' : 'wss:'
    }

    sourceUrl.pathname = sourceUrl.pathname.endsWith('/ws')
      ? sourceUrl.pathname.replace(/\/ws$/, '/pubsub/ws')
      : `${sourceUrl.pathname.replace(/\/$/, '')}/pubsub/ws`

    sourceUrl.searchParams.set('channel', channel)

    if (this.config.token) {
      sourceUrl.searchParams.set('token', this.config.token)
    }

    return sourceUrl.toString()
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs)

    try {
      const response = await this.config.fetch(`${this.config.baseUrl}${path}`, {
        method,
        signal: controller.signal,
        headers: {
          'content-type': 'application/json',
          ...(this.config.token ? { authorization: `Bearer ${this.config.token}` } : {}),
          ...this.config.headers
        },
        body: body ? JSON.stringify(body) : undefined
      })

      if (!response.ok) {
        throw new TransportError(`Worker Pub/Sub request failed with status ${response.status}`, response.status)
      }

      return (await response.json()) as T
    } catch (error) {
      if (error instanceof TransportError) {
        throw error
      }

      if (error instanceof Error && error.name === 'AbortError') {
        throw new TransportError('Worker Pub/Sub request timed out')
      }

      throw new TransportError(error instanceof Error ? error.message : 'Unknown pub/sub transport error')
    } finally {
      clearTimeout(timeout)
    }
  }
}
