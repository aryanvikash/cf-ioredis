import type { Redis } from './Redis'
import type { ExecReply, RedisValue, SetOptions, StatusReply } from './types'

type Task = () => Promise<unknown>

export class Pipeline {
  private readonly tasks: Task[] = []

  constructor(private readonly redis: Redis) {}

  // ─── Strings ───────────────────────────────────────────────────

  get(key: string): this {
    return this.queue(() => this.redis.get(key))
  }

  set(key: string, value: RedisValue, options?: SetOptions): this {
    return this.queue(() => this.redis.set(key, value, options))
  }

  getset(key: string, value: RedisValue): this {
    return this.queue(() => this.redis.getset(key, value))
  }

  mget(...keys: string[]): this {
    return this.queue(() => this.redis.mget(...keys))
  }

  mset(entries: Record<string, RedisValue>): this {
    return this.queue(() => this.redis.mset(entries))
  }

  incr(key: string): this {
    return this.queue(() => this.redis.incr(key))
  }

  decr(key: string): this {
    return this.queue(() => this.redis.decr(key))
  }

  incrby(key: string, delta: number): this {
    return this.queue(() => this.redis.incrby(key, delta))
  }

  decrby(key: string, delta: number): this {
    return this.queue(() => this.redis.decrby(key, delta))
  }

  // ─── Keys ──────────────────────────────────────────────────────

  del(...keys: string[]): this {
    return this.queue(() => this.redis.del(...keys))
  }

  exists(...keys: string[]): this {
    return this.queue(() => this.redis.exists(...keys))
  }

  expire(key: string, seconds: number): this {
    return this.queue(() => this.redis.expire(key, seconds))
  }

  pexpire(key: string, ms: number): this {
    return this.queue(() => this.redis.pexpire(key, ms))
  }

  ttl(key: string): this {
    return this.queue(() => this.redis.ttl(key))
  }

  pttl(key: string): this {
    return this.queue(() => this.redis.pttl(key))
  }

  persist(key: string): this {
    return this.queue(() => this.redis.persist(key))
  }

  type(key: string): this {
    return this.queue(() => this.redis.type(key))
  }

  // ─── Execution ─────────────────────────────────────────────────

  async exec(): Promise<ExecReply> {
    const results: ExecReply = []
    for (const task of this.tasks) {
      try {
        results.push([null, await task()])
      } catch (error) {
        results.push([error instanceof Error ? error : new Error(String(error)), null])
      }
    }
    return results
  }

  async quit(): Promise<StatusReply> {
    return await this.redis.quit()
  }

  private queue(task: Task): this {
    this.tasks.push(task)
    return this
  }
}
