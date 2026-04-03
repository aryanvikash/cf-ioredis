import type { RedisKey, SetOptions } from '../types/commands'
import type { KvRecord } from '../types/responses'

export interface KvTransport {
  get(key: RedisKey): Promise<KvRecord>
  mget(keys: RedisKey[]): Promise<KvRecord[]>
  set(key: RedisKey, value: string, options?: SetOptions): Promise<{ applied: boolean; previous: string | null }>
  mset(entries: Array<{ key: RedisKey; value: string; options?: SetOptions }>): Promise<'OK'>
  del(keys: RedisKey[]): Promise<number>
  exists(keys: RedisKey[]): Promise<number>
  expire(key: RedisKey, ttlMs: number): Promise<boolean>
  ttl(key: RedisKey): Promise<number>
  persist(key: RedisKey): Promise<boolean>
  type(key: RedisKey): Promise<'string' | 'none'>
  close(): Promise<void>
}
