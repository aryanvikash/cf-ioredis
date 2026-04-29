import { assertCommandSupported } from './commands'
import { resolveConfig } from './config'
import { decode, encode, prefixKey, prefixKeys } from './encoding'
import { Pipeline } from './Pipeline'
import { PubSub } from './PubSub'
import { createTransport, type Transport } from './transport'
import type {
  BulkStringReply,
  IntegerReply,
  KeyEntry,
  RedisEventListener,
  RedisEventName,
  RedisOptions,
  RedisValue,
  ResolvedConfig,
  SetOptions,
  StatusReply
} from './types'

interface SetResult {
  ok: boolean
  applied: boolean
  previous: { type: string; encoding: string; value: string } | null
}

export class Redis {
  readonly options: ResolvedConfig
  private readonly transport: Transport
  private readonly pubsub: PubSub

  constructor(input?: string | RedisOptions) {
    this.options = resolveConfig(input)
    this.transport = createTransport(this.options)
    this.pubsub = new PubSub(this.options)
  }

  // ─── Strings ───────────────────────────────────────────────────

  async get(key: string): Promise<BulkStringReply> {
    const { entry } = await this.send<{ entry: KeyEntry }>('get', { key: this.k(key) })
    return decode(entry.value)
  }

  async set(key: string, value: RedisValue, options?: SetOptions): Promise<'OK' | null> {
    const result = await this.send<SetResult>('set', {
      key: this.k(key),
      value: encode(value),
      options
    })
    return result.applied ? 'OK' : null
  }

  async getset(key: string, value: RedisValue): Promise<BulkStringReply> {
    const result = await this.send<SetResult>('getset', {
      key: this.k(key),
      value: encode(value)
    })
    return decode(result.previous as KeyEntry['value'])
  }

  async mget(...keys: string[]): Promise<BulkStringReply[]> {
    const result = await this.send<{ entries: KeyEntry[] }>('mget', {
      keys: prefixKeys(keys, this.options.keyPrefix)
    })
    return result.entries.map((entry) => decode(entry.value))
  }

  async mset(entries: Record<string, RedisValue>): Promise<StatusReply> {
    await this.send('mset', {
      entries: Object.entries(entries).map(([key, value]) => ({
        key: this.k(key),
        value: encode(value)
      }))
    })
    return 'OK'
  }

  async incr(key: string): Promise<IntegerReply> {
    return await this.incrby(key, 1)
  }

  async decr(key: string): Promise<IntegerReply> {
    return await this.incrby(key, -1)
  }

  async incrby(key: string, delta: number): Promise<IntegerReply> {
    const result = await this.send<{ value: number }>('incrby', { key: this.k(key), delta })
    return result.value
  }

  async decrby(key: string, delta: number): Promise<IntegerReply> {
    return await this.incrby(key, -delta)
  }

  // ─── Keys ──────────────────────────────────────────────────────

  async del(...keys: string[]): Promise<IntegerReply> {
    const result = await this.send<{ deleted: number }>('del', {
      keys: prefixKeys(keys, this.options.keyPrefix)
    })
    return result.deleted
  }

  async exists(...keys: string[]): Promise<IntegerReply> {
    const result = await this.send<{ count: number }>('exists', {
      keys: prefixKeys(keys, this.options.keyPrefix)
    })
    return result.count
  }

  async expire(key: string, seconds: number): Promise<IntegerReply> {
    return await this.expireMs(key, seconds * 1000)
  }

  async pexpire(key: string, ms: number): Promise<IntegerReply> {
    return await this.expireMs(key, ms)
  }

  async ttl(key: string): Promise<IntegerReply> {
    const ttlMs = await this.pttl(key)
    return ttlMs < 0 ? ttlMs : Math.ceil(ttlMs / 1000)
  }

  async pttl(key: string): Promise<IntegerReply> {
    const result = await this.send<{ exists: boolean; ttlMs: number | null }>('ttl', { key: this.k(key) })
    if (!result.exists) return -2
    return result.ttlMs ?? -1
  }

  async persist(key: string): Promise<IntegerReply> {
    const result = await this.send<{ persisted: boolean }>('persist', { key: this.k(key) })
    return result.persisted ? 1 : 0
  }

  async type(key: string): Promise<'string' | 'none'> {
    const result = await this.send<{ type: 'string' | 'none' }>('type', { key: this.k(key) })
    return result.type
  }

  // ─── Pub/sub ───────────────────────────────────────────────────

  async publish(channel: string, message: string): Promise<IntegerReply> {
    assertCommandSupported('publish', this.options.allowEmulatedCommands)
    return await this.pubsub.publish(channel, String(message))
  }

  async subscribe(...channels: string[]): Promise<IntegerReply> {
    assertCommandSupported('subscribe', this.options.allowEmulatedCommands)
    return await this.pubsub.subscribe(...channels)
  }

  async unsubscribe(...channels: string[]): Promise<IntegerReply> {
    assertCommandSupported('unsubscribe', this.options.allowEmulatedCommands)
    return await this.pubsub.unsubscribe(...channels)
  }

  on<T extends RedisEventName>(event: T, listener: RedisEventListener<T>): this {
    this.pubsub.on(event, listener)
    return this
  }

  off<T extends RedisEventName>(event: T, listener: RedisEventListener<T>): this {
    this.pubsub.off(event, listener)
    return this
  }

  once<T extends RedisEventName>(event: T, listener: RedisEventListener<T>): this {
    this.pubsub.once(event, listener)
    return this
  }

  // ─── Pipeline / transaction ────────────────────────────────────

  pipeline(): Pipeline {
    assertCommandSupported('pipeline', this.options.allowEmulatedCommands)
    return new Pipeline(this)
  }

  multi(): Pipeline {
    assertCommandSupported('multi', this.options.allowEmulatedCommands)
    return new Pipeline(this)
  }

  // ─── Lifecycle ─────────────────────────────────────────────────

  duplicate(input?: string | RedisOptions): Redis {
    if (input) return new Redis(input)

    const baseUrl = new URL(this.options.baseUrl)
    return new Redis({
      url: `cfkv://${this.options.token ? `${this.options.token}@` : ''}${baseUrl.host}${baseUrl.pathname}`,
      timeoutMs: this.options.timeoutMs,
      keyPrefix: this.options.keyPrefix,
      namespace: this.options.namespace,
      allowEmulatedCommands: this.options.allowEmulatedCommands,
      transport: this.options.transport,
      wsUrl: this.options.wsUrl,
      headers: this.options.headers,
      fetch: this.options.fetch,
      webSocketFactory: this.options.webSocketFactory
    })
  }

  disconnect(): void {
    void this.transport.close()
    void this.pubsub.close()
  }

  async quit(): Promise<StatusReply> {
    await Promise.allSettled([this.transport.close(), this.pubsub.close()])
    return 'OK'
  }

  // ─── internals ─────────────────────────────────────────────────

  private async send<T>(action: string, payload?: unknown): Promise<T> {
    return await this.transport.request<T>(action, payload)
  }

  private async expireMs(key: string, ttlMs: number): Promise<IntegerReply> {
    const result = await this.send<{ applied: boolean }>('expire', { key: this.k(key), ttlMs })
    return result.applied ? 1 : 0
  }

  private k(key: string): string {
    return prefixKey(key, this.options.keyPrefix)
  }
}
