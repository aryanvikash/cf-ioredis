import { executeQueuedCommands } from '../commands/batch'
import type { Redis } from './Redis'
import type { ExecReply, StatusReply } from '../types/responses'
import type { RedisValue, SetOptions, QueuedCommand } from '../types/commands'

export class Pipeline {
  protected readonly queue: QueuedCommand[] = []

  constructor(protected readonly redis: Redis) {}

  get(key: string): this {
    this.queue.push({ name: 'get', args: [key], execute: () => this.redis.get(key) })
    return this
  }

  set(key: string, value: RedisValue, options?: SetOptions): this {
    this.queue.push({ name: 'set', args: [key, value, options], execute: () => this.redis.set(key, value, options) })
    return this
  }

  del(...keys: string[]): this {
    this.queue.push({ name: 'del', args: keys, execute: () => this.redis.del(...keys) })
    return this
  }

  exists(...keys: string[]): this {
    this.queue.push({ name: 'exists', args: keys, execute: () => this.redis.exists(...keys) })
    return this
  }

  mget(...keys: string[]): this {
    this.queue.push({ name: 'mget', args: keys, execute: () => this.redis.mget(...keys) })
    return this
  }

  mset(entries: Record<string, RedisValue>): this {
    this.queue.push({ name: 'mset', args: [entries], execute: () => this.redis.mset(entries) })
    return this
  }

  expire(key: string, seconds: number): this {
    this.queue.push({ name: 'expire', args: [key, seconds], execute: () => this.redis.expire(key, seconds) })
    return this
  }

  pexpire(key: string, milliseconds: number): this {
    this.queue.push({ name: 'pexpire', args: [key, milliseconds], execute: () => this.redis.pexpire(key, milliseconds) })
    return this
  }

  ttl(key: string): this {
    this.queue.push({ name: 'ttl', args: [key], execute: () => this.redis.ttl(key) })
    return this
  }

  pttl(key: string): this {
    this.queue.push({ name: 'pttl', args: [key], execute: () => this.redis.pttl(key) })
    return this
  }

  persist(key: string): this {
    this.queue.push({ name: 'persist', args: [key], execute: () => this.redis.persist(key) })
    return this
  }

  type(key: string): this {
    this.queue.push({ name: 'type', args: [key], execute: () => this.redis.type(key) })
    return this
  }

  async exec(): Promise<ExecReply> {
    return executeQueuedCommands(this.queue)
  }

  async quit(): Promise<StatusReply> {
    return this.redis.quit()
  }
}
